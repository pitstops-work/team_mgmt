import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

type Health = "red" | "amber" | "green" | "none";
type Period = "month" | "quarter" | "year" | "all";

interface GoalHealth {
  overdueGoals: number;
  atRiskGoals: number;
  onTrackGoals: number;
  doneGoals: number;
}

interface PitstopCount {
  total: number;
  done: number;
}

function emptyHealth(): GoalHealth {
  return { overdueGoals: 0, atRiskGoals: 0, onTrackGoals: 0, doneGoals: 0 };
}

function emptyPitstopCount(): PitstopCount {
  return { total: 0, done: 0 };
}

function toHealth(h: GoalHealth): Health {
  const total = h.overdueGoals + h.atRiskGoals + h.onTrackGoals + h.doneGoals;
  if (total === 0) return "none";
  if (h.overdueGoals > 0) return "red";
  if (h.atRiskGoals > 0) return "amber";
  return "green";
}

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

// GET /api/map/progress-health?period=month|quarter|year|all
// Returns goal health status and checklist % keyed by lowercase name.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const rawPeriod = url.searchParams.get("period") ?? "all";
  const period: Period = ["month", "quarter", "year", "all"].includes(rawPeriod)
    ? (rawPeriod as Period)
    : "all";

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const AT_RISK_DAYS = 30;

  const periodBounds = getPeriodBounds(period);

  // Build pitstop targetDate filter for period
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pitstopWhere: Record<string, any> = { deletedAt: null };
  if (periodBounds.start && periodBounds.end) {
    pitstopWhere.targetDate = { gte: periodBounds.start, lte: periodBounds.end };
  }

  const [goals, pitstopsForPeriod, geography] = await Promise.all([
    prisma.goal.findMany({
      where: { needsDomain: { not: null }, deletedAt: null },
      select: {
        status: true,
        targetDate: true,
        needsSettlementId: true,
        needsClusterId: true,
        needsZoneId: true,
        pitstops: { where: { deletedAt: null }, select: { status: true } },
      },
    }),
    prisma.pitstop.findMany({
      where: {
        ...pitstopWhere,
        goal: { needsDomain: { not: null }, deletedAt: null },
      },
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
    }),
    prisma.city.findMany({
      where: { deletedAt: null },
      select: {
        zones: {
          where: { deletedAt: null },
          select: {
            id: true, name: true,
            clusters: {
              where: { deletedAt: null },
              select: {
                id: true, name: true,
                settlements: {
                  where: { deletedAt: null },
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  // Build lookup maps
  const settlementToCluster: Record<string, string> = {};
  const settlementToZone: Record<string, string> = {};
  const clusterToZone: Record<string, string> = {};

  for (const city of geography) {
    for (const zone of city.zones) {
      for (const cluster of zone.clusters) {
        clusterToZone[cluster.id] = zone.id;
        for (const s of cluster.settlements) {
          settlementToCluster[s.id] = cluster.id;
          settlementToZone[s.id] = zone.id;
        }
      }
    }
  }

  // Accumulate health per settlement / cluster / zone (keyed by DB id)
  const settlementHealth: Record<string, GoalHealth> = {};
  const clusterHealth: Record<string, GoalHealth> = {};
  const zoneHealth: Record<string, GoalHealth> = {};

  for (const g of goals) {
    const td = g.targetDate ? new Date(g.targetDate) : null;
    const daysToDeadline = td ? Math.round((td.getTime() - today.getTime()) / 86400000) : Infinity;

    let goalStatus: "overdue" | "atRisk" | "onTrack" | "done" | "skip";
    if (g.status === "Complete") {
      goalStatus = "done";
    } else if (g.status === "Active") {
      if (td && td < today) {
        goalStatus = "overdue";
      } else if (daysToDeadline <= AT_RISK_DAYS) {
        const total = g.pitstops.length;
        const done  = g.pitstops.filter(p => p.status === "Done").length;
        goalStatus = (total > 0 && done / total < 0.5) ? "atRisk" : "onTrack";
      } else {
        goalStatus = "onTrack";
      }
    } else {
      goalStatus = "skip"; // Paused
    }

    if (goalStatus === "skip") continue;

    const bump = (h: GoalHealth) => {
      if (goalStatus === "overdue")  h.overdueGoals++;
      else if (goalStatus === "atRisk")  h.atRiskGoals++;
      else if (goalStatus === "onTrack") h.onTrackGoals++;
      else if (goalStatus === "done")    h.doneGoals++;
    };

    // Resolve which settlement/cluster/zone IDs this goal touches
    const sId = g.needsSettlementId;
    const cId = g.needsClusterId ?? (sId ? settlementToCluster[sId] : null);
    const zId = g.needsZoneId ?? (cId ? clusterToZone[cId] : null) ?? (sId ? settlementToZone[sId] : null);

    if (sId) { if (!settlementHealth[sId]) settlementHealth[sId] = emptyHealth(); bump(settlementHealth[sId]); }
    if (cId) { if (!clusterHealth[cId])    clusterHealth[cId]    = emptyHealth(); bump(clusterHealth[cId]); }
    if (zId) { if (!zoneHealth[zId])       zoneHealth[zId]       = emptyHealth(); bump(zoneHealth[zId]); }
  }

  // Accumulate pitstop counts for checklist % (by DB id)
  const settlementPitstops: Record<string, PitstopCount> = {};
  const clusterPitstops: Record<string, PitstopCount> = {};
  const zonePitstops: Record<string, PitstopCount> = {};

  for (const p of pitstopsForPeriod) {
    const g = p.goal;
    const sId = g.needsSettlementId;
    const cId = g.needsClusterId ?? (sId ? settlementToCluster[sId] : null);
    const zId = g.needsZoneId ?? (cId ? clusterToZone[cId] : null) ?? (sId ? settlementToZone[sId] : null);

    const isDone = p.status === "Done";

    if (sId) {
      if (!settlementPitstops[sId]) settlementPitstops[sId] = emptyPitstopCount();
      settlementPitstops[sId].total++;
      if (isDone) settlementPitstops[sId].done++;
    }
    if (cId) {
      if (!clusterPitstops[cId]) clusterPitstops[cId] = emptyPitstopCount();
      clusterPitstops[cId].total++;
      if (isDone) clusterPitstops[cId].done++;
    }
    if (zId) {
      if (!zonePitstops[zId]) zonePitstops[zId] = emptyPitstopCount();
      zonePitstops[zId].total++;
      if (isDone) zonePitstops[zId].done++;
    }
  }

  // Convert to name-keyed health maps (lowercase, matching GeoJSON property values)
  const settlements: Record<string, Health> = {};
  const clusters:    Record<string, Health> = {};
  const zones:       Record<string, Health> = {};

  // checklistPct: keyed by lowercase name
  const checklistPct = {
    settlements: {} as Record<string, number>,
    clusters:    {} as Record<string, number>,
    zones:       {} as Record<string, number>,
  };

  for (const city of geography) {
    for (const zone of city.zones) {
      zones[zone.name.toLowerCase()] = toHealth(zoneHealth[zone.id] ?? emptyHealth());
      const zpc = zonePitstops[zone.id];
      if (zpc && zpc.total > 0) {
        checklistPct.zones[zone.name.toLowerCase()] = Math.round((zpc.done / zpc.total) * 100);
      }
      for (const cluster of zone.clusters) {
        clusters[cluster.name.toLowerCase()] = toHealth(clusterHealth[cluster.id] ?? emptyHealth());
        const cpc = clusterPitstops[cluster.id];
        if (cpc && cpc.total > 0) {
          checklistPct.clusters[cluster.name.toLowerCase()] = Math.round((cpc.done / cpc.total) * 100);
        }
        for (const s of cluster.settlements) {
          settlements[s.name.toLowerCase()] = toHealth(settlementHealth[s.id] ?? emptyHealth());
          const spc = settlementPitstops[s.id];
          if (spc && spc.total > 0) {
            checklistPct.settlements[s.name.toLowerCase()] = Math.round((spc.done / spc.total) * 100);
          }
        }
      }
    }
  }

  return NextResponse.json({ settlements, clusters, zones, checklistPct, period });
}
