import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import SettlementDetail from "./SettlementDetail";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export const dynamic = "force-dynamic";

export default async function SettlementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await auth();
  const { id } = await params;

  const settlement = await prisma.settlement.findUnique({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      centroidLat: true,
      centroidLng: true,
      cityId: true,
      city: { select: { id: true, name: true } },
      // Partner comes from Org (partnerOrgId). The legacy MapPartner relation
      // this used to read was retired in 20261103160000_retire_map_partner; it
      // agreed with partnerOrgId on all 270 rows that had both, and was blank
      // on the 7 settlements partnered since the Org migration — which is what
      // this page silently failed to show.
      partnerOrg: { select: { slug: true, mapKey: true, name: true, color: true } },
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

  if (!settlement) notFound();

  return (
    <SurfaceProvider id="settlement.detail">
      <SettlementDetail settlement={JSON.parse(JSON.stringify(settlement))} />
    </SurfaceProvider>
  );
}
