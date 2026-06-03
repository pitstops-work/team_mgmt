/**
 * Re-open a done ActionPoint. Used when the close-out wasn't satisfactory and
 * the raiser wants the AP back on the active list. No verify step on this
 * design, so reopen is the only correction lever.
 *
 * Auth: TEAM scope on action_point.update (same as complete).
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { viewerForbidden } from "@/lib/roleGuard";
import { buildRbacContext, scopeWhere } from "@/lib/rbac";
import { auditLog } from "@/lib/auditLog";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;

  const ctx = await buildRbacContext(session);
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const where = await scopeWhere(ctx, "action_point", "update");
  if (where === null) return Response.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.actionPoint.findFirst({
    where: { id, ...where },
    select: { id: true, status: true },
  });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
  if (existing.status === "open") return Response.json({ ok: true, alreadyOpen: true });

  const actorId = session.user.id;
  const updated = await prisma.actionPoint.update({
    where: { id },
    data: {
      status: "open",
      completedAt: null,
      completedById: null,
      // closureNote/closureProofUrl are preserved — useful audit trail if it's
      // reopened because the proof was unsatisfactory.
      lastUpdatedById: actorId,
    },
  });

  auditLog({
    entityType: "ActionPoint", entityId: id, userId: actorId,
    action: "reopened", field: "status", oldValue: existing.status, newValue: "open",
  });

  return Response.json(updated);
}
