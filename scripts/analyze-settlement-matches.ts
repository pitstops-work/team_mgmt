/**
 * scripts/analyze-settlement-matches.ts
 *
 * Dry-run analysis: scores every DB settlement against GeoJSON polygons
 * and groups matches into confidence cohorts WITHOUT writing to the DB.
 *
 * Cohorts:
 *   EXACT        – identical after normalisation (apply blindly)
 *   VERY HIGH    – score ≥ 0.88  (safe to auto-apply)
 *   HIGH         – score ≥ 0.72  (recommend review)
 *   MEDIUM       – score ≥ 0.55  (manual check needed)
 *   LOW          – score ≥ 0.35  (likely wrong)
 *   UNMATCHED    – no candidate in same cluster, or best score < 0.35
 *
 * Run:  npx tsx scripts/analyze-settlement-matches.ts
 * Apply: npx tsx scripts/analyze-settlement-matches.ts --apply=EXACT,VERY_HIGH,HIGH
 */

import fs from "fs";
import path from "path";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
const prisma = new PrismaClient({ adapter });

const APPLY_ARG = process.argv.find(a => a.startsWith("--apply="));
const APPLY_COHORTS = APPLY_ARG
  ? new Set(APPLY_ARG.replace("--apply=", "").split(",").map(s => s.toUpperCase()))
  : new Set<string>();
const DRY_RUN = APPLY_COHORTS.size === 0;

// ── String utilities ──────────────────────────────────────────────────────────

/** Lowercase, remove all punctuation, collapse whitespace */
const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** Significant words only (length > 2, exclude filler) */
const STOP = new Set(["the", "and", "near", "road", "main", "cross", "site", "slum", "colony",
  "nagar", "nagara", "layout", "community", "badavane", "beedi", "street"]);

const words = (s: string) =>
  norm(s).split(" ").filter(w => w.length > 2 && !STOP.has(w));

/** Levenshtein edit distance */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

/** Levenshtein similarity 0–1 */
const levSim = (a: string, b: string) => {
  const na = norm(a), nb = norm(b);
  return 1 - levenshtein(na, nb) / Math.max(na.length, nb.length, 1);
};

/** Jaccard similarity on significant words */
const jaccardWords = (a: string, b: string) => {
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  if (wa.size === 0 && wb.size === 0) return 1;
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  wa.forEach(w => { if (wb.has(w)) inter++; });
  return inter / (wa.size + wb.size - inter);
};

/** Word overlap ratio = intersection / min(|A|, |B|) — rewards partial containment */
const wordOverlapRatio = (a: string, b: string) => {
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  wa.forEach(w => { if (wb.has(w)) inter++; });
  return inter / Math.min(wa.size, wb.size);
};

/** Token-sort similarity: sort words, then compare with levSim */
const tokenSortSim = (a: string, b: string) => {
  const sa = norm(a).split(" ").sort().join(" ");
  const sb = norm(b).split(" ").sort().join(" ");
  return levSim(sa, sb);
};

/** Substring bonus: 1.0 if one contains the other (min 5 chars), 0 otherwise */
const substringSim = (a: string, b: string): number => {
  const na = norm(a), nb = norm(b);
  const shorter = na.length < nb.length ? na : nb;
  const longer  = na.length < nb.length ? nb : na;
  if (shorter.length < 5) return 0;
  return longer.includes(shorter) ? 0.85 : 0; // not 1.0 — substring alone isn't perfect
};

/** Combined score: weighted max of all signals */
function score(a: string, b: string): { score: number; breakdown: string } {
  const lev  = levSim(a, b);
  const jacc = jaccardWords(a, b);
  const wor  = wordOverlapRatio(a, b);
  const tok  = tokenSortSim(a, b);
  const sub  = substringSim(a, b);

  // Weighted combination — lev is good overall, words good for long names, sub for prefixes
  const combined = Math.max(
    lev * 0.8 + jacc * 0.2,
    wor * 0.7 + lev * 0.3,
    tok * 0.85 + jacc * 0.15,
    sub,
  );

  const bd = `lev=${lev.toFixed(2)} jacc=${jacc.toFixed(2)} wor=${wor.toFixed(2)} tok=${tok.toFixed(2)} sub=${sub.toFixed(2)}`;
  return { score: Math.min(combined, 1), breakdown: bd };
}

// ── Confidence cohort ─────────────────────────────────────────────────────────

function cohort(s: number, isExact: boolean): string {
  if (isExact)   return "EXACT";
  if (s >= 0.88) return "VERY_HIGH";
  if (s >= 0.72) return "HIGH";
  if (s >= 0.55) return "MEDIUM";
  if (s >= 0.35) return "LOW";
  return "UNMATCHED";
}

// ── Centroid ──────────────────────────────────────────────────────────────────

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

// ── Main ──────────────────────────────────────────────────────────────────────

interface GeoFeature {
  geometry: { type: string; coordinates: unknown };
  properties: { name: string; layer: string; cluster: string };
}

async function main() {
  const geojsonPath = path.join(process.cwd(), "public", "data", "all.geojson");
  const raw = JSON.parse(fs.readFileSync(geojsonPath, "utf-8"));

  const polygons: GeoFeature[] = raw.features.filter(
    (f: GeoFeature) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
  );

  // Index by cluster (normalised key)
  const geoByCluster = new Map<string, GeoFeature[]>();
  for (const f of polygons) {
    const cl = norm(f.properties.cluster ?? "");
    if (!geoByCluster.has(cl)) geoByCluster.set(cl, []);
    geoByCluster.get(cl)!.push(f);
  }

  const settlements = await prisma.settlement.findMany({
    where: { deletedAt: null },
    include: { cluster: true },
    orderBy: [{ cluster: { name: "asc" } }, { name: "asc" }],
  });

  const partners = await prisma.mapPartner.findMany({ select: { id: true, key: true } });
  const partnerMap = new Map(partners.map(p => [p.key, p.id]));

  // Track which GeoJSON features are already consumed (prevent double-assignment)
  const consumed = new Set<GeoFeature>();

  interface Result {
    cohort: string;
    score: number;
    breakdown: string;
    dbName: string;
    dbCluster: string;
    geoName: string;
    geoLayer: string;
    feature: GeoFeature | null;
    settlementId: string;
  }

  const results: Result[] = [];

  for (const s of settlements) {
    const clKey = norm(s.cluster.name);
    const candidates = (geoByCluster.get(clKey) ?? []).filter(f => !consumed.has(f));

    if (candidates.length === 0) {
      results.push({
        cohort: "UNMATCHED", score: 0, breakdown: "no cluster in GeoJSON",
        dbName: s.name, dbCluster: s.cluster.name,
        geoName: "", geoLayer: "", feature: null, settlementId: s.id,
      });
      continue;
    }

    // Score all candidates, pick best
    let best: GeoFeature | null = null;
    let bestScore = -1;
    let bestBreakdown = "";

    const normDb = norm(s.name);

    for (const f of candidates) {
      const normGeo = norm(f.properties.name);
      const isExactNorm = normDb === normGeo;
      const { score: sc, breakdown: bd } = score(s.name, f.properties.name);
      const finalScore = isExactNorm ? 1.0 : sc;
      if (finalScore > bestScore) {
        bestScore = finalScore;
        best = f;
        bestBreakdown = isExactNorm ? "exact-normalised" : bd;
      }
    }

    const isExact = best ? norm(s.name) === norm(best.properties.name) : false;
    const ch = cohort(bestScore, isExact);

    results.push({
      cohort: ch,
      score: bestScore,
      breakdown: bestBreakdown,
      dbName: s.name,
      dbCluster: s.cluster.name,
      geoName: best?.properties.name ?? "",
      geoLayer: best?.properties.layer ?? "",
      feature: best,
      settlementId: s.id,
    });

    // Consume so it's not double-assigned
    if (ch !== "UNMATCHED" && ch !== "LOW" && best) consumed.add(best);
  }

  // ── Print cohort summary ──────────────────────────────────────────────────

  const COHORT_ORDER = ["EXACT", "VERY_HIGH", "HIGH", "MEDIUM", "LOW", "UNMATCHED"];
  const groups: Record<string, Result[]> = {};
  COHORT_ORDER.forEach(c => { groups[c] = results.filter(r => r.cohort === c); });

  console.log("\n════════════════════════════════════════════════════════");
  console.log(" SETTLEMENT → GEOJSON MATCH ANALYSIS");
  console.log("════════════════════════════════════════════════════════\n");

  for (const ch of COHORT_ORDER) {
    const g = groups[ch];
    const emoji = { EXACT: "✅", VERY_HIGH: "🟢", HIGH: "🟡", MEDIUM: "🟠", LOW: "🔴", UNMATCHED: "⬛" }[ch];
    console.log(`${emoji}  ${ch.padEnd(12)} ${String(g.length).padStart(3)} settlements`);
  }

  console.log("\n────────────────────────────────────────────────────────");
  console.log(` Total: ${results.length}  |  Will update: ${
    (groups.EXACT?.length ?? 0) +
    (groups.VERY_HIGH?.length ?? 0) +
    (groups.HIGH?.length ?? 0)
  } if you apply EXACT + VERY_HIGH + HIGH`);
  console.log("────────────────────────────────────────────────────────\n");

  // ── Per-cohort detail ─────────────────────────────────────────────────────

  for (const ch of ["VERY_HIGH", "HIGH", "MEDIUM", "LOW"]) {
    const g = groups[ch];
    if (!g.length) continue;
    console.log(`\n── ${ch} (${g.length}) ──────────────────────────────`);
    for (const r of g) {
      const score_str = (r.score * 100).toFixed(0).padStart(3);
      console.log(`  ${score_str}%  DB: "${r.dbName}" [${r.dbCluster}]`);
      console.log(`        GEO: "${r.geoName}" [${r.geoLayer}]`);
      if (ch === "MEDIUM" || ch === "LOW") {
        console.log(`        ${r.breakdown}`);
      }
    }
  }

  const unmatched = groups.UNMATCHED ?? [];
  const reallyUnmatched = unmatched.filter(r => r.breakdown !== "no cluster in GeoJSON");
  const noCluster = unmatched.filter(r => r.breakdown === "no cluster in GeoJSON");
  console.log(`\n── UNMATCHED ──────────────────────────────────────────`);
  console.log(`  No GeoJSON cluster at all (Chennai + others): ${noCluster.length}`);
  if (reallyUnmatched.length) {
    console.log(`  Bangalore but no candidate found: ${reallyUnmatched.length}`);
    reallyUnmatched.forEach(r => console.log(`    ✗ "${r.dbName}" [${r.dbCluster}]`));
  }

  // ── Apply if requested ────────────────────────────────────────────────────

  if (!DRY_RUN) {
    const toApply = results.filter(r => APPLY_COHORTS.has(r.cohort) && r.feature);
    console.log(`\n\nApplying ${toApply.length} matches (cohorts: ${[...APPLY_COHORTS].join(", ")})...`);
    let applied = 0;
    for (const r of toApply) {
      if (!r.feature) continue;
      const c = centroid(r.feature.geometry.coordinates);
      const partnerId = partnerMap.get(r.geoLayer) ?? null;
      await prisma.settlement.update({
        where: { id: r.settlementId },
        data: {
          polygon: r.feature.geometry as object,
          centroidLat: c?.lat ?? null,
          centroidLng: c?.lng ?? null,
          partnerId,
        },
      });
      applied++;
    }
    console.log(`✓ Applied ${applied} updates.`);
  } else {
    console.log("\n\n[DRY RUN — no DB changes made]");
    console.log("To apply, run:");
    console.log("  npx tsx scripts/analyze-settlement-matches.ts --apply=EXACT,VERY_HIGH,HIGH\n");
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
