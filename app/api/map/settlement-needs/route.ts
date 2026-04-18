import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export type FormulaRow = {
  domain: string;
  label: string | null;
  color: string;
  denominator: number | null;
  populationField: string | null;
  assessmentColumn: string | null;
  domainType: string;
  isActive: boolean;
  sortOrder: number;
};

type PopFields = {
  totalHouseholds: number;
  children6m3yr: number;
  children4to14: number;
  youth15to21: number;
  elderly60plus: number;
};

// Shared helper — used by cluster-needs and zone-needs.
// Fully config-driven: uses populationField and domainType from NeedsFormulaConfig.
export function calcTargets(pop: PopFields, formulaRows: FormulaRow[]): Record<string, number> {
  const popMap: Record<string, number> = {
    totalHouseholds: pop.totalHouseholds,
    children6m3yr: pop.children6m3yr,
    children4to14: pop.children4to14,
    youth15to21: pop.youth15to21,
    elderly60plus: pop.elderly60plus,
  };

  const result: Record<string, number> = {};
  for (const f of formulaRows) {
    if (!f.isActive) continue;
    const popVal = f.populationField ? (popMap[f.populationField] ?? 0) : 0;
    if (f.domainType === "boolean") {
      result[f.domain] = popVal > 0 ? 1 : 0;
    } else {
      result[f.domain] = f.denominator ? Math.floor(popVal / f.denominator) : 0;
    }
  }
  return result;
}

export function buildDomainConfig(formulaRows: FormulaRow[]) {
  return formulaRows
    .filter(f => f.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(f => ({ domain: f.domain, label: f.label ?? f.domain, color: f.color, domainType: f.domainType }));
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

// Normalise a name coming from GeoJSON: collapse unicode spaces, trim
function normaliseName(s: string): string {
  return s.replace(/[\u00a0\u200b\u2009\u202f]+/g, " ").replace(/\s+/g, " ").trim();
}

// GET /api/map/settlement-needs?settlement=NAME&cluster=CLUSTER_NAME
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawSettlement  = url.searchParams.get("settlement");
  const rawCluster     = url.searchParams.get("cluster");

  if (!rawSettlement) return NextResponse.json({ error: "settlement required" }, { status: 400 });

  const settlementName = normaliseName(rawSettlement);
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

  // 3. Fuzzy fallback: first significant word (≥4 chars) as a contains search,
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

  const targets = calcTargets(pop, formulaRows);

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

  return NextResponse.json({ settlement, assessment: assessmentWithEnts, pop, existing, targets, actuals, domainConfig });
}
