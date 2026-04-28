import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

type Period = "month" | "quarter" | "year" | "all";

function getPeriodBounds(period: Period): { start: Date | null; end: Date | null } {
  if (period === "all") return { start: null, end: null };

  const now = new Date();
  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }
  if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    const end   = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
    return { start, end };
  }
  // year
  const start = new Date(now.getFullYear(), 0, 1);
  const end   = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  return { start, end };
}

// GET /api/needs/progress-checklist?period=month|quarter|year|all&city=cityId
// Returns pitstop checklist completion grouped by cluster.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const rawPeriod = url.searchParams.get("period") ?? "all";
  const cityParam = url.searchParams.get("city") ?? null;

  const period: Period = ["month", "quarter", "year", "all"].includes(rawPeriod)
    ? (rawPeriod as Period)
    : "all";

  const periodBounds = getPeriodBounds(period);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pitstopWhere: Record<string, any> = {
    deletedAt: null,
    goal: {
      needsDomain: { not: null },
      deletedAt: null,
    },
  };

  if (periodBounds.start && periodBounds.end) {
    pitstopWhere.targetDate = { gte: periodBounds.start, lte: periodBounds.end };
  }

  // Fetch all geography for lookup (optionally filtered by city)
  const geography = await prisma.city.findMany({
    where: cityParam ? { id: cityParam, deletedAt: null } : { deletedAt: null },
    select: {
      id: true,
      name: true,
      zones: {
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          clusters: {
            where: { deletedAt: null },
            select: {
              id: true,
              name: true,
              settlements: {
                where: { deletedAt: null },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });

  // Build settlement → cluster and cluster → zone lookups
  const settlementToCluster: Record<string, string> = {};
  const clusterToZone: Record<string, { zoneId: string; zoneName: string; cityId: string }> = {};
  const clusterMeta: Record<string, { name: string; zoneName: string; cityId: string }> = {};

  for (const city of geography) {
    for (const zone of city.zones) {
      for (const cluster of zone.clusters) {
        clusterToZone[cluster.id] = { zoneId: zone.id, zoneName: zone.name, cityId: city.id };
        clusterMeta[cluster.id] = { name: cluster.name, zoneName: zone.name, cityId: city.id };
        for (const s of cluster.settlements) {
          settlementToCluster[s.id] = cluster.id;
        }
      }
    }
  }

  const pitstops = await prisma.pitstop.findMany({
    where: pitstopWhere,
    select: {
      status: true,
      goal: {
        select: {
          needsSettlementId: true,
          needsClusterId: true,
          needsZoneId: true,
        },
      },
    },
  });

  // Accumulate per cluster
  const clusterCounts: Record<string, { total: number; done: number }> = {};

  for (const p of pitstops) {
    const g = p.goal;
    // Resolve cluster ID
    const cId = g.needsClusterId ?? (g.needsSettlementId ? settlementToCluster[g.needsSettlementId] : null);
    if (!cId) continue;
    // Skip if city filter set and cluster not in that city
    if (cityParam && clusterToZone[cId]?.cityId !== cityParam) continue;

    if (!clusterCounts[cId]) clusterCounts[cId] = { total: 0, done: 0 };
    clusterCounts[cId].total++;
    if (p.status === "Done") clusterCounts[cId].done++;
  }

  // Build result clusters array
  const clusters = Object.entries(clusterCounts)
    .filter(([cId]) => clusterMeta[cId])
    .map(([cId, counts]) => {
      const meta = clusterMeta[cId];
      return {
        id: cId,
        name: meta.name,
        zoneName: meta.zoneName,
        total: counts.total,
        done: counts.done,
        pct: counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0,
      };
    })
    .sort((a, b) => a.pct - b.pct); // worst first

  // Compute city-level pct per city
  const cityTotals: Record<string, { total: number; done: number }> = {};
  for (const [cId, counts] of Object.entries(clusterCounts)) {
    const cityId = clusterToZone[cId]?.cityId;
    if (!cityId) continue;
    if (!cityTotals[cityId]) cityTotals[cityId] = { total: 0, done: 0 };
    cityTotals[cityId].total += counts.total;
    cityTotals[cityId].done += counts.done;
  }

  const cityPct: Record<string, number> = {};
  for (const [cityId, t] of Object.entries(cityTotals)) {
    cityPct[cityId] = t.total > 0 ? Math.round((t.done / t.total) * 100) : 0;
  }

  return NextResponse.json({ clusters, cityPct, period });
}
