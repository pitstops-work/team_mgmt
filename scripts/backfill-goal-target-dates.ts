/**
 * For every active goal, set goal.targetDate = max(pitstop.targetDate)
 * across non-deleted pitstops, but ONLY when the max exceeds the current
 * goal.targetDate. Fixes existing-template goals whose recurring pitstops
 * cycled before the matching forward-extension fix landed in
 * app/api/pitstops/[pitstopId]/route.ts.
 *
 * Usage:
 *   npx tsx scripts/backfill-goal-target-dates.ts          # dry run
 *   npx tsx scripts/backfill-goal-target-dates.ts --apply  # write changes
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");

async function main() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as never);
  const prisma = new PrismaClient({ adapter } as never);

  const rows = await prisma.$queryRaw<Array<{
    goalId: string;
    goalTitle: string;
    currentTarget: Date | null;
    maxPitstopTarget: Date | null;
  }>>`
    SELECT
      g.id            AS "goalId",
      g.title         AS "goalTitle",
      g."targetDate"  AS "currentTarget",
      MAX(p."targetDate") AS "maxPitstopTarget"
    FROM "Goal" g
    JOIN "Pitstop" p ON p."goalId" = g.id AND p."deletedAt" IS NULL
    WHERE g."deletedAt" IS NULL
    GROUP BY g.id, g.title, g."targetDate"
    HAVING MAX(p."targetDate") IS NOT NULL
       AND (g."targetDate" IS NULL OR MAX(p."targetDate") > g."targetDate")
    ORDER BY MAX(p."targetDate") - COALESCE(g."targetDate", 'epoch'::timestamp) DESC
  `;

  console.log(`${rows.length} goals need their targetDate extended.\n`);
  for (const r of rows) {
    const fromStr = r.currentTarget ? r.currentTarget.toISOString().slice(0, 10) : "—";
    const toStr = r.maxPitstopTarget!.toISOString().slice(0, 10);
    console.log(`  ${r.goalId}  ${fromStr} → ${toStr}  ${r.goalTitle}`);
  }
  if (rows.length === 0) {
    console.log("Nothing to do.");
    await pool.end();
    return;
  }

  if (!APPLY) {
    console.log("\nDry run — pass --apply to write changes.");
    await pool.end();
    return;
  }

  console.log("\nApplying…");
  for (const r of rows) {
    await prisma.goal.update({
      where: { id: r.goalId },
      data: { targetDate: r.maxPitstopTarget! },
    });
  }
  console.log(`Done. Updated ${rows.length} goals.`);
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
