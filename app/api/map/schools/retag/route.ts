import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// POST /api/map/schools/retag
// Body: { maxKm: number }
// Re-runs settlement-school tagging with the given distance threshold.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const maxKm = typeof body.maxKm === "number" && body.maxKm > 0 ? body.maxKm : 4;

  const schools = await prisma.school.findMany();
  if (schools.length === 0) {
    return NextResponse.json({ error: "No schools in database. Run the import script first." }, { status: 400 });
  }

  const settlements = await prisma.settlement.findMany({
    where: { deletedAt: null, centroidLat: { not: null }, centroidLng: { not: null } },
    select: { id: true, centroidLat: true, centroidLng: true },
  });

  await prisma.settlementSchool.deleteMany();

  const toCreate: { settlementId: string; schoolId: string; distanceKm: number }[] = [];
  for (const school of schools) {
    for (const s of settlements) {
      const d = haversine(school.lat, school.lng, s.centroidLat!, s.centroidLng!);
      if (d <= maxKm) {
        toCreate.push({
          settlementId: s.id,
          schoolId: school.id,
          distanceKm: Math.round(d * 1000) / 1000,
        });
      }
    }
  }

  // Batch insert
  let created = 0;
  const BATCH = 100;
  for (let i = 0; i < toCreate.length; i += BATCH) {
    const batch = toCreate.slice(i, i + BATCH);
    await prisma.settlementSchool.createMany({
      data: batch.map(r => ({ ...r, id: crypto.randomUUID() })),
      skipDuplicates: true,
    });
    created += batch.length;
  }

  return NextResponse.json({
    maxKm,
    schools: schools.length,
    settlements: settlements.length,
    links: created,
  });
}
