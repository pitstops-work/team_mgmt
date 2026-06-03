/**
 * Backfill: attach the pitstop owner as `accepted` attendee on every active
 * PitstopEvent that currently has zero attendees.
 *
 * Background. Template-sync's add-activity / add-pitstop / add-checklistItem
 * paths historically created PitstopEvents without the goal owner as attendee
 * (the official template-apply route does `attendees: { create: [{ userId:
 * goalOwnerId }] }`; sync forgot). Result: those activities are invisible on
 * every user's Today + activities-page calendars (which key off the
 * `PitstopEventAttendee` join), even though the pitstop detail page renders
 * them fine (it walks the pitstop → events relation).
 *
 * Same-day scan (2026-06-04) found 504 affected active activities across 10
 * RPs (Abdul 151, test1 154, Shrinivas 74, Yuvaraj 53, etc.).
 *
 * Attendee resolution: `pitstop.ownerId ?? goal.ownerId`. Pitstop owner is the
 * person doing the work; goal owner is the fallback when ownerInherited is
 * false and pitstop owner was nulled. Status = "accepted" to match the official
 * template-apply behaviour.
 *
 * Skips:
 *   - Done / Cancelled activities (historical; calendar doesn't need them)
 *   - Events that already have ≥1 attendee (only fixing the silent-zero case)
 *   - Deleted activities / pitstops / goals
 *   - Events with no linked pitstop (orphan; can't infer the right user)
 *   - Events whose resolved owner is null (no one to attach)
 *
 * Run:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/backfill-event-attendee-pitstop-owner.ts            # dry-run
 *   npx tsx scripts/backfill-event-attendee-pitstop-owner.ts --apply    # commit
 */

import prisma from "../lib/prisma";

const apply = process.argv.includes("--apply");

async function main() {
  // For each active, attendee-less PitstopEvent linked to a pitstop, resolve
  // the attendee = pitstop.ownerId ?? goal.ownerId. Done in one SQL pass.
  const rows = await prisma.$queryRaw<{
    eventId: string; eventTitle: string;
    pitstopTitle: string; goalTitle: string;
    pitstopOwnerId: string | null; goalOwnerId: string;
    ownerName: string | null;
  }[]>`
    SELECT pe.id AS "eventId", pe.title AS "eventTitle",
           p.title AS "pitstopTitle", g.title AS "goalTitle",
           p."ownerId" AS "pitstopOwnerId", g."ownerId" AS "goalOwnerId",
           COALESCE(uo.name, ug.name) AS "ownerName"
    FROM "PitstopEvent" pe
    JOIN "PitstopEventPitstop" pep ON pep."eventId" = pe.id
    JOIN "Pitstop" p ON p.id = pep."pitstopId"
    JOIN "Goal"    g ON g.id = p."goalId"
    LEFT JOIN "User" uo ON uo.id = p."ownerId"
    LEFT JOIN "User" ug ON ug.id = g."ownerId"
    LEFT JOIN "PitstopEventAttendee" pea ON pea."eventId" = pe.id
    WHERE pe."deletedAt" IS NULL
      AND p."deletedAt" IS NULL
      AND g."deletedAt" IS NULL
      AND pe.status NOT IN ('Done', 'Cancelled')
      AND pea."eventId" IS NULL
    ORDER BY g.title, p.title, pe."scheduledAt"
  `;

  console.log(`${rows.length} attendee-less active events found.\n`);

  // Group by resolved owner so the output is scannable.
  const byOwner = new Map<string, typeof rows>();
  let noOwnerCount = 0;
  for (const r of rows) {
    const ownerId = r.pitstopOwnerId ?? r.goalOwnerId;
    if (!ownerId) { noOwnerCount++; continue; }
    const arr = byOwner.get(ownerId) ?? [];
    arr.push(r);
    byOwner.set(ownerId, arr);
  }

  for (const [, arr] of byOwner) {
    const name = arr[0].ownerName ?? "(unknown)";
    console.log(`  ${name}: ${arr.length} activities to attach`);
  }
  if (noOwnerCount > 0) {
    console.log(`  (skipped ${noOwnerCount} with no resolvable owner)`);
  }
  console.log();

  if (!apply) {
    console.log("Dry-run only. Pass --apply to commit.");
    return;
  }

  // Single createMany for efficiency, skipDuplicates safe-guards in case the
  // (eventId, userId) unique constraint kicks in for any racing row.
  const data: { eventId: string; userId: string; status: string }[] = [];
  for (const r of rows) {
    const userId = r.pitstopOwnerId ?? r.goalOwnerId;
    if (!userId) continue;
    data.push({ eventId: r.eventId, userId, status: "accepted" });
  }

  console.log(`Inserting ${data.length} PitstopEventAttendee rows…`);
  const result = await prisma.pitstopEventAttendee.createMany({
    data,
    skipDuplicates: true,
  });
  console.log(`Done. ${result.count} rows inserted.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
