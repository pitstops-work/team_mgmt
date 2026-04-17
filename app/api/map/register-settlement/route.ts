import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * POST /api/map/register-settlement
 * Called after drawing a new settlement on the map.
 * Creates (or finds) a Settlement + stub SettlementAssessment.
 * Returns { settlementId } for redirect to /needs/settlement/[id].
 *
 * Body: { name, clusterName, zone, lat?, lng? }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { name, clusterName, zone } = await req.json();
  if (!name?.trim()) return Response.json({ error: "name required" }, { status: 400 });

  // Resolve cluster → clusterId
  let clusterId: string | null = null;
  if (clusterName) {
    const cluster = await prisma.cluster.findFirst({
      where: { name: { equals: clusterName, mode: "insensitive" }, deletedAt: null },
    });
    clusterId = cluster?.id ?? null;
  }

  // Fall back: if zone given and no cluster, pick first cluster in that zone
  if (!clusterId && zone) {
    const zoneRow = await prisma.zone.findFirst({
      where: { name: { equals: zone, mode: "insensitive" } },
      include: { clusters: { where: { deletedAt: null }, take: 1 } },
    });
    clusterId = zoneRow?.clusters[0]?.id ?? null;
  }

  if (!clusterId) {
    return Response.json({ error: "Could not resolve cluster — please assign this settlement manually." }, { status: 422 });
  }

  // Upsert settlement (find by name+cluster, create if missing)
  let settlement = await prisma.settlement.findFirst({
    where: { name: { equals: name.trim(), mode: "insensitive" }, clusterId, deletedAt: null },
  });

  if (!settlement) {
    settlement = await prisma.settlement.create({
      data: { name: name.trim(), clusterId },
    });
  }

  // Create a stub assessment if none exists
  const existing = await prisma.settlementAssessment.findFirst({
    where: { settlementId: settlement.id },
    orderBy: { assessedAt: "desc" },
  });

  if (!existing) {
    await prisma.settlementAssessment.create({
      data: {
        settlementId: settlement.id,
        assessmentYear: new Date().getFullYear(),
        assessedById: session.user.id,
      },
    });
  }

  return Response.json({ settlementId: settlement.id });
}
