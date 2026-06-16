import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { goalOwnedByAnyOf } from "@/lib/ownership";

/**
 * GET /api/map/my-goal-scope
 *
 * Returns the set of clusters, zones, and settlements the current user
 * has at least one non-deleted goal in (as owner or co-owner).
 * Used by the Programme Map "Mine / All" toggle so the RP can narrow
 * the map down to just their territory.
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const goals = await prisma.goal.findMany({
    where: { deletedAt: null, ...goalOwnedByAnyOf([userId]) },
    select: {
      needsClusterId: true,
      needsZoneId: true,
      needsCityId: true,
      needsSettlementId: true,
      needsCluster: { select: { id: true, name: true, zone: { select: { id: true, name: true } } } },
      needsZone:    { select: { id: true, name: true } },
      needsSettlement: {
        select: {
          id: true, name: true,
          cluster: { select: { id: true, name: true, zone: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  const clusterIds = new Set<string>();
  const clusterNames = new Set<string>();
  const zoneIds = new Set<string>();
  const zoneNames = new Set<string>();
  const settlementIds = new Set<string>();
  const settlementNames = new Set<string>();

  for (const g of goals) {
    // Cluster-scoped goal
    if (g.needsCluster) {
      clusterIds.add(g.needsCluster.id);
      clusterNames.add(g.needsCluster.name);
      if (g.needsCluster.zone) {
        zoneIds.add(g.needsCluster.zone.id);
        zoneNames.add(g.needsCluster.zone.name);
      }
    }
    // Zone-scoped goal
    if (g.needsZone) {
      zoneIds.add(g.needsZone.id);
      zoneNames.add(g.needsZone.name);
    }
    // Settlement-scoped goal — also include parent cluster + zone
    if (g.needsSettlement) {
      settlementIds.add(g.needsSettlement.id);
      settlementNames.add(g.needsSettlement.name);
      if (g.needsSettlement.cluster) {
        clusterIds.add(g.needsSettlement.cluster.id);
        clusterNames.add(g.needsSettlement.cluster.name);
        if (g.needsSettlement.cluster.zone) {
          zoneIds.add(g.needsSettlement.cluster.zone.id);
          zoneNames.add(g.needsSettlement.cluster.zone.name);
        }
      }
    }
  }

  // Cluster-scoped goal already brings its zone above; nothing else to do.
  // For zone-only goals, also pull in their child clusters so the map shows
  // every settlement under the zone the user has work in.
  if (zoneIds.size > 0) {
    const zoneClusters = await prisma.cluster.findMany({
      where: { zoneId: { in: [...zoneIds] }, deletedAt: null },
      select: { id: true, name: true },
    });
    for (const c of zoneClusters) {
      clusterIds.add(c.id);
      clusterNames.add(c.name);
    }
  }

  return Response.json({
    clusterIds: [...clusterIds],
    clusterNames: [...clusterNames],
    zoneIds: [...zoneIds],
    zoneNames: [...zoneNames],
    settlementIds: [...settlementIds],
    settlementNames: [...settlementNames],
    goalCount: goals.length,
  });
}
