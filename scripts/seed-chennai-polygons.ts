/**
 * Matches Chennai settlement GeoJSON features to DB Settlement records and
 * writes polygon + centroid into Settlement.polygon.
 *
 * Run (dry):  npx tsx scripts/seed-chennai-polygons.ts
 * Run (apply): npx tsx scripts/seed-chennai-polygons.ts --apply
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

const APPLY = process.argv.includes("--apply");

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

const levSim = (a: string, b: string) => {
  const na = norm(a), nb = norm(b);
  return 1 - levenshtein(na, nb) / Math.max(na.length, nb.length, 1);
};

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

interface Feat {
  geometry: { type: string; coordinates: unknown };
  properties: { name: string; layer: string; cluster: string; cluster_display: string };
}

async function main() {
  // Load all Chennai GeoJSON features; convert closed/open LineStrings → Polygon
  const partners = ["arunodhaya", "tndwwt", "dbai", "dbsss", "thozhamai"];
  const allFeatures: Feat[] = [];
  for (const p of partners) {
    const raw = JSON.parse(fs.readFileSync(`public/data/${p}.geojson`, "utf8"));
    for (const f of raw.features) {
      if (f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon") {
        allFeatures.push(f);
      } else if (f.geometry?.type === "LineString") {
        // Close the ring if needed and promote to Polygon
        const coords = f.geometry.coordinates as number[][];
        const ring = [...coords];
        const first = ring[0], last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
        allFeatures.push({
          ...f,
          geometry: { type: "Polygon", coordinates: [ring] },
        });
      }
    }
  }

  // Index by normalised cluster_display
  const geoByCluster = new Map<string, Feat[]>();
  for (const f of allFeatures) {
    const cl = norm(f.properties.cluster_display ?? f.properties.cluster ?? "");
    if (!geoByCluster.has(cl)) geoByCluster.set(cl, []);
    geoByCluster.get(cl)!.push(f);
  }

  // Load Chennai settlements from DB
  const settlements = await prisma.settlement.findMany({
    where: { deletedAt: null, centroidLat: null, city: { name: "Chennai" } },
    include: { cluster: true },
    orderBy: [{ cluster: { name: "asc" } }, { name: "asc" }],
  });

  const partnerRows = await prisma.mapPartner.findMany({ select: { id: true, key: true } });
  const partnerMap = new Map(partnerRows.map(p => [p.key, p.id]));

  console.log(`Chennai GeoJSON features: ${allFeatures.length}`);
  console.log(`Chennai DB settlements without polygon: ${settlements.length}\n`);

  const consumed = new Set<Feat>();
  const results: { settlement: typeof settlements[0]; feat: Feat; sim: number; exact: boolean }[] = [];
  const unmatched: typeof settlements[0][] = [];

  for (const s of settlements) {
    const clKey = norm(s.cluster.name);
    const candidates = (geoByCluster.get(clKey) ?? []).filter(f => !consumed.has(f));

    if (candidates.length === 0) {
      unmatched.push(s);
      continue;
    }

    const normDb = norm(s.name);
    let best: Feat | null = null;
    let bestSim = 0;

    for (const f of candidates) {
      const sim = levSim(s.name, f.properties.name);
      if (sim > bestSim) { bestSim = sim; best = f; }
    }

    if (best && bestSim >= 0.72) {
      const exact = norm(s.name) === norm(best.properties.name);
      results.push({ settlement: s, feat: best, sim: bestSim, exact });
      consumed.add(best);
    } else {
      unmatched.push(s);
    }
  }

  // Print matches
  console.log(`MATCHES (${results.length}):`);
  for (const r of results) {
    const flag = r.exact ? "✅" : r.sim >= 0.88 ? "🟢" : "🟡";
    console.log(`  ${flag} ${(r.sim * 100).toFixed(0).padStart(3)}%  DB: "${r.settlement.name}" [${r.settlement.cluster.name}]`);
    if (!r.exact) console.log(`         GEO: "${r.feat.properties.name}"`);
  }

  console.log(`\nUNMATCHED DB (${unmatched.length}):`);
  for (const s of unmatched) {
    console.log(`  ✗  "${s.name}" [${s.cluster.name}]`);
  }

  // Unused GeoJSON features
  const unused = allFeatures.filter(f => !consumed.has(f));
  console.log(`\nUNUSED GeoJSON features (${unused.length}):`);
  for (const f of unused) {
    console.log(`  GEO: "${f.properties.name}" [${f.properties.cluster_display}]`);
  }

  if (!APPLY) {
    console.log(`\n[DRY RUN] Run with --apply to write to DB`);
    await prisma.$disconnect(); pool.end(); return;
  }

  console.log(`\nApplying ${results.length} matches...`);
  let applied = 0;
  for (const r of results) {
    const c = centroid(r.feat.geometry.coordinates);
    await prisma.settlement.update({
      where: { id: r.settlement.id },
      data: {
        polygon: r.feat.geometry as object,
        centroidLat: c?.lat ?? null,
        centroidLng: c?.lng ?? null,
        partnerId: partnerMap.get(r.feat.properties.layer) ?? null,
      },
    });
    applied++;
  }
  console.log(`✓ Applied ${applied}`);

  await prisma.$disconnect();
  pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
