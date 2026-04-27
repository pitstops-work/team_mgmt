import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { calcTargets, buildDomainConfig, buildExisting, type FormulaRow } from "../settlement-needs/route";

// GET /api/map/zone-needs?zone=NAME
export async function GET(request: Request) {
  const rawZone = new URL(request.url).searchParams.get("zone");
  if (!rawZone) return NextResponse.json({ error: "zone required" }, { status: 400 });

  const zoneInclude = {
    clusters: {
      where: { deletedAt: null },
      include: {
        settlements: { where: { deletedAt: null }, select: { id: true, name: true } },
      },
    },
  };

  // Strip city prefix (e.g. "Chennai – Central" → "Central") and determine city
  const isChennai = rawZone.startsWith("Chennai");
  const zoneLookupName = rawZone.replace(/^.+?[–\-]\s*/u, "").trim();
  const cityKeyword = isChennai ? "Chennai" : "Bangalore";

  // Look up city record so we can scope the zone query to the right city
  const city = await prisma.city.findFirst({
    where: { name: { contains: cityKeyword, mode: "insensitive" }, deletedAt: null },
    select: { id: true },
  });

  let zone = null;

  // 1. Scoped by city + zone name (most precise when cityId is populated)
  if (city) {
    zone = await prisma.zone.findFirst({
      where: { name: { equals: zoneLookupName, mode: "insensitive" }, deletedAt: null, cityId: city.id },
      include: zoneInclude,
    });
  }

  // 2. Cluster-based lookup via zone_cluster_index (handles missing cityId)
  if (!zone) {
    try {
      const indexPath = path.join(process.cwd(), "public/data/zone_cluster_index.json");
      const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      const clusterNames = Object.entries(index.clusters as Record<string, { zone: string; display?: string }>)
        .filter(([, c]) => c.zone === rawZone)
        .map(([key, c]) => c.display ?? key.replace(/_/g, " "))
        .filter(Boolean);

      if (clusterNames.length > 0) {
        // Use OR of contains checks to work around `in` case-sensitivity limits
        zone = await prisma.zone.findFirst({
          where: {
            deletedAt: null,
            clusters: {
              some: {
                OR: clusterNames.map(n => ({ name: { equals: n, mode: "insensitive" as const }, deletedAt: null })),
              },
            },
          },
          include: zoneInclude,
        });
      }
    } catch { /* fall through */ }
  }

  // 3. Plain name fallback
  if (!zone) {
    zone = await prisma.zone.findFirst({
      where: { name: { equals: zoneLookupName, mode: "insensitive" }, deletedAt: null },
      include: zoneInclude,
    });
  }

  if (!zone) return NextResponse.json(null);

  const allSettlementIds = zone.clusters.flatMap(c => c.settlements.map(s => s.id));
  const allClusterIds = zone.clusters.map(c => c.id);

  // Formula config — fetched early so buildExisting can use assessmentColumn
  const formulaRows = await prisma.needsFormulaConfig.findMany({ orderBy: { sortOrder: "asc" } });
  const domainConfig = buildDomainConfig(formulaRows);

  // Latest assessment per settlement
  const assessments = await prisma.settlementAssessment.findMany({
    where: { settlementId: { in: allSettlementIds } },
    orderBy: { assessedAt: "desc" },
    distinct: ["settlementId"],
    select: {
      id: true, settlementId: true, totalHouseholds: true,
      children6m3yr: true, children4to14: true, youth15to21: true, elderly60plus: true,
      existingCreches: true, existingChildrenCentres: true, existingYouthGroups: true,
      existingElderlyKitchens: true, existingPalliativeUnits: true,
      existingCommunityToilets: true, existingWaterATMs: true,
      addressableCreches: true, addressableToilets: true, addressableWaterATMs: true,
    },
  });

  // Aggregate
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
  const addressable: Record<string, number> = {};
  for (const a of assessments) {
    const row = buildExisting(a as Record<string, unknown>, formulaRows as FormulaRow[]);
    for (const [domain, val] of Object.entries(row)) {
      existing[domain] = (existing[domain] ?? 0) + val;
    }
    const aa = a as typeof a & { addressableCreches?: number | null; addressableToilets?: number | null; addressableWaterATMs?: number | null };
    if (aa.addressableCreches   != null) addressable["Creche"]          = (addressable["Creche"]          ?? 0) + aa.addressableCreches;
    if (aa.addressableToilets   != null) addressable["CommunityToilet"] = (addressable["CommunityToilet"] ?? 0) + aa.addressableToilets;
    if (aa.addressableWaterATMs != null) addressable["WaterATM"]        = (addressable["WaterATM"]        ?? 0) + aa.addressableWaterATMs;
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

  // Done = GoalOutcome rows attributed to any settlement in this zone
  const outcomeRows = await prisma.goalOutcome.findMany({
    where: { settlementId: { in: allSettlementIds } },
    select: { count: true, goal: { select: { needsDomain: true, deletedAt: true } } },
  });

  // Plan = active goals scoped to this zone, its clusters, or its settlements
  const activeGoals = await prisma.goal.findMany({
    where: {
      needsDomain: { not: null },
      status: "Active",
      deletedAt: null,
      OR: [
        { needsZoneId: zone.id },
        { needsClusterId: { in: allClusterIds } },
        { needsSettlementId: { in: allSettlementIds } },
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

  return NextResponse.json({
    zone: { id: zone.id, name: zone.name },
    clusterCount: zone.clusters.length,
    settlementCount: allSettlementIds.length,
    assessedCount: assessments.length,
    pop, existing, targets, actuals, domainConfig, addressable,
    entitlements: Object.entries(entitlementMap).map(([id, v]) => ({ id, ...v })),
  });
}
