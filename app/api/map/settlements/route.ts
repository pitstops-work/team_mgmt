import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/map/settlements
// Returns all non-deleted settlements with polygon, partner, profile, and live goal/pitstop counts.
// Powers the live map layer and settlement cards.
export async function GET() {
  // Filter polygon != null at JS level to avoid Prisma JSON null type complexity
  const settlements = await prisma.settlement.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      centroidLat: true,
      centroidLng: true,
      polygon: true,
      partnerId: true,
      partner: { select: { key: true, label: true, color: true } },
      cluster: {
        select: {
          id: true, name: true,
          zone: { select: { id: true, name: true } },
        },
      },
      profile: {
        select: {
          totalHouseholds: true,
          children6m3yr: true,
          children4to14: true,
          youth15to21: true,
          elderly60plus: true,
          lastSyncedAt: true,
        },
      },
      assessments: {
        orderBy: { assessedAt: "desc" },
        take: 1,
        select: { assessedAt: true, assessmentYear: true },
      },
      needsGoals: {
        where: { deletedAt: null, status: { not: "Complete" } },
        select: { id: true, status: true },
      },
    },
    orderBy: { name: "asc" },
  });

  // Only return settlements that have polygon data
  const result = settlements.filter((s) => s.polygon != null).map((s) => ({
    id: s.id,
    name: s.name,
    centroidLat: s.centroidLat,
    centroidLng: s.centroidLng,
    polygon: s.polygon,
    partner: s.partner
      ? { key: s.partner.key, label: s.partner.label, color: s.partner.color }
      : null,
    cluster: s.cluster
      ? { id: s.cluster.id, name: s.cluster.name, zone: s.cluster.zone }
      : null,
    profile: s.profile ?? null,
    lastAssessedAt: s.assessments[0]?.assessedAt ?? null,
    activeGoals: s.needsGoals.filter((g) => g.status === "Active").length,
    totalGoals: s.needsGoals.length,
  }));

  return NextResponse.json(result);
}
