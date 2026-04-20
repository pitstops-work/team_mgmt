import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/map/geojson/clusters?city=bangalore
// Returns a GeoJSON FeatureCollection of cluster boundary polygons from the DB.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city");

  const clusters = await prisma.cluster.findMany({
    where: {
      deletedAt: null,
      geometry: { not: undefined },
      ...(city ? { zone: { city: { name: { contains: city, mode: "insensitive" } } } } : {}),
    },
    select: {
      id: true,
      name: true,
      geometry: true,
      color: true,
      label: true,
      zone: { select: { name: true } },
    },
  });

  const features = clusters.map((c) => ({
    type: "Feature",
    geometry: c.geometry,
    properties: {
      id: c.id,
      cluster: c.name,
      zone: c.zone.name,
      color: c.color ?? "#64748b",
      label: c.label ?? c.name,
    },
  }));

  return NextResponse.json(
    { type: "FeatureCollection", features },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } }
  );
}
