import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/map/geojson/clusters?city=bangalore
//
// Returns a GeoJSON FeatureCollection of cluster polygons. The polygon
// for each cluster is computed live by the `cluster_geometry` PostGIS
// view (ST_Union of its settlements' polygons + 300m buffer around
// centroid-only settlements). See migration
// 20260605010000_derived_cluster_zone_views.
//
// Settlement coverage IS the cluster shape — no stored geometry, no
// recompute hooks, no hand-drawn seed.

interface Row {
  id: string;
  name: string;
  label: string | null;
  color: string | null;
  zoneName: string;
  geometry: string; // GeoJSON text from ST_AsGeoJSON
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city");

  const rows = city
    ? await prisma.$queryRaw<Row[]>`
        SELECT c.id, c.name, c.label, c.color, z.name AS "zoneName",
               cg.geometry::text AS geometry
          FROM cluster_geometry cg
          JOIN "Cluster" c ON c.id = cg."clusterId"
          JOIN "Zone" z ON z.id = c."zoneId"
          JOIN "City" city ON city.id = z."cityId"
         WHERE city.name ILIKE ${"%" + city + "%"}
      `
    : await prisma.$queryRaw<Row[]>`
        SELECT c.id, c.name, c.label, c.color, z.name AS "zoneName",
               cg.geometry::text AS geometry
          FROM cluster_geometry cg
          JOIN "Cluster" c ON c.id = cg."clusterId"
          JOIN "Zone" z ON z.id = c."zoneId"
      `;

  const features = rows.map((r) => ({
    type: "Feature" as const,
    geometry: JSON.parse(r.geometry),
    properties: {
      id: r.id,
      cluster: r.name,
      zone: r.zoneName,
      color: r.color ?? "#64748b",
      label: r.label ?? r.name,
    },
  }));

  return NextResponse.json(
    { type: "FeatureCollection", features },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } }
  );
}
