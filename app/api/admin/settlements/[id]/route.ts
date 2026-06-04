import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { adminForbidden } from "@/lib/roleGuard";
import { recomputeClusterBoundary, recomputeZoneBoundary } from "@/lib/geo";

const SELECT = {
  id: true,
  name: true,
  polygon: true,
  centroidLat: true,
  centroidLng: true,
  partnerOrgId: true,
  clusterId: true,
  cluster: { select: { id: true, name: true, zone: { select: { id: true, name: true } } } },
  partnerOrg: { select: { id: true, name: true, color: true, mapKey: true } },
} as const;

type SettlementRow = {
  id: string;
  name: string;
  polygon: unknown;
  centroidLat: number | null;
  centroidLng: number | null;
  partnerOrgId: string | null;
  clusterId: string;
  cluster: { id: string; name: string; zone: { id: string; name: string } };
  partnerOrg: { id: string; name: string; color: string | null; mapKey: string | null } | null;
};

function shape(row: SettlementRow) {
  return {
    id: row.id,
    name: row.name,
    polygon: row.polygon,
    centroidLat: row.centroidLat,
    centroidLng: row.centroidLng,
    partnerId: row.partnerOrgId,
    partnerOrgId: row.partnerOrgId,
    clusterId: row.clusterId,
    cluster: row.cluster,
    partner: row.partnerOrg
      ? { id: row.partnerOrg.id, key: row.partnerOrg.mapKey ?? row.partnerOrg.id, label: row.partnerOrg.name, color: row.partnerOrg.color ?? "#6366f1" }
      : null,
  };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session); if (veto) return veto;

  const { id } = await params;
  const body = await req.json();
  const { name, clusterId, partnerId, partnerOrgId, polygon, centroidLat, centroidLng } = body;

  // Capture the pre-update cluster + zone so we can recompute both old and
  // new boundaries when the cluster changes.
  const before = await prisma.settlement.findUnique({
    where: { id },
    select: { clusterId: true, cluster: { select: { zoneId: true } } },
  });

  // If clusterId changes, re-derive cityId
  let cityId: string | null | undefined = undefined;
  let newZoneId: string | null = null;
  if (clusterId !== undefined) {
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      include: { zone: { include: { city: true } } },
    });
    cityId = cluster?.zone?.city?.id ?? null;
    newZoneId = cluster?.zoneId ?? null;
  }

  // Accept both new (partnerOrgId) and legacy (partnerId) names — both refer
  // to Org.id after the partner consolidation. Empty string → null clear.
  const partnerOrgIdInput =
    partnerOrgId !== undefined ? partnerOrgId :
    partnerId !== undefined ? partnerId :
    undefined;

  const row = await prisma.settlement.update({
    where: { id },
    data: {
      ...(name !== undefined        && { name }),
      ...(clusterId !== undefined   && { clusterId }),
      ...(cityId !== undefined      && { cityId }),
      ...(partnerOrgIdInput !== undefined && { partnerOrgId: partnerOrgIdInput || null }),
      ...(polygon !== undefined     && { polygon }),
      ...(centroidLat !== undefined && { centroidLat: centroidLat != null ? parseFloat(centroidLat) : null }),
      ...(centroidLng !== undefined && { centroidLng: centroidLng != null ? parseFloat(centroidLng) : null }),
    },
    select: SELECT,
  });

  // Recompute cluster + zone hulls when geometry-relevant fields changed:
  // cluster reassignment, polygon edit, or centroid edit. Skipping when only
  // partner/name/etc. changed keeps the route cheap.
  const geometryAffected =
    clusterId !== undefined || polygon !== undefined ||
    centroidLat !== undefined || centroidLng !== undefined;
  if (geometryAffected) {
    const affectedClusterIds = new Set<string>([row.clusterId]);
    if (before?.clusterId && before.clusterId !== row.clusterId) affectedClusterIds.add(before.clusterId);
    const affectedZoneIds = new Set<string>();
    if (newZoneId) affectedZoneIds.add(newZoneId);
    if (before?.cluster?.zoneId) affectedZoneIds.add(before.cluster.zoneId);
    try {
      await Promise.all([
        ...Array.from(affectedClusterIds).map((cid) => recomputeClusterBoundary(cid, prisma)),
        ...Array.from(affectedZoneIds).map((zid) => recomputeZoneBoundary(zid, prisma)),
      ]);
    } catch (e) {
      console.error("[settlements] boundary recompute failed", e);
    }
  }

  return NextResponse.json(shape(row));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session); if (veto) return veto;

  const { id } = await params;
  const before = await prisma.settlement.findUnique({
    where: { id },
    select: { clusterId: true, cluster: { select: { zoneId: true } } },
  });
  // Soft delete
  await prisma.settlement.update({ where: { id }, data: { deletedAt: new Date() } });
  if (before?.clusterId) {
    try {
      await recomputeClusterBoundary(before.clusterId, prisma);
      if (before.cluster?.zoneId) await recomputeZoneBoundary(before.cluster.zoneId, prisma);
    } catch (e) {
      console.error("[settlements] boundary recompute failed", e);
    }
  }
  return NextResponse.json({ ok: true });
}
