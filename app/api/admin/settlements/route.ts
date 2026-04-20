import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const rows = await prisma.settlement.findMany({
    where: { deletedAt: null },
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
    orderBy: { name: "asc" },
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, clusterId, partnerId, polygon, centroidLat, centroidLng } = body;
  if (!name || !clusterId) {
    return NextResponse.json({ error: "name and clusterId are required" }, { status: 400 });
  }

  // Derive cityId from cluster→zone→city
  const cluster = await prisma.cluster.findUnique({
    where: { id: clusterId },
    include: { zone: { include: { city: true } } },
  });
  const cityId = cluster?.zone?.city?.id ?? null;

  const row = await prisma.settlement.create({
    data: {
      name,
      clusterId,
      partnerId: partnerId || null,
      cityId,
      polygon: polygon ?? null,
      centroidLat: centroidLat ? parseFloat(centroidLat) : null,
      centroidLng: centroidLng ? parseFloat(centroidLng) : null,
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
  return NextResponse.json(row, { status: 201 });
}
