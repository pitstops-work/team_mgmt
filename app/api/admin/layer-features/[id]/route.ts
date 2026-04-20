import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { name, layerKey, centreType, partner, lat, lng, settlementId, clusterId, zoneId, notes } = body;
  const row = await prisma.layerFeature.update({
    where: { id },
    data: {
      ...(name !== undefined      && { name }),
      ...(layerKey !== undefined  && { layerKey }),
      ...(centreType !== undefined && { centreType: centreType || null }),
      ...(partner !== undefined   && { partner: partner || null }),
      ...(lat !== undefined       && { lat: parseFloat(lat) }),
      ...(lng !== undefined       && { lng: parseFloat(lng) }),
      ...(settlementId !== undefined && { settlementId: settlementId || null }),
      ...(clusterId !== undefined    && { clusterId: clusterId || null }),
      ...(zoneId !== undefined       && { zoneId: zoneId || null }),
      ...(notes !== undefined        && { notes: notes || null }),
    },
    include: {
      settlement: { select: { id: true, name: true } },
      cluster:    { select: { id: true, name: true } },
      zone:       { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.layerFeature.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
