import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/map/geojson/settlements?partner=sangama&city=bangalore
// Returns a GeoJSON FeatureCollection of settlement polygons from the DB.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const partner = searchParams.get("partner");
  const city = searchParams.get("city");

  const rows = await prisma.settlement.findMany({
    where: {
      deletedAt: null,
      polygon: { not: undefined },
      ...(partner ? { partner: { key: partner } } : {}),
      ...(city ? { city: { name: { contains: city, mode: "insensitive" } } } : {}),
    },
    select: {
      id: true,
      name: true,
      polygon: true,
      partner: { select: { key: true, color: true } },
      cluster: { select: { name: true, zone: { select: { name: true } } } },
    },
    orderBy: { name: "asc" },
  });

  const features = rows.map((s) => ({
    type: "Feature",
    geometry: s.polygon,
    properties: {
      id: s.id,
      name: s.name,
      zone: s.cluster.zone.name,
      cluster: s.cluster.name,
      description: "",
      partner: s.partner?.key ?? "",
      color: s.partner?.color ?? "#6366f1",
    },
  }));

  return NextResponse.json(
    { type: "FeatureCollection", features },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
  );
}
