import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { adminForbidden } from "@/lib/roleGuard";

const INCLUDE = {
  settlement: { select: { id: true, name: true } },
  cluster:    { select: { id: true, name: true } },
  zone:       { select: { id: true, name: true } },
  partnerOrg: { select: { id: true, name: true, color: true, mapKey: true } },
} as const;

async function resolvePartner(
  partnerOrgId: string | null | undefined,
  partnerMapKey: string | null | undefined,
): Promise<{ partnerOrgId: string | null; partner: string | null } | null> {
  if (partnerOrgId === undefined && partnerMapKey === undefined) return null;
  const idOrKey = partnerOrgId || partnerMapKey;
  if (!idOrKey) return { partnerOrgId: null, partner: null };
  const org = await prisma.org.findFirst({
    where: { kind: "partner", OR: [{ id: idOrKey }, { mapKey: idOrKey }] },
    select: { id: true, name: true, mapKey: true },
  });
  if (!org) return { partnerOrgId: null, partner: idOrKey || null };
  return { partnerOrgId: org.id, partner: org.mapKey ?? org.name };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session); if (veto) return veto;

  const { id } = await params;
  const body = await req.json();
  const { name, layerKey, centreType, partner, partnerOrgId, lat, lng, settlementId, clusterId, zoneId, notes } = body;

  const resolvedPartner = await resolvePartner(partnerOrgId, partner);

  const row = await prisma.layerFeature.update({
    where: { id },
    data: {
      ...(name !== undefined      && { name }),
      ...(layerKey !== undefined  && { layerKey }),
      ...(centreType !== undefined && { centreType: centreType || null }),
      ...(resolvedPartner       && { partner: resolvedPartner.partner, partnerOrgId: resolvedPartner.partnerOrgId }),
      ...(lat !== undefined       && { lat: parseFloat(lat) }),
      ...(lng !== undefined       && { lng: parseFloat(lng) }),
      ...(settlementId !== undefined && { settlementId: settlementId || null }),
      ...(clusterId !== undefined    && { clusterId: clusterId || null }),
      ...(zoneId !== undefined       && { zoneId: zoneId || null }),
      ...(notes !== undefined        && { notes: notes || null }),
    },
    include: INCLUDE,
  });
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session); if (veto) return veto;

  const { id } = await params;
  await prisma.layerFeature.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
