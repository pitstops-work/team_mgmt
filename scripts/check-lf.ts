import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as never);
  const prisma = new PrismaClient({ adapter } as never);

  const srirampuraId = 'cmnsyd97c006qiyvciklea2hj';

  // Does Srirampura have an assessment?
  const assessment = await prisma.settlementAssessment.findFirst({
    where: { settlementId: srirampuraId }
  });
  console.log('Srirampura assessment:', assessment ? JSON.stringify(assessment, null, 2) : 'NONE — no assessment record exists');

  // Does it have a polygon?
  const settlement = await prisma.settlement.findUnique({
    where: { id: srirampuraId },
    select: { name: true, polygon: true, centroidLat: true, centroidLng: true }
  });
  console.log(`\nSrirampura polygon: ${settlement?.polygon ? 'YES' : 'NO'}`);
  console.log(`Centroid: ${settlement?.centroidLat ?? 'null'}, ${settlement?.centroidLng ?? 'null'}`);

  // Check what the needs page actually needs — SettlementProfile?
  const profile = await prisma.settlementProfile.findFirst({ where: { settlementId: srirampuraId } });
  console.log(`\nSettlementProfile: ${profile ? 'exists' : 'NONE'}`);

  await pool.end();
}
main().catch(e => console.error(e.message)).finally(() => process.exit(0));
