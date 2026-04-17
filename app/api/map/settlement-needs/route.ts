import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Shared helper — also used by cluster-needs and zone-needs
export function calcTargets(
  pop: { totalHouseholds: number; children6m3yr: number; children4to14: number; youth15to21: number; elderly60plus: number },
  formulas: Record<string, number | null>
) {
  // floor = denominator is both divisor AND minimum viable threshold (0 when pop < denom)
  const flr = (v: number, d: number | null | undefined) => d ? Math.floor(v / d) : 0;
  return {
    Creche:              flr(pop.children6m3yr,  formulas["Creche"]             ?? 20),
    ChildrenCentre:      flr(pop.children4to14,  formulas["ChildrenCentre"]     ?? 500),
    YouthGroup:          flr(pop.youth15to21,     formulas["YouthGroup"]         ?? 30),
    YouthResourceCentre: flr(pop.youth15to21,     formulas["YouthResourceCentre"]?? 1500),
    ElderlyKitchen:      flr(pop.elderly60plus,   formulas["ElderlyKitchen"]     ?? 50),
    ElderlyCentre:       flr(pop.elderly60plus,   formulas["ElderlyCentre"]      ?? 1000),
    PalliativeSupport:   flr(pop.elderly60plus,   formulas["PalliativeSupport"]  ?? 100),
    CommunityToilet:     flr(pop.totalHouseholds, formulas["CommunityToilet"]    ?? 200),
    WaterATM:            flr(pop.totalHouseholds, formulas["WaterATM"]           ?? 250),
    // Boolean domains: 1 per settlement if relevant pop exists
    ReferralSystem: pop.elderly60plus > 0 ? 1 : 0,
  };
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
  const formulaRows = await prisma.needsFormulaConfig.findMany();
  const formulas = Object.fromEntries(formulaRows.map(f => [f.domain, f.denominator]));

  // Population (zero if no assessment)
  const pop = assessmentWithEnts
    ? { totalHouseholds: assessmentWithEnts.totalHouseholds, children6m3yr: assessmentWithEnts.children6m3yr, children4to14: assessmentWithEnts.children4to14, youth15to21: assessmentWithEnts.youth15to21, elderly60plus: assessmentWithEnts.elderly60plus }
    : { totalHouseholds: 0, children6m3yr: 0, children4to14: 0, youth15to21: 0, elderly60plus: 0 };

  const existing = assessmentWithEnts
    ? { Creche: assessmentWithEnts.existingCreches, ChildrenCentre: assessmentWithEnts.existingChildrenCentres, YouthGroup: assessmentWithEnts.existingYouthGroups, ElderlyKitchen: assessmentWithEnts.existingElderlyKitchens, PalliativeSupport: assessmentWithEnts.existingPalliativeUnits, CommunityToilet: assessmentWithEnts.existingCommunityToilets, WaterATM: assessmentWithEnts.existingWaterATMs }
    : { Creche: 0, ChildrenCentre: 0, YouthGroup: 0, ElderlyKitchen: 0, PalliativeSupport: 0, CommunityToilet: 0, WaterATM: 0 };

  const targets = calcTargets(pop, formulas);

  // APF actuals from goals
  const goals = await prisma.goal.findMany({
    where: {
      needsDomain: { not: null },
      deletedAt: null,
      OR: [
        { needsSettlementId: settlement.id },
        { needsClusterId: settlement.clusterId },
      ],
    },
    select: { status: true, needsDomain: true, parameter: true, outcomeCount: true, metrics: { where: { deletedAt: null }, select: { current: true }, take: 1 } },
  });

  const actuals: Record<string, { done: number; inProgress: number }> = {};
  for (const g of goals) {
    if (!g.needsDomain) continue;
    const d = g.needsDomain as string;
    if (!actuals[d]) actuals[d] = { done: 0, inProgress: 0 };
    if (g.status === "Complete") {
      const oc = (g as { outcomeCount?: number | null }).outcomeCount;
      const val = (oc != null && oc > 0) ? oc : (g.parameter ?? g.metrics[0]?.current ?? 0);
      actuals[d].done += val;
    } else if (g.status === "Active") {
      const val = g.parameter ?? g.metrics[0]?.current ?? 0;
      actuals[d].inProgress += val;
    }
  }

  return NextResponse.json({ settlement, assessment: assessmentWithEnts, pop, existing, targets, actuals, formulas });
}
