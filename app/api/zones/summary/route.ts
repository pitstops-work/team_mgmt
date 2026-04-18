import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/zones/summary
// Returns per-zone aggregates: settlement count, population, goal health, overdue pitstops.
// Uses Settlement.cityId (direct FK) for city delineation — no traversal needed.
export async function GET() {
  const zones = await prisma.zone.findMany({
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
              cityId: true,
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
  });

  const result = zones.map((zone) => {
    const settlements = zone.clusters.flatMap((c) => c.settlements);
    const totalSettlements = settlements.length;
    const withGoals = settlements.filter((s) => s.needsGoals.some((g) => g.status === "Active")).length;

    const pop = settlements.reduce(
      (acc, s) => ({
        totalHouseholds: acc.totalHouseholds + (s.profile?.totalHouseholds ?? 0),
        children6m3yr:   acc.children6m3yr   + (s.profile?.children6m3yr ?? 0),
        children4to14:   acc.children4to14   + (s.profile?.children4to14 ?? 0),
        youth15to21:     acc.youth15to21     + (s.profile?.youth15to21 ?? 0),
        elderly60plus:   acc.elderly60plus   + (s.profile?.elderly60plus ?? 0),
      }),
      { totalHouseholds: 0, children6m3yr: 0, children4to14: 0, youth15to21: 0, elderly60plus: 0 }
    );

    const lastSurveyed = settlements
      .flatMap((s) => s.assessments.map((a) => a.assessedAt))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

    const allGoals = [...settlements.flatMap((s) => s.needsGoals), ...zone.needsGoals];
    const activeGoals = allGoals.filter((g) => g.status === "Active").length;
    const overdueCount = zone.needsPitstops.length;

    return {
      id: zone.id,
      name: zone.name,
      city: zone.city ?? null,
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
