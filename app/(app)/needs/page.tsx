import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import NeedsDashboard from "./NeedsDashboard";

const DOMAIN_KEYS = ["Creche", "ChildrenCentre", "YouthGroup", "ElderlyKitchen", "PalliativeSupport", "CommunityToilet", "WaterATM"] as const;
type DomainKey = typeof DOMAIN_KEYS[number];

export interface DomainSummary { target: number; existing: number; apfTarget: number; done: number; inProgress: number; gap: number }
export type DomainStats = Record<DomainKey, DomainSummary>;
export interface LevelStats { totalHH: number; assessedCount: number; totalCount: number; domains: DomainStats }

type PopFields = { totalHouseholds: number; children6m3yr: number; children4to14: number; youth15to21: number; elderly60plus: number };
type ExistingFields = { existingCreches: number; existingChildrenCentres: number; existingYouthGroups: number; existingElderlyKitchens: number; existingPalliativeUnits: number; existingCommunityToilets: number; existingWaterATMs: number };
type AssessmentFields = PopFields & ExistingFields;
type GoalRow = { status: string; needsDomain: string | null; parameter: number | null; needsSettlementId: string | null; needsClusterId: string | null; needsZoneId: string | null; metrics: { current: number }[] };

function formulaTargets(pop: PopFields, formulas: Record<string, number>): Record<DomainKey, number> {
  const ceil = (v: number, d: number) => v > 0 ? Math.ceil(v / d) : 0;
  return {
    Creche:            ceil(pop.children6m3yr,     formulas["Creche"]            ?? 20),
    ChildrenCentre:    ceil(pop.children4to14,     formulas["ChildrenCentre"]    ?? 500),
    YouthGroup:        ceil(pop.youth15to21,        formulas["YouthGroup"]        ?? 30),
    ElderlyKitchen:    ceil(pop.elderly60plus,      formulas["ElderlyKitchen"]    ?? 50),
    PalliativeSupport: ceil(pop.elderly60plus,      formulas["PalliativeSupport"] ?? 100),
    CommunityToilet:   ceil(pop.totalHouseholds,    formulas["CommunityToilet"]   ?? 200),
    WaterATM:          ceil(pop.totalHouseholds,    formulas["WaterATM"]          ?? 250),
  };
}

function computeStats(
  assessments: AssessmentFields[],
  goals: GoalRow[],
  formulas: Record<string, number>,
  totalCount: number,
): LevelStats {
  const totalPop: PopFields = assessments.reduce((acc, a) => ({
    totalHouseholds: acc.totalHouseholds + a.totalHouseholds,
    children6m3yr:   acc.children6m3yr   + a.children6m3yr,
    children4to14:   acc.children4to14   + a.children4to14,
    youth15to21:     acc.youth15to21     + a.youth15to21,
    elderly60plus:   acc.elderly60plus   + a.elderly60plus,
  }), { totalHouseholds: 0, children6m3yr: 0, children4to14: 0, youth15to21: 0, elderly60plus: 0 });

  const targets = formulaTargets(totalPop, formulas);

  const existing: Record<DomainKey, number> = {
    Creche:            assessments.reduce((s, a) => s + a.existingCreches,           0),
    ChildrenCentre:    assessments.reduce((s, a) => s + a.existingChildrenCentres,   0),
    YouthGroup:        assessments.reduce((s, a) => s + a.existingYouthGroups,       0),
    ElderlyKitchen:    assessments.reduce((s, a) => s + a.existingElderlyKitchens,   0),
    PalliativeSupport: assessments.reduce((s, a) => s + a.existingPalliativeUnits,   0),
    CommunityToilet:   assessments.reduce((s, a) => s + a.existingCommunityToilets,  0),
    WaterATM:          assessments.reduce((s, a) => s + a.existingWaterATMs,         0),
  };

  const actuals: Record<string, { done: number; inProgress: number }> = {};
  for (const g of goals) {
    if (!g.needsDomain) continue;
    const d = g.needsDomain;
    if (!actuals[d]) actuals[d] = { done: 0, inProgress: 0 };
    const val = g.parameter ?? g.metrics[0]?.current ?? 0;
    if (g.status === "Complete") actuals[d].done += val;
    else if (g.status === "Active") actuals[d].inProgress += val;
  }

  const domains = {} as DomainStats;
  for (const d of DOMAIN_KEYS) {
    const target    = targets[d];
    const ex        = existing[d];
    const apfTarget = Math.max(0, target - ex);
    const done      = actuals[d]?.done      ?? 0;
    const inProg    = actuals[d]?.inProgress ?? 0;
    domains[d]      = { target, existing: ex, apfTarget, done, inProgress: inProg, gap: Math.max(0, apfTarget - done) };
  }

  return { totalHH: totalPop.totalHouseholds, assessedCount: assessments.length, totalCount, domains };
}

export default async function NeedsPage() {
  const session = await auth();

  const [cities, formulaRows, latestAssessments, goals] = await Promise.all([
    prisma.city.findMany({
      where: { deletedAt: null },
      include: {
        zones: {
          where: { deletedAt: null },
          orderBy: { name: "asc" },
          include: {
            clusters: {
              where: { deletedAt: null },
              orderBy: { name: "asc" },
              include: {
                settlements: {
                  where: { deletedAt: null },
                  orderBy: { name: "asc" },
                  include: {
                    assessments: {
                      orderBy: { assessedAt: "desc" },
                      take: 1,
                      select: { id: true, assessmentYear: true, assessedAt: true, totalHouseholds: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.needsFormulaConfig.findMany(),
    // Latest assessment per settlement — full population + existing facility counts
    prisma.settlementAssessment.findMany({
      orderBy: [{ settlementId: "asc" }, { assessedAt: "desc" }],
      distinct: ["settlementId"],
      select: {
        settlementId: true,
        totalHouseholds: true, children6m3yr: true, children4to14: true,
        youth15to21: true, elderly60plus: true,
        existingCreches: true, existingChildrenCentres: true, existingYouthGroups: true,
        existingElderlyKitchens: true, existingPalliativeUnits: true,
        existingCommunityToilets: true, existingWaterATMs: true,
      },
    }),
    prisma.goal.findMany({
      where: { needsDomain: { not: null }, deletedAt: null },
      select: {
        status: true, needsDomain: true, parameter: true,
        needsSettlementId: true, needsClusterId: true, needsZoneId: true,
        metrics: { where: { deletedAt: null }, select: { current: true }, take: 1 },
      },
    }),
  ]);

  const formulas = Object.fromEntries(formulaRows.map(f => [f.domain, f.denominator]));
  const assessmentBySettlement = Object.fromEntries(latestAssessments.map(a => [a.settlementId, a]));

  // Build settlement → zone/cluster lookup
  const settlementToCluster: Record<string, string>  = {};
  const settlementToZone: Record<string, string>     = {};
  const clusterToZone: Record<string, string>        = {};

  for (const city of cities) {
    for (const zone of city.zones) {
      for (const cluster of zone.clusters) {
        clusterToZone[cluster.id] = zone.id;
        for (const s of cluster.settlements) {
          settlementToCluster[s.id] = cluster.id;
          settlementToZone[s.id]    = zone.id;
        }
      }
    }
  }

  // ── City-wide stats ──────────────────────────────────────────────────────────
  const allSettlements = cities.flatMap(c => c.zones.flatMap(z => z.clusters.flatMap(cl => cl.settlements)));
  const cityStats = computeStats(latestAssessments, goals, formulas, allSettlements.length);

  // ── Per-zone stats ───────────────────────────────────────────────────────────
  const zoneStatsMap: Record<string, { name: string; cityName: string; stats: LevelStats }> = {};
  for (const city of cities) {
    for (const zone of city.zones) {
      const zoneSettlements = zone.clusters.flatMap(c => c.settlements);
      const zoneAssessments = zoneSettlements.map(s => assessmentBySettlement[s.id]).filter(Boolean) as AssessmentFields[];
      const zoneGoals = goals.filter(g =>
        g.needsZoneId === zone.id ||
        (g.needsClusterId && clusterToZone[g.needsClusterId] === zone.id) ||
        (g.needsSettlementId && settlementToZone[g.needsSettlementId] === zone.id)
      );
      zoneStatsMap[zone.id] = { name: zone.name, cityName: city.name, stats: computeStats(zoneAssessments, zoneGoals, formulas, zoneSettlements.length) };
    }
  }

  // ── Per-cluster stats ────────────────────────────────────────────────────────
  const clusterStatsMap: Record<string, { name: string; zoneName: string; cityName: string; stats: LevelStats }> = {};
  for (const city of cities) {
    for (const zone of city.zones) {
      for (const cluster of zone.clusters) {
        const clAssessments = cluster.settlements.map(s => assessmentBySettlement[s.id]).filter(Boolean) as AssessmentFields[];
        const clGoals = goals.filter(g =>
          g.needsClusterId === cluster.id ||
          (g.needsSettlementId && settlementToCluster[g.needsSettlementId] === cluster.id)
        );
        clusterStatsMap[cluster.id] = { name: cluster.name, zoneName: zone.name, cityName: city.name, stats: computeStats(clAssessments, clGoals, formulas, cluster.settlements.length) };
      }
    }
  }

  // ── Per-settlement stats ─────────────────────────────────────────────────────
  const settlementStatsMap: Record<string, { name: string; clusterName: string; zoneName: string; stats: LevelStats }> = {};
  for (const city of cities) {
    for (const zone of city.zones) {
      for (const cluster of zone.clusters) {
        for (const s of cluster.settlements) {
          const a = assessmentBySettlement[s.id];
          const sGoals = goals.filter(g => g.needsSettlementId === s.id);
          settlementStatsMap[s.id] = {
            name: s.name, clusterName: cluster.name, zoneName: zone.name,
            stats: computeStats(a ? [a] : [], sGoals, formulas, 1),
          };
        }
      }
    }
  }

  return (
    <NeedsDashboard
      cities={JSON.parse(JSON.stringify(cities))}
      currentUserId={session!.user!.id!}
      totalSettlements={allSettlements.length}
      cityStats={cityStats}
      zoneStats={JSON.parse(JSON.stringify(zoneStatsMap))}
      clusterStats={JSON.parse(JSON.stringify(clusterStatsMap))}
      settlementStats={JSON.parse(JSON.stringify(settlementStatsMap))}
    />
  );
}
