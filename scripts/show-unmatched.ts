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

async function main() {
  // DB settlements with polygon (Bangalore)
  const withPoly = await prisma.settlement.findMany({
    where: { deletedAt: null, polygon: { not: null as never }, city: { name: "Bangalore" } },
    include: { cluster: true },
  });
  const matchedKeys = new Set(withPoly.map(s => norm(s.name) + "|" + norm(s.cluster.name)));

  // DB settlements without polygon (Bangalore)
  const noPoly = await prisma.settlement.findMany({
    where: { deletedAt: null, centroidLat: null, city: { name: "Bangalore" } },
    include: { cluster: true },
    orderBy: [{ cluster: { name: "asc" } }, { name: "asc" }],
  });

  // Static GeoJSON features with no DB match
  const partners = ["sangama", "cfar", "actionaid", "gubbachi", "sieds", "janasha", "maarga", "thamate"];
  const unmatched: { name: string; cluster: string; layer: string }[] = [];
  for (const p of partners) {
    const raw = JSON.parse(fs.readFileSync(`public/data/${p}.geojson`, "utf8"));
    for (const f of raw.features) {
      const key = norm(f.properties.name ?? "") + "|" + norm(f.properties.cluster ?? "");
      if (!matchedKeys.has(key)) {
        unmatched.push({ name: f.properties.name, cluster: f.properties.cluster, layer: f.properties.layer });
      }
    }
  }

  // ── Print side by side per cluster ──────────────────────────────────────────

  const allClusters = new Set([
    ...unmatched.map(u => u.cluster),
    ...noPoly.map(s => s.cluster.name),
  ]);

  const geoByCluster = new Map<string, typeof unmatched>();
  for (const u of unmatched) {
    if (!geoByCluster.has(u.cluster)) geoByCluster.set(u.cluster, []);
    geoByCluster.get(u.cluster)!.push(u);
  }

  const dbByCluster = new Map<string, typeof noPoly>();
  for (const s of noPoly) {
    if (!dbByCluster.has(s.cluster.name)) dbByCluster.set(s.cluster.name, []);
    dbByCluster.get(s.cluster.name)!.push(s);
  }

  for (const cl of [...allClusters].sort()) {
    const geo = geoByCluster.get(cl) ?? [];
    const db  = dbByCluster.get(cl) ?? [];
    console.log(`\n[${cl}]`);
    const max = Math.max(geo.length, db.length);
    for (let i = 0; i < max; i++) {
      const gLabel = geo[i] ? `GEO: ${geo[i].name} [${geo[i].layer}]` : "";
      const dLabel = db[i]  ? `DB:  ${db[i].name}` : "";
      console.log(`  ${gLabel.padEnd(55)}  ${dLabel}`);
    }
  }

  console.log(`\n${"─".repeat(80)}`);
  console.log(`GeoJSON unmatched: ${unmatched.length}   DB without polygon: ${noPoly.length}`);

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
