import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const [cities, zones, clusters, settlements] = await Promise.all([
    prisma.pitstopCity.findMany({ where: { pitstopId }, include: { city: true } }),
    prisma.pitstopZone.findMany({ where: { pitstopId }, include: { zone: true } }),
    prisma.pitstopCluster.findMany({ where: { pitstopId }, include: { cluster: true } }),
    prisma.pitstopSettlement.findMany({ where: { pitstopId }, include: { settlement: true } }),
  ]);

  return Response.json({
    cities: cities.map((r) => ({ ...r.city, type: "city" })),
    zones: zones.map((r) => ({ ...r.zone, type: "zone" })),
    clusters: clusters.map((r) => ({ ...r.cluster, type: "cluster" })),
    settlements: settlements.map((r) => ({ ...r.settlement, type: "settlement" })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const { type, id } = await req.json();

  if (type === "city") {
    await prisma.pitstopCity.upsert({ where: { pitstopId_cityId: { pitstopId, cityId: id } }, create: { pitstopId, cityId: id }, update: {} });
  } else if (type === "zone") {
    await prisma.pitstopZone.upsert({ where: { pitstopId_zoneId: { pitstopId, zoneId: id } }, create: { pitstopId, zoneId: id }, update: {} });
  } else if (type === "cluster") {
    await prisma.pitstopCluster.upsert({ where: { pitstopId_clusterId: { pitstopId, clusterId: id } }, create: { pitstopId, clusterId: id }, update: {} });
  } else if (type === "settlement") {
    await prisma.pitstopSettlement.upsert({ where: { pitstopId_settlementId: { pitstopId, settlementId: id } }, create: { pitstopId, settlementId: id }, update: {} });
  } else {
    return Response.json({ error: "Invalid type" }, { status: 400 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const { type, id } = await req.json();

  if (type === "city") {
    await prisma.pitstopCity.deleteMany({ where: { pitstopId, cityId: id } });
  } else if (type === "zone") {
    await prisma.pitstopZone.deleteMany({ where: { pitstopId, zoneId: id } });
  } else if (type === "cluster") {
    await prisma.pitstopCluster.deleteMany({ where: { pitstopId, clusterId: id } });
  } else if (type === "settlement") {
    await prisma.pitstopSettlement.deleteMany({ where: { pitstopId, settlementId: id } });
  } else {
    return Response.json({ error: "Invalid type" }, { status: 400 });
  }

  return Response.json({ ok: true });
}
