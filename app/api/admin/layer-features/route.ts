/**
 * LayerFeature CRUD (centres / facilities for the map-features admin panel).
 * Accepts both the new `partnerOrgId` (Org.id) and the legacy `partner`
 * (mapKey string) — the admin UI currently sends mapKey, so we resolve it
 * to an Org row before writing partnerOrgId. The free-text `partner` column
 * is also kept in sync with the resolved Org.name for backward compatibility
 * with the GeoJSON-tile-driven map popups; once those switch to the live DB
 * read (task 25), the free-text column can be dropped.
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
): Promise<{ partnerOrgId: string | null; partner: string | null } | null> {
  // Both undefined means "don't touch" (only on PATCH); caller checks that.
  if (partnerOrgId === undefined && partnerMapKey === undefined) return null;

  const idOrKey = partnerOrgId || partnerMapKey;
  if (!idOrKey) return { partnerOrgId: null, partner: null };

  const org = await prisma.org.findFirst({
    where: { kind: "partner", OR: [{ id: idOrKey }, { mapKey: idOrKey }] },
    select: { id: true, name: true, mapKey: true },
  });
  if (!org) return { partnerOrgId: null, partner: idOrKey || null };
  return { partnerOrgId: org.id, partner: org.mapKey ?? org.name };
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
      partner: resolved?.partner ?? null,
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
