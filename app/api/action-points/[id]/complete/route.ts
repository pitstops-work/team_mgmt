/**
 * Mark an ActionPoint done. The assignee close is final — no verify step.
 * Body (optional): { closureNote, closureProofUrl }.
 *
 * Authorisation: TEAM scope on action_point.update — supervisors (ZL/PM/Leader)
 * may close on the RP's behalf, mirroring the locked close-authority rule.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { viewerForbidden } from "@/lib/roleGuard";
import { buildRbacContext, scopeWhere } from "@/lib/rbac";
import { auditLog } from "@/lib/auditLog";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;

  const ctx = await buildRbacContext(session, { req });
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const where = await scopeWhere(ctx, "action_point", "update");
  if (where === null) return Response.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.actionPoint.findFirst({
    where: { id, ...where },
    select: { id: true, status: true, title: true },
  });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
  if (existing.status === "done") return Response.json({ ok: true, alreadyDone: true });
  if (existing.status === "cancelled") {
    return Response.json({ error: "Cannot complete a cancelled action point" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const closureNote = typeof body?.closureNote === "string" ? body.closureNote.trim() || null : null;
  const closureProofUrl = typeof body?.closureProofUrl === "string" ? body.closureProofUrl.trim() || null : null;

  const actorId = session.user.id;
  const updated = await prisma.actionPoint.update({
    where: { id },
    data: {
      status: "done",
      completedAt: new Date(),
      completedById: actorId,
      lastUpdatedById: actorId,
      ...(closureNote     !== null ? { closureNote } : {}),
      ...(closureProofUrl !== null ? { closureProofUrl } : {}),
    },
  });

  auditLog({
    entityType: "ActionPoint", entityId: id, userId: actorId,
    action: "completed", field: "status", oldValue: existing.status, newValue: "done",
  });

  return Response.json(updated);
}
