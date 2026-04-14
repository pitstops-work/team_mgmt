import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import NeedsDashboard from "./NeedsDashboard";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DomainConfig {
  domain: string;
  label: string;
  color: string;
  domainType: string;          // "count" | "boolean"
  populationField: string | null;
  denominator: number | null;
  sortOrder: number;
}

export interface DomainSummary {
  target: number;
  existing: number;
  apfTarget: number;
  done: number;
  inProgress: number;
  gap: number;
}

export type DomainStats = Record<string, DomainSummary>;

export interface LevelStats {
  totalHH: number;
  assessedCount: number;
  totalCount: number;
  domains: DomainStats;
}

// ── Maps: domain key → DB column for existing-infrastructure counts ──────────
// These must match the actual column names in SettlementAssessment.
const EXISTING_FIELD_MAP: Record<string, string> = {
  Creche:               "existingCreches",
  ChildrenCentre:       "existingChildrenCentres",
  YouthGroup:           "existingYouthGroups",
  YouthResourceCentre:  "existingYouthResourceCentres",
  ElderlyKitchen:       "existingElderlyKitchens",
  ElderlyCentre:        "existingElderlyCentres",
  PalliativeSupport:    "existingPalliativeUnits",
  PalliativeCareService:"existingPalliativeCareServices",
  ReferralSystem:       "existingReferralSystems",
  CommunityToilet:      "existingCommunityToilets",
  WaterATM:             "existingWaterATMs",
};

type PopFields = {
  totalHouseholds: number;
  children6m3yr: number;
  children4to14: number;
  youth15to21: number;
  elderly60plus: number;
};

type AssessmentRow = PopFields & { [key: string]: unknown };

type GoalRow = {
  status: string;
  needsDomain: string | null;
  parameter: number | null;
  needsSettlementId: string | null;
  needsClusterId: string | null;
  needsZoneId: string | null;
  metrics: { current: number }[];
};

// ── Formula: how many units needed for a single settlement's population ───────
// Count domains: denominator is BOTH the divisor AND the minimum viable threshold.
//   floor(pop / denom) — naturally 0 when pop < denom (not viable to establish).
// Boolean domains: evaluated per settlement (1 if any relevant population, else 0).
//   At aggregate levels we sum per-settlement booleans so city shows
//   "N settlements need a referral system", not just 1.

function formulaTarget(pop: PopFields, cfg: DomainConfig): number {
  if (cfg.domainType === "boolean") {
    const field = cfg.populationField as keyof PopFields | null;
    const popVal = field ? pop[field] : pop.totalHouseholds;
    return popVal > 0 ? 1 : 0;
  }
  if (!cfg.populationField || !cfg.denominator) return 0;
  const popVal = pop[cfg.populationField as keyof PopFields] ?? 0;
  return Math.floor(popVal / cfg.denominator);   // 0 when pop < denom (not viable)
}

// ── Aggregate stats for a set of assessments + goals ────────────────────────
// Targets are computed PER assessment then summed — this ensures boolean domains
// count correctly at zone/cluster/city level, and count domains respect the
// per-settlement viability threshold.

function computeStats(
  assessments: AssessmentRow[],
  goals: GoalRow[],
  domainConfigs: DomainConfig[],
  totalCount: number,
): LevelStats {
  const totalHH = assessments.reduce((s, a) => s + (Number(a.totalHouseholds) || 0), 0);

  // Initialise per-domain accumulators
  const targetSum: Record<string, number> = {};
  const existing:  Record<string, number> = {};
  for (const cfg of domainConfigs) { targetSum[cfg.domain] = 0; existing[cfg.domain] = 0; }

  // Per-assessment: compute target + sum existing
  for (const a of assessments) {
    const pop: PopFields = {
      totalHouseholds: Number(a.totalHouseholds) || 0,
      children6m3yr:   Number(a.children6m3yr)   || 0,
      children4to14:   Number(a.children4to14)   || 0,
      youth15to21:     Number(a.youth15to21)     || 0,
      elderly60plus:   Number(a.elderly60plus)   || 0,
    };
    for (const cfg of domainConfigs) {
      targetSum[cfg.domain] += formulaTarget(pop, cfg);
      const col = EXISTING_FIELD_MAP[cfg.domain];
      if (col) existing[cfg.domain] += Number(a[col]) || 0;
    }
  }

  // Aggregate goal actuals per domain
  const actuals: Record<string, { done: number; inProgress: number }> = {};
  for (const g of goals) {
    if (!g.needsDomain) continue;
    if (!actuals[g.needsDomain]) actuals[g.needsDomain] = { done: 0, inProgress: 0 };
    const val = g.parameter ?? g.metrics[0]?.current ?? 0;
    if (g.status === "Complete")   actuals[g.needsDomain].done       += val;
    else if (g.status === "Active") actuals[g.needsDomain].inProgress += val;
  }

  const domains: DomainStats = {};
  for (const cfg of domainConfigs) {
    const target = targetSum[cfg.domain];
    const ex     = existing[cfg.domain] ?? 0;
    const apfTarget = Math.max(0, target - ex);
    const done      = actuals[cfg.domain]?.done      ?? 0;
    const inProg    = actuals[cfg.domain]?.inProgress ?? 0;
    domains[cfg.domain] = {
      target,
      existing: ex,
      apfTarget,
      done,
      inProgress: inProg,
      gap: Math.max(0, apfTarget - done),
    };
  }

  return {
    totalHH,
    assessedCount: assessments.length,
    totalCount,
    domains,
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────

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
    prisma.needsFormulaConfig.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    // Latest assessment per settlement — full population + all existing facility counts
    prisma.settlementAssessment.findMany({
      orderBy: [{ settlementId: "asc" }, { assessedAt: "desc" }],
      distinct: ["settlementId"],
      select: {
        settlementId: true,
        totalHouseholds: true, children6m3yr: true, children4to14: true,
        youth15to21: true, elderly60plus: true,
        existingCreches: true, existingChildrenCentres: true, existingYouthGroups: true,
        existingYouthResourceCentres: true,
        existingElderlyKitchens: true, existingElderlyCentres: true,
        existingPalliativeUnits: true, existingPalliativeCareServices: true,
        existingReferralSystems: true,
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

  // Build domain configs from DB rows
  const domainConfigs: DomainConfig[] = formulaRows.map(f => ({
    domain:         f.domain,
    label:          f.label ?? f.domain,
    color:          f.color ?? "#6b7280",
    domainType:     f.domainType ?? "count",
    populationField:f.populationField ?? null,
    denominator:    f.denominator ?? null,
    sortOrder:      f.sortOrder ?? 0,
  }));

  const assessmentBySettlement = Object.fromEntries(latestAssessments.map(a => [a.settlementId, a]));

  // Build settlement → zone/cluster lookup
  const settlementToCluster: Record<string, string> = {};
  const settlementToZone: Record<string, string>    = {};
  const clusterToZone: Record<string, string>       = {};

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

  const allSettlements = cities.flatMap(c => c.zones.flatMap(z => z.clusters.flatMap(cl => cl.settlements)));

  // City-wide stats
  const cityStats = computeStats(latestAssessments as unknown as AssessmentRow[], goals, domainConfigs, allSettlements.length);

  // Per-city stats (for city toggle)
  const cityStatsMap: Record<string, { name: string; stats: LevelStats }> = {};
  for (const city of cities) {
    const cityZoneIds = new Set(city.zones.map(z => z.id));
    const citySettlements = city.zones.flatMap(z => z.clusters.flatMap(c => c.settlements));
    const cityAssessments = citySettlements.map(s => assessmentBySettlement[s.id]).filter(Boolean) as unknown as AssessmentRow[];
    const cityGoals = goals.filter(g =>
      (g.needsZoneId        && cityZoneIds.has(g.needsZoneId)) ||
      (g.needsClusterId     && cityZoneIds.has(clusterToZone[g.needsClusterId])) ||
      (g.needsSettlementId  && cityZoneIds.has(settlementToZone[g.needsSettlementId]))
    );
    cityStatsMap[city.id] = {
      name: city.name,
      stats: computeStats(cityAssessments, cityGoals, domainConfigs, citySettlements.length),
    };
  }

  // Per-zone stats
  const zoneStatsMap: Record<string, { name: string; cityName: string; stats: LevelStats }> = {};
  for (const city of cities) {
    for (const zone of city.zones) {
      const zoneSettlements = zone.clusters.flatMap(c => c.settlements);
      const zoneAssessments = zoneSettlements.map(s => assessmentBySettlement[s.id]).filter(Boolean) as unknown as AssessmentRow[];
      const zoneGoals = goals.filter(g =>
        g.needsZoneId === zone.id ||
        (g.needsClusterId && clusterToZone[g.needsClusterId] === zone.id) ||
        (g.needsSettlementId && settlementToZone[g.needsSettlementId] === zone.id)
      );
      zoneStatsMap[zone.id] = {
        name: zone.name,
        cityName: city.name,
        stats: computeStats(zoneAssessments, zoneGoals, domainConfigs, zoneSettlements.length),
      };
    }
  }

  // Per-cluster stats
  const clusterStatsMap: Record<string, { name: string; zoneName: string; cityName: string; stats: LevelStats }> = {};
  for (const city of cities) {
    for (const zone of city.zones) {
      for (const cluster of zone.clusters) {
        const clAssessments = cluster.settlements.map(s => assessmentBySettlement[s.id]).filter(Boolean) as unknown as AssessmentRow[];
        const clGoals = goals.filter(g =>
          g.needsClusterId === cluster.id ||
          (g.needsSettlementId && settlementToCluster[g.needsSettlementId] === cluster.id)
        );
        clusterStatsMap[cluster.id] = {
          name: cluster.name,
          zoneName: zone.name,
          cityName: city.name,
          stats: computeStats(clAssessments, clGoals, domainConfigs, cluster.settlements.length),
        };
      }
    }
  }

  // Per-settlement stats
  const settlementStatsMap: Record<string, { name: string; clusterName: string; zoneName: string; stats: LevelStats }> = {};
  for (const city of cities) {
    for (const zone of city.zones) {
      for (const cluster of zone.clusters) {
        for (const s of cluster.settlements) {
          const a = assessmentBySettlement[s.id];
          const sGoals = goals.filter(g => g.needsSettlementId === s.id);
          settlementStatsMap[s.id] = {
            name: s.name,
            clusterName: cluster.name,
            zoneName: zone.name,
            stats: computeStats(a ? [a as unknown as AssessmentRow] : [], sGoals, domainConfigs, 1),
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
      domainConfigs={domainConfigs}
      cityStats={cityStats}
      cityStatsMap={JSON.parse(JSON.stringify(cityStatsMap))}
      zoneStats={JSON.parse(JSON.stringify(zoneStatsMap))}
      clusterStats={JSON.parse(JSON.stringify(clusterStatsMap))}
      settlementStats={JSON.parse(JSON.stringify(settlementStatsMap))}
    />
  );
}
