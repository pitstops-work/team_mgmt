import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const adapter = new PrismaPg(pool as never);
  const prisma = new PrismaClient({ adapter } as never);

  const rows = await prisma.needsFormulaConfig.findMany({ orderBy: { sortOrder: 'asc' }, select: { domain: true, label: true, assessmentColumn: true } });
  console.log(JSON.stringify(rows, null, 2));
  await pool.end();
}
main().catch(console.error).finally(() => process.exit(0));
