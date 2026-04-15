import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

type Health = "red" | "amber" | "green" | "none";

interface GoalHealth {
  overdueGoals: number;
  atRiskGoals: number;
  onTrackGoals: number;
  doneGoals: number;
}

function emptyHealth(): GoalHealth {
  return { overdueGoals: 0, atRiskGoals: 0, onTrackGoals: 0, doneGoals: 0 };
}

function toHealth(h: GoalHealth): Health {
  const total = h.overdueGoals + h.atRiskGoals + h.onTrackGoals + h.doneGoals;
  if (total === 0) return "none";
  if (h.overdueGoals > 0) return "red";
  if (h.atRiskGoals > 0) return "amber";
  return "green";
}

// GET /api/map/progress-health
// Returns goal health status keyed by lowercase name for settlements, clusters, zones.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const AT_RISK_DAYS = 30;

  const [goals, geography] = await Promise.all([
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

  // Convert to name-keyed health maps (lowercase, matching GeoJSON property values)
  const settlements: Record<string, Health> = {};
  const clusters:    Record<string, Health> = {};
  const zones:       Record<string, Health> = {};

  for (const city of geography) {
    for (const zone of city.zones) {
      zones[zone.name.toLowerCase()] = toHealth(zoneHealth[zone.id] ?? emptyHealth());
      for (const cluster of zone.clusters) {
        clusters[cluster.name.toLowerCase()] = toHealth(clusterHealth[cluster.id] ?? emptyHealth());
        for (const s of cluster.settlements) {
          settlements[s.name.toLowerCase()] = toHealth(settlementHealth[s.id] ?? emptyHealth());
        }
      }
    }
  }

  return NextResponse.json({ settlements, clusters, zones });
}
