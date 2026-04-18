import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/zones/summary
// Returns per-zone aggregates: settlement count, population, goal health, top gap domain.
export async function GET() {
  const [zones, formulas] = await Promise.all([
    prisma.zone.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        clusters: {
          where: { deletedAt: null },
          select: {
            id: true,
            settlements: {
              where: { deletedAt: null },
              select: {
                id: true,
                profile: {
                  select: {
                    totalHouseholds: true,
                    children6m3yr: true,
                    children4to14: true,
                    youth15to21: true,
                    elderly60plus: true,
                  },
                },
                assessments: {
                  orderBy: { assessedAt: "desc" },
                  take: 1,
                  select: {
                    assessedAt: true,
                    existingCreches: true,
                    existingChildrenCentres: true,
                    existingYouthGroups: true,
                    existingElderlyKitchens: true,
                    existingCommunityToilets: true,
                    existingWaterATMs: true,
                  },
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
      orderBy: { name: "asc" },
    }),
    prisma.needsFormulaConfig.findMany({
      where: { isActive: true },
      select: { domain: true, denominator: true, populationField: true, label: true },
    }),
  ]);

  const result = zones.map((zone) => {
    const settlements = zone.clusters.flatMap((c) => c.settlements);
    const totalSettlements = settlements.length;
    const withGoals = settlements.filter((s) => s.needsGoals.some((g) => g.status === "Active")).length;

    // Population aggregates
    const pop = settlements.reduce(
      (acc, s) => ({
        totalHouseholds: acc.totalHouseholds + (s.profile?.totalHouseholds ?? 0),
        children6m3yr: acc.children6m3yr + (s.profile?.children6m3yr ?? 0),
        children4to14: acc.children4to14 + (s.profile?.children4to14 ?? 0),
        youth15to21: acc.youth15to21 + (s.profile?.youth15to21 ?? 0),
        elderly60plus: acc.elderly60plus + (s.profile?.elderly60plus ?? 0),
      }),
      { totalHouseholds: 0, children6m3yr: 0, children4to14: 0, youth15to21: 0, elderly60plus: 0 }
    );

    // Last surveyed (most recent across all settlements)
    const lastSurveyed = settlements
      .flatMap((s) => s.assessments.map((a) => a.assessedAt))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

    // Goal counts (settlement-level + zone-level)
    const allGoals = [
      ...settlements.flatMap((s) => s.needsGoals),
      ...zone.needsGoals,
    ];
    const activeGoals = allGoals.filter((g) => g.status === "Active").length;

    // Overdue pitstops at zone level
    const overdueCount = zone.needsPitstops.length;

    return {
      id: zone.id,
      name: zone.name,
      totalSettlements,
      withActiveGoals: withGoals,
      population: pop,
      activeGoals,
      overdueCount,
      lastSurveyed,
    };
  });

  return NextResponse.json(result);
}
