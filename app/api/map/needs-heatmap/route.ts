import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { calcTargets, buildExisting, type FormulaRow } from "../settlement-needs/route";

export type NeedsMetric = "demand" | "addressable" | "existing" | "gap" | "done_pct" | "planned" | "deficit";
export type NeedsLevel = "settlement" | "cluster" | "zone";

const ADDRESSABLE_FIELD: Record<string, string> = {
  Creche: "addressableCreches",
  CommunityToilet: "addressableToilets",
  WaterATM: "addressableWaterATMs",
};

const LAYER_DOMAIN_MAP: Record<string, string> = {
  creches: "Creche",
  children_centres: "ChildrenCentre",
  youth_centres: "YouthResourceCentre",
};

const CIVIC_SCORE_FIELD: Record<string, keyof {
  borewellNeedScore: number | null;
  toiletConnNeedScore: number | null;
  toiletFacNeedScore: number | null;
  waterSupplyNeedScore: number | null;
}> = {
  borewell:         "borewellNeedScore",
  toiletConnection: "toiletConnNeedScore",
  toiletFacility:   "toiletFacNeedScore",
  waterSupply:      "waterSupplyNeedScore",
};

// GET /api/map/needs-heatmap?domain=X&metric=demand|addressable|existing|gap|done_pct|planned|deficit&level=settlement|cluster|zone
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const domain = url.searchParams.get("domain");
  const rawMetric = url.searchParams.get("metric") ?? "demand";
  const rawLevel = url.searchParams.get("level") ?? "settlement";

  const metric: NeedsMetric = (["demand","addressable","existing","gap","done_pct","planned","deficit"].includes(rawMetric)
    ? rawMetric : "demand") as NeedsMetric;
  const level: NeedsLevel = (["settlement","cluster","zone"].includes(rawLevel)
    ? rawLevel : "settlement") as NeedsLevel;

  const formulaRows = await prisma.needsFormulaConfig.findMany({
    orderBy: { sortOrder: "asc" },
    where: { isActive: true },
  }) as FormulaRow[];

  const allDomains = formulaRows
    .filter(f => f.domainType !== "entitlement")
    .map(f => ({ domain: f.domain, label: f.label ?? f.domain, color: f.color, domainType: f.domainType }));

  if (!domain) {
    return NextResponse.json({ values: {}, max: 0, domain: null, metric, level, allDomains, hasData: false, isCivic: false });
  }

  const domainRow = formulaRows.find(f => f.domain === domain);
  if (!domainRow) {
    return NextResponse.json({ values: {}, max: 0, domain: null, metric, level, allDomains, hasData: false, isCivic: false });
  }

  const domainInfo = { domain: domainRow.domain, label: domainRow.label ?? domainRow.domain, color: domainRow.color };

  // ── Civic domain: colour by need score (0-100) ──────────────────────────────
  if (domainRow.domainType === "civic") {
    const civicGroup = domainRow.civicGroup;
    const scoreField = civicGroup ? CIVIC_SCORE_FIELD[civicGroup] : null;
    if (!scoreField) {
      return NextResponse.json({ values: {}, max: 100, domain: domainInfo, metric, level, allDomains, hasData: false, isCivic: true });
    }

    // All settlements with cluster/zone
    const settlements = await prisma.settlement.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, cluster: { select: { name: true, zone: { select: { name: true } } } } },
    });

    const civicRows = await prisma.settlementCivicData.findMany({
      select: { settlementId: true, borewellNeedScore: true, toiletConnNeedScore: true, toiletFacNeedScore: true, waterSupplyNeedScore: true },
    });
    const civicMap = new Map<string, number>(
      civicRows
        .filter(r => r[scoreField] != null)
        .map(r => [r.settlementId, r[scoreField] as number])
    );

    const values: Record<string, number> = {};

    if (level === "settlement") {
      for (const s of settlements) {
        const score = civicMap.get(s.id);
        if (score != null && score > 0) values[s.name.toLowerCase()] = score;
      }
    } else if (level === "cluster") {
      const clusterScores = new Map<string, number[]>();
      for (const s of settlements) {
        const score = civicMap.get(s.id);
        if (score != null) {
          const cn = s.cluster.name;
          if (!clusterScores.has(cn)) clusterScores.set(cn, []);
          clusterScores.get(cn)!.push(score);
        }
      }
      for (const [cn, scores] of clusterScores) {
        const avg = scores.reduce((a, v) => a + v, 0) / scores.length;
        if (avg > 0) values[cn.toLowerCase()] = Math.round(avg * 10) / 10;
      }
    } else {
      const zoneScores = new Map<string, number[]>();
      for (const s of settlements) {
        const score = civicMap.get(s.id);
        if (score != null) {
          const zn = s.cluster.zone.name;
          if (!zoneScores.has(zn)) zoneScores.set(zn, []);
          zoneScores.get(zn)!.push(score);
        }
      }
      for (const [zn, scores] of zoneScores) {
        const avg = scores.reduce((a, v) => a + v, 0) / scores.length;
        if (avg > 0) values[zn.toLowerCase()] = Math.round(avg * 10) / 10;
      }
    }

    return NextResponse.json({ values, max: 100, domain: domainInfo, metric, level, allDomains, hasData: Object.keys(values).length > 0, isCivic: true });
  }

  // All settlements with cluster + zone
  const settlements = await prisma.settlement.findMany({
    where: { deletedAt: null },
    select: {
      id: true, name: true,
      cluster: { select: { id: true, name: true, zone: { select: { id: true, name: true } } } },
    },
  });

  const settlementIds = settlements.map(s => s.id);

  // Latest assessment per settlement
  const assessments = await prisma.settlementAssessment.findMany({
    where: { settlementId: { in: settlementIds } },
    orderBy: { assessedAt: "desc" },
    distinct: ["settlementId"],
    select: {
      settlementId: true,
      totalHouseholds: true, children6m3yr: true, children4to14: true,
      youth15to21: true, elderly60plus: true,
      existingCreches: true, existingChildrenCentres: true, existingYouthGroups: true,
      existingYouthResourceCentres: true, existingElderlyKitchens: true,
      existingElderlyCentres: true, existingPalliativeUnits: true,
      existingPalliativeCareServices: true, existingReferralSystems: true,
      existingCommunityToilets: true, existingWaterATMs: true,
      addressableCreches: true, addressableToilets: true, addressableWaterATMs: true,
    },
  });

  const assessmentMap = new Map(assessments.map(a => [a.settlementId, a]));

  // "Done" = completed goals with parameter, distributed to settlements like plannedMap
  const doneMap = new Map<string, number>();
  if (metric === "done_pct" || metric === "deficit") {
    const clusterToSettlements = new Map<string, string[]>();
    const zoneToSettlements = new Map<string, string[]>();
    for (const s of settlements) {
      const cid = s.cluster.id;
      const zid = s.cluster.zone.id;
      if (!clusterToSettlements.has(cid)) clusterToSettlements.set(cid, []);
      if (!zoneToSettlements.has(zid)) zoneToSettlements.set(zid, []);
      clusterToSettlements.get(cid)!.push(s.id);
      zoneToSettlements.get(zid)!.push(s.id);
    }
    const doneGoals = await prisma.goal.findMany({
      where: { needsDomain: domain, deletedAt: null, status: "Complete" },
      select: { parameter: true, needsSettlementId: true, needsClusterId: true, needsZoneId: true },
    });
    for (const g of doneGoals) {
      const param = g.parameter ?? 0;
      if (g.needsSettlementId) {
        doneMap.set(g.needsSettlementId, (doneMap.get(g.needsSettlementId) ?? 0) + param);
      } else if (g.needsClusterId) {
        const sids = clusterToSettlements.get(g.needsClusterId) ?? [];
        const share = sids.length > 0 ? param / sids.length : 0;
        for (const sid of sids) doneMap.set(sid, (doneMap.get(sid) ?? 0) + share);
      } else if (g.needsZoneId) {
        const sids = zoneToSettlements.get(g.needsZoneId) ?? [];
        const share = sids.length > 0 ? param / sids.length : 0;
        for (const sid of sids) doneMap.set(sid, (doneMap.get(sid) ?? 0) + share);
      }
    }
  }

  // Planned goals for planned/deficit
  const plannedMap = new Map<string, number>();
  if (metric === "planned" || metric === "deficit") {
    const clusterToSettlements = new Map<string, string[]>();
    const zoneToSettlements = new Map<string, string[]>();
    for (const s of settlements) {
      const cid = s.cluster.id;
      const zid = s.cluster.zone.id;
      if (!clusterToSettlements.has(cid)) clusterToSettlements.set(cid, []);
      if (!zoneToSettlements.has(zid)) zoneToSettlements.set(zid, []);
      clusterToSettlements.get(cid)!.push(s.id);
      zoneToSettlements.get(zid)!.push(s.id);
    }
    const goals = await prisma.goal.findMany({
      where: { needsDomain: domain, deletedAt: null, status: { not: "Complete" } },
      select: { parameter: true, needsSettlementId: true, needsClusterId: true, needsZoneId: true },
    });
    for (const g of goals) {
      const param = g.parameter ?? 0;
      if (g.needsSettlementId) {
        plannedMap.set(g.needsSettlementId, (plannedMap.get(g.needsSettlementId) ?? 0) + param);
      } else if (g.needsClusterId) {
        const sids = clusterToSettlements.get(g.needsClusterId) ?? [];
        const share = sids.length > 0 ? param / sids.length : 0;
        for (const sid of sids) plannedMap.set(sid, (plannedMap.get(sid) ?? 0) + share);
      } else if (g.needsZoneId) {
        const sids = zoneToSettlements.get(g.needsZoneId) ?? [];
        const share = sids.length > 0 ? param / sids.length : 0;
        for (const sid of sids) plannedMap.set(sid, (plannedMap.get(sid) ?? 0) + share);
      }
    }
  }

  // LayerFeature existing override for facility domains
  const layerExistingMap = new Map<string, number>();
  if (metric === "existing" || metric === "gap" || metric === "deficit") {
    const domainToLayerKey: Record<string, string> = Object.fromEntries(
      Object.entries(LAYER_DOMAIN_MAP).map(([k, v]) => [v, k])
    );
    const layerKey = domainToLayerKey[domain];
    if (layerKey) {
      const feats = await prisma.layerFeature.groupBy({
        by: ["settlementId"],
        where: { layerKey, settlementId: { in: settlementIds, not: null } },
        _count: { id: true },
      });
      for (const f of feats) {
        if (f.settlementId) layerExistingMap.set(f.settlementId, f._count.id);
      }
    }
  }

  // Civic data for civicWeightGroup computation
  const allCivicData = new Map<string, { borewellNeedScore: number | null; toiletConnNeedScore: number | null; toiletFacNeedScore: number | null; waterSupplyNeedScore: number | null }>();
  if (domainRow.civicWeightGroup) {
    const rows = await prisma.settlementCivicData.findMany({
      where: { settlementId: { in: settlementIds } },
      select: { settlementId: true, borewellNeedScore: true, toiletConnNeedScore: true, toiletFacNeedScore: true, waterSupplyNeedScore: true },
    });
    for (const r of rows) allCivicData.set(r.settlementId, r);
  }

  // Compute per-settlement value
  const settlementValues = new Map<string, number>();
  for (const s of settlements) {
    const a = assessmentMap.get(s.id);
    if (!a) continue;

    const pop = {
      totalHouseholds: a.totalHouseholds, children6m3yr: a.children6m3yr,
      children4to14: a.children4to14, youth15to21: a.youth15to21, elderly60plus: a.elderly60plus,
    };
    const civic = allCivicData.get(s.id);
    const cwp: Record<string, number> = {};
    if (civic && a.totalHouseholds > 0) {
      const HH = a.totalHouseholds;
      if (civic.borewellNeedScore     != null) cwp.borewell        = HH * civic.borewellNeedScore     / 100;
      if (civic.toiletConnNeedScore   != null) cwp.toiletConnection = HH * civic.toiletConnNeedScore   / 100;
      if (civic.toiletFacNeedScore    != null) cwp.toiletFacility   = HH * civic.toiletFacNeedScore    / 100;
      if (civic.waterSupplyNeedScore  != null) cwp.waterSupply      = HH * civic.waterSupplyNeedScore  / 100;
    }
    const demand = (calcTargets(pop, [domainRow as FormulaRow], cwp) as Record<string, number>)[domain] ?? 0;
    const existingFromAssessment = (buildExisting(a as Record<string, unknown>, [domainRow as FormulaRow]) as Record<string, number>)[domain] ?? 0;
    const existing = layerExistingMap.has(s.id) ? layerExistingMap.get(s.id)! : existingFromAssessment;
    const addressableField = ADDRESSABLE_FIELD[domain];
    const addressable = addressableField ? ((a as unknown as Record<string, number | null>)[addressableField] ?? 0) : 0;
    const gap = Math.max(0, demand - existing);
    const done = doneMap.get(s.id) ?? 0;
    const done_pct = demand > 0 ? Math.round((done / demand) * 100) : 0;
    const planned = Math.round(plannedMap.get(s.id) ?? 0);
    const deficit = Math.max(0, gap - planned);

    let value: number;
    switch (metric) {
      case "demand":      value = demand; break;
      case "addressable": value = addressable; break;
      case "existing":    value = existing; break;
      case "gap":         value = gap; break;
      case "done_pct":    value = done_pct; break;
      case "planned":     value = planned; break;
      case "deficit":     value = deficit; break;
      default:            value = demand;
    }
    settlementValues.set(s.id, value);
  }

  // Aggregate by level
  const values: Record<string, number> = {};

  if (level === "settlement") {
    for (const s of settlements) {
      const v = settlementValues.get(s.id) ?? 0;
      if (v > 0) values[s.name.toLowerCase()] = v;
    }
  } else if (level === "cluster") {
    const agg = new Map<string, { sumNum: number; sumDem: number }>();
    for (const s of settlements) {
      const cn = s.cluster.name;
      if (!agg.has(cn)) agg.set(cn, { sumNum: 0, sumDem: 0 });
      const entry = agg.get(cn)!;
      if (metric === "done_pct") {
        const a = assessmentMap.get(s.id);
        if (a) {
          const pop = { totalHouseholds: a.totalHouseholds, children6m3yr: a.children6m3yr, children4to14: a.children4to14, youth15to21: a.youth15to21, elderly60plus: a.elderly60plus };
          entry.sumDem += (calcTargets(pop, [domainRow as FormulaRow]) as Record<string, number>)[domain] ?? 0;
          entry.sumNum += doneMap.get(s.id) ?? 0;
        }
      } else {
        entry.sumNum += settlementValues.get(s.id) ?? 0;
      }
    }
    for (const [cn, { sumNum, sumDem }] of agg) {
      const v = metric === "done_pct" ? (sumDem > 0 ? Math.round((sumNum / sumDem) * 100) : 0) : Math.round(sumNum);
      if (v > 0) values[cn.toLowerCase()] = v;
    }
  } else {
    const agg = new Map<string, { sumNum: number; sumDem: number }>();
    for (const s of settlements) {
      const zn = s.cluster.zone.name;
      if (!agg.has(zn)) agg.set(zn, { sumNum: 0, sumDem: 0 });
      const entry = agg.get(zn)!;
      if (metric === "done_pct") {
        const a = assessmentMap.get(s.id);
        if (a) {
          const pop = { totalHouseholds: a.totalHouseholds, children6m3yr: a.children6m3yr, children4to14: a.children4to14, youth15to21: a.youth15to21, elderly60plus: a.elderly60plus };
          entry.sumDem += (calcTargets(pop, [domainRow as FormulaRow]) as Record<string, number>)[domain] ?? 0;
          entry.sumNum += doneMap.get(s.id) ?? 0;
        }
      } else {
        entry.sumNum += settlementValues.get(s.id) ?? 0;
      }
    }
    for (const [zn, { sumNum, sumDem }] of agg) {
      const v = metric === "done_pct" ? (sumDem > 0 ? Math.round((sumNum / sumDem) * 100) : 0) : Math.round(sumNum);
      if (v > 0) values[zn.toLowerCase()] = v;
    }
  }

  const max = Object.values(values).reduce((m, v) => Math.max(m, v), 0);

  return NextResponse.json({ values, max, domain: domainInfo, metric, level, allDomains, hasData: Object.keys(values).length > 0, isCivic: false });
}
