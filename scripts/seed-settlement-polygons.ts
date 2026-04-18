/**
 * scripts/seed-settlement-polygons.ts
 *
 * Reads public/data/all.geojson and writes polygon, centroidLat, centroidLng,
 * and partnerId onto each Settlement row by matching on (name, cluster).
 *
 * Run: npx tsx scripts/seed-settlement-polygons.ts
 */

import fs from "fs";
import path from "path";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
const prisma = new PrismaClient({ adapter });

interface GeoFeature {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: {
    name: string;
    description?: string;
    layer: string;       // partner key
    zone: string;
    cluster: string;     // underscore-separated, e.g. "rajiv_nagar"
  };
}

interface GeoJSON {
  type: "FeatureCollection";
  features: GeoFeature[];
}

/** Compute centroid of a polygon (first ring of first polygon). */
function centroid(coords: unknown): { lat: number; lng: number } | null {
  // Supports Polygon and MultiPolygon
  let ring: number[][] | null = null;
  if (Array.isArray(coords)) {
    const first = (coords as unknown[][])[0];
    if (Array.isArray(first)) {
      const second = (first as unknown[][])[0];
      if (Array.isArray(second) && typeof second[0] === "number") {
        ring = first as number[][];
      } else if (Array.isArray(second)) {
        ring = second as number[][];
      }
    }
  }
  if (!ring || ring.length === 0) return null;
  const n = ring.length;
  let lngSum = 0, latSum = 0;
  for (const [lng, lat] of ring) { lngSum += lng; latSum += lat; }
  return { lat: latSum / n, lng: lngSum / n };
}

async function main() {
  const geojsonPath = path.join(process.cwd(), "public", "data", "all.geojson");
  const raw = JSON.parse(fs.readFileSync(geojsonPath, "utf-8")) as GeoJSON;

  // Build a map: "name|cluster" → first feature (deduplicate duplicates)
  const featureMap = new Map<string, GeoFeature>();
  for (const f of raw.features) {
    if (!f.properties?.name) continue;
    const clusterProp = f.properties.cluster ?? "";
    const key = `${f.properties.name.trim().toLowerCase()}|${clusterProp.trim().toLowerCase()}`;
    if (!featureMap.has(key)) featureMap.set(key, f);
  }

  console.log(`GeoJSON: ${raw.features.length} features, ${featureMap.size} unique name+cluster keys`);

  // Load all settlements with their cluster names
  const settlements = await prisma.settlement.findMany({
    include: { cluster: true },
  });
  console.log(`DB: ${settlements.length} settlements`);

  // Load partner map: key → id
  const partners = await prisma.mapPartner.findMany({ select: { id: true, key: true } });
  const partnerMap = new Map(partners.map((p) => [p.key, p.id]));

  let updated = 0, skipped = 0;

  for (const s of settlements) {
    const clusterKey = s.cluster.name.trim().toLowerCase();
    const nameKey = s.name.trim().toLowerCase();
    const lookupKey = `${nameKey}|${clusterKey}`;

    const feature = featureMap.get(lookupKey);
    if (!feature) {
      skipped++;
      continue;
    }

    const c = centroid(feature.geometry.coordinates);
    const partnerId = partnerMap.get(feature.properties.layer) ?? null;

    await prisma.settlement.update({
      where: { id: s.id },
      data: {
        polygon: feature.geometry as object,
        centroidLat: c?.lat ?? null,
        centroidLng: c?.lng ?? null,
        partnerId,
      },
    });
    updated++;
  }

  console.log(`Done. Updated: ${updated}, skipped (no GeoJSON match): ${skipped}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
