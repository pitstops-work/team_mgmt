import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/settlements/[id]
// Full settlement profile: hierarchy, population, goals, pitstops, latest assessment, notes.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await auth();
  const { id } = await params;

  const settlement = await prisma.settlement.findUnique({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      centroidLat: true,
      centroidLng: true,
      partnerId: true,
      partner: { select: { key: true, label: true, color: true } },
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
        take: 3,
        select: {
          id: true,
          assessedAt: true,
          assessmentYear: true,
          existingCreches: true,
          existingChildrenCentres: true,
          existingYouthGroups: true,
          existingElderlyKitchens: true,
          existingCommunityToilets: true,
          existingWaterATMs: true,
        },
      },
      note: {
        select: { note: true, updatedAt: true },
      },
      needsGoals: {
        where: { deletedAt: null },
        select: {
          id: true,
          title: true,
          status: true,
          needsDomain: true,
          targetDate: true,
          owner: { select: { id: true, name: true, image: true } },
          pitstops: {
            where: { deletedAt: null, status: { not: "Done" } },
            orderBy: { order: "asc" },
            take: 3,
            select: { id: true, title: true, status: true, targetDate: true },
          },
        },
        orderBy: { updatedAt: "desc" },
      },
      needsPitstops: {
        where: { deletedAt: null, status: { not: "Done" } },
        orderBy: { targetDate: "asc" },
        select: {
          id: true,
          title: true,
          status: true,
          targetDate: true,
          goal: { select: { id: true, title: true } },
          owner: { select: { id: true, name: true, image: true } },
        },
      },
    },
  });

  if (!settlement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(settlement);
}
