/**
 * ActionPoint — edit + cancel.
 *
 *   PATCH  edit { title, detail, dueDate, priority, partnerStaffLabel }
 *   DELETE soft-cancel (sets status='cancelled'); reuses the AuditLog 'cancelled' action.
 *
 * Authorisation: per-record TEAM scope on `action_point.update` (for PATCH)
 * and OWN scope on `action_point.delete` (for cancel). Mirrors the rule that
 * supervisors can close/edit subordinate APs but not silently delete them.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { viewerForbidden } from "@/lib/roleGuard";
import { buildRbacContext, scopeWhere } from "@/lib/rbac";
import { auditLog, diffAudit, auditLogMany } from "@/lib/auditLog";

async function inScope(
  session: Awaited<ReturnType<typeof auth>>,
  id: string,
  action: "update" | "delete",
): Promise<boolean> {
  const ctx = await buildRbacContext(session);
  if (!ctx) return false;
  const where = await scopeWhere(ctx, "action_point", action);
  if (where === null) return false;
  const hit = await prisma.actionPoint.findFirst({
    where: { id, ...where },
    select: { id: true },
  });
  return hit !== null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;

  const { id } = await params;
  if (!(await inScope(session, id, "update"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const actorId = session.user.id;
  const body = await req.json();
  const { title, detail, dueDate, priority, partnerStaffLabel } = body ?? {};

  const before = await prisma.actionPoint.findUnique({
    where: { id },
    select: { title: true, detail: true, dueDate: true, priority: true, partnerStaffLabel: true },
  });
  if (!before) return Response.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = { lastUpdatedById: actorId };
  if (title !== undefined)              data.title = String(title).trim();
  if (detail !== undefined)             data.detail = detail ? String(detail).trim() : null;
  if (dueDate !== undefined)            data.dueDate = new Date(dueDate);
  if (priority !== undefined)           data.priority = priority === "urgent" ? "urgent" : "routine";
  if (partnerStaffLabel !== undefined)  data.partnerStaffLabel = partnerStaffLabel ? String(partnerStaffLabel).trim() : null;

  const updated = await prisma.actionPoint.update({ where: { id }, data });

  // Field-diff audit — one row per actually-changed field.
  auditLogMany(diffAudit(
    "ActionPoint", id, actorId,
    before,
    {
      title: data.title, detail: data.detail, dueDate: data.dueDate,
      priority: data.priority, partnerStaffLabel: data.partnerStaffLabel,
    },
  ));

  return Response.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;

  const { id } = await params;
  if (!(await inScope(session, id, "delete"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const actorId = session.user.id;
  await prisma.actionPoint.update({
    where: { id },
    data: { status: "cancelled", lastUpdatedById: actorId },
  });
  auditLog({ entityType: "ActionPoint", entityId: id, userId: actorId, action: "cancelled" });
  return Response.json({ ok: true });
}
