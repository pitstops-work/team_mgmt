import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/map/schools?maxKm=4[&settlement=<id>]
// Without settlement: returns all schools as GeoJSON with nearby settlement info.
// With settlement:    returns only schools near that settlement (for sidebar).
export async function GET(req: NextRequest) {
  const maxKm = parseFloat(req.nextUrl.searchParams.get("maxKm") ?? "4");
  const settlementId = req.nextUrl.searchParams.get("settlement") ?? null;

  if (settlementId) {
    // Settlement-scoped: which schools are near this settlement?
    const links = await prisma.settlementSchool.findMany({
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

  // All schools as GeoJSON — only schools that have ≥1 settlement within maxKm
  const schools = await prisma.school.findMany({
    where: { settlements: { some: { distanceKm: { lte: maxKm } } } },
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
    geometry: { type: "Point" as const, coordinates: [school.lng, school.lat] },
    properties: {
      id: school.id,
      name: school.name,
      address: school.address ?? "",
      schoolType: school.schoolType,
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
