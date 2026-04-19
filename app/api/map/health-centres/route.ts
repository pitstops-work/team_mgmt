import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/map/health-centres?settlement=<id>
// Without settlement: all health centres as GeoJSON
// With settlement:    health centres near that settlement (for sidebar)
export async function GET(req: NextRequest) {
  const settlementId = req.nextUrl.searchParams.get("settlement");

  if (settlementId) {
    const links = await prisma.settlementHealthCentre.findMany({
      where: { settlementId, healthCentre: { centreType: { in: ["CRC", "Foundation Health Centre"] } } },
      include: { healthCentre: true },
      orderBy: { distanceKm: "asc" },
    });
    return NextResponse.json(
      links.map(l => ({
        id: l.healthCentre.id,
        name: l.healthCentre.name,
        centreType: l.healthCentre.centreType,
        notes: l.healthCentre.notes ?? "",
        distanceKm: l.distanceKm,
        lat: l.healthCentre.lat,
        lng: l.healthCentre.lng,
      }))
    );
  }

  const centres = await prisma.healthCentre.findMany({
    include: {
      settlements: {
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

  const features = centres.map(hc => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [hc.lng, hc.lat] },
    properties: {
      id: hc.id,
      name: hc.name,
      centreType: hc.centreType,
      notes: hc.notes ?? "",
      settlementCount: hc.settlements.length,
      settlements: hc.settlements.map(s => ({
        id: s.settlement.id,
        name: s.settlement.name,
        cluster: s.settlement.cluster?.name ?? "",
        zone: s.settlement.cluster?.zone?.name ?? "",
        distanceKm: s.distanceKm,
      })),
    },
  }));

  return NextResponse.json({ type: "FeatureCollection", features });
}
