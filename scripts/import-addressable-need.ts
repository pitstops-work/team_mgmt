/**
 * Import addressable need data from the field survey Excel file into
 * SettlementAssessment (addressable* fields) and SettlementProfile.
 *
 * Source: Creche, Toilet, Water - Need assessment.xlsx
 * Sheets: CRECHE, TOILET, WATER
 *
 * Usage:
 *   npx tsx scripts/import-addressable-need.ts [--dry-run] [--force]
 *
 *   --dry-run  Show matches/unmatched without writing
 *   --force    Overwrite addressable fields even if already set
 */

import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as XLSX from 'xlsx';
import * as dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');
const FUZZY_THRESHOLD = 0.75;
const ASSESSMENT_YEAR = 2025;

const FILE_PATH = join(__dirname, '../..', 'Downloads/Creche, Toilet, Water - Need assessment.xlsx');

// ── Types ─────────────────────────────────────────────────────────────────────

interface SurveyRow {
  settlementName: string;
  clusterName: string;
  totalHouseholds: number | null;
  // Creche
  children6m3yr?: number | null;
  addressableCreches?: number | null;
  // Toilet
  addressableToilets?: number | null;
  toiletLandAvailable?: boolean | null;
  toiletLandType?: string | null;
  // Water
  waterATMCurrentCount?: number | null;
  addressableWaterATMs?: number | null;
  waterATMFeasible?: boolean | null;
}

// ── Normalise / fuzzy helpers ─────────────────────────────────────────────────

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

function yn(v: unknown): boolean | null {
  if (v == null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (s === 'y' || s === 'yes') return true;
  if (s === 'n' || s === 'no') return false;
  return null;
}

function num(v: unknown): number | null {
  if (v == null || v === '' || v === 'NA' || v === 'na') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ── Read Excel sheets ─────────────────────────────────────────────────────────

function readSheets(): Map<string, SurveyRow> {
  const wb = XLSX.readFile(FILE_PATH);
  const rows = new Map<string, SurveyRow>();

  function key(settlement: string, cluster: string) {
    return `${norm(settlement)}||${norm(cluster)}`;
  }

  function getOrCreate(settlement: string, cluster: string, hh: unknown): SurveyRow {
    const k = key(settlement, cluster);
    if (!rows.has(k)) {
      rows.set(k, { settlementName: settlement.trim(), clusterName: cluster.trim(), totalHouseholds: num(hh) });
    }
    return rows.get(k)!;
  }

  // ── CRECHE sheet ─────────────────────────────────────────────────────────
  const crecheSheet = wb.Sheets['CRECHE'] ?? wb.Sheets['Creche'] ?? wb.Sheets[wb.SheetNames.find(n => /creche/i.test(n)) ?? ''];
  if (crecheSheet) {
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(crecheSheet, { defval: '' });
    for (const row of data) {
      const settlement = String(row['Settlement Name'] ?? row['Settlement name'] ?? '').trim();
      const cluster    = String(row['Cluster name'] ?? row['Cluster Name'] ?? '').trim();
      if (!settlement) continue;

      const r = getOrCreate(settlement, cluster, row['No. of HHs - Janadhikara'] ?? row['No of HHs']);
      r.children6m3yr      = num(row['No: of children (6 months - 3 years old)'] ?? row['No. of children (6 months - 3 years old)']);
      r.addressableCreches = num(row['No: of creches proposed in this settlement for this year?'] ?? row['No. of creches proposed in this settlement for this year?']);
    }
  }

  // ── TOILET sheet ─────────────────────────────────────────────────────────
  const toiletSheet = wb.Sheets['TOILET'] ?? wb.Sheets['Toilet'] ?? wb.Sheets[wb.SheetNames.find(n => /toilet/i.test(n)) ?? ''];
  if (toiletSheet) {
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(toiletSheet, { defval: '' });
    for (const row of data) {
      const settlement = String(row['Settlement Name'] ?? row['Settlement name'] ?? '').trim();
      const cluster    = String(row['Cluster name'] ?? row['Cluster Name'] ?? '').trim();
      if (!settlement) continue;

      const r = getOrCreate(settlement, cluster, row['No. of HHs - Janadhikara'] ?? row['No of HHs']);
      const needY         = yn(row['Is there a need of a community owned toilet? (Y/N)']);
      const landAvailable = yn(row['Is there land/space available to estbalish a community owned toilet? (Y/N)']
                             ?? row['Is there land/space available to establish a community owned toilet? (Y/N)']);
      const landType      = String(row['If land is available, is it govt or private? (Govt/Private)'] ?? '').trim() || null;

      // Addressable = need is Y AND land is available
      r.addressableToilets  = (needY && landAvailable) ? 1 : 0;
      r.toiletLandAvailable = landAvailable;
      r.toiletLandType      = landType;
    }
  }

  // ── WATER sheet ──────────────────────────────────────────────────────────
  const waterSheet = wb.Sheets['WATER'] ?? wb.Sheets['Water'] ?? wb.Sheets[wb.SheetNames.find(n => /water/i.test(n)) ?? ''];
  if (waterSheet) {
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(waterSheet, { defval: '' });
    for (const row of data) {
      const settlement = String(row['Settlement Name'] ?? row['Settlement name'] ?? '').trim();
      const cluster    = String(row['Cluster name'] ?? row['Cluster Name'] ?? '').trim();
      if (!settlement) continue;

      const r = getOrCreate(settlement, cluster, row['No. of HHs - Janadhikara'] ?? row['No of HHs']);
      const currentATM = yn(row['How many water ATMs are servicing this settlement?']);
      const needMore   = yn(row['Is there a need for more water ATMs? (Y/N)']);
      const feasible   = yn(row['If yes, is it feasible? (land/space, water connection - borewell etc.) (Y/N)']);

      r.waterATMCurrentCount = currentATM ? 1 : 0;
      r.addressableWaterATMs = (needMore && feasible) ? 1 : 0;
      r.waterATMFeasible     = feasible;
    }
  }

  return rows;
}

// ── Match survey row → DB settlement ─────────────────────────────────────────

interface DbSettlement {
  id: string;
  name: string;
  clusterId: string;
  cluster: { name: string };
}

function matchSettlement(surveyName: string, surveyCluster: string, dbSettlements: DbSettlement[]): { settlement: DbSettlement; score: number } | null {
  const sn = norm(surveyName);
  const sc = norm(surveyCluster).replace(/_/g, ' ');

  let best: { settlement: DbSettlement; score: number } | null = null;

  for (const s of dbSettlements) {
    const dn = norm(s.name);
    const dc = norm(s.cluster.name.replace(/_/g, ' '));
    const nameDice = dice(sn, dn);
    // Bonus if cluster names share words
    const clusterBonus = sc && dc.split(' ').some(w => w.length > 3 && sc.includes(w)) ? 0.1 : 0;
    const score = nameDice + clusterBonus;
    if (score > (best?.score ?? 0)) best = { settlement: s, score };
  }

  if (!best || best.score < FUZZY_THRESHOLD) return null;
  return best;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
  const prisma  = new PrismaClient({ adapter });

  console.log(`\nImporting addressable need from Excel${DRY_RUN ? ' (DRY RUN)' : ''}${FORCE ? ' (FORCE)' : ''}\n`);

  // Read Excel
  const surveyRows = readSheets();
  console.log(`Excel rows read: ${surveyRows.size} unique settlements across all sheets\n`);

  // Load all DB settlements
  const dbSettlements = await prisma.settlement.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, clusterId: true, cluster: { select: { name: true } } },
  });

  let matched = 0, unmatched = 0, written = 0, skipped = 0;

  for (const [, row] of surveyRows) {
    const result = matchSettlement(row.settlementName, row.clusterName, dbSettlements);

    if (!result) {
      console.log(`  ✗ UNMATCHED: "${row.settlementName}" (cluster: ${row.clusterName})`);
      unmatched++;
      continue;
    }

    // Reject cross-city matches — all survey data is Bangalore, skip Chennai settlements
    const settlementCity = await prisma.$queryRaw<{ name: string }[]>`
      SELECT ci.name FROM "Settlement" s
      JOIN "Cluster" cl ON cl.id = s."clusterId"
      JOIN "Zone" z ON z.id = cl."zoneId"
      JOIN "City" ci ON ci.id = z."cityId"
      WHERE s.id = ${result.settlement.id} LIMIT 1
    `;
    if (settlementCity[0]?.name && !/bangalore/i.test(settlementCity[0].name)) {
      console.log(`  ✗ CROSS-CITY SKIP: "${row.settlementName}" → ${result.settlement.name} [${settlementCity[0].name}]`);
      unmatched++;
      continue;
    }

    matched++;
    const { settlement } = result;
    console.log(`  ✓ ${row.settlementName} → ${settlement.name} [${settlement.cluster.name}] (score: ${result.score.toFixed(2)})`);

    if (DRY_RUN) continue;

    // Find existing assessment for this year, or latest
    const existing = await prisma.settlementAssessment.findFirst({
      where: { settlementId: settlement.id },
      orderBy: { assessedAt: 'desc' },
    });

    if (existing && !FORCE) {
      // Check if addressable fields already populated
      const hasData = existing.addressableCreches != null || existing.addressableToilets != null || existing.addressableWaterATMs != null;
      if (hasData) {
        console.log(`    → skipped (addressable data already set, use --force to overwrite)`);
        skipped++;
        continue;
      }
    }

    const addressableData = {
      addressableCreches:   row.addressableCreches   ?? null,
      addressableToilets:   row.addressableToilets   ?? null,
      toiletLandAvailable:  row.toiletLandAvailable  ?? null,
      toiletLandType:       row.toiletLandType        ?? null,
      addressableWaterATMs: row.addressableWaterATMs  ?? null,
      waterATMCurrentCount: row.waterATMCurrentCount  ?? null,
      waterATMFeasible:     row.waterATMFeasible      ?? null,
    };

    let assessmentId: string;

    if (existing) {
      // Patch addressable fields onto existing assessment
      await prisma.settlementAssessment.update({
        where: { id: existing.id },
        data: addressableData,
      });
      assessmentId = existing.id;
      console.log(`    → updated assessment ${existing.id} (${existing.assessmentYear})`);
    } else {
      // Create minimal assessment with population + addressable data
      const created = await prisma.settlementAssessment.create({
        data: {
          settlementId: settlement.id,
          assessmentYear: ASSESSMENT_YEAR,
          assessedById: await getSystemUserId(prisma),
          assessedAt: new Date(),
          totalHouseholds: row.totalHouseholds ?? 0,
          children6m3yr:   row.children6m3yr   ?? 0,
          ...addressableData,
        },
      });
      assessmentId = created.id;
      console.log(`    → created new assessment ${created.id}`);
    }

    // Sync SettlementProfile
    const assessment = await prisma.settlementAssessment.findUnique({ where: { id: assessmentId } });
    if (assessment) {
      const profileData = {
        totalHouseholds:     assessment.totalHouseholds,
        children6m3yr:       assessment.children6m3yr,
        children4to14:       assessment.children4to14,
        youth15to21:         assessment.youth15to21,
        elderly60plus:       assessment.elderly60plus,
        settlementType:      assessment.settlementType      ?? null,
        priorityIssues:      assessment.priorityIssues      ?? null,
        addressableCreches:  assessment.addressableCreches  ?? null,
        addressableToilets:  assessment.addressableToilets  ?? null,
        addressableWaterATMs:assessment.addressableWaterATMs ?? null,
        lastAssessmentId:    assessmentId,
        lastSyncedAt:        new Date(),
      };
      await prisma.settlementProfile.upsert({
        where: { settlementId: settlement.id },
        create: { settlementId: settlement.id, ...profileData },
        update: profileData,
      });
    }

    written++;
  }

  console.log(`\n── Summary ──────────────────────────────────────────────`);
  console.log(`  Survey rows:  ${surveyRows.size}`);
  console.log(`  Matched:      ${matched}`);
  console.log(`  Unmatched:    ${unmatched}`);
  if (!DRY_RUN) {
    console.log(`  Written:      ${written}`);
    console.log(`  Skipped:      ${skipped}  (use --force to overwrite)`);
  }

  await prisma.$disconnect();
}

// Return the id of a super admin / first user to use as assessedById for auto-created assessments
async function getSystemUserId(prisma: PrismaClient): Promise<string> {
  const u = await prisma.user.findFirst({ where: { role: 'admin' }, select: { id: true } })
         ?? await prisma.user.findFirst({ select: { id: true } });
  if (!u) throw new Error('No users in DB');
  return u.id;
}

main().catch(e => { console.error(e); process.exit(1); });
