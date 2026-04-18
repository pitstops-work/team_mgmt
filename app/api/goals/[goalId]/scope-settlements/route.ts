import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/goals/[goalId]/scope-settlements
// Returns the settlements in scope for a cluster- or zone-level domain goal.
// Used by the completion modal to show the settlement attribution picker.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ goalId: string }> }
) {
  await auth();
  const { goalId } = await params;

  const goal = await prisma.goal.findUnique({
    where: { id: goalId, deletedAt: null },
    select: {
      needsSettlementId: true,
      needsClusterId:    true,
      needsZoneId:       true,
    },
  });

  if (!goal) return Response.json({ error: "Not found" }, { status: 404 });

  // If already pinned to a single settlement — no picker needed
  if (goal.needsSettlementId) {
    const s = await prisma.settlement.findUnique({
      where: { id: goal.needsSettlementId },
      select: { id: true, name: true },
    });
    return Response.json(s ? [s] : []);
  }

  // Cluster-level: return all active settlements in that cluster
  if (goal.needsClusterId) {
    const settlements = await prisma.settlement.findMany({
      where: { clusterId: goal.needsClusterId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return Response.json(settlements);
  }

  // Zone-level: return all active settlements in the zone, grouped by cluster
  if (goal.needsZoneId) {
    const clusters = await prisma.cluster.findMany({
      where: { zoneId: goal.needsZoneId, deletedAt: null },
      select: {
        id: true,
        name: true,
        settlements: {
          where: { deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });
    // Flatten with cluster name as prefix context
    const settlements = clusters.flatMap(c =>
      c.settlements.map(s => ({ id: s.id, name: s.name, clusterName: c.name }))
    );
    return Response.json(settlements);
  }

  return Response.json([]);
}
