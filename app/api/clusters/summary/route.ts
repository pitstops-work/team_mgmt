import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcTargets, buildDomainConfig, buildExisting, type FormulaRow } from "../../map/settlement-needs/route";

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
    },
  });
  const assessmentBySettlement = Object.fromEntries(assessments.map(a => [a.settlementId, a]));

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

    const targets = calcTargets(pop, formulaRows as FormulaRow[]);
    const existing: Record<string, number> = {};
    for (const s of cluster.settlements) {
      const a = assessmentBySettlement[s.id];
      if (!a) continue;
      const row = buildExisting(a as Record<string, unknown>, formulaRows as FormulaRow[]);
      for (const [domain, val] of Object.entries(row)) {
        existing[domain] = (existing[domain] ?? 0) + val;
      }
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
      const inCluster =
        (g.needsClusterId   && g.needsClusterId   === cluster.id) ||
        (g.needsSettlementId && sids.has(g.needsSettlementId));
      if (!inCluster) continue;
      inProgress[g.needsDomain] = (inProgress[g.needsDomain] ?? 0) + (g.parameter ?? 0);
    }

    const domainProgress: Record<string, { target: number; existing: number; done: number; inProgress: number }> = {};
    for (const f of domainConfig) {
      domainProgress[f.domain] = {
        target:     targets[f.domain]    ?? 0,
        existing:   existing[f.domain]   ?? 0,
        done:       done[f.domain]       ?? 0,
        inProgress: inProgress[f.domain] ?? 0,
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
