import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcTargets, buildDomainConfig, buildExisting, type FormulaRow } from "../../map/settlement-needs/route";

// GET /api/zones/summary
// Returns per-zone aggregates: settlement count, population, goal health, overdue pitstops,
// and domain-level needs progress (target / existing / done / inProgress).
export async function GET() {
  const [zones, formulaRows] = await Promise.all([
    prisma.zone.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        city: { select: { id: true, name: true } },
        clusters: {
          where: { deletedAt: null },
          select: {
            id: true,
            settlements: {
              where: { deletedAt: null },
              select: {
                id: true,
                assessments: {
                  orderBy: { assessedAt: "desc" },
                  take: 1,
                  select: { assessedAt: true },
                },
                needsGoals: {
                  where: { deletedAt: null },
                  select: { id: true, status: true },
                },
              },
            },
          },
        },
        needsGoals: {
          where: { deletedAt: null },
          select: { id: true, status: true },
        },
        needsPitstops: {
          where: { deletedAt: null, status: { not: "Done" }, targetDate: { lt: new Date() } },
          select: { id: true },
        },
      },
      orderBy: [{ city: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.needsFormulaConfig.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const domainConfig = buildDomainConfig(formulaRows);

  // Collect all settlement IDs across all zones for batch queries
  const allSettlementIds = zones.flatMap(z => z.clusters.flatMap(c => c.settlements.map(s => s.id)));
  const allClusterIds    = zones.flatMap(z => z.clusters.map(c => c.id));

  // Latest assessment per settlement (for population + existing counts)
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
  const assessmentBySettlement = Object.fromEntries(assessments.map(a => [a.settlementId, a]));

  // Civic scores for civicWeightGroup formula weighting
  const civicRows = allSettlementIds.length > 0
    ? await prisma.settlementCivicData.findMany({
        where: { settlementId: { in: allSettlementIds } },
        select: { settlementId: true, borewellNeedScore: true, toiletConnNeedScore: true, toiletFacNeedScore: true, waterSupplyNeedScore: true },
      })
    : [];
  const civicBySettlement = new Map(civicRows.map(r => [r.settlementId, r]));

  // GoalOutcome rows for actuals (done)
  const outcomeRows = await prisma.goalOutcome.findMany({
    where: { settlementId: { in: allSettlementIds } },
    select: { settlementId: true, count: true, goal: { select: { needsDomain: true, deletedAt: true } } },
  });

  // Active goals for inProgress (parameter = planned count for this geo scope)
  const activeGoals = await prisma.goal.findMany({
    where: {
      needsDomain: { not: null },
      status: "Active",
      deletedAt: null,
      OR: [
        { needsZoneId: { in: zones.map(z => z.id) } },
        { needsClusterId: { in: allClusterIds } },
        { needsSettlementId: { in: allSettlementIds } },
      ],
    },
    select: {
      needsDomain: true,
      parameter: true,
      needsZoneId: true,
      needsClusterId: true,
      needsSettlementId: true,
    },
  });

  // Build a lookup: zoneId → set of clusterIds and settlementIds
  const zoneClusterIds   = new Map<string, Set<string>>();
  const zoneSettlementIds = new Map<string, Set<string>>();
  for (const zone of zones) {
    const cids = new Set(zone.clusters.map(c => c.id));
    const sids = new Set(zone.clusters.flatMap(c => c.settlements.map(s => s.id)));
    zoneClusterIds.set(zone.id, cids);
    zoneSettlementIds.set(zone.id, sids);
  }

  const result = zones.map((zone) => {
    const settlements = zone.clusters.flatMap((c) => c.settlements);
    const totalSettlements = settlements.length;
    const withGoals = settlements.filter((s) => s.needsGoals.some((g) => g.status === "Active")).length;

    // Population — from latest assessments
    const pop = { totalHouseholds: 0, children6m3yr: 0, children4to14: 0, youth15to21: 0, elderly60plus: 0 };
    for (const s of settlements) {
      const a = assessmentBySettlement[s.id];
      if (!a) continue;
      pop.totalHouseholds += a.totalHouseholds;
      pop.children6m3yr   += a.children6m3yr;
      pop.children4to14   += a.children4to14;
      pop.youth15to21     += a.youth15to21;
      pop.elderly60plus   += a.elderly60plus;
    }

    const lastSurveyed = settlements
      .flatMap((s) => s.assessments.map((a) => a.assessedAt))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

    const allGoals = [...settlements.flatMap((s) => s.needsGoals), ...zone.needsGoals];
    const activeGoalCount = allGoals.filter((g) => g.status === "Active").length;
    const overdueCount = zone.needsPitstops.length;

    // Domain progress — civic-weighted population for civicWeightGroup domains
    const civicWeightedPop: Record<string, number> = {};
    for (const s of settlements) {
      const a = assessmentBySettlement[s.id];
      const c = civicBySettlement.get(s.id);
      if (!a || !c) continue;
      const HH = a.totalHouseholds;
      if (c.borewellNeedScore     != null) civicWeightedPop.borewell        = (civicWeightedPop.borewell        ?? 0) + HH * c.borewellNeedScore     / 100;
      if (c.toiletConnNeedScore   != null) civicWeightedPop.toiletConnection = (civicWeightedPop.toiletConnection ?? 0) + HH * c.toiletConnNeedScore   / 100;
      if (c.toiletFacNeedScore    != null) civicWeightedPop.toiletFacility   = (civicWeightedPop.toiletFacility   ?? 0) + HH * c.toiletFacNeedScore    / 100;
      if (c.waterSupplyNeedScore  != null) civicWeightedPop.waterSupply      = (civicWeightedPop.waterSupply      ?? 0) + HH * c.waterSupplyNeedScore  / 100;
    }
    // Boolean aggregation at zone scope: count settlements & clusters with population.
    const settlementsWithPop = settlements
      .map(s => assessmentBySettlement[s.id])
      .filter(a => a && a.totalHouseholds > 0).length;
    let clustersWithPop = 0;
    for (const c of zone.clusters) {
      const cPop = c.settlements
        .map(s => assessmentBySettlement[s.id])
        .reduce((sum, a) => sum + (a?.totalHouseholds ?? 0), 0);
      if (cPop > 0) clustersWithPop += 1;
    }
    const targets = calcTargets(pop, formulaRows as FormulaRow[], civicWeightedPop, {
      scope: "zone",
      subUnitsWithPop: { settlement: settlementsWithPop, cluster: clustersWithPop },
    });
    const existing:    Record<string, number> = {};
    const addressable: Record<string, number> = {};
    const sids = zoneSettlementIds.get(zone.id) ?? new Set<string>();
    const cids = zoneClusterIds.get(zone.id)    ?? new Set<string>();

    for (const s of settlements) {
      const a = assessmentBySettlement[s.id];
      if (!a) continue;
      const row = buildExisting(a as Record<string, unknown>, formulaRows as FormulaRow[]);
      for (const [domain, val] of Object.entries(row) as [string, number][]) {
        existing[domain] = (existing[domain] ?? 0) + val;
      }
      const aa = a as typeof a & { addressableCreches?: number | null; addressableToilets?: number | null; addressableWaterATMs?: number | null };
      if (aa.addressableCreches   != null) addressable["Creche"]          = (addressable["Creche"]          ?? 0) + aa.addressableCreches;
      if (aa.addressableToilets   != null) addressable["CommunityToilet"] = (addressable["CommunityToilet"] ?? 0) + aa.addressableToilets;
      if (aa.addressableWaterATMs != null) addressable["WaterATM"]        = (addressable["WaterATM"]        ?? 0) + aa.addressableWaterATMs;
    }

    const done:       Record<string, number> = {};
    const inProgress: Record<string, number> = {};

    for (const row of outcomeRows) {
      if (!sids.has(row.settlementId)) continue;
      const domain = row.goal.needsDomain;
      if (!domain || row.goal.deletedAt) continue;
      done[domain] = (done[domain] ?? 0) + row.count;
    }

    for (const g of activeGoals) {
      if (!g.needsDomain) continue;
      const inZone =
        (g.needsZoneId    && g.needsZoneId    === zone.id) ||
        (g.needsClusterId && cids.has(g.needsClusterId))    ||
        (g.needsSettlementId && sids.has(g.needsSettlementId));
      if (!inZone) continue;
      inProgress[g.needsDomain] = (inProgress[g.needsDomain] ?? 0) + (g.parameter ?? 0);
    }

    const domainProgress: Record<string, { target: number; existing: number; addressable: number | null; done: number; inProgress: number }> = {};
    for (const f of domainConfig) {
      domainProgress[f.domain] = {
        target:      targets[f.domain]      ?? 0,
        existing:    existing[f.domain]     ?? 0,
        addressable: addressable[f.domain]  ?? null,
        done:        done[f.domain]         ?? 0,
        inProgress:  inProgress[f.domain]   ?? 0,
      };
    }

    return {
      id: zone.id,
      name: zone.name,
      city: zone.city ?? null,
      totalSettlements,
      withActiveGoals: withGoals,
      population: pop,
      activeGoals: activeGoalCount,
      overdueCount,
      lastSurveyed,
      domainProgress,
    };
  });

  return NextResponse.json({ zones: result, domainConfig });
}
