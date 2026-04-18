import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clusterParam = url.searchParams.get("cluster");
  const zoneParam    = url.searchParams.get("zone");

  if (!clusterParam && !zoneParam) {
    return NextResponse.json({ error: "Missing cluster or zone" }, { status: 400 });
  }

  let geoWhere: Record<string, unknown>;

  if (clusterParam) {
    const clusterName = clusterParam.replace(/_/g, " ");
    const cluster = await prisma.cluster.findFirst({
      where: { name: { equals: clusterName, mode: "insensitive" }, deletedAt: null },
    });
    if (!cluster) return NextResponse.json([]);
    geoWhere = { needsClusterId: cluster.id };
  } else {
    const zoneName = zoneParam!.trim();
    const zone = await prisma.zone.findFirst({
      where: { name: { equals: zoneName, mode: "insensitive" } },
    });
    if (!zone) return NextResponse.json([]);
    geoWhere = { needsZoneId: zone.id };
  }

  const goals = await prisma.goal.findMany({
    where: { deletedAt: null, ...geoWhere },
    select: {
      id: true, title: true, status: true,
      owner: { select: { id: true, name: true, image: true } },
      pitstops: {
        where: { deletedAt: null },
        orderBy: { order: "asc" },
        select: {
          id: true, title: true, status: true, targetDate: true,
          owner: { select: { id: true, name: true, image: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(goals);
}
