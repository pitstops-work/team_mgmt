/**
 * One-shot backfill: walk every existing GoalCoOwner + PitstopCoOwner row
 * and add the co-owner as an attendee on every non-Done event under that
 * scope. Mirrors what the POST /api/goals|pitstops/[id]/co-owners hooks now
 * do at create time — this covers everyone who was already a co-owner
 * before those hooks deployed.
 *
 * Idempotent: reuses backfillEventAttendeeForCoOwner, which skips events
 * where the user is already an attendee.
 *
 * Run with:
 *   $(grep -v '^#' .env.local | xargs) npx tsx scripts/backfill-coowner-attendees.ts
 */

import prisma from "@/lib/prisma";
import { backfillEventAttendeeForCoOwner } from "@/lib/coOwnerBackfill";

async function main() {
  let totalEventsAdded = 0;

  // ── Goal co-owners ─────────────────────────────────────────────────────────
  const goalCoOwners = await prisma.goalCoOwner.findMany({
    where: { goal: { deletedAt: null } },
    select: {
      userId: true, goalId: true,
      user: { select: { name: true } },
      goal: { select: { title: true } },
    },
  });
  console.log(`\n=== Goal co-owners: ${goalCoOwners.length} rows ===`);
  let goalPairsTouched = 0;
  for (const row of goalCoOwners) {
    const added = await backfillEventAttendeeForCoOwner(row.userId, { goalId: row.goalId });
    if (added > 0) {
      goalPairsTouched++;
      totalEventsAdded += added;
      console.log(`  + ${added} events ← ${row.user?.name ?? row.userId} on "${row.goal?.title ?? row.goalId}"`);
    }
  }
  console.log(`Goal pairs that picked up new attendee rows: ${goalPairsTouched}/${goalCoOwners.length}`);

  // ── Pitstop co-owners ──────────────────────────────────────────────────────
  const pitstopCoOwners = await prisma.pitstopCoOwner.findMany({
    where: { pitstop: { deletedAt: null } },
    select: {
      userId: true, pitstopId: true,
      user: { select: { name: true } },
      pitstop: { select: { title: true } },
    },
  });
  console.log(`\n=== Pitstop co-owners: ${pitstopCoOwners.length} rows ===`);
  let pitstopPairsTouched = 0;
  for (const row of pitstopCoOwners) {
    const added = await backfillEventAttendeeForCoOwner(row.userId, { pitstopId: row.pitstopId });
    if (added > 0) {
      pitstopPairsTouched++;
      totalEventsAdded += added;
      console.log(`  + ${added} events ← ${row.user?.name ?? row.userId} on "${row.pitstop?.title ?? row.pitstopId}"`);
    }
  }
  console.log(`Pitstop pairs that picked up new attendee rows: ${pitstopPairsTouched}/${pitstopCoOwners.length}`);

  console.log(`\n=== Total attendee rows added: ${totalEventsAdded} ===`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
