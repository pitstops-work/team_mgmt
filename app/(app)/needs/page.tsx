import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import NeedsDashboard from "./NeedsDashboard";

const DOMAIN_KEYS = ["Creche", "ChildrenCentre", "YouthGroup", "ElderlyKitchen", "PalliativeSupport", "CommunityToilet", "WaterATM"] as const;
type DomainKey = typeof DOMAIN_KEYS[number];

function calcTargets(pop: { totalHouseholds: number; children6m3yr: number; children4to14: number; youth15to21: number; elderly60plus: number }, formulas: Record<string, number>) {
  const ceil = (v: number, d: number) => v > 0 ? Math.ceil(v / d) : 0;
  return {
    Creche: ceil(pop.children6m3yr, formulas["Creche"] ?? 20),
    ChildrenCentre: ceil(pop.children4to14, formulas["ChildrenCentre"] ?? 500),
    YouthGroup: ceil(pop.youth15to21, formulas["YouthGroup"] ?? 30),
    ElderlyKitchen: ceil(pop.elderly60plus, formulas["ElderlyKitchen"] ?? 50),
    PalliativeSupport: ceil(pop.elderly60plus, formulas["PalliativeSupport"] ?? 100),
    CommunityToilet: ceil(pop.totalHouseholds, formulas["CommunityToilet"] ?? 200),
    WaterATM: ceil(pop.totalHouseholds, formulas["WaterATM"] ?? 250),
  };
}

export interface DomainSummary { target: number; existing: number; apfTarget: number; done: number; inProgress: number; gap: number }
export type CityStats = { totalHH: number; assessedCount: number; domains: Record<DomainKey, DomainSummary> }

export default async function NeedsPage() {
  const session = await auth();

  const [cities, formulaRows, latestAssessments, goals] = await Promise.all([
    prisma.city.findMany({
      where: { deletedAt: null },
      include: {
        zones: {
          where: { deletedAt: null },
          orderBy: { name: "asc" },
          include: {
            clusters: {
              where: { deletedAt: null },
              orderBy: { name: "asc" },
              include: {
                settlements: {
                  where: { deletedAt: null },
                  orderBy: { name: "asc" },
                  include: {
                    assessments: {
                      orderBy: { assessedAt: "desc" },
                      take: 1,
                      select: { id: true, assessmentYear: true, assessedAt: true, totalHouseholds: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.needsFormulaConfig.findMany(),
    // Latest assessment per settlement — only population + existing facility counts
    prisma.settlementAssessment.findMany({
      orderBy: [{ settlementId: "asc" }, { assessedAt: "desc" }],
      distinct: ["settlementId"],
      select: {
        totalHouseholds: true, children6m3yr: true, children4to14: true,
        youth15to21: true, elderly60plus: true,
        existingCreches: true, existingChildrenCentres: true, existingYouthGroups: true,
        existingElderlyKitchens: true, existingPalliativeUnits: true,
        existingCommunityToilets: true, existingWaterATMs: true,
      },
    }),
    prisma.goal.findMany({
      where: { needsDomain: { not: null }, deletedAt: null },
      select: { status: true, needsDomain: true, parameter: true, metrics: { where: { deletedAt: null }, select: { current: true }, take: 1 } },
    }),
  ]);

  // ── Compute city-level aggregate summary ──────────────────────────────────
  const formulas = Object.fromEntries(formulaRows.map(f => [f.domain, f.denominator]));

  const totalPop = latestAssessments.reduce((acc, a) => ({
    totalHouseholds: acc.totalHouseholds + a.totalHouseholds,
    children6m3yr: acc.children6m3yr + a.children6m3yr,
    children4to14: acc.children4to14 + a.children4to14,
    youth15to21: acc.youth15to21 + a.youth15to21,
    elderly60plus: acc.elderly60plus + a.elderly60plus,
  }), { totalHouseholds: 0, children6m3yr: 0, children4to14: 0, youth15to21: 0, elderly60plus: 0 });

  const totalExisting: Record<DomainKey, number> = {
    Creche: latestAssessments.reduce((s, a) => s + a.existingCreches, 0),
    ChildrenCentre: latestAssessments.reduce((s, a) => s + a.existingChildrenCentres, 0),
    YouthGroup: latestAssessments.reduce((s, a) => s + a.existingYouthGroups, 0),
    ElderlyKitchen: latestAssessments.reduce((s, a) => s + a.existingElderlyKitchens, 0),
    PalliativeSupport: latestAssessments.reduce((s, a) => s + a.existingPalliativeUnits, 0),
    CommunityToilet: latestAssessments.reduce((s, a) => s + a.existingCommunityToilets, 0),
    WaterATM: latestAssessments.reduce((s, a) => s + a.existingWaterATMs, 0),
  };

  const targets = calcTargets(totalPop, formulas);

  const actuals: Record<string, { done: number; inProgress: number }> = {};
  for (const g of goals) {
    if (!g.needsDomain) continue;
    const d = g.needsDomain as string;
    if (!actuals[d]) actuals[d] = { done: 0, inProgress: 0 };
    const val = g.parameter ?? g.metrics[0]?.current ?? 0;
    if (g.status === "Complete") actuals[d].done += val;
    else if (g.status === "Active") actuals[d].inProgress += val;
  }

  const domainStats: Record<DomainKey, DomainSummary> = {} as Record<DomainKey, DomainSummary>;
  for (const d of DOMAIN_KEYS) {
    const target = targets[d];
    const existing = totalExisting[d];
    const apfTarget = Math.max(0, target - existing);
    const done = actuals[d]?.done ?? 0;
    const inProgress = actuals[d]?.inProgress ?? 0;
    domainStats[d] = { target, existing, apfTarget, done, inProgress, gap: Math.max(0, apfTarget - done) };
  }

  const allSettlements = cities.flatMap(c => c.zones.flatMap(z => z.clusters.flatMap(cl => cl.settlements)));
  const cityStats: CityStats = {
    totalHH: totalPop.totalHouseholds,
    assessedCount: latestAssessments.length,
    domains: domainStats,
  };

  return (
    <NeedsDashboard
      cities={JSON.parse(JSON.stringify(cities))}
      currentUserId={session!.user!.id!}
      totalSettlements={allSettlements.length}
      cityStats={cityStats}
    />
  );
}
