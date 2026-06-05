// GET /api/admin/derived-boundaries
//
// Returns cluster + zone polygons derived live from settlement coverage —
// reads from the cluster_geometry / zone_geometry Postgres views (added in
// migration 20260605010000_derived_cluster_zone_views). Used by the map
// to overlay derived boundaries on top of the stored hand-drawn ones for
// a visual diff before the cutover.

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { adminForbidden } from "@/lib/roleGuard";

interface Row {
  id: string;
  name: string;
  geometry: string;
}

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session); if (veto) return veto;

  const clusters = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT c.id, c.name, cg.geometry::text AS geometry
       FROM cluster_geometry cg
       JOIN "Cluster" c ON c.id = cg."clusterId"
      ORDER BY c.name`
  );
  const zones = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT z.id, z.name, zg.geometry::text AS geometry
       FROM zone_geometry zg
       JOIN "Zone" z ON z.id = zg."zoneId"
      ORDER BY z.name`
  );

  return Response.json({
    clusters: clusters.map(r => ({ id: r.id, name: r.name, geometry: JSON.parse(r.geometry) })),
    zones: zones.map(r => ({ id: r.id, name: r.name, geometry: JSON.parse(r.geometry) })),
  });
}
