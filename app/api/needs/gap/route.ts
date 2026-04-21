import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcTargets, buildExisting, type FormulaRow } from "../../map/settlement-needs/route";

// GET /api/needs/gap?zoneId=&clusterId=&settlementId=
// Returns pop + existing + targets + actuals for the given geography (by ID).
// Used by the goal-creation wizard to show domain gap cards.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const zoneId       = url.searchParams.get("zoneId");
  const clusterId    = url.searchParams.get("clusterId");
  const settlementId = url.searchParams.get("settlementId");
  const cityId       = url.searchParams.get("cityId");

  if (!zoneId && !clusterId && !settlementId && !cityId) {
    return NextResponse.json({ error: "zoneId, clusterId, settlementId, or cityId required" }, { status: 400 });
  }

  // ── Collect settlement IDs ──────────────────────────────────────────────────

  let allSettlementIds: string[] = [];
  let allClusterIds: string[]    = [];

  if (settlementId) {
    allSettlementIds = [settlementId];
    const s = await prisma.settlement.findUnique({ where: { id: settlementId }, select: { clusterId: true } });
    if (s?.clusterId) allClusterIds = [s.clusterId];
  } else if (clusterId) {
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      include: { settlements: { where: { deletedAt: null }, select: { id: true } } },
    });
    if (!cluster) return NextResponse.json(null);
    allSettlementIds = cluster.settlements.map(s => s.id);
    allClusterIds    = [clusterId];
  } else if (zoneId) {
    const zone = await prisma.zone.findUnique({
      where: { id: zoneId },
      include: {
        clusters: {
          where: { deletedAt: null },
          include: { settlements: { where: { deletedAt: null }, select: { id: true } } },
        },
      },
    });
    if (!zone) return NextResponse.json(null);
    allSettlementIds = zone.clusters.flatMap(c => c.settlements.map(s => s.id));
    allClusterIds    = zone.clusters.map(c => c.id);
  } else if (cityId) {
    const cityZones = await prisma.zone.findMany({
      where: { cityId },
      include: {
        clusters: {
          where: { deletedAt: null },
          include: { settlements: { where: { deletedAt: null }, select: { id: true } } },
        },
      },
    });
    allSettlementIds = cityZones.flatMap(z => z.clusters.flatMap(c => c.settlements.map(s => s.id)));
    allClusterIds    = cityZones.flatMap(z => z.clusters.map(c => c.id));
  }

  // Formula config — fetched early so buildExisting can use assessmentColumn
  const formulaRows  = await prisma.needsFormulaConfig.findMany({ orderBy: { sortOrder: "asc" } });

  // domainConfig for gap endpoint includes entitlement domains (unlike map which excludes them)
  const domainConfig = formulaRows
    .filter(f => f.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(f => ({ domain: f.domain, label: f.label ?? f.domain, color: f.color, domainType: f.domainType }));

  // ── Latest assessment per settlement ───────────────────────────────────────

  const assessments = await prisma.settlementAssessment.findMany({
    where: { settlementId: { in: allSettlementIds } },
    orderBy: { assessedAt: "desc" },
    distinct: ["settlementId"],
    select: {
      id: true,
      totalHouseholds: true,
      children6m3yr: true, children4to14: true, youth15to21: true, elderly60plus: true,
      existingCreches: true, existingChildrenCentres: true, existingYouthGroups: true,
      existingElderlyKitchens: true, existingPalliativeUnits: true,
      existingCommunityToilets: true, existingWaterATMs: true,
    },
  });

  const pop = assessments.reduce(
    (acc, a) => ({
      totalHouseholds: acc.totalHouseholds + a.totalHouseholds,
      children6m3yr:   acc.children6m3yr   + a.children6m3yr,
      children4to14:   acc.children4to14   + a.children4to14,
      youth15to21:     acc.youth15to21     + a.youth15to21,
      elderly60plus:   acc.elderly60plus   + a.elderly60plus,
    }),
    { totalHouseholds: 0, children6m3yr: 0, children4to14: 0, youth15to21: 0, elderly60plus: 0 }
  );

  // Aggregate existing counts driven by assessmentColumn from config
  const existing: Record<string, number> = {};
  for (const a of assessments) {
    const row = buildExisting(a as Record<string, unknown>, formulaRows as FormulaRow[]);
    for (const [domain, val] of Object.entries(row)) {
      existing[domain] = (existing[domain] ?? 0) + val;
    }
  }

  const targets = calcTargets(pop, formulaRows);

  // ── Actuals from goals ─────────────────────────────────────────────────────

  const goals = await prisma.goal.findMany({
    where: {
      needsDomain: { not: null },
      deletedAt: null,
      OR: [
        ...(zoneId       ? [{ needsZoneId: zoneId }]           : []),
        ...(clusterId    ? [{ needsClusterId: clusterId }]      : []),
        ...(settlementId ? [{ needsSettlementId: settlementId }]: []),
        { needsClusterId: { in: allClusterIds } },
        { needsSettlementId: { in: allSettlementIds } },
      ],
    },
    select: {
      status: true, needsDomain: true, parameter: true,
      metrics: { where: { deletedAt: null }, select: { current: true }, take: 1 },
    },
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

  // ── Eligible HH per entitlement domain ────────────────────────────────────

  const eligibleByDomain: Record<string, number> = {};
  const entDomains = formulaRows.filter(f => f.isActive && f.domainType === "entitlement" && f.linkedSchemeId);

  if (entDomains.length > 0 && assessments.length > 0) {
    const assessmentIds = assessments.map(a => a.id);
    const schemeIds = entDomains.map(f => f.linkedSchemeId!);
    const baselines = await prisma.entitlementBaseline.findMany({
      where: { assessmentId: { in: assessmentIds }, schemeId: { in: schemeIds } },
      select: { schemeId: true, eligibleHouseholds: true },
    });
    const schemeEligible: Record<string, number> = {};
    for (const b of baselines) {
      schemeEligible[b.schemeId] = (schemeEligible[b.schemeId] ?? 0) + Number(b.eligibleHouseholds);
    }
    for (const f of entDomains) {
      eligibleByDomain[f.domain] = schemeEligible[f.linkedSchemeId!] ?? 0;
    }
  }

  return NextResponse.json({ pop, existing, targets, actuals, domainConfig, eligibleByDomain });
}
