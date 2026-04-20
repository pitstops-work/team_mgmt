/**
 * Applies the second round of manually confirmed matches.
 * Run: npx tsx scripts/apply-manual-matches-2.ts
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

const CONFIRMED: [string, string, string][] = [
  // Bellandur
  ["Haralur Road 3 sites",    "Bellandur", "Harulur Kannada community 1st site"],
  ["Huligappa Community KA",  "Bellandur", "Ganesh community"],

  // Majestic
  ["Valluvarpurm",                   "Majestic", "Vallavarpuram Majestic Area"],
  ["Gawtham Nagar",                  "Majestic", "Gowthamnagar Majestic Area"],
  ["Okalipuram",                     "Majestic", "Okalipura - 96 Majestic Area"],
  ["Dayananda Nagar",                "Majestic", "Dayanandanagar Majestic Area"],
  ["Minerva Mill",                   "Majestic", "Minervamill, Majestic Area"],
  ["VST colony",                     "Majestic", "V.S.T colony-2 Majestic Area"],

  // Nagarbhavi
  ["Bhuvaneshwari nagar",  "Nagarbhavi", "Bhuvaneshwarinagar, Nagarbhavi Area"],
  ["Chamundi Slum",        "Nagarbhavi", "Chamundeshwari slum, Nagarbhavi Area"],
  ["D'souza Nagar",        "Nagarbhavi", "Dzouza nagar, Nagarbhavi Area"],
  ["Devegowda slum",       "Nagarbhavi", "DevaGowda Slum, Nagarbhavi Area"],
  ["Kanaka Nagar",         "Nagarbhavi", "Kanakanagara, Nagarbhavi Area"],
  ["Vasanthapura",         "Nagarbhavi", "Vasanthpura, Nagarbhavi Area"],

  // Jakkur
  ["Jai Bhim Nagara",      "Jakkur",     "Jaibhim Nagar"],

  // Peenya North
  ["Maruthi Nagar near Bilal Masjid", "Peenya North", "Maruthi Nagar Near Bilal Masjid"],
];

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

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
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/all.geojson"), "utf-8"));

  interface Feat { geometry: { type: string; coordinates: unknown }; properties: { name: string; layer: string; cluster: string } }
  const polygons: Feat[] = raw.features.filter((f: Feat) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon");

  const geoByCluster = new Map<string, Feat[]>();
  for (const f of polygons) {
    const cl = norm(f.properties.cluster ?? "");
    if (!geoByCluster.has(cl)) geoByCluster.set(cl, []);
    geoByCluster.get(cl)!.push(f);
  }

  const partners = await prisma.mapPartner.findMany({ select: { id: true, key: true } });
  const partnerMap = new Map(partners.map(p => [p.key, p.id]));

  const settlements = await prisma.settlement.findMany({ where: { deletedAt: null }, include: { cluster: true } });
  const lookup = new Map(settlements.map(s => [`${norm(s.name)}|${norm(s.cluster.name)}`, s]));

  let applied = 0, warnings = 0;

  for (const [dbName, clusterName, geoName] of CONFIRMED) {
    const s = lookup.get(`${norm(dbName)}|${norm(clusterName)}`);
    if (!s) { console.warn(`⚠ DB not found: "${dbName}" [${clusterName}]`); warnings++; continue; }

    const features = geoByCluster.get(norm(clusterName)) ?? [];
    const f = features.find(x => norm(x.properties.name) === norm(geoName));
    if (!f) { console.warn(`⚠ GEO not found: "${geoName}" [${clusterName}]`); warnings++; continue; }

    const c = centroid(f.geometry.coordinates);
    await prisma.settlement.update({
      where: { id: s.id },
      data: { polygon: f.geometry as object, centroidLat: c?.lat ?? null, centroidLng: c?.lng ?? null, partnerId: partnerMap.get(f.properties.layer) ?? null },
    });
    console.log(`✓ "${dbName}" → "${geoName}"`);
    applied++;
  }

  console.log(`\nApplied: ${applied}  Warnings: ${warnings}`);

  // ── Show remaining unused Anekal geo features for manual mapping ──────────────
  const anekalSettlements = await prisma.settlement.findMany({
    where: { deletedAt: null, centroidLat: null, cluster: { name: "Anekal" } },
    include: { cluster: true },
    orderBy: { name: "asc" },
  });

  const anekalGeo = geoByCluster.get("anekal") ?? [];
  const usedAnekalSettlements = await prisma.settlement.findMany({
    where: { deletedAt: null, centroidLat: { not: null }, cluster: { name: "Anekal" } },
    include: { cluster: true },
  });

  // Find geo features already consumed by matched settlements (by comparing polygon JSON)
  const usedPolygonHashes = new Set(usedAnekalSettlements.map(s => JSON.stringify(s.polygon)));
  const unusedGeo = anekalGeo.filter(f => !usedPolygonHashes.has(JSON.stringify(f.geometry)));

  console.log(`\n── Anekal: still needs mapping ────────────────────────────────`);
  console.log(`\nDB settlements without polygon (${anekalSettlements.length}):`);
  anekalSettlements.forEach((s, i) => console.log(`  ${i + 1}. "${s.name}"`));
  console.log(`\nGeoJSON features not yet consumed (${unusedGeo.length}):`);
  unusedGeo.forEach((f, i) => console.log(`  ${String.fromCharCode(65 + i)}. "${f.properties.name}" [${f.properties.layer}]`));
  console.log(`\nTell me: "1→A, 2→C" etc. (or "none" for any that have no polygon)`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
