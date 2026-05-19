import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { viewerForbidden } from "@/lib/roleGuard";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ decisionId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;

  const { decisionId } = await params;
  const { status, rationale, description, decidedAt } = await req.json();

  const decision = await prisma.decision.update({
    where: { id: decisionId },
    data: {
      status: status ?? undefined,
      rationale: rationale !== undefined ? (rationale?.trim() || null) : undefined,
      description: description !== undefined ? (description?.trim() || null) : undefined,
      decidedAt: decidedAt ? new Date(decidedAt) : undefined,
    },
    include: { createdBy: { select: { id: true, name: true, image: true } } },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "Decision",
      entityId: decisionId,
      userId: session.user.id,
      action: "updated",
      field: status ? "status" : "content",
      oldValue: null,
      newValue: status ?? null,
    },
  });

  return Response.json(decision);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ decisionId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;

  const { decisionId } = await params;
  await prisma.decision.update({ where: { id: decisionId }, data: { deletedAt: new Date() } });
  return Response.json({ ok: true });
}
