/**
 * LayerFeature CRUD (centres / facilities for the map-features admin panel).
 * Accepts both `partnerOrgId` (Org.id) and a `partner` mapKey string — the
 * admin UI sends mapKey — and resolves either to the Org before writing
 * partnerOrgId.
 *
 * It used to write the resolved name into a free-text `partner` column too,
 * for map popups that read the GeoJSON tiles. Those now read partnerOrg
 * directly (/api/map/geojson/layer-features), so that column was dropped in
 * 20261103160000_retire_map_partner — the condition this file's own comment
 * set for dropping it.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { adminForbidden } from "@/lib/roleGuard";

const INCLUDE = {
  settlement: { select: { id: true, name: true } },
  cluster:    { select: { id: true, name: true } },
  zone:       { select: { id: true, name: true } },
  partnerOrg: { select: { id: true, name: true, color: true, mapKey: true } },
} as const;

// Resolve a partner identifier (Org.id OR Org.mapKey) into both
// partnerOrgId (FK) and the legacy free-text `partner` string. Either input
// shape is accepted; null inputs clear the assignment.
async function resolvePartner(
  partnerOrgId: string | null | undefined,
  partnerMapKey: string | null | undefined,
): Promise<{ partnerOrgId: string | null } | null> {
  // Both undefined means "don't touch" (only on PATCH); caller checks that.
  if (partnerOrgId === undefined && partnerMapKey === undefined) return null;

  const idOrKey = partnerOrgId || partnerMapKey;
  if (!idOrKey) return { partnerOrgId: null };

  const org = await prisma.org.findFirst({
    where: { kind: "partner", OR: [{ id: idOrKey }, { mapKey: idOrKey }] },
    select: { id: true },
  });
  // An identifier that resolves to no org clears the assignment rather than
  // being stored as a loose string. The free-text column that used to hold
  // the unresolved value is gone, and silently keeping one was how a partner
  // came to exist as text in one place and a row in another.
  return { partnerOrgId: org?.id ?? null };
}

export async function GET(req: NextRequest) {
  const layerKey = req.nextUrl.searchParams.get("layerKey");
  const rows = await prisma.layerFeature.findMany({
    where: layerKey ? { layerKey } : undefined,
    include: INCLUDE,
    orderBy: { name: "asc" },
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session); if (veto) return veto;

  const body = await req.json();
  const { name, layerKey, centreType, partner, partnerOrgId, lat, lng, settlementId, clusterId, zoneId, notes } = body;
  if (!name || !layerKey || lat == null || lng == null) {
    return NextResponse.json({ error: "name, layerKey, lat, lng are required" }, { status: 400 });
  }

  const resolved = await resolvePartner(partnerOrgId, partner);
  const row = await prisma.layerFeature.create({
    data: {
      name,
      layerKey,
      centreType: centreType || null,
      partnerOrgId: resolved?.partnerOrgId ?? null,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      settlementId: settlementId || null,
      clusterId: clusterId || null,
      zoneId: zoneId || null,
      notes: notes || null,
    },
    include: INCLUDE,
  });
  return NextResponse.json(row, { status: 201 });
}
