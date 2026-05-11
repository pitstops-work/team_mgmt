import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as never);
  const prisma = new PrismaClient({ adapter } as never);

  const rows = await prisma.$queryRaw<Array<{
    assessmentId: string;
    settlementId: string;
    settlementName: string;
    zoneName: string;
    clusterName: string;
    children6m3yr: number;
    children4to14: number;
    youth15to21: number;
    totalHouseholds: number;
    enumeratorNotes: string | null;
  }>>`
    SELECT
      sa.id AS "assessmentId",
      sa."settlementId",
      s.name AS "settlementName",
      z.name AS "zoneName",
      cl.name AS "clusterName",
      sa."children6m3yr",
      sa."children4to14",
      sa."youth15to21",
      sa."totalHouseholds",
      sa."enumeratorNotes"
    FROM "SettlementAssessment" sa
    JOIN "Settlement" s ON s.id = sa."settlementId"
    JOIN "Cluster" cl ON cl.id = s."clusterId"
    JOIN "Zone" z ON z.id = cl."zoneId"
    WHERE sa."children6m3yr" = 0
      AND sa."children4to14" = 0
      AND sa."youth15to21" = 0
      AND s."deletedAt" IS NULL
    ORDER BY z.name, cl.name, s.name
  `;

  console.log(`Settlements missing all age-band data: ${rows.length}\n`);

  // Extract slum_ids from enumeratorNotes JSON
  for (const r of rows) {
    let slumId = null;
    try {
      const notes = r.enumeratorNotes ? JSON.parse(r.enumeratorNotes) : null;
      slumId = notes?.slum_id ?? null;
    } catch {}
    console.log(`  [slum_id:${slumId ?? '?'}] ${r.settlementName} — ${r.zoneName} / ${r.clusterName}  (HH: ${r.totalHouseholds})`);
  }

  await pool.end();
}
main().catch(e => console.error(e.message)).finally(() => process.exit(0));
