import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export type FormulaRow = {
  domain: string;
  label: string | null;
  color: string;
  numerator: number;        // "X units per N people"; defaults to 1
  denominator: number | null;
  populationField: string | null;
  assessmentColumn: string | null;
  domainType: string;
  civicGroup: string | null;
  civicWeightGroup: string | null;
  isActive: boolean;
  sortOrder: number;
  assessmentLevel: string;  // "settlement" | "cluster" | "zone" | "city"
};

type PopFields = {
  totalHouseholds: number;
  children6m3yr: number;
  children4to14: number;
  youth15to21: number;
  elderly60plus: number;
};

const LEVEL_RANK: Record<string, number> = { settlement: 0, cluster: 1, zone: 2, city: 3 };

/**
 * Context describing the aggregation scope a calcTargets() call represents.
 *
 *  - `scope`            — the level we're computing for (settlement / cluster / zone / city).
 *  - `subUnitsWithPop`  — for boolean domains aggregated above their native level: how many
 *                         sub-units of that level have population > 0. e.g. when scope=zone,
 *                         `subUnitsWithPop.cluster` is the number of clusters in this zone
 *                         that have any population (used for boolean+cluster domains).
 */
export interface AggregationContext {
  scope: "settlement" | "cluster" | "zone" | "city";
  subUnitsWithPop?: {
    settlement?: number;
    cluster?: number;
    zone?: number;
  };
}

// Shared helper — used by cluster-needs and zone-needs.
// Fully config-driven: uses populationField and domainType from NeedsFormulaConfig.
//
// civicWeightedPop: optional map of civicWeightGroup → effective population (already weighted).
//   For settlement level: { borewell: HH × borewellNeedScore/100, ... }
//   For cluster/zone:     sum(HHi × scorei/100) across all settlements in scope.
// When a count domain has civicWeightGroup set and civicWeightedPop is provided,
// that pre-weighted population is used instead of the raw populationField value.
export function calcTargets(
  pop: PopFields,
  formulaRows: FormulaRow[],
  civicWeightedPop?: Record<string, number>,
  ctx?: AggregationContext,
): Record<string, number> {
  const popMap: Record<string, number> = {
    totalHouseholds: pop.totalHouseholds,
    children6m3yr: pop.children6m3yr,
    children4to14: pop.children4to14,
    youth15to21: pop.youth15to21,
    elderly60plus: pop.elderly60plus,
  };

  const scopeRank = LEVEL_RANK[ctx?.scope ?? "settlement"];

  const result: Record<string, number> = {};
  for (const f of formulaRows) {
    if (!f.isActive || f.domainType === "entitlement" || f.domainType === "civic") continue;
    if (f.domainType === "boolean") {
      const aLevel = f.assessmentLevel ?? "settlement";
      const aRank = LEVEL_RANK[aLevel] ?? 0;
      const popVal = f.populationField ? (popMap[f.populationField] ?? 0) : pop.totalHouseholds;

      if (scopeRank < aRank) {
        // Boolean evaluated above this scope — not assessable here yet.
        result[f.domain] = 0;
      } else if (scopeRank === aRank) {
        // Native level: 1 if any population (or if no population field gates it), else 0.
        result[f.domain] = !f.populationField || popVal > 0 ? 1 : 0;
      } else {
        // Aggregated above native level: sum sub-units that need it.
        const subCount = aLevel === "settlement" ? ctx?.subUnitsWithPop?.settlement
                       : aLevel === "cluster"    ? ctx?.subUnitsWithPop?.cluster
                       : aLevel === "zone"       ? ctx?.subUnitsWithPop?.zone
                       : undefined;
        // Fallback when caller didn't provide the count: preserve legacy "1 if any pop" behavior.
        result[f.domain] = subCount !== undefined ? subCount : (popVal > 0 ? 1 : 0);
      }
    } else {
      let popVal = f.populationField ? (popMap[f.populationField] ?? 0) : 0;
      // Civic-weighted population: substitute pre-computed weighted value when available
      if (f.civicWeightGroup && civicWeightedPop) {
        const weighted = civicWeightedPop[f.civicWeightGroup];
        if (weighted != null) popVal = weighted;
      }
      const num = (f.numerator ?? 1) > 0 ? (f.numerator ?? 1) : 1;
      result[f.domain] = f.denominator && popVal >= f.denominator
        ? Math.floor((popVal * num) / f.denominator)
        : 0;
    }
  }
  return result;
}

export function buildDomainConfig(formulaRows: FormulaRow[]) {
  return formulaRows
    .filter(f => f.isActive && f.domainType !== "entitlement") // entitlement domains are shown in the Schemes tab
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(f => ({ domain: f.domain, label: f.label ?? f.domain, color: f.color, domainType: f.domainType, civicGroup: f.civicGroup ?? undefined }));
}

// layerKey → needsDomain mapping — mirrors FacilityLayerConfig.needsDomain in the DB.
// Used to override assessment-based "existing" counts with live LayerFeature counts.
const LAYER_DOMAIN_MAP: Record<string, string> = {
  creches:          "Creche",
  children_centres: "ChildrenCentre",
  youth_centres:    "YouthResourceCentre",
};

// Counts LayerFeature records for a scope and returns { [domain]: count }.
// Overrides the assessment-based existing counts for facility domains that have map records.
export async function layerFeatureExisting(
  filter: { settlementId?: string; clusterId?: string; zoneId?: string },
): Promise<Record<string, number>> {
  const groups = await prisma.layerFeature.groupBy({
    by: ["layerKey"],
    where: filter,
    _count: { id: true },
  });
  const result: Record<string, number> = {};
  for (const g of groups) {
    const domain = LAYER_DOMAIN_MAP[g.layerKey];
    if (domain) result[domain] = g._count.id;
  }
  return result;
}

// Build the "existing" dict from a single assessment row using assessmentColumn from config.
// Returns { [domain]: existingCount } — 0 for domains with no assessmentColumn or no assessment.
export function buildExisting(
  assessment: Record<string, unknown> | null,
  formulaRows: FormulaRow[]
): Record<string, number> {
  if (!assessment) return {};
  const result: Record<string, number> = {};
  for (const f of formulaRows) {
    if (f.assessmentColumn) {
      result[f.domain] = Number(assessment[f.assessmentColumn] ?? 0);
    }
  }
  return result;
}

// Aggregate civic need scores across settlements (for cluster/zone level)
export function avgCivicScores(rows: { borewellNeedScore: number | null; toiletConnNeedScore: number | null; toiletFacNeedScore: number | null; waterSupplyNeedScore: number | null }[]) {
  if (rows.length === 0) return null;
  const avg = (field: keyof typeof rows[0]) => {
    const vals = rows.map(r => r[field]).filter((v): v is number => v != null);
    return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
  };
  return {
    borewellNeedScore:    avg("borewellNeedScore"),
    toiletConnNeedScore:  avg("toiletConnNeedScore"),
    toiletFacNeedScore:   avg("toiletFacNeedScore"),
    waterSupplyNeedScore: avg("waterSupplyNeedScore"),
  };
}

// Normalise a name coming from GeoJSON: collapse unicode spaces, trim
function normaliseName(s: string): string {
  return s.replace(/[ ​  ]+/g, " ").replace(/\s+/g, " ").trim();
}

// Strip trailing area labels appended by cfar GeoJSON (e.g. ", Majestic Area" or " Majestic Area")
function stripAreaSuffix(s: string): string {
  s = s.replace(/,\s*.+?\s+Area\s*$/i, "").trim();  // "Name, Xxx Area"
  s = s.replace(/\s+\w+\s+Area\s*$/i, "").trim();    // "Name Xxx Area"
  s = s.replace(/\s+Majestic\s*$/i, "").trim();       // "Name Majestic"
  return s;
}

function normForDice(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 &]/g, " ").replace(/\s+/g, " ").trim();
}

function diceScore(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bg = (str: string) => { const set = new Set<string>(); for (let i = 0; i < str.length - 1; i++) set.add(str.slice(i, i + 2)); return set; };
  const ba = bg(a), bb = bg(b);
  let shared = 0;
  for (const g of ba) if (bb.has(g)) shared++;
  return (2 * shared) / (ba.size + bb.size);
}

// GET /api/map/settlement-needs?settlement=NAME&cluster=CLUSTER_NAME
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawSettlement  = url.searchParams.get("settlement");
  const rawCluster     = url.searchParams.get("cluster");

  if (!rawSettlement) return NextResponse.json({ error: "settlement required" }, { status: 400 });

  const settlementName = stripAreaSuffix(normaliseName(rawSettlement));
  const clusterName    = rawCluster ? normaliseName(rawCluster).replace(/_/g, " ") : null;

  const settleInclude = { cluster: { include: { zone: true } } };

  // 1. Exact match with cluster constraint
  let settlement = clusterName
    ? await prisma.settlement.findFirst({
        where: { name: { equals: settlementName, mode: "insensitive" }, deletedAt: null,
          cluster: { name: { equals: clusterName, mode: "insensitive" } } },
        include: settleInclude,
      })
    : null;

  // 2. Exact name match without cluster constraint (handles cluster name mismatches)
  if (!settlement) {
    settlement = await prisma.settlement.findFirst({
      where: { name: { equals: settlementName, mode: "insensitive" }, deletedAt: null },
      include: settleInclude,
    });
  }

  // 3. Fuzzy fallback: first significant word (>=4 chars) as a contains search,
  //    scoped to the same cluster when possible
  if (!settlement) {
    const firstWord = settlementName.split(/[\s,\-–(]+/).find(w => w.length >= 4) ?? "";
    if (firstWord) {
      settlement = await prisma.settlement.findFirst({
        where: {
          name: { contains: firstWord, mode: "insensitive" },
          deletedAt: null,
          ...(clusterName ? { cluster: { name: { contains: clusterName.split(/[\s\-–]+/)[0], mode: "insensitive" } } } : {}),
        },
        include: settleInclude,
      });
    }
  }

  // 4. Dice coefficient fallback — scan all settlements, pick best match >= 0.70
  if (!settlement) {
    const allSettlements = await prisma.settlement.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, cluster: { select: { id: true, name: true } } },
    });
    const sn = normForDice(settlementName);
    const cn = clusterName ? normForDice(clusterName.replace(/_/g, " ")) : null;
    let bestId: string | null = null;
    let bestScore = 0;
    for (const s of allSettlements) {
      let score = diceScore(sn, normForDice(s.name));
      if (cn && normForDice(s.cluster.name).split(" ").some(w => w.length > 3 && cn.includes(w))) score += 0.05;
      if (score > bestScore) { bestScore = score; bestId = s.id; }
    }
    if (bestId && bestScore >= 0.70) {
      settlement = await prisma.settlement.findUnique({ where: { id: bestId }, include: settleInclude });
    }
  }

  if (!settlement) return NextResponse.json(null);

  // Latest assessment (without entitlements — fetched via raw SQL below to avoid stale Prisma build cache)
  const assessment = await prisma.settlementAssessment.findFirst({
    where: { settlementId: settlement.id },
    orderBy: { assessedAt: "desc" },
    include: {
      assessedBy: { select: { name: true } },
      roads: true, water: true, sanitation: true,
      drainageSewer: true, drainageStorm: true,
      waste: true, electricity: true, facilities: true, safety: true,
    },
  });

  // Fetch entitlements via raw SQL — Prisma's stale build cache silently drops surveyEnrolled
  type EntRow = { schemeId: string; schemeName: string; parentId: string | null; sortOrder: number | null; eligibleHouseholds: number; enrolledHouseholds: number; surveyEnrolled: number | null };
  const rawEnts: EntRow[] = assessment
    ? await (prisma as unknown as { $queryRaw: (...a: unknown[]) => Promise<EntRow[]> }).$queryRaw`
        SELECT eb."schemeId", es.name AS "schemeName", es."parentId", es."sortOrder",
          eb."eligibleHouseholds", eb."enrolledHouseholds",
          COALESCE(eb."surveyEnrolled", 0) AS "surveyEnrolled"
        FROM "EntitlementBaseline" eb
        JOIN "EntitlementScheme" es ON es.id = eb."schemeId"
        WHERE eb."assessmentId" = ${assessment.id}
          AND eb."eligibleHouseholds" > 0
        ORDER BY es."sortOrder" ASC
      `
    : [];
  // Attach to assessment in the shape NeedsPanel expects
  const assessmentWithEnts = assessment ? {
    ...assessment,
    entitlements: rawEnts.map(e => ({
      scheme: { id: e.schemeId, name: e.schemeName, parentId: e.parentId },
      eligibleHouseholds: Number(e.eligibleHouseholds),
      enrolledHouseholds: Number(e.enrolledHouseholds),
      surveyEnrolled: Number(e.surveyEnrolled ?? 0),
    })),
  } : null;

  // Formula config
  const formulaRows = await prisma.needsFormulaConfig.findMany({ orderBy: { sortOrder: "asc" } });
  const domainConfig = buildDomainConfig(formulaRows);

  // Population (zero if no assessment)
  const pop = assessmentWithEnts
    ? { totalHouseholds: assessmentWithEnts.totalHouseholds, children6m3yr: assessmentWithEnts.children6m3yr, children4to14: assessmentWithEnts.children4to14, youth15to21: assessmentWithEnts.youth15to21, elderly60plus: assessmentWithEnts.elderly60plus }
    : { totalHouseholds: 0, children6m3yr: 0, children4to14: 0, youth15to21: 0, elderly60plus: 0 };

  const existing = buildExisting(assessmentWithEnts as Record<string, unknown> | null, formulaRows);
  // Override with live LayerFeature counts — the map-side source of truth for facility domains
  Object.assign(existing, await layerFeatureExisting({ settlementId: settlement.id }));

  // Civic-weighted population: computed after civicData fetch below, but civicData is fetched later.
  // Fetch it now so calcTargets can use it.
  const civicDataEarly = await prisma.settlementCivicData.findUnique({ where: { settlementId: settlement.id } });
  const civicWeightedPop: Record<string, number> = {};
  if (civicDataEarly && pop.totalHouseholds > 0) {
    const HH = pop.totalHouseholds;
    if (civicDataEarly.borewellNeedScore     != null) civicWeightedPop.borewell         = HH * civicDataEarly.borewellNeedScore     / 100;
    if (civicDataEarly.toiletConnNeedScore   != null) civicWeightedPop.toiletConnection  = HH * civicDataEarly.toiletConnNeedScore   / 100;
    if (civicDataEarly.toiletFacNeedScore    != null) civicWeightedPop.toiletFacility    = HH * civicDataEarly.toiletFacNeedScore    / 100;
    if (civicDataEarly.waterSupplyNeedScore  != null) civicWeightedPop.waterSupply       = HH * civicDataEarly.waterSupplyNeedScore  / 100;
  }
  const targets = calcTargets(pop, formulaRows, civicWeightedPop);

  // APF actuals: done = sum of GoalOutcome.count attributed to this settlement;
  // plan (inProgress) = sum of active goal parameters scoped to this settlement or its cluster.
  const outcomeRows = await prisma.goalOutcome.findMany({
    where: { settlementId: settlement.id },
    select: {
      count: true,
      goal: { select: { needsDomain: true, deletedAt: true } },
    },
  });

  const activeGoals = await prisma.goal.findMany({
    where: {
      needsDomain: { not: null },
      status: "Active",
      deletedAt: null,
      OR: [
        { needsSettlementId: settlement.id },
        { needsClusterId: settlement.clusterId },
      ],
    },
    select: { needsDomain: true, parameter: true, metrics: { where: { deletedAt: null }, select: { current: true }, take: 1 } },
  });

  const actuals: Record<string, { done: number; inProgress: number }> = {};

  for (const row of outcomeRows) {
    const domain = row.goal.needsDomain;
    if (!domain || row.goal.deletedAt) continue;
    if (!actuals[domain]) actuals[domain] = { done: 0, inProgress: 0 };
    actuals[domain].done += row.count;
  }

  for (const g of activeGoals) {
    if (!g.needsDomain) continue;
    const d = g.needsDomain as string;
    if (!actuals[d]) actuals[d] = { done: 0, inProgress: 0 };
    actuals[d].inProgress += g.parameter ?? g.metrics[0]?.current ?? 0;
  }

  // Addressable need — hardcoded domain mapping (field-verified feasibility, not formula)
  const addressable: Record<string, number> = {};
  if (assessment) {
    if (assessment.addressableCreches != null)   addressable["Creche"]          = assessment.addressableCreches;
    if (assessment.addressableToilets != null)   addressable["CommunityToilet"] = assessment.addressableToilets;
    if (assessment.addressableWaterATMs != null) addressable["WaterATM"]        = assessment.addressableWaterATMs;
  }

  // Civic data from Janadhikara survey (already fetched above for calcTargets)
  const civicData = civicDataEarly;

  return NextResponse.json({ settlement, assessment: assessmentWithEnts, pop, existing, targets, actuals, domainConfig, addressable, civicData: civicData ?? null });
}
