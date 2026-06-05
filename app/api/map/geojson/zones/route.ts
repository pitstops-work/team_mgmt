import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/map/geojson/zones?city=bangalore
//
// Returns a GeoJSON FeatureCollection of zone polygons. The polygon for
// each zone is computed live by the `zone_geometry` PostGIS view
// (ST_Union of all the zone's settlements' polygons + 300m buffer
// around centroid-only settlements). See migration
// 20260605010000_derived_cluster_zone_views.

interface Row {
  id: string;
  name: string;
  color: string | null;
  geometry: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city");

  const rows = city
    ? await prisma.$queryRaw<Row[]>`
        SELECT z.id, z.name, z.color, zg.geometry::text AS geometry
          FROM zone_geometry zg
          JOIN "Zone" z ON z.id = zg."zoneId"
          JOIN "City" city ON city.id = z."cityId"
         WHERE city.name ILIKE ${"%" + city + "%"}
      `
    : await prisma.$queryRaw<Row[]>`
        SELECT z.id, z.name, z.color, zg.geometry::text AS geometry
          FROM zone_geometry zg
          JOIN "Zone" z ON z.id = zg."zoneId"
      `;

  const features = rows.map((r) => ({
    type: "Feature" as const,
    geometry: JSON.parse(r.geometry),
    properties: {
      id: r.id,
      zone: r.name,
      color: r.color ?? "#64748b",
    },
  }));

  return NextResponse.json(
    { type: "FeatureCollection", features },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } }
  );
}
