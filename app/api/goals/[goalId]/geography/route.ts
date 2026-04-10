import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  const [cities, zones, clusters, settlements] = await Promise.all([
    prisma.goalCity.findMany({ where: { goalId }, include: { city: true } }),
    prisma.goalZone.findMany({ where: { goalId }, include: { zone: true } }),
    prisma.goalCluster.findMany({ where: { goalId }, include: { cluster: true } }),
    prisma.goalSettlement.findMany({ where: { goalId }, include: { settlement: true } }),
  ]);

  return Response.json({
    cities: cities.map((r) => ({ ...r.city, type: "city" })),
    zones: zones.map((r) => ({ ...r.zone, type: "zone" })),
    clusters: clusters.map((r) => ({ ...r.cluster, type: "cluster" })),
    settlements: settlements.map((r) => ({ ...r.settlement, type: "settlement" })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  const { type, id } = await req.json();

  if (type === "city") {
    await prisma.goalCity.upsert({ where: { goalId_cityId: { goalId, cityId: id } }, create: { goalId, cityId: id }, update: {} });
  } else if (type === "zone") {
    await prisma.goalZone.upsert({ where: { goalId_zoneId: { goalId, zoneId: id } }, create: { goalId, zoneId: id }, update: {} });
  } else if (type === "cluster") {
    await prisma.goalCluster.upsert({ where: { goalId_clusterId: { goalId, clusterId: id } }, create: { goalId, clusterId: id }, update: {} });
  } else if (type === "settlement") {
    await prisma.goalSettlement.upsert({ where: { goalId_settlementId: { goalId, settlementId: id } }, create: { goalId, settlementId: id }, update: {} });
  } else {
    return Response.json({ error: "Invalid type" }, { status: 400 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  const { type, id } = await req.json();

  if (type === "city") {
    await prisma.goalCity.deleteMany({ where: { goalId, cityId: id } });
  } else if (type === "zone") {
    await prisma.goalZone.deleteMany({ where: { goalId, zoneId: id } });
  } else if (type === "cluster") {
    await prisma.goalCluster.deleteMany({ where: { goalId, clusterId: id } });
  } else if (type === "settlement") {
    await prisma.goalSettlement.deleteMany({ where: { goalId, settlementId: id } });
  } else {
    return Response.json({ error: "Invalid type" }, { status: 400 });
  }

  return Response.json({ ok: true });
}
