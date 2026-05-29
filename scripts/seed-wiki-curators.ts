/**
 * Seed wiki curators. Idempotent — upserts WikiStaff rows.
 *
 * Curator is the role that runs the weekly gap-queue walk, the stale-page
 * sweep, and translation-queue triage. See module 5/7/8 of the practice-
 * documentation training.
 *
 * Configure by adding emails to CURATORS below (one row per city or global).
 *
 * Run:
 *   npx tsx scripts/seed-wiki-curators.ts          # dry run
 *   npx tsx scripts/seed-wiki-curators.ts --apply  # write
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type CuratorSeed = {
  email: string;
  scope: { cities?: string[]; verticals?: string[] } | null; // null = global
};

const CURATORS: CuratorSeed[] = [
  // Bootstrap: Vishnu as global curator until partner senior staff are
  // designated per city. Add more rows here (per-city, per-vertical) later.
  { email: "kotlerster@gmail.com", scope: null },
];

async function main() {
  const apply = process.argv.includes("--apply");

  for (const seed of CURATORS) {
    const user = await prisma.user.findFirst({
      where: { email: seed.email },
      select: { id: true, name: true, email: true },
    });
    if (!user) {
      console.log(`SKIP  ${seed.email} — user not found`);
      continue;
    }

    const existing = await prisma.wikiStaff.findUnique({
      where: { userId_wikiRole: { userId: user.id, wikiRole: "curator" } },
      select: { id: true, scope: true },
    });

    if (existing) {
      const same = JSON.stringify(existing.scope) === JSON.stringify(seed.scope);
      console.log(
        `${same ? "no-op" : "UPDATE"}  ${seed.email}  curator  scope=${JSON.stringify(seed.scope)}`,
      );
      if (!apply || same) continue;
      await prisma.wikiStaff.update({
        where: { id: existing.id },
        data: { scope: seed.scope ?? undefined },
      });
    } else {
      console.log(
        `CREATE  ${seed.email}  curator  scope=${JSON.stringify(seed.scope)}`,
      );
      if (!apply) continue;
      await prisma.wikiStaff.create({
        data: {
          userId: user.id,
          wikiRole: "curator",
          scope: seed.scope ?? undefined,
        },
      });
    }
  }

  console.log(`\n${apply ? "Applied." : "Dry run. Re-run with --apply to write."}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    prisma.$disconnect().finally(() => process.exit(1));
  });
