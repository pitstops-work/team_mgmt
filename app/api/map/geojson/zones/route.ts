import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/map/geojson/zones?city=bangalore
// Returns a GeoJSON FeatureCollection of zone boundary polygons from the DB.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city");

  const zones = await prisma.zone.findMany({
    where: {
      deletedAt: null,
      geometry: { not: undefined },
      ...(city ? { city: { name: { contains: city, mode: "insensitive" } } } : {}),
    },
    select: {
      id: true,
      name: true,
      geometry: true,
      color: true,
    },
  });

  const features = zones.map((z) => ({
    type: "Feature",
    geometry: z.geometry,
    properties: {
      id: z.id,
      zone: z.name,
      color: z.color ?? "#64748b",
    },
  }));

  return NextResponse.json(
    { type: "FeatureCollection", features },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } }
  );
}
