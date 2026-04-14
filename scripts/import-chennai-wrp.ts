/**
 * Import Chennai WRP (Welfare Rights Programme) individual data into
 * SettlementAssessment records.
 *
 * Source: Individual Profile-WRP-2.csv
 *   Columns: Sr, ID, docstatus, Implementing Org, HHID, Settlement name,
 *            Street Name, Name, Age, Gender, Status, owner
 *
 * Aggregation per settlement:
 *   totalHouseholds  = unique HHIDs
 *   children6m3yr    = individuals age 0–3
 *   children4to14    = individuals age 4–14
 *   youth15to21      = individuals age 15–21
 *   elderly60plus    = individuals age 60+
 *
 * Matching: exact normalised name → fuzzy (Dice ≥ 0.75)
 *
 * Usage:
 *   npx tsx scripts/import-chennai-wrp.ts [--dry-run] [--force]
 */

import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

dotenv.config({ path: '.env.local' });

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN  = process.argv.includes('--dry-run');
const FORCE    = process.argv.includes('--force');
const FUZZY_THRESHOLD = 0.75;

// ── CSV parsing ───────────────────────────────────────────────────────────────

interface CsvRow {
  settlement: string;
  hhid: string;
  age: number;
}

function parseCsv(path: string): CsvRow[] {
  const text = readFileSync(path, 'utf-8');
  const lines = text.split('\n').filter(l => l.trim());
  const header = lines[0].split(',').map(h => h.trim().replace(/^\uFEFF/, ''));

  // Find column indices
  const iSettlement = header.findIndex(h => h.toLowerCase().includes('settlement'));
  const iHHID       = header.findIndex(h => h.toLowerCase().includes('hhid'));
  const iAge        = header.findIndex(h => h.toLowerCase().includes('age'));

  if (iSettlement < 0 || iHHID < 0 || iAge < 0) {
    throw new Error(`Could not find required columns. Headers: ${header.join(', ')}`);
  }

  const result: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const settlement = cols[iSettlement]?.trim();
    const hhid       = cols[iHHID]?.trim();
    const ageStr     = cols[iAge]?.trim();
    if (!settlement || !hhid || !ageStr) continue;
    const age = parseInt(ageStr, 10);
    if (isNaN(age)) continue;
    result.push({ settlement, hhid, age });
  }
  return result;
}

// ── Aggregation ───────────────────────────────────────────────────────────────

interface AggregatedSettlement {
  name: string;
  totalHouseholds: number;
  children6m3yr: number;
  children4to14: number;
  youth15to21: number;
  elderly60plus: number;
  totalIndividuals: number;
}

function aggregate(rows: CsvRow[]): Map<string, AggregatedSettlement> {
  const map = new Map<string, {
    hhids: Set<string>;
    children6m3yr: number;
    children4to14: number;
    youth15to21: number;
    elderly60plus: number;
    total: number;
  }>();

  for (const row of rows) {
    if (!map.has(row.settlement)) {
      map.set(row.settlement, { hhids: new Set(), children6m3yr: 0, children4to14: 0, youth15to21: 0, elderly60plus: 0, total: 0 });
    }
    const s = map.get(row.settlement)!;
    s.hhids.add(row.hhid);
    s.total++;
    if (row.age <= 3)            s.children6m3yr++;
    else if (row.age <= 14)      s.children4to14++;
    else if (row.age <= 21)      s.youth15to21++;
    else if (row.age >= 60)      s.elderly60plus++;
  }

  const result = new Map<string, AggregatedSettlement>();
  for (const [name, data] of map) {
    result.set(name, {
      name,
      totalHouseholds: data.hhids.size,
      children6m3yr:   data.children6m3yr,
      children4to14:   data.children4to14,
      youth15to21:     data.youth15to21,
      elderly60plus:   data.elderly60plus,
      totalIndividuals:data.total,
    });
  }
  return result;
}

// ── Name matching ─────────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s.toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[^a-z0-9 '&().]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const csvPath = join(__dirname, '..', '..', 'Downloads', 'Individual Profile-WRP-2.csv');
  console.log(`Reading ${csvPath}…`);
  const rows = parseCsv(csvPath);
  console.log(`  ${rows.length} individual rows parsed`);

  const csvSettlements = aggregate(rows);
  console.log(`  ${csvSettlements.size} unique settlements in CSV\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  // Get Chennai city
  const cities = await prisma.city.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
  const chennai = cities.find(c => c.name.toLowerCase().includes('chennai'));
  if (!chennai) { console.error('No Chennai city found in DB'); process.exit(1); }

  const dbSettlements = await prisma.settlement.findMany({
    where: { deletedAt: null, cluster: { zone: { cityId: chennai.id } } },
    include: { cluster: { include: { zone: true } } },
  });
  console.log(`DB settlements (Chennai): ${dbSettlements.length}\n`);

  // Build normalised lookup
  const dbByNorm = new Map<string, typeof dbSettlements[0][]>();
  for (const s of dbSettlements) {
    const key = normalise(s.name);
    if (!dbByNorm.has(key)) dbByNorm.set(key, []);
    dbByNorm.get(key)!.push(s);
  }

  // Match CSV settlements → DB settlements
  type Match = { csv: AggregatedSettlement; db: typeof dbSettlements[0]; score: number; method: string };
  const matches: Match[] = [];
  const unmatched: string[] = [];

  for (const [, agg] of csvSettlements) {
    const normCsv = normalise(agg.name);

    // Exact
    const exact = dbByNorm.get(normCsv);
    if (exact?.length === 1) {
      matches.push({ csv: agg, db: exact[0], score: 1, method: 'exact' });
      continue;
    }
    if (exact && exact.length > 1) {
      matches.push({ csv: agg, db: exact[0], score: 1, method: 'exact (ambiguous — first taken)' });
      continue;
    }

    // Fuzzy
    let best = 0;
    let bestDb: typeof dbSettlements[0] | null = null;
    for (const [normKey, settlements] of dbByNorm) {
      const score = dice(normCsv, normKey);
      if (score > best) { best = score; bestDb = settlements[0]; }
    }
    if (best >= FUZZY_THRESHOLD && bestDb) {
      matches.push({ csv: agg, db: bestDb, score: best, method: `fuzzy(${best.toFixed(2)})` });
    } else {
      unmatched.push(agg.name);
    }
  }

  console.log('=== Matching Results ===');
  console.log(`  Matched:   ${matches.length}`);
  console.log(`  Unmatched: ${unmatched.length}\n`);

  if (unmatched.length > 0) {
    console.log('--- Unmatched (will be skipped) ---');
    unmatched.forEach(n => console.log(`  "${n}"`));
    console.log();
  }

  console.log('--- All matches ---');
  matches.forEach(m => {
    console.log(`  [${m.method}] "${m.csv.name}" → "${m.db.name}"  | HH:${m.csv.totalHouseholds} ind:${m.csv.totalIndividuals} ch<3:${m.csv.children6m3yr} ch4-14:${m.csv.children4to14} y15-21:${m.csv.youth15to21} eld:${m.csv.elderly60plus}`);
  });
  console.log();

  if (DRY_RUN) {
    console.log('DRY RUN — no records written.');
    await prisma.$disconnect(); await pool.end();
    return;
  }

  const systemUser = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!systemUser) { console.error('No users found'); process.exit(1); }
  console.log(`Crediting to: ${systemUser.name ?? systemUser.email}\n`);

  let created = 0, updated = 0, skipped = 0, failed = 0;

  for (const { csv, db } of matches) {
    const existing = await prisma.settlementAssessment.findFirst({
      where: { settlementId: db.id },
      orderBy: { assessedAt: 'desc' },
    });

    if (existing && !FORCE) {
      // Update population fields but don't overwrite other infrastructure data
      await prisma.settlementAssessment.update({
        where: { id: existing.id },
        data: {
          totalHouseholds: csv.totalHouseholds,
          children6m3yr:   csv.children6m3yr,
          children4to14:   csv.children4to14,
          youth15to21:     csv.youth15to21,
          elderly60plus:   csv.elderly60plus,
        },
      });
      updated++;
      continue;
    }

    const notes = JSON.stringify({
      source: 'Chennai WRP import',
      totalIndividuals: csv.totalIndividuals,
    });

    try {
      await prisma.settlementAssessment.create({
        data: {
          settlementId:    db.id,
          assessmentYear:  2025,
          assessedById:    systemUser.id,
          assessedAt:      new Date('2025-01-01'),
          totalHouseholds: csv.totalHouseholds,
          children6m3yr:   csv.children6m3yr,
          children4to14:   csv.children4to14,
          youth15to21:     csv.youth15to21,
          elderly60plus:   csv.elderly60plus,
          existingCreches:               0,
          existingChildrenCentres:       0,
          existingYouthGroups:           0,
          existingYouthResourceCentres:  0,
          existingElderlyKitchens:       0,
          existingElderlyCentres:        0,
          existingPalliativeUnits:       0,
          existingPalliativeCareServices:0,
          existingReferralSystems:       0,
          existingCommunityToilets:      0,
          existingWaterATMs:             0,
          enumeratorNotes: notes,
        },
      });
      created++;
    } catch (err) {
      console.error(`  Failed for "${csv.name}":`, (err as Error).message);
      failed++;
    }
  }

  console.log('\n=== Import Complete ===');
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}  (population fields refreshed on existing assessments)`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed:  ${failed}`);
  console.log('\nNote: existing-infrastructure fields left at 0 for field entry.');

  await prisma.$disconnect();
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
