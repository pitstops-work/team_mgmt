/**
 * Shift every scheduled date that currently lands on Sat/Sun to the next
 * Monday across Goal, Pitstop, and PitstopEvent rows. Mirrors the
 * snapToWeekday() rule the server now enforces for new derived dates.
 *
 * Only touches scheduled/target dates. Historical timestamps
 * (completedAt, verifiedAt, rescheduledFrom, createdAt, updatedAt) are
 * preserved as-is — moving them would falsify the audit trail.
 *
 * Usage:
 *   npx tsx scripts/backfill-weekday-dates.ts          # dry run, shows counts
 *   npx tsx scripts/backfill-weekday-dates.ts --apply  # write changes
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");

// Postgres EXTRACT(DOW FROM ts):  0=Sun, 1=Mon … 6=Sat
const SAT = 6;
const SUN = 0;

type Target = {
  table: string;
  column: string;
  whereExtra?: string; // optional WHERE additions (e.g. exclude soft-deleted)
};

const TARGETS: Target[] = [
  { table: "Goal",         column: "startDate",   whereExtra: `"deletedAt" IS NULL` },
  { table: "Goal",         column: "targetDate",  whereExtra: `"deletedAt" IS NULL` },
  { table: "Pitstop",      column: "startDate",   whereExtra: `"deletedAt" IS NULL` },
  { table: "Pitstop",      column: "targetDate",  whereExtra: `"deletedAt" IS NULL` },
  { table: "PitstopEvent", column: "scheduledAt", whereExtra: `"deletedAt" IS NULL` },
  { table: "PitstopEvent", column: "endsAt",      whereExtra: `"deletedAt" IS NULL` },
];

async function main() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as never);
  const prisma = new PrismaClient({ adapter } as never);

  console.log(`${APPLY ? "APPLY MODE" : "DRY RUN"} — snap Sat/Sun to Mon\n`);

  let totalSat = 0;
  let totalSun = 0;

  for (const t of TARGETS) {
    const where = `"${t.column}" IS NOT NULL${t.whereExtra ? ` AND ${t.whereExtra}` : ""}`;

    const [sat] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*)::bigint AS n FROM "${t.table}" WHERE EXTRACT(DOW FROM "${t.column}") = ${SAT} AND ${where}`,
    );
    const [sun] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*)::bigint AS n FROM "${t.table}" WHERE EXTRACT(DOW FROM "${t.column}") = ${SUN} AND ${where}`,
    );
    const satN = Number(sat.n);
    const sunN = Number(sun.n);
    totalSat += satN;
    totalSun += sunN;

    console.log(`  ${t.table}.${t.column.padEnd(11)}  Sat: ${String(satN).padStart(5)}   Sun: ${String(sunN).padStart(5)}`);

    if (APPLY) {
      if (satN > 0) {
        await prisma.$executeRawUnsafe(
          `UPDATE "${t.table}" SET "${t.column}" = "${t.column}" + interval '2 days' WHERE EXTRACT(DOW FROM "${t.column}") = ${SAT} AND ${where}`,
        );
      }
      if (sunN > 0) {
        await prisma.$executeRawUnsafe(
          `UPDATE "${t.table}" SET "${t.column}" = "${t.column}" + interval '1 day' WHERE EXTRACT(DOW FROM "${t.column}") = ${SUN} AND ${where}`,
        );
      }
    }
  }

  console.log(`\nTotal: ${totalSat} Sat values, ${totalSun} Sun values (${totalSat + totalSun} rows affected).`);
  if (!APPLY) console.log("\nDry run — pass --apply to write changes.");
  else        console.log("\nDone.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
