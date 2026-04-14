import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import pg from 'pg';
dotenv.config({ path: '.env.local' });
const { Pool } = pg;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const r = await prisma.needsFormulaConfig.update({
    where: { domain: 'PalliativeCareService' },
    data: { isActive: false },
  });
  console.log('Deactivated:', r.domain, '→ isActive:', r.isActive);
  await prisma.$disconnect();
  await pool.end();
}
main().catch(console.error);
