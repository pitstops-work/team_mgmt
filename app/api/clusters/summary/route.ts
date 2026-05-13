import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcTargets, buildDomainConfig, buildExisting, layerFeatureExisting, type FormulaRow } from "../../map/settlement-needs/route";

// GET /api/clusters/summary
// Returns per-cluster aggregates with domain-level needs progress.
export async function GET() {
  const [clusters, formulaRows] = await Promise.all([
    prisma.cluster.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        zone: {
          select: {
            id: true,
            name: true,
            city: { select: { id: true, name: true } },
          },
        },
        settlements: {
          where: { deletedAt: null },
          select: {
            id: true,
            assessments: {
              orderBy: { assessedAt: "desc" },
              take: 1,
              select: { assessedAt: true },
            },
          },
        },
      },
      orderBy: [{ zone: { city: { name: "asc" } } }, { zone: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.needsFormulaConfig.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const domainConfig = buildDomainConfig(formulaRows);

  const allSettlementIds = clusters.flatMap(c => c.settlements.map(s => s.id));

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
  const assessmentBySettlement = Object.fromEntries(assessments.map(a => [a.settlementId, a]));

  // Civic scores for civicWeightGroup formula weighting
  const civicRows = allSettlementIds.length > 0
    ? await prisma.settlementCivicData.findMany({
        where: { settlementId: { in: allSettlementIds } },
        select: { settlementId: true, borewellNeedScore: true, toiletConnNeedScore: true, toiletFacNeedScore: true, waterSupplyNeedScore: true },
      })
    : [];
  const civicBySettlement = new Map(civicRows.map(r => [r.settlementId, r]));

  // GoalOutcome rows for done
  const outcomeRows = await prisma.goalOutcome.findMany({
    where: { settlementId: { in: allSettlementIds } },
    select: { settlementId: true, count: true, goal: { select: { needsDomain: true, deletedAt: true } } },
  });

  // Active goals for inProgress
  const activeGoals = await prisma.goal.findMany({
    where: {
      needsDomain: { not: null },
      status: "Active",
      deletedAt: null,
      OR: [
        { needsClusterId: { in: clusters.map(c => c.id) } },
        { needsSettlementId: { in: allSettlementIds } },
      ],
    },
    select: {
      needsDomain: true,
      parameter: true,
      needsClusterId: true,
      needsSettlementId: true,
    },
  });

  // Batch LayerFeature counts per cluster — override assessment-based existing for facility domains
  const LAYER_DOMAIN_MAP: Record<string, string> = {
    creches: "Creche", children_centres: "ChildrenCentre", youth_centres: "YouthResourceCentre",
  };
  const lfGroups = await prisma.layerFeature.groupBy({
    by: ["clusterId", "layerKey"],
    where: { clusterId: { in: clusters.map(c => c.id) } },
    _count: { id: true },
  });
  const lfByCluster: Record<string, Record<string, number>> = {};
  for (const g of lfGroups) {
    if (!g.clusterId) continue;
    const domain = LAYER_DOMAIN_MAP[g.layerKey];
    if (!domain) continue;
    if (!lfByCluster[g.clusterId]) lfByCluster[g.clusterId] = {};
    lfByCluster[g.clusterId][domain] = g._count.id;
  }

  const result = clusters.map((cluster) => {
    const sids = new Set(cluster.settlements.map(s => s.id));

    const pop = { totalHouseholds: 0, children6m3yr: 0, children4to14: 0, youth15to21: 0, elderly60plus: 0 };
    for (const s of cluster.settlements) {
      const a = assessmentBySettlement[s.id];
      if (!a) continue;
      pop.totalHouseholds += a.totalHouseholds;
      pop.children6m3yr   += a.children6m3yr;
      pop.children4to14   += a.children4to14;
      pop.youth15to21     += a.youth15to21;
      pop.elderly60plus   += a.elderly60plus;
    }

    const assessedCount = cluster.settlements.filter(s => s.assessments.length > 0).length;
    const lastSurveyed = cluster.settlements
      .flatMap(s => s.assessments.map(a => a.assessedAt))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

    // Civic-weighted population for civicWeightGroup domains
    const civicWeightedPop: Record<string, number> = {};
    for (const s of cluster.settlements) {
      const a = assessmentBySettlement[s.id];
      const c = civicBySettlement.get(s.id);
      if (!a || !c) continue;
      const HH = a.totalHouseholds;
      if (c.borewellNeedScore     != null) civicWeightedPop.borewell        = (civicWeightedPop.borewell        ?? 0) + HH * c.borewellNeedScore     / 100;
      if (c.toiletConnNeedScore   != null) civicWeightedPop.toiletConnection = (civicWeightedPop.toiletConnection ?? 0) + HH * c.toiletConnNeedScore   / 100;
      if (c.toiletFacNeedScore    != null) civicWeightedPop.toiletFacility   = (civicWeightedPop.toiletFacility   ?? 0) + HH * c.toiletFacNeedScore    / 100;
      if (c.waterSupplyNeedScore  != null) civicWeightedPop.waterSupply      = (civicWeightedPop.waterSupply      ?? 0) + HH * c.waterSupplyNeedScore  / 100;
    }
    const targets = calcTargets(pop, formulaRows as FormulaRow[], civicWeightedPop);
    const existing:    Record<string, number> = {};
    const addressable: Record<string, number> = {};
    for (const s of cluster.settlements) {
      const a = assessmentBySettlement[s.id];
      if (!a) continue;
      const row = buildExisting(a as Record<string, unknown>, formulaRows as FormulaRow[]);
      for (const [domain, val] of Object.entries(row)) {
        existing[domain] = (existing[domain] ?? 0) + val;
      }
      const aa = a as typeof a & { addressableCreches?: number | null; addressableToilets?: number | null; addressableWaterATMs?: number | null };
      if (aa.addressableCreches   != null) addressable["Creche"]          = (addressable["Creche"]          ?? 0) + aa.addressableCreches;
      if (aa.addressableToilets   != null) addressable["CommunityToilet"] = (addressable["CommunityToilet"] ?? 0) + aa.addressableToilets;
      if (aa.addressableWaterATMs != null) addressable["WaterATM"]        = (addressable["WaterATM"]        ?? 0) + aa.addressableWaterATMs;
    }

    // Override assessment-based existing with live LayerFeature counts
    Object.assign(existing, lfByCluster[cluster.id] ?? {});

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
      const inCluster =
        (g.needsClusterId   && g.needsClusterId   === cluster.id) ||
        (g.needsSettlementId && sids.has(g.needsSettlementId));
      if (!inCluster) continue;
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
      id: cluster.id,
      name: cluster.name,
      zone: { id: cluster.zone.id, name: cluster.zone.name },
      city: cluster.zone.city ?? null,
      totalSettlements: cluster.settlements.length,
      assessedCount,
      population: pop,
      lastSurveyed,
      domainProgress,
    };
  });

  return NextResponse.json({ clusters: result, domainConfig });
}
