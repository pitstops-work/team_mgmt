/**
 * Cross-reference GeoJSON settlement names against DB to find name mismatches
 * that cause "no assessment data found" in the map sidebar.
 *
 * Simulates the same matching strategy as /api/map/settlement-needs (4 steps):
 *   1. Exact match with cluster
 *   2. Exact match without cluster
 *   3. First significant word (>=4 chars) contains search
 *   4. Dice coefficient >= 0.70
 *
 * Usage: npx tsx scripts/check-geojson-name-mismatches.ts [--unmatched-only]
 */

import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config({ path: '.env.local' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const UNMATCHED_ONLY = process.argv.includes('--unmatched-only');

const GEOJSON_FILES = [
  'actionaid','cfar','gubbachi','janasha','maarga','sieds',
  'sama','dbai','dbsss','sangama','arunodhaya','tndwwt','thozhamai',
];

function normaliseName(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function stripAreaSuffix(s: string): string {
  s = s.replace(/,\s*.+?\s+Area\s*$/i, '').trim();  // "Name, Xxx Area"
  s = s.replace(/\s+\w+\s+Area\s*$/i, '').trim();    // "Name Xxx Area"
  s = s.replace(/\s+Majestic\s*$/i, '').trim();       // "Name Majestic"
  return s;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 &]/g, ' ').replace(/\s+/g, ' ').trim();
}

function bigrams(s: string): Set<string> {
  const bg = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2));
  return bg;
}

function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const ba = bigrams(a), bb = bigrams(b);
  let shared = 0;
  for (const g of ba) if (bb.has(g)) shared++;
  return (2 * shared) / (ba.size + bb.size);
}

interface GeoEntry { file: string; name: string; cluster: string }
interface DbSettlement { id: string; name: string; clusterName: string }

function extractGeoNames(): GeoEntry[] {
  const results: GeoEntry[] = [];
  for (const file of GEOJSON_FILES) {
    const fp = path.join(__dirname, '../public/data', `${file}.geojson`);
    if (!fs.existsSync(fp)) continue;
    const gj = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    for (const feat of gj.features ?? []) {
      const p = feat.properties ?? {};
      const name = String(p.name ?? p.settlement_name ?? p.settlement ?? p.Settlement ?? p.Name ?? '').trim();
      const cluster = String(p.cluster ?? p.cluster_name ?? p.Cluster ?? '').trim();
      if (name) results.push({ file, name, cluster });
    }
  }
  return results;
}

function matchSettlement(
  rawName: string,
  rawCluster: string,
  dbSettlements: DbSettlement[],
): DbSettlement | null {
  const settlementName = stripAreaSuffix(normaliseName(rawName));
  const clusterName    = rawCluster ? normaliseName(rawCluster).replace(/_/g, ' ') : null;
  const snLower = settlementName.toLowerCase();

  // Step 1: exact with cluster constraint
  if (clusterName) {
    const cnLower = clusterName.toLowerCase();
    const hit = dbSettlements.find(
      s => s.name.toLowerCase() === snLower && s.clusterName.toLowerCase() === cnLower
    );
    if (hit) return hit;
  }

  // Step 2: exact without cluster
  const hit2 = dbSettlements.find(s => s.name.toLowerCase() === snLower);
  if (hit2) return hit2;

  // Step 3: first significant word (>=4 chars) contains search
  const firstWord = settlementName.split(/[\s,\-–(]+/).find(w => w.length >= 4) ?? '';
  if (firstWord) {
    const fw = firstWord.toLowerCase();
    const clusterFirstWord = clusterName ? clusterName.split(/[\s\-–]+/)[0].toLowerCase() : null;
    const candidates = dbSettlements.filter(s => s.name.toLowerCase().includes(fw));
    if (clusterFirstWord) {
      const scoped = candidates.find(s => s.clusterName.toLowerCase().includes(clusterFirstWord));
      if (scoped) return scoped;
    }
    if (candidates.length > 0) return candidates[0];
  }

  // Step 4: Dice coefficient >= 0.70
  const sn = norm(settlementName);
  const cn = clusterName ? norm(clusterName.replace(/_/g, ' ')) : null;
  let best: DbSettlement | null = null;
  let bestScore = 0;
  for (const s of dbSettlements) {
    let score = dice(sn, norm(s.name));
    if (cn && norm(s.clusterName).split(' ').some(w => w.length > 3 && cn.includes(w))) score += 0.05;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  if (best && bestScore >= 0.70) return best;

  return null;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
  const prisma  = new PrismaClient({ adapter });

  const dbRows = await prisma.settlement.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, cluster: { select: { name: true } } },
  });
  const dbSettlements: DbSettlement[] = dbRows.map(r => ({
    id: r.id,
    name: r.name,
    clusterName: r.cluster.name,
  }));

  const withAssessment = new Set(
    (await prisma.settlementAssessment.findMany({
      distinct: ['settlementId'],
      select: { settlementId: true },
    })).map(a => a.settlementId)
  );

  await prisma.$disconnect();

  const geoEntries = extractGeoNames();
  console.log(`\nGeoJSON entries: ${geoEntries.length}  |  DB settlements: ${dbSettlements.length}\n`);

  const rows: { file: string; geoName: string; geoCluster: string; matched: string | null; dbCluster: string | null; hasAssessment: boolean | null; status: string }[] = [];

  for (const entry of geoEntries) {
    const match = matchSettlement(entry.name, entry.cluster, dbSettlements);
    if (match) {
      const hasAssess = withAssessment.has(match.id);
      rows.push({
        file: entry.file,
        geoName: entry.name,
        geoCluster: entry.cluster,
        matched: match.name,
        dbCluster: match.clusterName,
        hasAssessment: hasAssess,
        status: hasAssess ? 'OK' : 'NO_ASSESSMENT',
      });
    } else {
      rows.push({
        file: entry.file,
        geoName: entry.name,
        geoCluster: entry.cluster,
        matched: null,
        dbCluster: null,
        hasAssessment: null,
        status: 'NO_DB_MATCH',
      });
    }
  }

  const noMatch   = rows.filter(r => r.status === 'NO_DB_MATCH');
  const noAssess  = rows.filter(r => r.status === 'NO_ASSESSMENT');
  const ok        = rows.filter(r => r.status === 'OK');

  console.log('Results:');
  console.log(`  Matched + has assessment:  ${ok.length}`);
  console.log(`  Matched but NO assessment: ${noAssess.length}`);
  console.log(`  NO DB match at all:        ${noMatch.length}`);
  console.log('');

  if (!UNMATCHED_ONLY) {
    if (noMatch.length > 0) {
      console.log('== NO DB MATCH (settlement not in DB — needs adding, or GeoJSON name is wrong) ==');
      for (const r of noMatch) {
        console.log(`  [${r.file}] "${r.geoName}"  (cluster: ${r.geoCluster})`);
      }
      console.log('');
    }
    if (noAssess.length > 0) {
      console.log('== MATCHED but NO ASSESSMENT ==');
      for (const r of noAssess) {
        console.log(`  [${r.file}] "${r.geoName}" -> DB: "${r.matched}" [${r.dbCluster}]`);
      }
      console.log('');
    }
  } else {
    const all = [...noMatch, ...noAssess];
    for (const r of all) {
      console.log(`[${r.status}] [${r.file}] "${r.geoName}" (cluster: ${r.geoCluster})${r.matched ? ` -> "${r.matched}"` : ''}`);
    }
  }

  console.log('== By file ==');
  for (const file of GEOJSON_FILES) {
    const fileRows = rows.filter(r => r.file === file);
    if (!fileRows.length) continue;
    const bad = fileRows.filter(r => r.status !== 'OK').length;
    console.log(`  ${file.padEnd(14)} total=${fileRows.length}  ok=${fileRows.length - bad}  issues=${bad}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
