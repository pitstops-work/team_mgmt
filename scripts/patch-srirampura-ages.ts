import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as never);
  const prisma = new PrismaClient({ adapter } as never);

  const settlementId = 'cmnsyd97c006qiyvciklea2hj'; // Srirampura

  // Use raw SQL — age columns were added after initial Prisma client generation
  const result = await prisma.$executeRaw`
    UPDATE "SettlementAssessment"
    SET
      "children6m3yr" = 37,
      "children4to14" = 185,
      "youth15to21"   = 120
    WHERE "settlementId" = ${settlementId}
  `;

  console.log(`Rows updated: ${result}`);

  // Verify
  const assessment = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT "children6m3yr", "children4to14", "youth15to21", "elderly60plus", "totalHouseholds"
    FROM "SettlementAssessment"
    WHERE "settlementId" = ${settlementId}
  `;
  console.log('Updated assessment:', JSON.stringify(assessment[0], null, 2));

  await pool.end();
}
main().catch(e => console.error(e.message)).finally(() => process.exit(0));
