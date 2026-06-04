/**
 * Settlements CRUD for the map-features admin panel. Reads + writes the new
 * partnerOrgId FK (→ Org). Legacy `partnerId` (→ MapPartner) is still
 * surfaced via the `partner` shape — clients that haven't migrated keep
 * reading the same fields — but writes go to partnerOrgId only. The legacy
 * column is slated for removal in a follow-up migration.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { adminForbidden } from "@/lib/roleGuard";
import { recomputeClusterBoundary, recomputeZoneBoundary } from "@/lib/geo";

const SELECT = {
  id: true,
  name: true,
  polygon: true,
  centroidLat: true,
  centroidLng: true,
  partnerOrgId: true,
  clusterId: true,
  cluster: { select: { id: true, name: true, zone: { select: { id: true, name: true } } } },
  partnerOrg: { select: { id: true, name: true, color: true, mapKey: true } },
} as const;

type SettlementRow = {
  id: string;
  name: string;
  polygon: unknown;
  centroidLat: number | null;
  centroidLng: number | null;
  partnerOrgId: string | null;
  clusterId: string;
  cluster: { id: string; name: string; zone: { id: string; name: string } };
  partnerOrg: { id: string; name: string; color: string | null; mapKey: string | null } | null;
};

// Project to the legacy `{ partnerId, partner: { id, key, label, color } }`
// shape so existing UI components keep working unchanged. partnerId mirrors
// partnerOrgId now; the old MapPartner-keyed shape is gone.
function shape(row: SettlementRow) {
  return {
    id: row.id,
    name: row.name,
    polygon: row.polygon,
    centroidLat: row.centroidLat,
    centroidLng: row.centroidLng,
    partnerId: row.partnerOrgId,
    partnerOrgId: row.partnerOrgId,
    clusterId: row.clusterId,
    cluster: row.cluster,
    partner: row.partnerOrg
      ? { id: row.partnerOrg.id, key: row.partnerOrg.mapKey ?? row.partnerOrg.id, label: row.partnerOrg.name, color: row.partnerOrg.color ?? "#6366f1" }
      : null,
  };
}

export async function GET() {
  const rows = await prisma.settlement.findMany({
    where: { deletedAt: null },
    select: SELECT,
    orderBy: { name: "asc" },
  });
  return NextResponse.json(rows.map(shape));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session); if (veto) return veto;

  const body = await req.json();
  const { name, clusterId, partnerId, partnerOrgId, polygon, centroidLat, centroidLng } = body;
  if (!name || !clusterId) {
    return NextResponse.json({ error: "name and clusterId are required" }, { status: 400 });
  }

  // Derive cityId from cluster→zone→city
  const cluster = await prisma.cluster.findUnique({
    where: { id: clusterId },
    include: { zone: { include: { city: true } } },
  });
  const cityId = cluster?.zone?.city?.id ?? null;

  // Accept both new (partnerOrgId) and legacy (partnerId) field names from
  // the client; both now point at Org.id.
  const resolvedPartnerOrgId: string | null = (partnerOrgId ?? partnerId) || null;

  const row = await prisma.settlement.create({
    data: {
      name,
      clusterId,
      partnerOrgId: resolvedPartnerOrgId,
      cityId,
      polygon: polygon ?? null,
      centroidLat: centroidLat ? parseFloat(centroidLat) : null,
      centroidLng: centroidLng ? parseFloat(centroidLng) : null,
    },
    select: SELECT,
  });

  // Newly registered settlement contributes a hull point to its cluster
  // (and the cluster's zone). Recompute boundaries best-effort — boundary
  // updates aren't critical to the create succeeding.
  try {
    await recomputeClusterBoundary(clusterId, prisma);
    const zoneId = cluster?.zoneId ?? null;
    if (zoneId) await recomputeZoneBoundary(zoneId, prisma);
  } catch (e) {
    console.error("[settlements] boundary recompute failed", e);
  }

  return NextResponse.json(shape(row), { status: 201 });
}
