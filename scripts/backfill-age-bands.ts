/**
 * Fetch age-band data from janadhikara.org for all settlements
 * missing children6m3yr / children4to14 / youth15to21, and patch them.
 *
 * Usage:  npx tsx scripts/backfill-age-bands.ts <TOKEN>
 */
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error('Usage: npx tsx scripts/backfill-age-bands.ts <TOKEN>');
  process.exit(1);
}

async function main() {
  // ── 1. Fetch age data from janadhikara ──────────────────────────────────────
  console.log('Fetching age report from janadhikara.org...');
  const res = await fetch(
    `https://janadhikara.org/backend/api/multi_filter_report/16?token=${TOKEN}`,
    { headers: { accept: 'application/json', referer: 'https://janadhikara.org/' } }
  );
  if (!res.ok) {
    console.error(`HTTP ${res.status} — token may be expired`);
    process.exit(1);
  }
  const json = await res.json() as { items: Array<{ slum_id: number; Count: number; Item: string }> };
  const items = json.items ?? [];
  console.log(`Got ${items.length} age rows`);

  // Build map: slum_id → { '0-3': N, '4-6': N, '7-14': N, '15-18': N, '19-21': N }
  const ageBySlum = new Map<number, Record<string, number>>();
  for (const row of items) {
    if (!ageBySlum.has(row.slum_id)) ageBySlum.set(row.slum_id, {});
    ageBySlum.get(row.slum_id)![row.Item] = row.Count;
  }

  // ── 2. Query DB for settlements missing age data ─────────────────────────────
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as never);
  const prisma = new PrismaClient({ adapter } as never);

  const missing = await prisma.$queryRaw<Array<{
    assessmentId: string;
    settlementId: string;
    settlementName: string;
    enumeratorNotes: string | null;
  }>>`
    SELECT
      sa.id AS "assessmentId",
      sa."settlementId",
      s.name AS "settlementName",
      sa."enumeratorNotes"
    FROM "SettlementAssessment" sa
    JOIN "Settlement" s ON s.id = sa."settlementId"
    WHERE sa."children6m3yr" = 0
      AND sa."children4to14" = 0
      AND sa."youth15to21" = 0
      AND s."deletedAt" IS NULL
  `;
  console.log(`\nSettlements to patch: ${missing.length}`);

  let updated = 0;
  let noData = 0;

  for (const row of missing) {
    let slumId: number | null = null;
    try {
      const notes = row.enumeratorNotes ? JSON.parse(row.enumeratorNotes) : null;
      slumId = notes?.slum_id ?? null;
    } catch {}

    if (!slumId || !ageBySlum.has(slumId)) {
      console.log(`  SKIP  [no janadhikara match] ${row.settlementName}`);
      noData++;
      continue;
    }

    const bands = ageBySlum.get(slumId)!;
    const children6m3yr = bands['0-3'] ?? 0;
    const children4to14 = (bands['4-6'] ?? 0) + (bands['7-14'] ?? 0);
    const youth15to21   = (bands['15-18'] ?? 0) + (bands['19-21'] ?? 0);

    await prisma.$executeRaw`
      UPDATE "SettlementAssessment"
      SET
        "children6m3yr" = ${children6m3yr},
        "children4to14" = ${children4to14},
        "youth15to21"   = ${youth15to21}
      WHERE "settlementId" = ${row.settlementId}
    `;

    console.log(`  OK    ${row.settlementName.padEnd(40)} 0-3:${children6m3yr}  4-14:${children4to14}  15-21:${youth15to21}`);
    updated++;
  }

  console.log(`\nDone — updated: ${updated}, skipped (no janadhikara data): ${noData}`);
  await pool.end();
}
main().catch(e => console.error(e.message)).finally(() => process.exit(0));
