/**
 * Backfill: re-snap existing Upcoming recurring-clone pitstops onto the
 * day-of-week of their ROOT (oldest) sibling in the same templateSlug+templateKey
 * group on the same goal. Cleans up data from before the DOW-preservation fix
 * in lib/recurringPitstop.ts.
 *
 * Why "root" not "previous": cloneRecurringPitstopOnDone runs on transition to
 * Done, so the chain order is deterministic by createdAt. The earliest instance
 * (the one created by template-apply) sets the intended DOW; every subsequent
 * clone should land on the same DOW within its month/week/quarter slot.
 *
 * Activities cascade: when a pitstop date shifts here, every non-Done activity
 * on it also shifts by the same day delta (preserves time-of-day). Mirrors the
 * reschedule-visit endpoint behaviour.
 *
 * Skips:
 *   - pitstops whose templateSlug+templateKey group has no anchor (no clone, nothing to align)
 *   - Done / Cancelled pitstops (historical record)
 *   - Pitstops already on the right DOW (no-op)
 *
 * Run:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/backfill-recurring-clone-dow.ts           # dry-run
 *   npx tsx scripts/backfill-recurring-clone-dow.ts --apply   # commit
 */

import prisma from "../lib/prisma";

const apply = process.argv.includes("--apply");

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function snapToSameDow(date: Date, dow: number): Date {
  const cur = date.getUTCDay();
  if (cur === dow) return date;
  const forward = (dow - cur + 7) % 7;
  const backward = (cur - dow + 7) % 7;
  const shift = backward < forward ? -backward : forward;
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + shift);
  return d;
}

async function main() {
  // All Upcoming recurring pitstops grouped by (goalId, templateSlug, templateKey),
  // with the EARLIEST createdAt in each group as the anchor.
  const groups = await prisma.$queryRaw<{
    goalId: string; templateSlug: string; templateKey: string;
    anchorId: string; anchorStartDate: Date; anchorCreatedAt: Date;
  }[]>`
    SELECT DISTINCT ON (p."goalId", p."templateSlug", p."templateKey")
      p."goalId", p."templateSlug", p."templateKey",
      p.id AS "anchorId", p."startDate" AS "anchorStartDate", p."createdAt" AS "anchorCreatedAt"
    FROM "Pitstop" p
    WHERE p."templateSlug" IS NOT NULL
      AND p."templateKey" IS NOT NULL
      AND p."deletedAt" IS NULL
      AND p."recurrence" != 'None'::"PitstopRecurrence"
      AND p."startDate" IS NOT NULL
    ORDER BY p."goalId", p."templateSlug", p."templateKey", p."createdAt" ASC
  `;

  let totalShifted = 0;
  let totalActivitiesShifted = 0;
  const plan: { id: string; oldStart: Date; newStart: Date; deltaDays: number; goalId: string; title: string }[] = [];

  for (const g of groups) {
    const anchorDow = g.anchorStartDate.getUTCDay();
    if (anchorDow < 1 || anchorDow > 5) continue; // anchor is weekend — skip

    // Find all Upcoming clones in this group (excluding the anchor itself)
    const clones = await prisma.$queryRaw<{
      id: string; title: string; startDate: Date | null; targetDate: Date | null;
    }[]>`
      SELECT id, title, "startDate", "targetDate"
      FROM "Pitstop"
      WHERE "goalId" = ${g.goalId}
        AND "templateSlug" = ${g.templateSlug}
        AND "templateKey" = ${g.templateKey}
        AND "deletedAt" IS NULL
        AND status = 'Upcoming'::"PitstopStatus"
        AND id != ${g.anchorId}
        AND "startDate" IS NOT NULL
    `;

    for (const c of clones) {
      if (!c.startDate) continue;
      const newStart = snapToSameDow(c.startDate, anchorDow);
      const deltaDays = Math.round((newStart.getTime() - c.startDate.getTime()) / 86_400_000);
      if (deltaDays === 0) continue;
      plan.push({ id: c.id, oldStart: c.startDate, newStart, deltaDays, goalId: g.goalId, title: c.title });
    }
  }

  console.log(`\n${plan.length} Upcoming clone pitstop(s) need re-snapping to parent DOW.\n`);
  for (const p of plan) {
    console.log(`  ${p.id}  "${p.title}"`);
    console.log(`    ${p.oldStart.toISOString().slice(0,10)} (${DOW[p.oldStart.getUTCDay()]})  →  ${p.newStart.toISOString().slice(0,10)} (${DOW[p.newStart.getUTCDay()]})  (shift ${p.deltaDays >= 0 ? "+" : ""}${p.deltaDays}d)`);
  }
  console.log();

  if (!apply) {
    console.log("Dry-run only. Pass --apply to commit.");
    return;
  }

  for (const p of plan) {
    const deltaMs = p.deltaDays * 86_400_000;
    // Shift pitstop start + target by same delta (preserves window length)
    const oldTarget = (await prisma.pitstop.findUnique({ where: { id: p.id }, select: { targetDate: true } }))?.targetDate;
    const newTarget = oldTarget ? new Date(oldTarget.getTime() + deltaMs) : null;
    await prisma.pitstop.update({
      where: { id: p.id },
      data: {
        startDate: p.newStart,
        ...(newTarget ? { targetDate: newTarget } : {}),
      },
    });
    totalShifted++;

    // Cascade to non-Done activities on this pitstop's events
    const events = await prisma.$queryRaw<{ id: string; scheduledAt: Date | null }[]>`
      SELECT pe.id, pe."scheduledAt"
      FROM "PitstopEvent" pe
      JOIN "PitstopEventPitstop" pep ON pep."eventId" = pe.id
      WHERE pep."pitstopId" = ${p.id}
        AND pe."deletedAt" IS NULL
        AND pe.status NOT IN ('Done', 'Cancelled')
    `;
    for (const ev of events) {
      if (!ev.scheduledAt) continue;
      const newSched = new Date(ev.scheduledAt.getTime() + deltaMs);
      await prisma.$executeRaw`
        UPDATE "PitstopEvent" SET "scheduledAt" = ${newSched}, "updatedAt" = NOW() WHERE id = ${ev.id}
      `;
      totalActivitiesShifted++;
    }
  }

  console.log(`Done. ${totalShifted} pitstop(s) shifted, ${totalActivitiesShifted} activit(ies) cascaded.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
