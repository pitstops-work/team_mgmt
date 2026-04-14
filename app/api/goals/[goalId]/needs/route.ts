import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;

  const goal = await prisma.goal.findUnique({
    where: { id: goalId, deletedAt: null },
    select: {
      needsDomain: true,
      parameter: true,
      needsSettlementId: true,
      needsClusterId: true,
      needsZoneId: true,
      needsSettlement: { select: { id: true, name: true } },
      needsCluster: { select: { id: true, name: true } },
      needsZone: { select: { id: true, name: true } },
    },
  });

  if (!goal) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(goal);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  const data = await req.json();

  const updateData: Record<string, unknown> = {};

  if ("needsDomain" in data) updateData.needsDomain = data.needsDomain ?? null;
  if ("parameter" in data) updateData.parameter = data.parameter != null ? Number(data.parameter) : null;

  // Geography scope — only one can be set at a time; clear the others when setting one
  if ("needsSettlementId" in data) {
    updateData.needsSettlementId = data.needsSettlementId ?? null;
    if (data.needsSettlementId) { updateData.needsClusterId = null; updateData.needsZoneId = null; }
  }
  if ("needsClusterId" in data) {
    updateData.needsClusterId = data.needsClusterId ?? null;
    if (data.needsClusterId) { updateData.needsSettlementId = null; updateData.needsZoneId = null; }
  }
  if ("needsZoneId" in data) {
    updateData.needsZoneId = data.needsZoneId ?? null;
    if (data.needsZoneId) { updateData.needsSettlementId = null; updateData.needsClusterId = null; }
  }

  const goal = await prisma.goal.update({
    where: { id: goalId },
    data: updateData,
    select: {
      needsDomain: true,
      parameter: true,
      needsSettlementId: true,
      needsClusterId: true,
      needsZoneId: true,
      needsSettlement: { select: { id: true, name: true } },
      needsCluster: { select: { id: true, name: true } },
      needsZone: { select: { id: true, name: true } },
    },
  });

  return Response.json(goal);
}
