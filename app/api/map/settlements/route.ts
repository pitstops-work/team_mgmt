import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/map/settlements
// Returns all non-deleted settlements with polygon, partner, profile, and live goal/pitstop counts.
// Uses cityId direct FK on Settlement — no cluster→zone→city traversal needed.
export async function GET() {
  const settlements = await prisma.settlement.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      centroidLat: true,
      centroidLng: true,
      polygon: true,
      cityId: true,
      city: { select: { id: true, name: true } },
      partnerOrgId: true,
      partnerOrg: { select: { mapKey: true, slug: true, name: true, color: true } },
      cluster: {
        select: {
          id: true,
          name: true,
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

  const result = settlements.filter((s) => s.polygon != null).map((s) => ({
    id: s.id,
    name: s.name,
    centroidLat: s.centroidLat,
    centroidLng: s.centroidLng,
    polygon: s.polygon,
    city: s.city ?? null,
    // Same { key, label, color } shape the map UI consumes — sourced from Org.
    partner: s.partnerOrg
      ? {
          key: s.partnerOrg.mapKey ?? s.partnerOrg.slug,
          label: s.partnerOrg.name,
          color: s.partnerOrg.color ?? "#6366f1",
        }
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
