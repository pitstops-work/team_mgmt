/**
 * Reverse-index of partner-org assignments for the map UI to resolve
 * partner identity in popups at click-time.
 *
 *   GET /api/map/partner-index
 *
 * Returns three lookup tables keyed by the human-readable identifiers
 * embedded in the GeoJSON tile properties so the client can avoid
 * round-tripping per popup:
 *
 *   {
 *     bySettlementName: { [normalisedName]: { id, name, color, mapKey } },
 *     byClusterName:    { [normalisedName]: { id, name, color, mapKey } },
 *     byFeatureName:    { [normalisedName]: { id, name, color, mapKey } },
 *     byMapKey:         { [mapKey]:        { id, name, color, mapKey } },
 *   }
 *
 * Settlement / Cluster / LayerFeature names go through `normalise()` so
 * minor casing / punctuation drift in the GeoJSON properties still hits.
 *
 * Cached for ~5 min — partner assignments change rarely; admin-driven
 * edits route through /api/admin/settlements + /api/admin/layer-features
 * and can use the cache-bust header below if real-time matters.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type PartnerRef = { id: string; name: string; color: string; mapKey: string | null };

function normalise(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ").replace(/[._-]+/g, " ");
}

export async function GET() {
  const [partnerOrgs, settlements, clusters, features] = await Promise.all([
    prisma.org.findMany({
      where: { kind: "partner", archivedAt: null },
      select: { id: true, name: true, mapKey: true, color: true },
    }),
    prisma.settlement.findMany({
      where: { deletedAt: null, partnerOrgId: { not: null } },
      select: { name: true, partnerOrg: { select: { id: true, name: true, color: true, mapKey: true } } },
    }),
    prisma.cluster.findMany({
      where: { deletedAt: null, partnerOrgId: { not: null } },
      select: { name: true, partnerOrg: { select: { id: true, name: true, color: true, mapKey: true } } },
    }),
    prisma.layerFeature.findMany({
      where: { partnerOrgId: { not: null } },
      select: { name: true, partnerOrg: { select: { id: true, name: true, color: true, mapKey: true } } },
    }),
  ]);

  const refOf = (p: { id: string; name: string; color: string | null; mapKey: string | null }): PartnerRef => ({
    id: p.id, name: p.name, color: p.color ?? "#6366f1", mapKey: p.mapKey,
  });

  const byMapKey: Record<string, PartnerRef> = {};
  for (const o of partnerOrgs) if (o.mapKey) byMapKey[o.mapKey] = refOf(o);

  const bySettlementName: Record<string, PartnerRef> = {};
  for (const s of settlements) if (s.partnerOrg) bySettlementName[normalise(s.name)] = refOf(s.partnerOrg);

  const byClusterName: Record<string, PartnerRef> = {};
  for (const c of clusters) if (c.partnerOrg) byClusterName[normalise(c.name)] = refOf(c.partnerOrg);

  const byFeatureName: Record<string, PartnerRef> = {};
  for (const f of features) if (f.partnerOrg) byFeatureName[normalise(f.name)] = refOf(f.partnerOrg);

  return NextResponse.json(
    { bySettlementName, byClusterName, byFeatureName, byMapKey },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
