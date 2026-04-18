/**
 * Backfill Settlement.cityId from cluster→zone→city chain.
 * Run after migration 0037 is deployed.
 *
 *   MIGRATE_DATABASE_URL="..." npx ts-node --project tsconfig.scripts.json scripts/backfill-settlement-city.ts
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL!, max: 1 });
const adapter = new PrismaPg(pool, { schema: undefined });
const prisma = new PrismaClient({ adapter } as never);

async function main() {
  // Load all settlements with their cluster→zone→city chain
  const settlements = await prisma.settlement.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      cityId: true,
      cluster: {
        select: {
          zone: {
            select: {
              cityId: true,
              city: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  let updated = 0;
  let alreadySet = 0;
  let noCity = 0;

  for (const s of settlements) {
    const inferredCityId = s.cluster.zone.cityId;

    if (!inferredCityId) {
      noCity++;
      continue;
    }

    if (s.cityId === inferredCityId) {
      alreadySet++;
      continue;
    }

    await prisma.settlement.update({
      where: { id: s.id },
      data: { cityId: inferredCityId },
    });

    const cityName = s.cluster.zone.city?.name ?? inferredCityId;
    console.log(`  ✓ ${s.name} → ${cityName}`);
    updated++;
  }

  console.log(`\nDone. Updated: ${updated}, already set: ${alreadySet}, no city in chain: ${noCity}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => pool.end());
