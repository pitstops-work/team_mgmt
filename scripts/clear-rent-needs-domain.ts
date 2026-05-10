import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as never);
  const prisma = new PrismaClient({ adapter } as never);

  // Show what's set
  const before = await prisma.costRegistry.findMany({
    where: { itemKey: { startsWith: "inp." }, needsDomain: { not: null } },
    select: { itemKey: true, needsDomain: true, unit: true },
  });
  console.log('Before:', JSON.stringify(before, null, 2));

  // Clear needsDomain from all rent fields
  const result = await prisma.costRegistry.updateMany({
    where: { itemKey: { contains: "Rent" }, needsDomain: { not: null } },
    data: { needsDomain: null },
  });
  console.log('Cleared needsDomain from', result.count, 'rent items');

  await pool.end();
}
main().catch(e => console.error(e.message)).finally(() => process.exit(0));
