import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
  const prisma = new PrismaClient({ adapter });
  const rows = await prisma.settlement.findMany({
    where: { deletedAt: null },
    include: { cluster: { include: { zone: true } } },
    orderBy: { name: 'asc' }
  });
  console.log('Total:', rows.length);
  rows.forEach(s => console.log(JSON.stringify({ id: s.id, name: s.name, cluster: s.cluster.name, zone: s.cluster.zone.name })));
  await prisma.$disconnect();
}
main();
