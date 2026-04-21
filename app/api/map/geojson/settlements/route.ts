import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";

// GET /api/map/geojson/settlements?partner=sangama&city=bangalore
//
// Hybrid strategy:
//   1. Load the static GeoJSON file as the baseline (full polygon coverage).
//   2. For any settlement that has been saved to Settlement.polygon in the DB,
//      replace the static feature with the DB version so admin edits take effect.
//   3. Any DB settlement with a polygon that has NO corresponding static feature
//      is appended (newly drawn polygons from the admin panel).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const partner = searchParams.get("partner");
  const city = searchParams.get("city");

  // ── 1. Static baseline ──────────────────────────────────────────────────
  let staticFeatures: GeoJSONFeature[] = [];
  if (partner) {
    try {
      const filePath = path.join(process.cwd(), "public", "data", `${partner}.geojson`);
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { features: GeoJSONFeature[] };
      staticFeatures = raw.features ?? [];
    } catch {
      // No static file for this partner — that's fine, DB only
    }
  }

  // ── 1b. Build cluster lookup for enriching static features ────────────────
  // Key: "ZoneName::ClusterName" (lower-cased) → { clusterId, zoneId }
  const allClusters = await prisma.cluster.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, zoneId: true, zone: { select: { id: true, name: true } } },
  });
  const clusterLookup = new Map<string, { clusterId: string; zoneId: string }>(
    allClusters.map(c => [
      `${c.zone.name.toLowerCase()}::${c.name.toLowerCase().replace(/_/g, " ")}`,
      { clusterId: c.id, zoneId: c.zone.id },
    ])
  );

  // ── 2. DB overrides/additions ───────────────────────────────────────────
  const rows = await prisma.settlement.findMany({
    where: {
      deletedAt: null,
      polygon: { not: null as never },
      ...(partner ? { partner: { key: partner } } : {}),
      ...(city
        ? { city: { name: { contains: city, mode: "insensitive" } } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      polygon: true,
      clusterId: true,
      partner: { select: { key: true, color: true } },
      cluster: { select: { name: true, zoneId: true, zone: { select: { id: true, name: true } } } },
    },
    orderBy: { name: "asc" },
  });

  // Index DB rows by normalised name for fast lookup
  const dbByName = new Map(
    rows.map((s) => [s.name.trim().toLowerCase(), s])
  );

  // Build the merged feature list
  const seenDbIds = new Set<string>();
  const features: GeoJSONFeature[] = [];

  for (const sf of staticFeatures) {
    const sName = (String(sf.properties?.name ?? "")).trim().toLowerCase();
    const dbRow = dbByName.get(sName);
    if (dbRow) {
      // DB version takes precedence (user may have edited the polygon)
      seenDbIds.add(dbRow.id);
      features.push({
        type: "Feature",
        geometry: dbRow.polygon as unknown as GeoJSONGeometry,
        properties: {
          id: dbRow.id,
          name: dbRow.name,
          zone: dbRow.cluster.zone.name,
          zoneId: dbRow.cluster.zone.id,
          cluster: dbRow.cluster.name,
          clusterId: dbRow.clusterId,
          description: "",
          partner: dbRow.partner?.key ?? partner ?? "",
          color: dbRow.partner?.color ?? "#6366f1",
        },
      });
    } else {
      // No DB record yet — enrich with clusterId + zoneId from DB lookup if possible
      const sfZone = String(sf.properties?.zone ?? "").toLowerCase();
      const sfCluster = String(sf.properties?.cluster ?? "").toLowerCase().replace(/_/g, " ");
      const enriched = sfZone && sfCluster ? (clusterLookup.get(`${sfZone}::${sfCluster}`) ?? null) : null;
      features.push({
        ...sf,
        properties: { ...sf.properties, clusterId: enriched?.clusterId ?? null, zoneId: enriched?.zoneId ?? null },
      });
    }
  }

  // Append any DB records not covered by the static file (admin-drawn polygons)
  for (const dbRow of rows) {
    if (!seenDbIds.has(dbRow.id)) {
      features.push({
        type: "Feature",
        geometry: dbRow.polygon as unknown as GeoJSONGeometry,
        properties: {
          id: dbRow.id,
          name: dbRow.name,
          zone: dbRow.cluster.zone.name,
          zoneId: dbRow.cluster.zone.id,
          cluster: dbRow.cluster.name,
          clusterId: dbRow.clusterId,
          description: "",
          partner: dbRow.partner?.key ?? partner ?? "",
          color: dbRow.partner?.color ?? "#6366f1",
        },
      });
    }
  }

  return NextResponse.json(
    { type: "FeatureCollection", features },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    }
  );
}

interface GeoJSONGeometry {
  type: string;
  coordinates: unknown;
}

interface GeoJSONFeature {
  type: "Feature";
  geometry: GeoJSONGeometry;
  properties: Record<string, unknown>;
}
