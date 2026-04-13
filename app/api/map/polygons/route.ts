import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const polygons = await prisma.mapPolygon.findMany({
    orderBy: { createdAt: "desc" },
  });

  const featureCollection = {
    type: "FeatureCollection" as const,
    features: polygons.map((p) => ({
      type: "Feature" as const,
      properties: {
        id: p.id,
        name: p.name,
        partnerKey: p.partnerKey,
        zone: p.zone,
        cluster: p.cluster,
        description: p.description,
        createdAt: p.createdAt.toISOString(),
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: p.coordinates as number[][][],
      },
    })),
  };

  return NextResponse.json(featureCollection);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, partnerKey, zone, cluster, description, coordinates } = body;

  if (!name?.trim() || !partnerKey?.trim() || !Array.isArray(coordinates) || coordinates.length < 3) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Ensure coordinates are in GeoJSON ring format [[lng,lat], ...]
  // Close the ring if not already closed
  const ring: number[][] = coordinates.map((c: { lat: number; lng: number } | number[]) =>
    Array.isArray(c) ? c : [c.lng, c.lat]
  );
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
    ring.push(ring[0]);
  }

  const polygon = await prisma.mapPolygon.create({
    data: {
      name: String(name).trim(),
      partnerKey: String(partnerKey).trim(),
      zone: String(zone ?? "").trim(),
      cluster: String(cluster ?? "").trim(),
      description: String(description ?? "").trim(),
      coordinates: [ring],
    },
  });

  return NextResponse.json(polygon, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.mapPolygon.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
