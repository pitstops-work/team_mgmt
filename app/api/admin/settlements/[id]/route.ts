import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { adminForbidden } from "@/lib/roleGuard";

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

  // If clusterId changes, re-derive cityId
  let cityId: string | null | undefined = undefined;
  if (clusterId !== undefined) {
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      include: { zone: { include: { city: true } } },
    });
    cityId = cluster?.zone?.city?.id ?? null;
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
  return NextResponse.json(shape(row));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session); if (veto) return veto;

  const { id } = await params;
  // Soft delete
  await prisma.settlement.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
