import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as never);
  const prisma = new PrismaClient({ adapter } as never);

  const children = await prisma.lineTemplate.updateMany({
    where: { description: { contains: 'Children Programme Lead', mode: 'insensitive' } },
    data: { inputVar: 'gate:nCLCs', inputThreshold: 0, inputMonthly: true },
  });
  const youth = await prisma.lineTemplate.updateMany({
    where: { description: { contains: 'Youth Programme Lead', mode: 'insensitive' } },
    data: { inputVar: 'gate:nYRCs', inputThreshold: 0, inputMonthly: true },
  });

  console.log('Children Programme Lead updated:', children.count);
  console.log('Youth Programme Lead updated:', youth.count);

  const check = await prisma.lineTemplate.findMany({
    where: { description: { contains: 'Programme Lead', mode: 'insensitive' } },
    select: { description: true, inputVar: true, inputThreshold: true, inputMonthly: true },
  });
  console.log('Result:', JSON.stringify(check, null, 2));

  await pool.end();
}
main().catch(e => console.error(e.message)).finally(() => process.exit(0));
