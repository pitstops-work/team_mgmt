/**
 * scripts/apply-manual-matches.ts
 *
 * Applies manually confirmed MEDIUM + LOW matches, then shows remaining
 * unmatched settlements alongside all unused GeoJSON features in their cluster.
 *
 * Run: npx tsx scripts/apply-manual-matches.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL!, max: 1 });
const adapter = new PrismaPg(pool, { schema: undefined });
const prisma = new PrismaClient({ adapter } as never);

// ── Confirmed manual matches: [DB name, Cluster, GeoJSON name] ────────────────

const CONFIRMED: [string, string, string][] = [
  // MEDIUM confirmed (all except 6=MCT Colony, 7=Jai Bhim Nagara, 11=Dayananda Nagar)
  ["Ayodyanagar",              "Anekal",      "Ayodhya nagar"],
  ["Razakpalya",               "Bagalur",     "Razack Palya"],
  ["Ravindra Nagara",          "Dasarahalli", "Ravindranagar"],
  ["Devarajurs Nagar",         "JJR Nagar",   "Devaraju Arasu Nagar"],
  ["Farookhiya Nagar I & II",  "JJR Nagar",   "Farooqiya Nagar"],
  ["Shivakumar Swamiji nagar", "Kengeri",     "Shivakumara Swamiji Nagar, Kengeri Area"],
  ["Indira Gandhi slum Ejipura","Koramangala","Indragandhi colony Ejipura"],
  ["Rajendra Nagar I",         "Koramangala", "Rajendranagar"],
  ["Shastri Nagar",            "Majestic",    "Shashthrinagar"],

  // LOW confirmed
  ["Bellandur kannada Community", "Bellandur",    "Kannada Community Near AET College"],
  ["Doddbele colony",             "Kengeri",      "Doddabele colony, Kengeri Area"],
  ["Shivanagar colony",           "Kengeri",      "Shivnagara Colony, Kengeri Area"],
  ["Geetanajali",                 "Koramangala",  "Geethanjali slum"],
  ["Lakshmanapuri",               "Majestic",     "Lakshmanpuri, Majestic Area"],
  ["Railway Station/Ambedkar Nagar","Majestic",   "Ambedkarnagar -97 Majestic"],
  ["Swathanthra Nagar",           "Majestic",     "Swathantranagar Majestic"],
  ["Ambedkar Nagar-105",          "Nagarbhavi",   "Ambedkar Quarters, Nagarbhavi Area"],
  ["Bangarappa Gudde",            "Nagarbhavi",   "Bangarappa nagar, Nagarbhavi Area"],
  ["Javaregoudana Doddi",         "Nagarbhavi",   "Javere Gowdana doddi, Nagarbhavi Area"],
  ["Kurilingappa Garden",         "Nagarbhavi",   "Kurlingappa garden, Nagarbhavi Area"],
  ["Mutthurayana Nagar",          "Nagarbhavi",   "Muthurayana Nagar, Nagarbhavi Area"],
  ["Nanjarasappa Badavane",       "Nagarbhavi",   "Najarasappa Badavane, Nagarbhavi Area"],
  ["Thande Periyar nagar",        "Nagarbhavi",   "Thande periar nagar, Nagarbhavi Area"],
  ["Veerabhadra Nagar",           "Nagarbhavi",   "Veerabhadranagar, Nagarbhavi Area"],
  ["Ashraya Nagar",               "Peenya - West","Ashrayanagar, Peenya Area"],
  ["Muneshwar Nagar",             "Peenya - West","Muneshwaranagar, Peenya Area"],
  ["Sanjay Gandhi Nagar",         "Peenya - West","Sanjaygandhinagar -38, Peenya Area"],
  ["Sanjay Gandhi Nagar-42",      "Peenya - West","Sanjaygandhinagar-42, Peenya Area"],
  ["Sarkari Oni",                 "Yeshwantpur",  "Sarkari Ooni, Hoshalli"],
];

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function centroid(coords: unknown): { lat: number; lng: number } | null {
  let ring: number[][] | null = null;
  if (Array.isArray(coords)) {
    const first = (coords as unknown[][])[0];
    if (Array.isArray(first)) {
      const second = (first as unknown[][])[0];
      if (Array.isArray(second) && typeof second[0] === "number") ring = first as number[][];
      else if (Array.isArray(second)) ring = second as number[][];
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
  const raw = JSON.parse(fs.readFileSync(geojsonPath, "utf-8"));

  interface GeoFeature {
    geometry: { type: string; coordinates: unknown };
    properties: { name: string; layer: string; cluster: string };
  }

  const polygons: GeoFeature[] = raw.features.filter(
    (f: GeoFeature) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
  );

  // Index by norm(cluster) → features
  const geoByCluster = new Map<string, GeoFeature[]>();
  for (const f of polygons) {
    const cl = norm(f.properties.cluster ?? "");
    if (!geoByCluster.has(cl)) geoByCluster.set(cl, []);
    geoByCluster.get(cl)!.push(f);
  }

  const partners = await prisma.mapPartner.findMany({ select: { id: true, key: true } });
  const partnerMap = new Map(partners.map(p => [p.key, p.id]));

  const settlements = await prisma.settlement.findMany({
    where: { deletedAt: null },
    include: { cluster: true },
  });

  // Build lookup: norm(dbName)|norm(cluster) → settlement
  const settlementLookup = new Map(
    settlements.map(s => [`${norm(s.name)}|${norm(s.cluster.name)}`, s])
  );

  // ── Apply confirmed matches ──────────────────────────────────────────────────
  let applied = 0;
  const matchedGeoNames = new Set<string>(); // track which geo features are now consumed

  for (const [dbName, clusterName, geoName] of CONFIRMED) {
    const key = `${norm(dbName)}|${norm(clusterName)}`;
    const settlement = settlementLookup.get(key);
    if (!settlement) { console.warn(`⚠ Not found in DB: "${dbName}" [${clusterName}]`); continue; }

    const clKey = norm(clusterName);
    const candidates = geoByCluster.get(clKey) ?? [];
    const feature = candidates.find(f => norm(f.properties.name) === norm(geoName));
    if (!feature) { console.warn(`⚠ Not found in GeoJSON: "${geoName}" [${clusterName}]`); continue; }

    const c = centroid(feature.geometry.coordinates);
    const partnerId = partnerMap.get(feature.properties.layer) ?? null;
    await prisma.settlement.update({
      where: { id: settlement.id },
      data: { polygon: feature.geometry as object, centroidLat: c?.lat ?? null, centroidLng: c?.lng ?? null, partnerId },
    });
    matchedGeoNames.add(`${norm(geoName)}|${clKey}`);
    applied++;
  }

  console.log(`\n✓ Applied ${applied} manual matches.\n`);

  // ── Figure out which GeoJSON features are still unmatched ───────────────────
  // A feature is "consumed" if it was used by the 172 auto-applied OR just now
  const usedSettlements = await prisma.settlement.findMany({
    where: { deletedAt: null, centroidLat: { not: null } },
    include: { cluster: true },
  });

  // Build cluster→dominant partner from already-matched data
  const clusterPartner = new Map<string, string>();
  const usedGeoKeys = new Set<string>();

  for (const s of usedSettlements) {
    // We don't have geo name anymore, so we track by centroid proximity later
    // Instead: build cluster → partner from partnerId
    if (s.partnerId) {
      const p = partners.find(p => p.id === s.partnerId);
      if (p) clusterPartner.set(norm(s.cluster.name), p.key);
    }
  }

  // Mark all geo features that now have a matching settled settlement
  // (rough: if cluster+partner are consumed, remaining ones in that cluster are unmatched)
  // Better: collect all geo names that were applied
  for (const [dbName, clusterName, geoName] of CONFIRMED) {
    matchedGeoNames.add(`${norm(geoName)}|${norm(clusterName)}`);
  }

  // Load what was auto-applied (settlements with centroid that we can identify via polygon)
  // We'll just show ALL remaining geo features not in CONFIRMED or auto-applied
  // by checking which settlements still have no centroid

  const stillNoCoord = await prisma.settlement.findMany({
    where: { deletedAt: null, centroidLat: null },
    include: { cluster: true },
    orderBy: [{ cluster: { name: "asc" } }, { name: "asc" }],
  });

  // Group by cluster, show alongside unused GeoJSON features in that cluster
  const byCluster = new Map<string, typeof stillNoCoord>();
  for (const s of stillNoCoord) {
    const cl = s.cluster.name;
    if (!byCluster.has(cl)) byCluster.set(cl, []);
    byCluster.get(cl)!.push(s);
  }

  // For each cluster, find which geo features were NOT yet matched
  // (used by any settlement that now has a centroid)
  const usedGeoByCluster = new Map<string, Set<string>>();
  for (const s of usedSettlements) {
    const clKey = norm(s.cluster.name);
    if (!usedGeoByCluster.has(clKey)) usedGeoByCluster.set(clKey, new Set());
    // We don't store geo name on settlement — so mark by polygon JSON hash
    // Instead just show ALL remaining geo features and let user see
  }

  console.log("════════════════════════════════════════════════════════");
  console.log(" REMAINING UNMATCHED SETTLEMENTS vs AVAILABLE GEO FEATURES");
  console.log("════════════════════════════════════════════════════════\n");

  const bangaloreClusters = [...byCluster.keys()].filter(cl => {
    const clKey = norm(cl);
    return (geoByCluster.get(clKey) ?? []).length > 0;
  });

  for (const clusterName of [...byCluster.keys()].sort()) {
    const unmatched = byCluster.get(clusterName)!;
    const clKey = norm(clusterName);
    const geoFeatures = geoByCluster.get(clKey) ?? [];
    const partner = clusterPartner.get(clKey) ?? "?";

    if (geoFeatures.length === 0) continue; // Chennai or no polygon data

    // All geo feature names in this cluster
    const allGeoNames = geoFeatures.map(f => f.properties.name);

    console.log(`\n── ${clusterName} [partner: ${partner}] ──────────────────`);
    console.log(`   DB without polygon (${unmatched.length}): ${unmatched.map(s => `"${s.name}"`).join(", ")}`);
    console.log(`   All GeoJSON features in cluster (${allGeoNames.length}):`);
    allGeoNames.forEach((n, i) => console.log(`     ${String(i+1).padStart(2)}. ${n}`));
  }

  // Summary of no-polygon-in-geojson settlements
  const noGeoCluster = [...byCluster.keys()].filter(cl => {
    return (geoByCluster.get(norm(cl)) ?? []).length === 0;
  });
  if (noGeoCluster.length) {
    console.log(`\n── No GeoJSON data for these clusters ──────────────────`);
    for (const cl of noGeoCluster.sort()) {
      const ss = byCluster.get(cl)!;
      console.log(`  ${cl}: ${ss.map(s => s.name).join(", ")}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
