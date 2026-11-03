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
): Promise<{ partnerOrgId: string | null } | null> {
  // Both undefined means "don't touch" (only on PATCH); caller checks that.
  if (partnerOrgId === undefined && partnerMapKey === undefined) return null;

  const idOrKey = partnerOrgId || partnerMapKey;
  if (!idOrKey) return { partnerOrgId: null };

  const org = await prisma.org.findFirst({
    where: { kind: "partner", OR: [{ id: idOrKey }, { mapKey: idOrKey }] },
    select: { id: true },
  });
  // An identifier that resolves to no org clears the assignment rather than
  // being stored as a loose string. The free-text column that used to hold
  // the unresolved value is gone, and silently keeping one was how a partner
  // came to exist as text in one place and a row in another.
  return { partnerOrgId: org?.id ?? null };
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
      ...(resolvedPartner       && { partnerOrgId: resolvedPartner.partnerOrgId }),
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
