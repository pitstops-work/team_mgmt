/**
 * One-shot heal: detect goals where the buggy ms-delta cascade left
 * incomplete pitstops starting BEFORE the goal's startDate. For each such
 * goal, shift every incomplete pitstop (and its Scheduled activities) forward
 * by exactly the offset needed to make the earliest pitstop start on/after
 * the goal's startDate. Snaps each result to a weekday. Extends goal.targetDate
 * if shifting pushes a pitstop past it (the same invariant the cascade enforces).
 *
 * Skipped: Done/Cancelled pitstops, Done/Cancelled activities — historical
 * work is never moved. Goals whose pitstops already fit are skipped.
 *
 * Usage:
 *   npx tsx scripts/heal-cascade-drift.ts          # dry-run report
 *   npx tsx scripts/heal-cascade-drift.ts --apply  # write changes
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");

function dayDeltaUTC(from: Date, to: Date): number {
  const fromMid = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toMid   = Date.UTC(to.getUTCFullYear(),   to.getUTCMonth(),   to.getUTCDate());
  return Math.round((toMid - fromMid) / 86400000);
}
function addDaysUTC(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
function snapToWeekday(date: Date): Date {
  const d = new Date(date);
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2);
  else if (dow === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}
function fmt(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

async function main() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as never);
  const prisma = new PrismaClient({ adapter } as never);

  console.log(`${APPLY ? "APPLY MODE" : "DRY RUN"} — heal cascade drift\n`);

  // Find goals where an incomplete pitstop starts before the goal's startDate.
  const candidates = await prisma.$queryRaw<{
    goalId: string;
    goalTitle: string;
    goalStart: Date;
    goalTarget: Date | null;
    earliestPitstopStart: Date;
  }[]>`
    SELECT
      g.id            AS "goalId",
      g.title         AS "goalTitle",
      g."startDate"   AS "goalStart",
      g."targetDate"  AS "goalTarget",
      MIN(p."startDate") AS "earliestPitstopStart"
    FROM "Goal" g
    JOIN "Pitstop" p ON p."goalId" = g.id
    WHERE g."deletedAt" IS NULL
      AND g."startDate" IS NOT NULL
      AND p."deletedAt" IS NULL
      AND p."status" != 'Done'
      AND p."startDate" IS NOT NULL
    GROUP BY g.id, g.title, g."startDate", g."targetDate"
    HAVING MIN(p."startDate") < g."startDate"
    ORDER BY g."startDate" DESC
  `;

  if (candidates.length === 0) {
    console.log("No goals need healing — every incomplete pitstop starts on/after its goal's start date.");
    await pool.end();
    return;
  }

  console.log(`${candidates.length} goal${candidates.length === 1 ? "" : "s"} need healing.\n`);

  let totalPitstopsShifted = 0;
  let totalActivitiesShifted = 0;
  let totalGoalTargetsExtended = 0;

  let skippedZeroShift = 0;
  for (const g of candidates) {
    const shiftDays = dayDeltaUTC(g.earliestPitstopStart, g.goalStart);
    if (shiftDays <= 0) {
      // Spurious match: earliest pitstop is before goal start in raw ms but same
      // UTC day (just an earlier time-of-day). Nothing to shift.
      skippedZeroShift += 1;
      continue;
    }
    console.log(`  ${g.goalId}  ${g.goalTitle.slice(0, 60)}`);
    console.log(`    goal start = ${fmt(g.goalStart)}, earliest pitstop = ${fmt(g.earliestPitstopStart)}  → shift +${shiftDays} day${shiftDays === 1 ? "" : "s"}`);

    // Pull incomplete pitstops for this goal
    const pitstops = await prisma.pitstop.findMany({
      where: { goalId: g.goalId, deletedAt: null, status: { not: "Done" } },
      select: { id: true, startDate: true, targetDate: true },
    });
    const pitstopIds = pitstops.map(p => p.id);

    const events = pitstopIds.length > 0
      ? await prisma.pitstopEvent.findMany({
          where: {
            deletedAt: null,
            status: "Scheduled",
            OR: [
              { pitstops: { some: { pitstopId: { in: pitstopIds } } } },
              { checklistItem: { pitstopId: { in: pitstopIds } } },
            ],
          },
          select: { id: true, scheduledAt: true, endsAt: true },
        })
      : [];

    // Compute new max pitstop target to decide whether to extend goal.targetDate
    let newMaxPitstopTarget: Date | null = null;
    for (const p of pitstops) {
      const t = p.targetDate ? snapToWeekday(addDaysUTC(p.targetDate, shiftDays)) : null;
      if (t && (!newMaxPitstopTarget || t > newMaxPitstopTarget)) newMaxPitstopTarget = t;
    }
    const needsGoalTargetExtend = newMaxPitstopTarget && (!g.goalTarget || newMaxPitstopTarget > g.goalTarget);
    const newGoalTarget = needsGoalTargetExtend ? newMaxPitstopTarget! : g.goalTarget;

    console.log(`    will shift ${pitstops.length} pitstop${pitstops.length === 1 ? "" : "s"} + ${events.length} activit${events.length === 1 ? "y" : "ies"}` + (needsGoalTargetExtend ? `, extend goal target ${fmt(g.goalTarget)} → ${fmt(newGoalTarget)}` : ""));

    if (APPLY) {
      // Interactive transaction form — needed to bump the timeout past the
      // 5s default (some goals have 80+ activities so the batch can take
      // longer over a remote Neon connection).
      await prisma.$transaction(async (tx) => {
        for (const p of pitstops) {
          await tx.pitstop.update({
            where: { id: p.id },
            data: {
              startDate:  p.startDate  ? snapToWeekday(addDaysUTC(p.startDate,  shiftDays)) : undefined,
              targetDate: p.targetDate ? snapToWeekday(addDaysUTC(p.targetDate, shiftDays)) : undefined,
            },
          });
        }
        for (const e of events) {
          await tx.pitstopEvent.update({
            where: { id: e.id },
            data: {
              scheduledAt: snapToWeekday(addDaysUTC(e.scheduledAt, shiftDays)),
              endsAt: e.endsAt ? snapToWeekday(addDaysUTC(e.endsAt, shiftDays)) : undefined,
            },
          });
        }
        if (needsGoalTargetExtend) {
          await tx.goal.update({ where: { id: g.goalId }, data: { targetDate: newGoalTarget } });
        }
      }, { timeout: 60000, maxWait: 10000 });
    }

    totalPitstopsShifted += pitstops.length;
    totalActivitiesShifted += events.length;
    if (needsGoalTargetExtend) totalGoalTargetsExtended += 1;
  }

  console.log(`\nTotal: ${candidates.length - skippedZeroShift} goals shifted, ${totalPitstopsShifted} pitstops, ${totalActivitiesShifted} activities${totalGoalTargetsExtended > 0 ? `, ${totalGoalTargetsExtended} goal targets extended` : ""}.`);
  if (skippedZeroShift > 0) console.log(`Skipped ${skippedZeroShift} goal${skippedZeroShift === 1 ? "" : "s"} with same-day ms-level drift (nothing to shift).`);
  if (!APPLY) console.log("\nDry run — pass --apply to write changes.");
  else        console.log("\nDone.");
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
