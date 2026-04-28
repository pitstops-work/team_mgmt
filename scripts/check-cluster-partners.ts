import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const TARGET_CLUSTERS = [
  'Rayapuram', 'Nagarbhavi', 'Koramangala', 'Kengeri', 'Anekal',
  'Jayanagar', 'KR Market', 'Peenya - West', 'Yeshwantpur',
  'Hebbal', 'Bellandur', 'JJR Nagar'
];

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
  const prisma = new PrismaClient({ adapter });

  // For each cluster, find the most common partner among settlements in that cluster
  for (const clusterName of TARGET_CLUSTERS) {
    const rows = await prisma.settlement.findMany({
      where: {
        deletedAt: null,
        partner: { isNot: null },
        cluster: { name: { equals: clusterName, mode: 'insensitive' } }
      },
      select: { partner: { select: { key: true } } }
    });
    const counts: Record<string, number> = {};
    for (const r of rows) {
      if (r.partner?.key) counts[r.partner.key] = (counts[r.partner.key] ?? 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    console.log(`${clusterName}: ${sorted.map(([k,v]) => `${k}(${v})`).join(', ') || 'NO PARTNER'}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
