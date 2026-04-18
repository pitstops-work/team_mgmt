import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcTargets, buildDomainConfig, buildExisting, type FormulaRow } from "../settlement-needs/route";

// GET /api/map/cluster-needs?cluster=NAME[&zone=ZONE_NAME]
// zone param scopes the lookup to avoid cross-city name collisions
export async function GET(request: Request) {
  const url    = new URL(request.url);
  const rawCluster = url.searchParams.get("cluster");
  const rawZone    = url.searchParams.get("zone");
  if (!rawCluster) return NextResponse.json({ error: "cluster required" }, { status: 400 });
  // Normalise: replace underscores with spaces for lookup
  const clusterName = rawCluster.replace(/_/g, " ");
  const zoneName    = rawZone ? rawZone.trim() : null;

  // Build zone scope when zone name is provided
  const zoneScope = zoneName
    ? { zone: { name: { equals: zoneName, mode: "insensitive" as const }, deletedAt: null } }
    : {};

  const clusterInclude = {
    settlements: { where: { deletedAt: null }, select: { id: true, name: true } },
    zone: { select: { name: true, city: { select: { name: true } } } },
  };

  // 1. Exact match scoped by zone
  let cluster = await prisma.cluster.findFirst({
    where: { name: { equals: clusterName, mode: "insensitive" }, deletedAt: null, ...zoneScope },
    include: clusterInclude,
  });

  // 2. Exact match without zone scope (fallback for zones not in params)
  if (!cluster) {
    cluster = await prisma.cluster.findFirst({
      where: { name: { equals: clusterName, mode: "insensitive" }, deletedAt: null },
      include: clusterInclude,
    });
  }

  // 3. Fuzzy: first word, with zone scope
  if (!cluster) {
    const firstWord = clusterName.split(/[\s\-–]+/)[0];
    if (firstWord.length >= 3) {
      cluster = await prisma.cluster.findFirst({
        where: { name: { contains: firstWord, mode: "insensitive" }, deletedAt: null, ...zoneScope },
        include: clusterInclude,
      });
    }
  }

  if (!cluster) return NextResponse.json(null);

  const settlementIds = cluster.settlements.map(s => s.id);

  // Formula config — fetched early so buildExisting can use assessmentColumn
  const formulaRows = await prisma.needsFormulaConfig.findMany({ orderBy: { sortOrder: "asc" } });
  const domainConfig = buildDomainConfig(formulaRows);

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

  // Aggregate existing counts across all assessments, driven by assessmentColumn from config
  const existing: Record<string, number> = {};
  for (const a of assessments) {
    const row = buildExisting(a as Record<string, unknown>, formulaRows as FormulaRow[]);
    for (const [domain, val] of Object.entries(row)) {
      existing[domain] = (existing[domain] ?? 0) + val;
    }
  }

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

  const targets = calcTargets(pop, formulaRows);

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
    cluster: { id: cluster.id, name: cluster.name, zone: cluster.zone.name, city: cluster.zone.city?.name ?? null },
    settlementCount: cluster.settlements.length,
    assessedCount,
    pop, existing, targets, actuals, domainConfig,
    entitlements: Object.entries(entitlementMap).map(([id, v]) => ({ id, ...v })),
  });
}
