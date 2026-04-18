import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import pg from 'pg';
dotenv.config({ path: '.env.local' });
const { Pool } = pg;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const cities = await prisma.city.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
  console.log('Cities:', JSON.stringify(cities));
  
  const chennai = cities.find(c => c.name.toLowerCase().includes('chennai'));
  if (!chennai) { console.log('No Chennai city found'); await prisma.$disconnect(); await pool.end(); return; }

  const settlements = await prisma.settlement.findMany({
    where: { deletedAt: null, cluster: { zone: { cityId: chennai.id } } },
    include: { cluster: { include: { zone: true } } },
    orderBy: { name: 'asc' }
  });
  console.log(`Chennai settlements: ${settlements.length}`);
  settlements.forEach(s => console.log(JSON.stringify({ id: s.id, name: s.name, cluster: s.cluster.name, zone: s.cluster.zone.name })));
  
  await prisma.$disconnect();
  await pool.end();
}
main().catch(console.error);
