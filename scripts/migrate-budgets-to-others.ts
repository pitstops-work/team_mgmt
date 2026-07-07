/**
 * Move every EXISTING budget to city "Others" so the new Bangalore / Chennai
 * city landing starts empty. Legacy/test budgets live under "Others"; real
 * approved grants get added to Bangalore/Chennai going forward.
 *
 * Idempotent: skips budgets already in "Others". grantPartnerId is left null.
 *
 * Usage:
 *   npx tsx scripts/migrate-budgets-to-others.ts            # dry run
 *   npx tsx scripts/migrate-budgets-to-others.ts --apply    # write
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  console.log(`\n=== Migrate budgets → Others — ${APPLY ? "APPLY" : "DRY RUN"} ===\n`);

  const toMove = await prisma.budget.findMany({
    where: { city: { not: "Others" } },
    select: { id: true, name: true, city: true },
    orderBy: { updatedAt: "desc" },
  });
  const byCity: Record<string, number> = {};
  for (const b of toMove) byCity[b.city] = (byCity[b.city] ?? 0) + 1;
  console.log(`${toMove.length} budget(s) to move:`, JSON.stringify(byCity));
  for (const b of toMove.slice(0, 20)) console.log(`  ${b.city.padEnd(10)} ${b.name}`);
  if (toMove.length > 20) console.log(`  … +${toMove.length - 20} more`);

  if (APPLY && toMove.length) {
    const res = await prisma.budget.updateMany({
      where: { city: { not: "Others" } },
      data: { city: "Others" },
    });
    console.log(`\nMoved ${res.count} budget(s) to Others.`);
  } else {
    console.log(`\n${APPLY ? "Nothing to move." : "Dry run — no changes."}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
