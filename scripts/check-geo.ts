import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as never);
  const prisma = new PrismaClient({ adapter } as never);

  const zones = await prisma.zone.findMany({ select: { id: true, name: true, cityId: true, deletedAt: true } });
  const clusters = await prisma.cluster.findMany({ select: { id: true, name: true, zoneId: true, deletedAt: true }, take: 5 });
  const cities = await prisma.city.findMany({ select: { id: true, name: true } });

  console.log('Cities:', JSON.stringify(cities));
  console.log('Zones:', JSON.stringify(zones));
  console.log('Sample clusters:', JSON.stringify(clusters));

  await pool.end();
}
main().catch(e => console.error(e.message)).finally(() => process.exit(0));
