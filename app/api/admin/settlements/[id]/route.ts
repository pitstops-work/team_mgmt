import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { adminForbidden } from "@/lib/roleGuard";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session); if (veto) return veto;

  const { id } = await params;
  const body = await req.json();
  const { name, clusterId, partnerId, polygon, centroidLat, centroidLng } = body;

  // If clusterId changes, re-derive cityId
  let cityId: string | null | undefined = undefined;
  if (clusterId !== undefined) {
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      include: { zone: { include: { city: true } } },
    });
    cityId = cluster?.zone?.city?.id ?? null;
  }

  const row = await prisma.settlement.update({
    where: { id },
    data: {
      ...(name !== undefined       && { name }),
      ...(clusterId !== undefined  && { clusterId }),
      ...(cityId !== undefined     && { cityId }),
      ...(partnerId !== undefined  && { partnerId: partnerId || null }),
      ...(polygon !== undefined    && { polygon }),
      ...(centroidLat !== undefined && { centroidLat: centroidLat != null ? parseFloat(centroidLat) : null }),
      ...(centroidLng !== undefined && { centroidLng: centroidLng != null ? parseFloat(centroidLng) : null }),
    },
    select: {
      id: true,
      name: true,
      polygon: true,
      centroidLat: true,
      centroidLng: true,
      partnerId: true,
      clusterId: true,
      cluster: { select: { id: true, name: true, zone: { select: { id: true, name: true } } } },
      partner:  { select: { id: true, key: true, label: true, color: true } },
    },
  });
  return NextResponse.json(row);
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
