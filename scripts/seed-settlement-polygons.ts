/**
 * scripts/seed-settlement-polygons.ts
 *
 * Reads public/data/all.geojson and writes polygon, centroidLat, centroidLng,
 * and partnerId onto each Settlement row.
 *
 * Matching strategy (in order):
 *   1. Exact name + cluster (case-insensitive)
 *   2. Normalised name + cluster (remove punctuation/extra spaces)
 *   3. Substring containment: geo name contains DB name, or DB name contains geo name (min 6 chars)
 *   4. Word-overlap ≥ 60% of shorter name's words
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
    layer: string;
    zone: string;
    cluster: string;
  };
}

interface GeoJSON {
  type: "FeatureCollection";
  features: GeoFeature[];
}

/** Compute centroid of a Polygon or MultiPolygon (first ring). */
function centroid(coords: unknown): { lat: number; lng: number } | null {
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

const normalise = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

function wordOverlap(a: string, b: string): number {
  const wa = new Set(normalise(a).split(" ").filter(w => w.length > 2));
  const wb = new Set(normalise(b).split(" ").filter(w => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let common = 0;
  wa.forEach(w => { if (wb.has(w)) common++; });
  return common / Math.min(wa.size, wb.size);
}

async function main() {
  const geojsonPath = path.join(process.cwd(), "public", "data", "all.geojson");
  const raw = JSON.parse(fs.readFileSync(geojsonPath, "utf-8")) as GeoJSON;

  // Only polygon features
  const polygons = raw.features.filter(
    f => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
  );

  console.log(`GeoJSON: ${raw.features.length} total features, ${polygons.length} polygons`);

  // Index by cluster
  const geoByCluster = new Map<string, GeoFeature[]>();
  for (const f of polygons) {
    if (!f.properties?.name) continue;
    const cl = f.properties.cluster?.trim().toLowerCase() ?? "";
    if (!geoByCluster.has(cl)) geoByCluster.set(cl, []);
    geoByCluster.get(cl)!.push(f);
  }

  // Load all settlements
  const settlements = await prisma.settlement.findMany({
    include: { cluster: true },
  });
  console.log(`DB: ${settlements.length} settlements`);

  // Load partners
  const partners = await prisma.mapPartner.findMany({ select: { id: true, key: true } });
  const partnerMap = new Map(partners.map(p => [p.key, p.id]));

  let exact = 0, fuzzy = 0, skipped = 0;
  const unmatched: string[] = [];

  for (const s of settlements) {
    const clusterKey = s.cluster.name.trim().toLowerCase();
    const nameKey = s.name.trim().toLowerCase();
    const normName = normalise(s.name);

    // Candidates in same cluster
    const candidates = geoByCluster.get(clusterKey) ?? [];

    let matched: GeoFeature | null = null;
    let matchType = "";

    // 1. Exact
    const ex = candidates.find(f => f.properties.name.trim().toLowerCase() === nameKey);
    if (ex) { matched = ex; matchType = "exact"; exact++; }

    // 2. Normalised
    if (!matched) {
      const nm = candidates.find(f => normalise(f.properties.name) === normName);
      if (nm) { matched = nm; matchType = "normalised"; fuzzy++; }
    }

    // 3. Substring containment (min 6 chars to avoid trivial matches)
    if (!matched && s.name.length >= 6) {
      const sub = candidates.find(f => {
        const gn = f.properties.name.trim().toLowerCase();
        return (gn.includes(nameKey) || nameKey.includes(gn)) && Math.min(gn.length, nameKey.length) >= 6;
      });
      if (sub) { matched = sub; matchType = "substring"; fuzzy++; }
    }

    // 4. Word overlap ≥ 65%
    if (!matched) {
      let best: GeoFeature | null = null;
      let bestScore = 0;
      for (const f of candidates) {
        const score = wordOverlap(s.name, f.properties.name);
        if (score > bestScore) { bestScore = score; best = f; }
      }
      if (best && bestScore >= 0.65) { matched = best; matchType = `word-overlap(${bestScore.toFixed(2)})`; fuzzy++; }
    }

    if (!matched) {
      skipped++;
      // Only report Bangalore ones (cluster exists in GeoJSON)
      if (candidates.length > 0 || geoByCluster.has(clusterKey)) {
        unmatched.push(`${s.name} | ${s.cluster.name}`);
      }
      continue;
    }

    const c = centroid(matched.geometry.coordinates);
    const partnerId = partnerMap.get(matched.properties.layer) ?? null;

    await prisma.settlement.update({
      where: { id: s.id },
      data: {
        polygon: matched.geometry as object,
        centroidLat: c?.lat ?? null,
        centroidLng: c?.lng ?? null,
        partnerId,
      },
    });
  }

  console.log(`\nDone.`);
  console.log(`  Exact matches:  ${exact}`);
  console.log(`  Fuzzy matches:  ${fuzzy}`);
  console.log(`  Total updated:  ${exact + fuzzy}`);
  console.log(`  Skipped:        ${skipped}`);
  if (unmatched.length > 0) {
    console.log(`\nUnmatched Bangalore settlements (${unmatched.length}):`);
    unmatched.forEach(u => console.log("  ✗", u));
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
