/**
 * Backfill: cancel non-Done events whose parent pitstop is soft-deleted.
 *
 * Background. template-sync's remove path (lib/templateSync.ts) historically
 * soft-deleted the pitstop but did NOT cascade-cancel events. Result: those
 * events linger as orphans — they vanish from the pitstop detail page (which
 * filters by pitstop.deletedAt) but stay visible on the activities-page
 * calendar (which keys off PitstopEventAttendee, not parent pitstop deletion
 * state). User-confusion-causing on 2026-06-04 when Abdul's activities page
 * showed 31 pitstops worth of orphan events while /visits showed only 5.
 *
 * The code fix in lib/templateSync.ts cascades on new removes. This script
 * cleans up pre-existing orphans from prior sync runs.
 *
 * Run:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/backfill-cancel-orphan-events.ts            # dry-run
 *   npx tsx scripts/backfill-cancel-orphan-events.ts --apply    # commit
 */

import prisma from "../lib/prisma";

const apply = process.argv.includes("--apply");

async function main() {
  // Events that are Scheduled / Rescheduled / InProgress and whose ONLY
  // linked pitstops are all soft-deleted. The "only" qualifier matters
  // because PitstopEvent ↔ Pitstop is many-to-many; an event linked to even
  // one alive pitstop is a valid scheduled visit and shouldn't be cancelled.
  const orphans = await prisma.$queryRaw<{
    eventId: string; eventTitle: string; eventStatus: string;
    scheduledAt: Date;
    pitstopCount: bigint; alivePitstops: bigint;
  }[]>`
    SELECT pe.id AS "eventId", pe.title AS "eventTitle",
           pe.status::text AS "eventStatus", pe."scheduledAt",
           COUNT(p.id)::bigint AS "pitstopCount",
           COUNT(p.id) FILTER (WHERE p."deletedAt" IS NULL)::bigint AS "alivePitstops"
    FROM "PitstopEvent" pe
    JOIN "PitstopEventPitstop" pep ON pep."eventId" = pe.id
    JOIN "Pitstop" p ON p.id = pep."pitstopId"
    WHERE pe."deletedAt" IS NULL
      AND pe.status NOT IN ('Done', 'Cancelled')
    GROUP BY pe.id
    HAVING COUNT(p.id) FILTER (WHERE p."deletedAt" IS NULL) = 0
    ORDER BY pe."scheduledAt"
  `;

  console.log(`${orphans.length} orphan active event(s) (parent pitstop soft-deleted).\n`);
  // Quick breakdown by status
  const byStatus = new Map<string, number>();
  for (const o of orphans) byStatus.set(o.eventStatus, (byStatus.get(o.eventStatus) ?? 0) + 1);
  for (const [s, n] of byStatus) console.log(`  ${s}: ${n}`);

  if (orphans.length === 0) { console.log("\nNothing to do."); return; }

  console.log("\nFirst 10:");
  for (const o of orphans.slice(0, 10)) {
    console.log(`  ${o.eventId}  ${o.eventStatus.padEnd(11)} sched=${o.scheduledAt.toISOString().slice(0,10)}  "${o.eventTitle}"`);
  }

  if (!apply) {
    console.log(`\nDry-run. Pass --apply to cancel all ${orphans.length} events.`);
    return;
  }

  console.log("\nCancelling…");
  const ids = orphans.map(o => o.eventId);
  const n = await prisma.$executeRaw`
    UPDATE "PitstopEvent"
    SET status = 'Cancelled'::"PitstopEventStatus",
        "cancellationReason" = 'Parent pitstop soft-deleted (orphan cleanup)',
        "updatedAt" = NOW()
    WHERE id = ANY(${ids})
  `;
  console.log(`Done. ${n} event(s) cancelled.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
