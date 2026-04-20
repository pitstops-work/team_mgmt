import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const layerKey = req.nextUrl.searchParams.get("layerKey");
  const rows = await prisma.layerFeature.findMany({
    where: layerKey ? { layerKey } : undefined,
    include: {
      settlement: { select: { id: true, name: true } },
      cluster:    { select: { id: true, name: true } },
      zone:       { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, layerKey, centreType, partner, lat, lng, settlementId, clusterId, zoneId, notes } = body;
  if (!name || !layerKey || lat == null || lng == null) {
    return NextResponse.json({ error: "name, layerKey, lat, lng are required" }, { status: 400 });
  }
  const row = await prisma.layerFeature.create({
    data: {
      name,
      layerKey,
      centreType: centreType || null,
      partner: partner || null,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      settlementId: settlementId || null,
      clusterId: clusterId || null,
      zoneId: zoneId || null,
      notes: notes || null,
    },
    include: {
      settlement: { select: { id: true, name: true } },
      cluster:    { select: { id: true, name: true } },
      zone:       { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(row, { status: 201 });
}
