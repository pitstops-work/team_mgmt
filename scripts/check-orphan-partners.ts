import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const ORPHANS = [
  '8th and 9th Main Road','Ahammed Nagar (CRC proposed)','Ambedkar nagar I',
  'Ambedkar nagar II','Ambedkar nagar III','Bheemana kuppe','Bilwaradahalli',
  'Corporation Colony','Doraiswamy Nagar','Flower Garden','Goutham Nagar',
  'Gowripura','Gundappa Colony','Hospalya','Jaibheemnagar','Jaibhuvaneshwari Nagar',
  'Kabbalamma palya','Kanminke','Kempapura','Khalikatta','MCT Colony',
  'Pillaganahalli','Rajendra Nagar II','Rajendra Nagar III','Seepkere',
  'Shastri Nagar (Koramangala)','Shilidradoddi','Subbarayanapalya','Sunnadgudu',
  'Thigalara Beedi','Thilaknagar','Vinayaka and Karimandi'
];

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
  const prisma = new PrismaClient({ adapter });

  const rows = await prisma.settlement.findMany({
    where: { name: { in: ORPHANS }, deletedAt: null },
    select: {
      id: true, name: true, partnerId: true,
      partner: { select: { key: true } },
      cluster: { select: { name: true, zone: { select: { name: true } } } }
    },
    orderBy: { name: 'asc' }
  });

  for (const r of rows) {
    console.log(`${r.partner?.key ?? 'NO_PARTNER'}\t${r.cluster.zone.name}\t${r.cluster.name}\t${r.name}`);
  }
  console.log(`\ntotal: ${rows.length}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
