import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/map/bbmp-schools?maxKm=4[&settlement=<id>]
// Without settlement: returns all BBMP schools as GeoJSON with nearby settlement info.
// With settlement:    returns only BBMP schools near that settlement (for sidebar).
export async function GET(req: NextRequest) {
  const maxKm = parseFloat(req.nextUrl.searchParams.get("maxKm") ?? "4");
  const settlementId = req.nextUrl.searchParams.get("settlement") ?? null;

  if (settlementId) {
    const links = await prisma.settlementBbmpSchool.findMany({
      where: { settlementId, distanceKm: { lte: maxKm } },
      include: { school: true },
      orderBy: { distanceKm: "asc" },
    });
    return NextResponse.json(
      links.map(l => ({
        id: l.school.id,
        name: l.school.name,
        address: l.school.address ?? "",
        distanceKm: l.distanceKm,
        lat: l.school.lat,
        lng: l.school.lng,
      }))
    );
  }

  // All BBMP schools as GeoJSON — only geocoded schools with ≥1 settlement
  // within maxKm. Ungeocoded rows (no KGIS match yet) have NULL lat/lng and are
  // deliberately excluded from the map, though they still appear in reports.
  const schools = await prisma.bbmpSchool.findMany({
    where: {
      lat: { not: null },
      lng: { not: null },
      settlements: { some: { distanceKm: { lte: maxKm } } },
    },
    include: {
      settlements: {
        where: { distanceKm: { lte: maxKm } },
        select: {
          distanceKm: true,
          settlement: {
            select: {
              id: true,
              name: true,
              cluster: { select: { name: true, zone: { select: { name: true } } } },
            },
          },
        },
        orderBy: { distanceKm: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const features = schools.map(school => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [school.lng!, school.lat!] },
    properties: {
      id: school.id,
      udiseCode: school.udiseCode,
      name: school.name,
      address: school.address ?? "",
      category: school.category ?? "",
      lgdWard: school.lgdWard ?? "",
      settlementCount: school.settlements.length,
      settlements: school.settlements.map(ss => ({
        id: ss.settlement.id,
        name: ss.settlement.name,
        cluster: ss.settlement.cluster?.name ?? "",
        zone: ss.settlement.cluster?.zone?.name ?? "",
        distanceKm: ss.distanceKm,
      })),
    },
  }));

  return NextResponse.json({ type: "FeatureCollection", features });
}
