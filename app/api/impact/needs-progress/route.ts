import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcTargets, buildExisting, layerFeatureExisting, type FormulaRow } from "@/app/api/map/settlement-needs/route";

type PopFields = {
  totalHouseholds: number;
  children6m3yr: number;
  children4to14: number;
  youth15to21: number;
  elderly60plus: number;
};

type StalenessStatus = "green" | "yellow" | "red" | "none";

function getStaleness(lastDelivery: Date | null, yellowDays: number, redDays: number): StalenessStatus {
  if (!lastDelivery) return "none";
  const daysSince = Math.floor((Date.now() - lastDelivery.getTime()) / 86400000);
  if (daysSince >= redDays) return "red";
  if (daysSince >= yellowDays) return "yellow";
  return "green";
}

// Resolve settlement IDs for any geography level
async function resolveSettlementIds(level: string, id: string): Promise<{ ids: string[]; name: string }> {
  if (level === "settlement") {
    const s = await prisma.settlement.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!s) return { ids: [], name: "" };
    return { ids: [s.id], name: s.name };
  }
  if (level === "cluster") {
    const c = await prisma.cluster.findUnique({
      where: { id },
      select: { name: true, settlements: { where: { deletedAt: null }, select: { id: true } } },
    });
    if (!c) return { ids: [], name: "" };
    return { ids: c.settlements.map(s => s.id), name: c.name };
  }
  if (level === "zone") {
    const z = await prisma.zone.findUnique({
      where: { id },
      select: {
        name: true,
        clusters: {
          where: { deletedAt: null },
          select: { settlements: { where: { deletedAt: null }, select: { id: true } } },
        },
      },
    });
    if (!z) return { ids: [], name: "" };
    return { ids: z.clusters.flatMap(c => c.settlements.map(s => s.id)), name: z.name };
  }
  if (level === "city") {
    const c = await prisma.city.findUnique({
      where: { id },
      select: {
        name: true,
        zones: {
          select: {
            clusters: {
              where: { deletedAt: null },
              select: { settlements: { where: { deletedAt: null }, select: { id: true } } },
            },
          },
        },
      },
    });
    if (!c) return { ids: [], name: "" };
    return { ids: c.zones.flatMap(z => z.clusters.flatMap(cl => cl.settlements.map(s => s.id))), name: c.name };
  }
  return { ids: [], name: "" };
}

// Build breakdown items for the next level down
async function buildBreakdown(
  level: string,
  id: string,
  formulaRows: FormulaRow[],
  today: Date,
): Promise<{ id: string; name: string; domains: Record<string, { baseline: number; done: number; remaining: number; pctDone: number; stalenessStatus: StalenessStatus }> }[]> {
  type BreakdownItem = { id: string; name: string; settlementIds: string[] };
  let items: BreakdownItem[] = [];

  if (level === "city") {
    const zones = await prisma.zone.findMany({
      where: { cityId: id, deletedAt: null },
      select: {
        id: true, name: true,
        clusters: { where: { deletedAt: null }, select: { settlements: { where: { deletedAt: null }, select: { id: true } } } },
      },
    });
    items = zones.map(z => ({ id: z.id, name: z.name, settlementIds: z.clusters.flatMap(c => c.settlements.map(s => s.id)) }));
  } else if (level === "zone") {
    const clusters = await prisma.cluster.findMany({
      where: { zoneId: id, deletedAt: null },
      select: { id: true, name: true, settlements: { where: { deletedAt: null }, select: { id: true } } },
    });
    items = clusters.map(c => ({ id: c.id, name: c.name, settlementIds: c.settlements.map(s => s.id) }));
  } else if (level === "cluster") {
    const settlements = await prisma.settlement.findMany({
      where: { clusterId: id, deletedAt: null },
      select: { id: true, name: true },
    });
    items = settlements.map(s => ({ id: s.id, name: s.name, settlementIds: [s.id] }));
  } else {
    return [];
  }

  const activeDomains = formulaRows.filter(f => f.isActive && f.domainType !== "entitlement" && f.domainType !== "civic");
  const allSettlementIds = items.flatMap(i => i.settlementIds);

  // First assessments per settlement (fixed baseline)
  const firstAssessments = allSettlementIds.length > 0
    ? await prisma.settlementAssessment.findMany({
        where: { settlementId: { in: allSettlementIds } },
        orderBy: { assessedAt: "asc" },
        distinct: ["settlementId"],
        select: { settlementId: true, totalHouseholds: true, children6m3yr: true, children4to14: true, youth15to21: true, elderly60plus: true, ...Object.fromEntries(activeDomains.filter(f => f.assessmentColumn).map(f => [f.assessmentColumn!, true])) },
      })
    : [];

  // GoalOutcomes with domain info
  const outcomes = allSettlementIds.length > 0
    ? await prisma.goalOutcome.findMany({
        where: { settlementId: { in: allSettlementIds } },
        select: { settlementId: true, count: true, createdAt: true, goal: { select: { needsDomain: true, deletedAt: true } } },
      })
    : [];

  // LayerFeature counts per settlement
  const layerBySettlement: Record<string, Record<string, number>> = {};
  if (allSettlementIds.length > 0) {
    for (const sid of allSettlementIds) {
      layerBySettlement[sid] = await layerFeatureExisting({ settlementId: sid });
    }
  }

  return items.map(item => {
    const myAssessments = firstAssessments.filter(a => item.settlementIds.includes(a.settlementId));
    const myOutcomes = outcomes.filter(o => item.settlementIds.includes(o.settlementId) && !o.goal.deletedAt && o.goal.needsDomain);

    const domains: Record<string, { baseline: number; done: number; remaining: number; pctDone: number; stalenessStatus: StalenessStatus }> = {};

    for (const f of activeDomains) {
      let target = 0;
      let existing = 0;
      const popZero: PopFields = { totalHouseholds: 0, children6m3yr: 0, children4to14: 0, youth15to21: 0, elderly60plus: 0 };
      const totalPop = { ...popZero };

      for (const a of myAssessments) {
        const pop: PopFields = {
          totalHouseholds: Number(a.totalHouseholds) || 0,
          children6m3yr: Number(a.children6m3yr) || 0,
          children4to14: Number(a.children4to14) || 0,
          youth15to21: Number(a.youth15to21) || 0,
          elderly60plus: Number(a.elderly60plus) || 0,
        };
        (Object.keys(pop) as (keyof PopFields)[]).forEach(k => { totalPop[k] += pop[k]; });
        if (f.assessmentLevel === "settlement") {
          const t = calcTargets(pop, [f] as FormulaRow[]);
          target += t[f.domain] ?? 0;
        }
        if (f.assessmentColumn) {
          existing += Number((a as Record<string, unknown>)[f.assessmentColumn] ?? 0);
        }
      }
      if (f.assessmentLevel !== "settlement") {
        const t = calcTargets(totalPop, [f] as FormulaRow[]);
        target += t[f.domain] ?? 0;
      }
      // Override existing with LayerFeature counts — sum across settlements in this breakdown item
      let layerCount: number | null = null;
      for (const sid of item.settlementIds) {
        const lf = layerBySettlement[sid];
        if (lf && f.domain in lf) layerCount = (layerCount ?? 0) + lf[f.domain];
      }
      if (layerCount !== null) existing = layerCount;
      const baseline = Math.max(0, target - existing);
      const done = myOutcomes.filter(o => o.goal.needsDomain === f.domain).reduce((s, o) => s + o.count, 0);
      const remaining = Math.max(0, baseline - done);
      const pctDone = baseline > 0 ? Math.round((done / baseline) * 100) : done > 0 ? 100 : 0;
      const lastDelivery = myOutcomes.filter(o => o.goal.needsDomain === f.domain).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.createdAt ?? null;
      const staleness = formulaRows.find(r => r.domain === f.domain);
      const yellow = (staleness as typeof staleness & { staleYellowDays?: number })?.staleYellowDays ?? 60;
      const red = (staleness as typeof staleness & { staleRedDays?: number })?.staleRedDays ?? 120;
      domains[f.domain] = { baseline, done, remaining, pctDone, stalenessStatus: getStaleness(lastDelivery, yellow, red) };
    }
    return { id: item.id, name: item.name, domains };
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const level = url.searchParams.get("level") ?? "city";
  const id = url.searchParams.get("id");
  const domainFilter = url.searchParams.get("domain");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!["city", "zone", "cluster", "settlement"].includes(level)) {
    return NextResponse.json({ error: "invalid level" }, { status: 400 });
  }

  const today = new Date();
  const fromDate = fromParam ? new Date(fromParam) : null;
  const toDate = toParam ? new Date(toParam) : null;

  const { ids: settlementIds, name: geoName } = await resolveSettlementIds(level, id);
  if (settlementIds.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Formula config with staleness thresholds
  const formulaRows = await (prisma.needsFormulaConfig.findMany as (args: unknown) => Promise<(FormulaRow & { staleYellowDays: number; staleRedDays: number })[]>)({
    orderBy: { sortOrder: "asc" },
    where: domainFilter ? { domain: domainFilter } : undefined,
  });
  const activeDomains = formulaRows.filter(f => f.isActive && f.domainType !== "entitlement" && f.domainType !== "civic");

  // FIRST assessment per settlement (fixed baseline)
  const selectFields = {
    id: true, settlementId: true, assessedAt: true,
    totalHouseholds: true, children6m3yr: true, children4to14: true, youth15to21: true, elderly60plus: true,
    existingCreches: true, existingChildrenCentres: true, existingYouthGroups: true,
    existingYouthResourceCentres: true, existingElderlyKitchens: true, existingElderlyCentres: true,
    existingPalliativeUnits: true, existingPalliativeCareServices: true,
    existingReferralSystems: true, existingCommunityToilets: true, existingWaterATMs: true,
  };
  const firstAssessments = await prisma.settlementAssessment.findMany({
    where: { settlementId: { in: settlementIds } },
    orderBy: { assessedAt: "asc" },
    distinct: ["settlementId"],
    select: selectFields,
  });

  // Aggregate population + existing from first assessments
  const totalPop: PopFields = { totalHouseholds: 0, children6m3yr: 0, children4to14: 0, youth15to21: 0, elderly60plus: 0 };
  const existingBySettlement: Record<string, Record<string, number>> = {};

  for (const a of firstAssessments) {
    const pop: PopFields = {
      totalHouseholds: Number(a.totalHouseholds) || 0,
      children6m3yr: Number(a.children6m3yr) || 0,
      children4to14: Number(a.children4to14) || 0,
      youth15to21: Number(a.youth15to21) || 0,
      elderly60plus: Number(a.elderly60plus) || 0,
    };
    (Object.keys(pop) as (keyof PopFields)[]).forEach(k => { totalPop[k] += pop[k]; });
    existingBySettlement[a.settlementId] = buildExisting(a as Record<string, unknown>, formulaRows as FormulaRow[]);
  }

  // Override existing with LayerFeature counts per settlement
  const layerFilter = level === "settlement" ? { settlementId: id } : level === "cluster" ? { clusterId: id } : level === "zone" ? { zoneId: id } : {};
  const layerExisting = await layerFeatureExisting(layerFilter);

  // Compute baseline per domain: sum of apfTargets across settlements
  const baselineByDomain: Record<string, number> = {};
  for (const f of activeDomains) {
    if (f.assessmentLevel === "settlement") {
      let total = 0;
      for (const a of firstAssessments) {
        const pop: PopFields = {
          totalHouseholds: Number(a.totalHouseholds) || 0,
          children6m3yr: Number(a.children6m3yr) || 0,
          children4to14: Number(a.children4to14) || 0,
          youth15to21: Number(a.youth15to21) || 0,
          elderly60plus: Number(a.elderly60plus) || 0,
        };
        const t = calcTargets(pop, [f] as FormulaRow[]);
        const ex = existingBySettlement[a.settlementId]?.[f.domain] ?? 0;
        total += Math.max(0, (t[f.domain] ?? 0) - ex);
      }
      baselineByDomain[f.domain] = total;
    } else {
      const t = calcTargets(totalPop, [f] as FormulaRow[]);
      const ex = (layerExisting[f.domain] ?? 0) || Object.values(existingBySettlement).reduce((s, e) => s + (e[f.domain] ?? 0), 0);
      baselineByDomain[f.domain] = Math.max(0, (t[f.domain] ?? 0) - ex);
    }
    // Override with LayerFeature counts for facility domains
    if (f.domain in layerExisting) {
      const t = f.assessmentLevel === "settlement"
        ? firstAssessments.reduce((s, a) => {
            const pop: PopFields = { totalHouseholds: Number(a.totalHouseholds) || 0, children6m3yr: Number(a.children6m3yr) || 0, children4to14: Number(a.children4to14) || 0, youth15to21: Number(a.youth15to21) || 0, elderly60plus: Number(a.elderly60plus) || 0 };
            return s + (calcTargets(pop, [f] as FormulaRow[])[f.domain] ?? 0);
          }, 0)
        : (calcTargets(totalPop, [f] as FormulaRow[])[f.domain] ?? 0);
      baselineByDomain[f.domain] = Math.max(0, t - layerExisting[f.domain]);
    }
  }

  // GoalOutcomes — time-ordered, with goal title and settlement name
  const outcomeWhere = {
    settlementId: { in: settlementIds },
    goal: { needsDomain: { not: null }, deletedAt: null },
    ...(fromDate ? { createdAt: { gte: fromDate } } : {}),
    ...(toDate ? { createdAt: { lte: toDate } } : {}),
  };
  const outcomeRows = await prisma.goalOutcome.findMany({
    where: outcomeWhere,
    orderBy: { createdAt: "asc" },
    select: {
      createdAt: true,
      count: true,
      goal: { select: { title: true, needsDomain: true } },
      settlement: { select: { name: true } },
    },
  });

  // Build per-domain time-series
  const cumulativeByDomain: Record<string, number> = {};
  type TSPoint = { date: string; cumulativeDone: number; remaining: number; goalTitle: string; settlementName: string | null };
  const timeSeriesByDomain: Record<string, TSPoint[]> = {};

  for (const row of outcomeRows) {
    const domain = row.goal.needsDomain!;
    if (domainFilter && domain !== domainFilter) continue;
    if (!activeDomains.find(f => f.domain === domain)) continue;
    cumulativeByDomain[domain] = (cumulativeByDomain[domain] ?? 0) + row.count;
    if (!timeSeriesByDomain[domain]) timeSeriesByDomain[domain] = [];
    const baseline = baselineByDomain[domain] ?? 0;
    timeSeriesByDomain[domain].push({
      date: row.createdAt.toISOString(),
      cumulativeDone: cumulativeByDomain[domain],
      remaining: Math.max(0, baseline - cumulativeByDomain[domain]),
      goalTitle: row.goal.title,
      settlementName: level !== "settlement" ? row.settlement.name : null,
    });
  }

  // Assemble per-domain summary
  const domains: Record<string, {
    label: string; color: string; baseline: number; totalDone: number; remaining: number;
    pctDone: number; lastDeliveryDate: string | null; stalenessStatus: StalenessStatus;
    timeSeries: TSPoint[];
  }> = {};

  for (const f of activeDomains) {
    const baseline = baselineByDomain[f.domain] ?? 0;
    const totalDone = cumulativeByDomain[f.domain] ?? 0;
    const remaining = Math.max(0, baseline - totalDone);
    const pctDone = baseline > 0 ? Math.round((totalDone / baseline) * 100) : totalDone > 0 ? 100 : 0;
    const ts = timeSeriesByDomain[f.domain] ?? [];
    const lastDeliveryDate = ts.length > 0 ? ts[ts.length - 1].date : null;
    const yellow = (f as typeof f & { staleYellowDays?: number }).staleYellowDays ?? 60;
    const red = (f as typeof f & { staleRedDays?: number }).staleRedDays ?? 120;
    domains[f.domain] = {
      label: f.label ?? f.domain,
      color: f.color,
      baseline,
      totalDone,
      remaining,
      pctDone,
      lastDeliveryDate,
      stalenessStatus: baseline > 0 ? getStaleness(lastDeliveryDate ? new Date(lastDeliveryDate) : null, yellow, red) : "none",
      timeSeries: ts,
    };
  }

  // Build breakdown
  const allFormula = await prisma.needsFormulaConfig.findMany({ orderBy: { sortOrder: "asc" } });
  const breakdown = await buildBreakdown(level, id, allFormula as FormulaRow[], today);

  return NextResponse.json({
    geography: { id, name: geoName, level },
    domains,
    breakdown,
  });
}
