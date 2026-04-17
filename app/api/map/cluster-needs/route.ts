import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcTargets } from "../settlement-needs/route";

// GET /api/map/cluster-needs?cluster=NAME
export async function GET(request: Request) {
  const rawCluster = new URL(request.url).searchParams.get("cluster");
  if (!rawCluster) return NextResponse.json({ error: "cluster required" }, { status: 400 });
  // Normalise: replace underscores with spaces for lookup
  const clusterName = rawCluster.replace(/_/g, " ");

  const clusterQuery = {
    where: { deletedAt: null },
    include: {
      settlements: { where: { deletedAt: null }, select: { id: true, name: true } },
      zone: { select: { name: true } },
    },
  };

  // Try exact match first, then fuzzy (handles en-dash vs hyphen, "&" vs "and", etc.)
  let cluster = await prisma.cluster.findFirst({
    where: { name: { equals: clusterName, mode: "insensitive" }, ...clusterQuery.where },
    include: clusterQuery.include,
  });

  if (!cluster) {
    // Fallback: find by contains first word of cluster name
    const firstWord = clusterName.split(/[\s\-–]+/)[0];
    if (firstWord.length >= 3) {
      cluster = await prisma.cluster.findFirst({
        where: { name: { contains: firstWord, mode: "insensitive" }, ...clusterQuery.where },
        include: clusterQuery.include,
      });
    }
  }

  if (!cluster) return NextResponse.json(null);

  const settlementIds = cluster.settlements.map(s => s.id);

  // Latest assessment per settlement
  const assessments = await prisma.settlementAssessment.findMany({
    where: { settlementId: { in: settlementIds } },
    orderBy: { assessedAt: "desc" },
    distinct: ["settlementId"],
    select: {
      id: true, settlementId: true, totalHouseholds: true,
      children6m3yr: true, children4to14: true, youth15to21: true, elderly60plus: true,
      existingCreches: true, existingChildrenCentres: true, existingYouthGroups: true,
      existingElderlyKitchens: true, existingPalliativeUnits: true,
      existingCommunityToilets: true, existingWaterATMs: true,
    },
  });

  // Aggregate population
  const pop = assessments.reduce(
    (acc, a) => ({
      totalHouseholds: acc.totalHouseholds + a.totalHouseholds,
      children6m3yr: acc.children6m3yr + a.children6m3yr,
      children4to14: acc.children4to14 + a.children4to14,
      youth15to21: acc.youth15to21 + a.youth15to21,
      elderly60plus: acc.elderly60plus + a.elderly60plus,
    }),
    { totalHouseholds: 0, children6m3yr: 0, children4to14: 0, youth15to21: 0, elderly60plus: 0 }
  );

  const existing = assessments.reduce(
    (acc, a) => ({
      Creche: acc.Creche + a.existingCreches,
      ChildrenCentre: acc.ChildrenCentre + a.existingChildrenCentres,
      YouthGroup: acc.YouthGroup + a.existingYouthGroups,
      ElderlyKitchen: acc.ElderlyKitchen + a.existingElderlyKitchens,
      PalliativeSupport: acc.PalliativeSupport + a.existingPalliativeUnits,
      CommunityToilet: acc.CommunityToilet + a.existingCommunityToilets,
      WaterATM: acc.WaterATM + a.existingWaterATMs,
    }),
    { Creche: 0, ChildrenCentre: 0, YouthGroup: 0, ElderlyKitchen: 0, PalliativeSupport: 0, CommunityToilet: 0, WaterATM: 0 }
  );

  // Use raw SQL for entitlements — Prisma include silently drops surveyEnrolled due to stale build cache
  const assessmentIds = assessments.map(a => (a as { id?: string }).id).filter(Boolean) as string[];
  type EntRow = { schemeId: string; schemeName: string; parentId: string | null; eligibleHouseholds: number; enrolledHouseholds: number; surveyEnrolled: number | null };
  const rawEnts = assessmentIds.length > 0
    ? await (prisma as unknown as { $queryRaw: (...a: unknown[]) => Promise<EntRow[]> }).$queryRaw`
        SELECT eb."schemeId", es.name AS "schemeName", es."parentId",
          SUM(eb."eligibleHouseholds")::int AS "eligibleHouseholds",
          SUM(eb."enrolledHouseholds")::int AS "enrolledHouseholds",
          SUM(COALESCE(eb."surveyEnrolled", 0))::int AS "surveyEnrolled"
        FROM "EntitlementBaseline" eb
        JOIN "EntitlementScheme" es ON es.id = eb."schemeId"
        WHERE eb."assessmentId" = ANY(${assessmentIds})
          AND eb."eligibleHouseholds" > 0
        GROUP BY eb."schemeId", es.name, es."parentId"
      `
    : [];
  const entitlementMap: Record<string, { name: string; parentId: string | null; eligible: number; enrolled: number }> = {};
  for (const e of rawEnts) {
    entitlementMap[e.schemeId] = {
      name: e.schemeName,
      parentId: e.parentId,
      eligible: Number(e.eligibleHouseholds),
      enrolled: Number(e.enrolledHouseholds) + Number(e.surveyEnrolled ?? 0),
    };
  }

  // Formula config
  const formulaRows = await prisma.needsFormulaConfig.findMany();
  const formulas = Object.fromEntries(formulaRows.map(f => [f.domain, f.denominator]));
  const targets = calcTargets(pop, formulas);

  // Actuals from goals
  const goals = await prisma.goal.findMany({
    where: {
      needsDomain: { not: null },
      deletedAt: null,
      OR: [
        { needsClusterId: cluster.id },
        { needsSettlementId: { in: settlementIds } },
      ],
    },
    select: { status: true, needsDomain: true, parameter: true, metrics: { where: { deletedAt: null }, select: { current: true }, take: 1 } },
  });

  const actuals: Record<string, { done: number; inProgress: number }> = {};
  for (const g of goals) {
    if (!g.needsDomain) continue;
    const d = g.needsDomain as string;
    if (!actuals[d]) actuals[d] = { done: 0, inProgress: 0 };
    const val = g.parameter ?? g.metrics[0]?.current ?? 0;
    if (g.status === "Complete") actuals[d].done += val;
    else if (g.status === "Active") actuals[d].inProgress += val;
  }

  const assessedCount = assessments.length;

  return NextResponse.json({
    cluster: { id: cluster.id, name: cluster.name, zone: cluster.zone.name },
    settlementCount: cluster.settlements.length,
    assessedCount,
    pop, existing, targets, actuals,
    entitlements: Object.entries(entitlementMap).map(([id, v]) => ({ id, ...v })),
  });
}
