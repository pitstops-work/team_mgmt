import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
// GET /api/needs/actuals?settlementId=x | clusterId=x | zoneId=x
// Returns actuals per domain, computed from goals tagged with needsDomain + geography
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const settlementId = searchParams.get("settlementId");
  const clusterId = searchParams.get("clusterId");
  const zoneId = searchParams.get("zoneId");

  if (!settlementId && !clusterId && !zoneId) {
    return Response.json({ error: "One of settlementId, clusterId, zoneId required" }, { status: 400 });
  }

  // Build goal filter based on geography scope
  // A goal can be linked via needsSettlementId, needsClusterId, or needsZoneId
  // For cluster scope: include goals tagged to the cluster OR any of its settlements
  // For zone scope: include goals tagged to the zone OR any of its clusters/settlements
  let goalFilter: object = {};

  if (settlementId) {
    goalFilter = {
      OR: [
        { needsSettlementId: settlementId },
        // Also include cluster-level goals for the cluster this settlement belongs to
        {
          needsClusterId: {
            in: await prisma.settlement.findUnique({ where: { id: settlementId }, select: { clusterId: true } })
              .then(s => s ? [s.clusterId] : []),
          },
        },
      ],
    };
  } else if (clusterId) {
    const settlements = await prisma.settlement.findMany({
      where: { clusterId, deletedAt: null },
      select: { id: true },
    });
    const settlementIds = settlements.map(s => s.id);
    goalFilter = {
      OR: [
        { needsClusterId: clusterId },
        { needsSettlementId: { in: settlementIds } },
      ],
    };
  } else if (zoneId) {
    const clusters = await prisma.cluster.findMany({
      where: { zoneId: zoneId!, deletedAt: null },
      select: { id: true, settlements: { where: { deletedAt: null }, select: { id: true } } },
    });
    const clusterIds = clusters.map(c => c.id);
    const settlementIds = clusters.flatMap(c => c.settlements.map(s => s.id));
    goalFilter = {
      OR: [
        { needsZoneId: zoneId },
        { needsClusterId: { in: clusterIds } },
        { needsSettlementId: { in: settlementIds } },
      ],
    };
  }

  // Fetch all goals with needsDomain set in scope
  const goals = await prisma.goal.findMany({
    where: {
      needsDomain: { not: null },
      deletedAt: null,
      ...goalFilter,
    },
    select: {
      id: true,
      status: true,
      needsDomain: true,
      parameter: true,
      outcomeCount: true,
      metrics: {
        where: { deletedAt: null },
        select: { current: true },
        take: 1,
      },
    },
  });

  // Aggregate per domain
  // Complete goals: outcomeCount (actual delivered) > parameter (planned) > metric
  // Active goals: parameter (planned) > metric (current progress)
  const domainMap: Record<string, { done: number; inProgress: number }> = {};

  // Pre-initialise all active domains so callers always get a full map
  const activeDomains = await prisma.needsFormulaConfig.findMany({ where: { isActive: true }, select: { domain: true } });
  for (const { domain } of activeDomains) {
    domainMap[domain] = { done: 0, inProgress: 0 };
  }

  for (const goal of goals) {
    if (!goal.needsDomain) continue;
    const domain = goal.needsDomain as string;

    if (goal.status === "Complete") {
      const value = goal.outcomeCount ?? goal.parameter ?? goal.metrics[0]?.current ?? 0;
      domainMap[domain].done += value;
    } else if (goal.status === "Active") {
      const value = goal.parameter ?? goal.metrics[0]?.current ?? 0;
      domainMap[domain].inProgress += value;
    }
  }

  return Response.json(domainMap);
}
