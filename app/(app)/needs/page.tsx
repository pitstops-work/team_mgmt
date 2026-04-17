import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import NeedsDashboard from "./NeedsDashboard";

export const dynamic = "force-dynamic";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DomainConfig {
  domain: string;
  label: string;
  color: string;
  domainType: string;          // "count" | "boolean"
  populationField: string | null;
  denominator: number | null;
  sortOrder: number;
  clusterScope: boolean;       // if true, viability minimum is at cluster level, not per-settlement
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
  saturationScore: number;  // 0–100: Σ min(done, apfTarget) / Σ apfTarget × 100
}

export interface DomainProgress {
  overdueGoals: number;
  atRiskGoals: number;
  onTrackGoals: number;
  doneGoals: number;
  expectedByToday: number;  // planned units due ≤ today
  actualDone: number;       // delivered units from Complete goals
  deficit: number;          // positive = behind plan
}

export interface ProgressSummary {
  overdueGoals: number;
  atRiskGoals: number;
  onTrackGoals: number;
  doneGoals: number;
  totalGoals: number;
  deficit: number;
  domains: Record<string, DomainProgress>;
}

export interface EntitlementSummary {
  id: string;
  name: string;
  parentId: string | null;
  eligible: number;
  ngoEnrolled: number;
  surveyEnrolled: number;
}

export interface MonthlyPoint {
  month: string;   // "2026-01"
  label: string;   // "Jan"
  planned: number; // cumulative planned units with targetDate ≤ end of this month
  actual: number;  // cumulative delivered units by end of this month
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
  outcomeCount: number | null;
  targetDate: Date | null;
  updatedAt: Date;
  needsSettlementId: string | null;
  needsClusterId: string | null;
  needsZoneId: string | null;
  metrics: { current: number }[];
  pitstops: { status: string }[];
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
// Settlement-scoped domains: targets computed PER assessment then summed.
// Cluster-scoped domains (ElderlyCentre, YouthResourceCentre): target computed
//   from TOTAL population across all assessments — viability check at group level.
//   At zone/city level callers pass pre-computed cluster targets as overrides
//   so we never apply the formula to zone/city totals (which would be wrong).

function computeStats(
  assessments: AssessmentRow[],
  goals: GoalRow[],
  domainConfigs: DomainConfig[],
  totalCount: number,
  clusterScopedOverrides?: Record<string, number>, // pre-computed targets for cluster-scoped domains
): LevelStats {
  const totalHH = assessments.reduce((s, a) => s + (Number(a.totalHouseholds) || 0), 0);

  // Initialise per-domain accumulators
  const targetSum: Record<string, number> = {};
  const existing:  Record<string, number> = {};
  for (const cfg of domainConfigs) { targetSum[cfg.domain] = 0; existing[cfg.domain] = 0; }

  // Accumulate total pop (needed for cluster-scoped domains when no override provided)
  const totalPop: PopFields = { totalHouseholds: 0, children6m3yr: 0, children4to14: 0, youth15to21: 0, elderly60plus: 0 };

  // Per-assessment: compute target for non-cluster-scoped + sum existing for all
  for (const a of assessments) {
    const pop: PopFields = {
      totalHouseholds: Number(a.totalHouseholds) || 0,
      children6m3yr:   Number(a.children6m3yr)   || 0,
      children4to14:   Number(a.children4to14)   || 0,
      youth15to21:     Number(a.youth15to21)     || 0,
      elderly60plus:   Number(a.elderly60plus)   || 0,
    };
    totalPop.totalHouseholds += pop.totalHouseholds;
    totalPop.children6m3yr   += pop.children6m3yr;
    totalPop.children4to14   += pop.children4to14;
    totalPop.youth15to21     += pop.youth15to21;
    totalPop.elderly60plus   += pop.elderly60plus;
    for (const cfg of domainConfigs) {
      if (!cfg.clusterScope) targetSum[cfg.domain] += formulaTarget(pop, cfg);
      const col = EXISTING_FIELD_MAP[cfg.domain];
      if (col) existing[cfg.domain] += Number(a[col]) || 0;
    }
  }

  // Cluster-scoped domains: use override (zone/city) or total pop (cluster call)
  for (const cfg of domainConfigs.filter(d => d.clusterScope)) {
    targetSum[cfg.domain] = clusterScopedOverrides !== undefined
      ? (clusterScopedOverrides[cfg.domain] ?? 0)
      : formulaTarget(totalPop, cfg);
  }

  // Aggregate goal actuals per domain
  // For Complete goals: use outcomeCount (actual delivered) → parameter (planned) → metric
  // For Active goals: use parameter (planned) as in-progress contribution
  const actuals: Record<string, { done: number; inProgress: number }> = {};
  for (const g of goals) {
    if (!g.needsDomain) continue;
    if (!actuals[g.needsDomain]) actuals[g.needsDomain] = { done: 0, inProgress: 0 };
    if (g.status === "Complete") {
      // Use outcomeCount only if explicitly recorded (> 0); otherwise fall back to parameter.
      // outcomeCount = 0 means "not filled in yet", not "zero delivered".
      const val = (g.outcomeCount != null && g.outcomeCount > 0)
        ? g.outcomeCount
        : (g.parameter ?? g.metrics[0]?.current ?? 0);
      actuals[g.needsDomain].done += val;
    } else if (g.status === "Active") {
      const val = g.parameter ?? g.metrics[0]?.current ?? 0;
      actuals[g.needsDomain].inProgress += val;
    }
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

  // Saturation score: Σ min(done, apfTarget) / Σ apfTarget × 100
  const totalApfTarget = Object.values(domains).reduce((s, d) => s + d.apfTarget, 0);
  const totalDelivered = Object.values(domains).reduce((s, d) => s + Math.min(d.done, d.apfTarget), 0);
  const saturationScore = totalApfTarget > 0 ? Math.round((totalDelivered / totalApfTarget) * 100) : 0;

  return {
    totalHH,
    assessedCount: assessments.length,
    totalCount,
    domains,
    saturationScore,
  };
}

// ── Progress: goal health + delivery deficit per set of goals ────────────────

function computeProgress(goals: GoalRow[], today: Date): ProgressSummary {
  const AT_RISK_DAYS = 30;

  let overdueGoals = 0, atRiskGoals = 0, onTrackGoals = 0, doneGoals = 0;
  const domains: Record<string, DomainProgress> = {};

  for (const g of goals) {
    if (!g.needsDomain) continue;
    if (!domains[g.needsDomain]) {
      domains[g.needsDomain] = { overdueGoals: 0, atRiskGoals: 0, onTrackGoals: 0, doneGoals: 0, expectedByToday: 0, actualDone: 0, deficit: 0 };
    }
    const d = domains[g.needsDomain];
    const param = g.parameter ?? 0;

    // Track how many units were due by today (for deficit calculation)
    if (g.targetDate) {
      const td = new Date(g.targetDate);
      if (td <= today) d.expectedByToday += param;
    }

    if (g.status === "Complete") {
      d.doneGoals++;
      doneGoals++;
      d.actualDone += g.outcomeCount ?? param;
    } else if (g.status === "Active") {
      const td = g.targetDate ? new Date(g.targetDate) : null;
      const daysToDeadline = td ? Math.round((td.getTime() - today.getTime()) / 86400000) : Infinity;

      if (td && td < today) {
        d.overdueGoals++;
        overdueGoals++;
      } else if (daysToDeadline <= AT_RISK_DAYS) {
        const total = g.pitstops.length;
        const done  = g.pitstops.filter(p => p.status === "Done").length;
        if (total > 0 && done / total < 0.5) {
          d.atRiskGoals++;
          atRiskGoals++;
        } else {
          d.onTrackGoals++;
          onTrackGoals++;
        }
      } else {
        d.onTrackGoals++;
        onTrackGoals++;
      }
    }
    // Paused goals omitted from health counts
  }

  let totalDeficit = 0;
  for (const d of Object.values(domains)) {
    d.deficit = Math.max(0, d.expectedByToday - d.actualDone);
    totalDeficit += d.deficit;
  }

  return {
    overdueGoals, atRiskGoals, onTrackGoals, doneGoals,
    totalGoals: overdueGoals + atRiskGoals + onTrackGoals + doneGoals,
    deficit: totalDeficit,
    domains,
  };
}

// ── Monthly trend: planned vs actual cumulative deliveries ───────────────────

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function computeMonthlyTrend(goals: GoalRow[], today: Date): MonthlyPoint[] {
  const year = today.getFullYear();
  return Array.from({ length: 12 }, (_, i) => {
    const monthEnd = new Date(year, i + 1, 0, 23, 59, 59, 999);

    // Planned: cumulative goal parameters due on or before end of this month (this year)
    const planned = goals
      .filter(g => {
        if (!g.targetDate) return false;
        const td = new Date(g.targetDate);
        return td.getFullYear() === year && td <= monthEnd;
      })
      .reduce((s, g) => s + (g.parameter ?? 0), 0);

    // Actual: cumulative delivered by Complete goals whose updatedAt ≤ end of this month
    const actual = goals
      .filter(g => g.status === "Complete" && new Date(g.updatedAt) <= monthEnd)
      .reduce((s, g) => s + (g.outcomeCount ?? g.parameter ?? 0), 0);

    return { month: `${year}-${String(i + 1).padStart(2, "0")}`, label: MONTH_LABELS[i], planned, actual };
  });
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
        id: true,
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
        status: true, needsDomain: true, parameter: true, outcomeCount: true,
        targetDate: true, updatedAt: true,
        needsSettlementId: true, needsClusterId: true, needsZoneId: true,
        metrics: { where: { deletedAt: null }, select: { current: true }, take: 1 },
        pitstops: { where: { deletedAt: null }, select: { status: true } },
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
    clusterScope:   f.clusterScope ?? false,
  }));

  const clusterScopedDomains = domainConfigs.filter(d => d.clusterScope);

  const assessmentBySettlement = Object.fromEntries(latestAssessments.map(a => [a.settlementId, a]));

  // ── Entitlement aggregation ──────────────────────────────────────────────────
  // Use raw SQL — Vercel's build cache serves a stale compiled Prisma module that
  // omits surveyEnrolled from the generated SELECT, so prisma.findMany({ include })
  // returns surveyEnrolled=null for every row even though the DB has real values.
  // Raw SQL bypasses the compiled query entirely.
  type EntBaselineRow = {
    id: string; assessmentId: string; schemeId: string;
    eligibleHouseholds: number; enrolledHouseholds: number;
    surveyEnrolled: number | null; notes: string | null;
    scheme: { id: string; name: string; parentId: string | null };
  };
  const latestAssessmentIdList = latestAssessments.map(a => (a as { id: string }).id);
  const rawEnt = await (prisma as unknown as { $queryRaw: (...a: unknown[]) => Promise<unknown[]> }).$queryRaw`
    SELECT
      eb.id, eb."assessmentId", eb."schemeId",
      eb."eligibleHouseholds", eb."enrolledHouseholds",
      eb."surveyEnrolled", eb.notes,
      es.id AS scheme_id, es.name AS scheme_name, es."parentId" AS scheme_parent_id
    FROM "EntitlementBaseline" eb
    JOIN "EntitlementScheme" es ON es.id = eb."schemeId"
    WHERE eb."assessmentId" = ANY(${latestAssessmentIdList})
      AND eb."eligibleHouseholds" > 0
  `;
  const entBaselines: EntBaselineRow[] = (rawEnt as Array<Record<string, unknown>>).map(r => ({
    id: r.id as string,
    assessmentId: r.assessmentId as string,
    schemeId: r.schemeId as string,
    eligibleHouseholds: Number(r.eligibleHouseholds),
    enrolledHouseholds: Number(r.enrolledHouseholds),
    surveyEnrolled: r.surveyEnrolled != null ? Number(r.surveyEnrolled) : null,
    notes: r.notes as string | null,
    scheme: { id: r.scheme_id as string, name: r.scheme_name as string, parentId: r.scheme_parent_id as string | null },
  }));

  const assessmentToSettlement = Object.fromEntries(
    latestAssessments.map(a => [(a as { id: string }).id, a.settlementId])
  );

  const settlementEntMap: Record<string, EntBaselineRow[]> = {};
  for (const e of entBaselines) {
    const sId = assessmentToSettlement[e.assessmentId];
    if (!sId) continue;
    if (!settlementEntMap[sId]) settlementEntMap[sId] = [];
    settlementEntMap[sId].push(e);
  }

  function aggregateEnt(settlementIds: string[]): EntitlementSummary[] {
    const map: Record<string, EntitlementSummary> = {};
    for (const sId of settlementIds) {
      for (const e of (settlementEntMap[sId] ?? [])) {
        const key = e.schemeId;
        if (!map[key]) map[key] = { id: e.scheme.id, name: e.scheme.name, parentId: e.scheme.parentId, eligible: 0, ngoEnrolled: 0, surveyEnrolled: 0 };
        map[key].eligible += e.eligibleHouseholds;
        map[key].ngoEnrolled += e.enrolledHouseholds;
        map[key].surveyEnrolled += e.surveyEnrolled ?? 0;
      }
    }
    return Object.values(map).filter(e => e.eligible > 0);
  }

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

  // ── Per-cluster stats (computed first — zone/city/settlement reference these) ──
  // cluster-scoped domains use total cluster pop (correct at this level)
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

  // Helper: build cluster-scoped override targets for a set of clusters
  // (sums cluster targets — avoids applying formula to zone/city totals which is wrong)
  function clusterScopedSum(clusterIds: string[]): Record<string, number> {
    const overrides: Record<string, number> = {};
    for (const cfg of clusterScopedDomains) {
      overrides[cfg.domain] = clusterIds.reduce((sum, cid) => {
        return sum + (clusterStatsMap[cid]?.stats.domains[cfg.domain]?.target ?? 0);
      }, 0);
    }
    return overrides;
  }

  // ── Per-zone stats ──
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
        stats: computeStats(
          zoneAssessments, zoneGoals, domainConfigs, zoneSettlements.length,
          clusterScopedSum(zone.clusters.map(c => c.id)),
        ),
      };
    }
  }

  // ── Per-city stats (city toggle) ──
  const cityStatsMap: Record<string, { name: string; stats: LevelStats }> = {};
  for (const city of cities) {
    const cityZoneIds = new Set(city.zones.map(z => z.id));
    const cityClusterIds = city.zones.flatMap(z => z.clusters.map(c => c.id));
    const citySettlements = city.zones.flatMap(z => z.clusters.flatMap(c => c.settlements));
    const cityAssessments = citySettlements.map(s => assessmentBySettlement[s.id]).filter(Boolean) as unknown as AssessmentRow[];
    const cityGoals = goals.filter(g =>
      (g.needsZoneId        && cityZoneIds.has(g.needsZoneId)) ||
      (g.needsClusterId     && cityZoneIds.has(clusterToZone[g.needsClusterId])) ||
      (g.needsSettlementId  && cityZoneIds.has(settlementToZone[g.needsSettlementId]))
    );
    cityStatsMap[city.id] = {
      name: city.name,
      stats: computeStats(
        cityAssessments, cityGoals, domainConfigs, citySettlements.length,
        clusterScopedSum(cityClusterIds),
      ),
    };
  }

  // ── GeoJSON existing-facility counts for Bangalore ──────────────────────────
  // Hardcoded from the static GeoJSON layers (public/data/*.geojson) which are
  // the authoritative physical inventory. fs.readFileSync doesn't work on these
  // files in Vercel Lambdas (public/ is CDN-only, not bundled with server fn).
  // Update these numbers when the GeoJSON files are updated.
  const geoCounts: Record<string, number> = {
    ChildrenCentre:      14,  // children_centres.geojson
    Creche:              14,  // creches.geojson
    YouthResourceCentre:  6,  // youth_centres.geojson (regional centres, not local groups)
  };

  function applyGeoOverrides(stats: LevelStats): LevelStats {
    const domains = { ...stats.domains };
    for (const [domain, geoCount] of Object.entries(geoCounts)) {
      if (!domains[domain] || geoCount === 0) continue;
      const d = domains[domain];
      const apfTarget = Math.max(0, d.target - geoCount);
      domains[domain] = { ...d, existing: geoCount, apfTarget, gap: Math.max(0, apfTarget - d.done) };
    }
    // Recompute saturation score with updated domains
    const totalTarget = Object.values(domains).reduce((s, d) => s + d.apfTarget, 0);
    const totalDone   = Object.values(domains).reduce((s, d) => s + Math.min(d.done, d.apfTarget), 0);
    const saturationScore = totalTarget > 0 ? Math.round((totalDone / totalTarget) * 100) : 0;
    return { ...stats, domains, saturationScore };
  }

  // Apply overrides only for Bangalore city (GeoJSON covers Bangalore facilities)
  const bangaloreCity = cities.find(c => c.name.toLowerCase().includes("bangalore"));
  if (bangaloreCity && cityStatsMap[bangaloreCity.id]) {
    cityStatsMap[bangaloreCity.id] = {
      ...cityStatsMap[bangaloreCity.id],
      stats: applyGeoOverrides(cityStatsMap[bangaloreCity.id].stats),
    };
  }

  // ── City-wide stats (all cities combined) ──
  const allClusterIds = cities.flatMap(c => c.zones.flatMap(z => z.clusters.map(cl => cl.id)));
  const cityStats = applyGeoOverrides(computeStats(
    latestAssessments as unknown as AssessmentRow[], goals, domainConfigs, allSettlements.length,
    clusterScopedSum(allClusterIds),
  ));

  // ── Per-settlement stats ──
  // cluster-scoped domains: assign cluster target to the top-population settlement;
  // all other settlements in that cluster get 0 for those domains.
  const settlementStatsMap: Record<string, { name: string; clusterName: string; zoneName: string; stats: LevelStats }> = {};
  for (const city of cities) {
    for (const zone of city.zones) {
      for (const cluster of zone.clusters) {
        // For each cluster-scoped domain, find the settlement with the highest relevant pop
        const topSettlement: Record<string, string> = {}; // domain → settlementId
        for (const cfg of clusterScopedDomains) {
          if (!cfg.populationField) continue;
          let maxPop = -1;
          let topId = "";
          for (const s of cluster.settlements) {
            const a = assessmentBySettlement[s.id];
            if (!a) continue;
            const pop = Number((a as AssessmentRow)[cfg.populationField]) || 0;
            if (pop > maxPop) { maxPop = pop; topId = s.id; }
          }
          if (topId) topSettlement[cfg.domain] = topId;
        }

        for (const s of cluster.settlements) {
          const a = assessmentBySettlement[s.id];
          const sGoals = goals.filter(g => g.needsSettlementId === s.id);
          const stats = computeStats(a ? [a as unknown as AssessmentRow] : [], sGoals, domainConfigs, 1);

          // Override cluster-scoped domain targets for this settlement
          for (const cfg of clusterScopedDomains) {
            const clusterTarget = clusterStatsMap[cluster.id]?.stats.domains[cfg.domain]?.target ?? 0;
            const isTop = topSettlement[cfg.domain] === s.id;
            const assignedTarget = isTop ? clusterTarget : 0;
            const ex = stats.domains[cfg.domain]?.existing ?? 0;
            const done = stats.domains[cfg.domain]?.done ?? 0;
            const inProg = stats.domains[cfg.domain]?.inProgress ?? 0;
            const apfTarget = Math.max(0, assignedTarget - ex);
            stats.domains[cfg.domain] = { target: assignedTarget, existing: ex, apfTarget, done, inProgress: inProg, gap: Math.max(0, apfTarget - done) };
          }

          settlementStatsMap[s.id] = { name: s.name, clusterName: cluster.name, zoneName: zone.name, stats };
        }
      }
    }
  }

  // ── Progress maps ──────────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const clusterProgressMap: Record<string, ProgressSummary> = {};
  for (const city of cities) {
    for (const zone of city.zones) {
      for (const cluster of zone.clusters) {
        const clGoals = goals.filter(g =>
          g.needsClusterId === cluster.id ||
          (g.needsSettlementId && settlementToCluster[g.needsSettlementId] === cluster.id)
        );
        clusterProgressMap[cluster.id] = computeProgress(clGoals, today);
      }
    }
  }

  const zoneProgressMap: Record<string, ProgressSummary> = {};
  for (const city of cities) {
    for (const zone of city.zones) {
      const zoneGoals = goals.filter(g =>
        g.needsZoneId === zone.id ||
        (g.needsClusterId && clusterToZone[g.needsClusterId] === zone.id) ||
        (g.needsSettlementId && settlementToZone[g.needsSettlementId] === zone.id)
      );
      zoneProgressMap[zone.id] = computeProgress(zoneGoals, today);
    }
  }

  const settlementProgressMap: Record<string, ProgressSummary> = {};
  for (const s of allSettlements) {
    const sGoals = goals.filter(g => g.needsSettlementId === s.id);
    settlementProgressMap[s.id] = computeProgress(sGoals, today);
  }

  const cityProgressMap: Record<string, ProgressSummary> = {};
  for (const city of cities) {
    const cityZoneIds = new Set(city.zones.map(z => z.id));
    const cityGoals = goals.filter(g =>
      (g.needsZoneId       && cityZoneIds.has(g.needsZoneId)) ||
      (g.needsClusterId    && cityZoneIds.has(clusterToZone[g.needsClusterId])) ||
      (g.needsSettlementId && cityZoneIds.has(settlementToZone[g.needsSettlementId]))
    );
    cityProgressMap[city.id] = computeProgress(cityGoals, today);
  }

  const cityProgress   = computeProgress(goals, today);
  const monthlyTrend   = computeMonthlyTrend(goals, today);
  const currentMonth   = today.getMonth(); // 0-indexed

  // ── Entitlement summaries per level ─────────────────────────────────────────
  const cityEntitlements = aggregateEnt(allSettlements.map(s => s.id));

  const cityEntMap: Record<string, EntitlementSummary[]> = {};
  for (const city of cities) {
    const sIds = city.zones.flatMap(z => z.clusters.flatMap(c => c.settlements.map(s => s.id)));
    cityEntMap[city.id] = aggregateEnt(sIds);
  }

  const zoneEntMap: Record<string, EntitlementSummary[]> = {};
  for (const city of cities) {
    for (const zone of city.zones) {
      zoneEntMap[zone.id] = aggregateEnt(zone.clusters.flatMap(c => c.settlements.map(s => s.id)));
    }
  }

  const clusterEntMap: Record<string, EntitlementSummary[]> = {};
  for (const city of cities) {
    for (const zone of city.zones) {
      for (const cluster of zone.clusters) {
        clusterEntMap[cluster.id] = aggregateEnt(cluster.settlements.map(s => s.id));
      }
    }
  }

  const settlementEntSummaryMap: Record<string, EntitlementSummary[]> = {};
  for (const s of allSettlements) {
    settlementEntSummaryMap[s.id] = aggregateEnt([s.id]);
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
      cityProgress={cityProgress}
      cityProgressMap={JSON.parse(JSON.stringify(cityProgressMap))}
      zoneProgress={JSON.parse(JSON.stringify(zoneProgressMap))}
      clusterProgress={JSON.parse(JSON.stringify(clusterProgressMap))}
      settlementProgress={JSON.parse(JSON.stringify(settlementProgressMap))}
      monthlyTrend={monthlyTrend}
      currentMonth={currentMonth}
      cityEntitlements={cityEntitlements}
      cityEntMap={JSON.parse(JSON.stringify(cityEntMap))}
      zoneEntMap={JSON.parse(JSON.stringify(zoneEntMap))}
      clusterEntMap={JSON.parse(JSON.stringify(clusterEntMap))}
      settlementEntMap={JSON.parse(JSON.stringify(settlementEntSummaryMap))}
    />
  );
}
