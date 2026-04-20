/**
 * Round 3 — features with null/undefined cluster in GeoJSON matched manually.
 * Lookup ignores cluster on the GeoJSON side; uses DB name + DB cluster to find the settlement.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const pool = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL!, max: 1 });
const adapter = new PrismaPg(pool, { schema: undefined });
const prisma = new PrismaClient({ adapter } as never);

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

// [DB settlement name, DB cluster, GeoJSON feature name (exact)]
const CONFIRMED: [string, string, string][] = [
  ["VV Giri colony",                           "Majestic",   "VV Giri , Majectic"],
  ["Rasaldhar Street",                         "Majestic",   "Rasildhar Street, Majectic Area"],
  ["RNS collage compound - Floating population","Nagarbhavi", "RNS college compound, Nagarbhavi Area"],
  ["Indira G colony",                          "Jayanagar",  "IG colony jayanagar"],
  ["Jakkuru (Near Jakkur Aarogya Kendra)",     "Jakkur",     "Jakkur Near A K"],
  // Round 4
  ["Narayanapura",                             "Anekal",     "Narayanapura"],
  ["Bydara beedi (Vishweshwarayya badawane)",   "Anekal",     "Bydarabeedhi"],
  ["Hakkipikki Subhashnagar",                  "Ullalu",     "Subhas Nagar, Hakkipikki Colony"],
  ["RKS",                                      "Majestic",   "RKS nagar Majestic Area"],
  ["Ambedkar Nagar",                           "Ullalu",     "Ambedkar Nagar"],
];

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
  const raw = JSON.parse(fs.readFileSync("public/data/all.geojson", "utf8"));
  interface Feat { geometry: { type: string; coordinates: unknown }; properties: { name: string; layer: string } }
  const allFeatures: Feat[] = raw.features.filter(
    (f: Feat) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
  );

  // Index ALL features by normalised name (ignoring cluster — these have undefined cluster)
  const geoByName = new Map<string, Feat>();
  for (const f of allFeatures) {
    geoByName.set(norm(f.properties.name ?? ""), f);
  }

  const partners = await prisma.mapPartner.findMany({ select: { id: true, key: true } });
  const partnerMap = new Map(partners.map(p => [p.key, p.id]));

  const settlements = await prisma.settlement.findMany({
    where: { deletedAt: null },
    include: { cluster: true },
  });
  const lookup = new Map(settlements.map(s => [`${norm(s.name)}|${norm(s.cluster.name)}`, s]));

  let applied = 0;
  for (const [dbName, clusterName, geoName] of CONFIRMED) {
    const s = lookup.get(`${norm(dbName)}|${norm(clusterName)}`);
    if (!s) { console.warn(`⚠  DB not found: "${dbName}" [${clusterName}]`); continue; }

    const f = geoByName.get(norm(geoName));
    if (!f) { console.warn(`⚠  GEO not found: "${geoName}"`); continue; }

    const c = centroid(f.geometry.coordinates);
    await prisma.settlement.update({
      where: { id: s.id },
      data: {
        polygon: f.geometry as object,
        centroidLat: c?.lat ?? null,
        centroidLng: c?.lng ?? null,
        partnerId: partnerMap.get(f.properties.layer) ?? null,
      },
    });
    console.log(`✓  "${dbName}" [${clusterName}]  →  "${geoName}"`);
    applied++;
  }

  console.log(`\nApplied: ${applied}`);
  await prisma.$disconnect();
  pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
