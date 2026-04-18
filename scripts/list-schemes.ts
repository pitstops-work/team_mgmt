import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import pg from 'pg';
dotenv.config({ path: '.env.local' });
const { Pool } = pg;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const schemes = await prisma.entitlementScheme.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, parentId: true } });
  console.log(JSON.stringify(schemes, null, 2));
  await prisma.$disconnect();
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
