/**
 * One-shot cleanup: soft-delete PitstopEvent rows whose parent Pitstop or
 * Goal is already deleted. The home-page queries now filter these out, but
 * the rows still bloat the DB and would resurface if a future query forgets
 * the filter. This stamps `deletedAt` so they're gone for good.
 *
 * Covers both linkage shapes:
 *   - many-to-many via PitstopEventPitstop
 *   - direct ChecklistItem.pitstopId → PitstopEvent.checklistItemId
 *
 * Usage:
 *   npx tsx scripts/cleanup-orphan-events.ts          # dry-run report
 *   npx tsx scripts/cleanup-orphan-events.ts --apply  # write changes
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

  console.log(`${APPLY ? "APPLY MODE" : "DRY RUN"} — orphan PitstopEvent cleanup\n`);

  // Buckets are not mutually exclusive — an event can be tied to a deleted
  // goal AND a deleted pitstop. Dedupe by id at the end.

  // Bucket 1: event → pitstop (many-to-many) where that pitstop is deleted.
  const viaPitstopLinkDeletedPitstop = await prisma.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT pe.id
    FROM "PitstopEvent" pe
    JOIN "PitstopEventPitstop" pep ON pep."eventId" = pe.id
    JOIN "Pitstop" p ON p.id = pep."pitstopId"
    WHERE pe."deletedAt" IS NULL
      AND p."deletedAt" IS NOT NULL
  `;

  // Bucket 2: event → pitstop (many-to-many) where that pitstop's goal is deleted.
  const viaPitstopLinkDeletedGoal = await prisma.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT pe.id
    FROM "PitstopEvent" pe
    JOIN "PitstopEventPitstop" pep ON pep."eventId" = pe.id
    JOIN "Pitstop" p ON p.id = pep."pitstopId"
    JOIN "Goal" g ON g.id = p."goalId"
    WHERE pe."deletedAt" IS NULL
      AND g."deletedAt" IS NOT NULL
  `;

  // Bucket 3: event → checklistItem → pitstop where that pitstop is deleted.
  const viaChecklistDeletedPitstop = await prisma.$queryRaw<{ id: string }[]>`
    SELECT pe.id
    FROM "PitstopEvent" pe
    JOIN "ChecklistItem" ci ON ci.id = pe."checklistItemId"
    JOIN "Pitstop" p ON p.id = ci."pitstopId"
    WHERE pe."deletedAt" IS NULL
      AND p."deletedAt" IS NOT NULL
  `;

  // Bucket 4: event → checklistItem → pitstop where that pitstop's goal is deleted.
  const viaChecklistDeletedGoal = await prisma.$queryRaw<{ id: string }[]>`
    SELECT pe.id
    FROM "PitstopEvent" pe
    JOIN "ChecklistItem" ci ON ci.id = pe."checklistItemId"
    JOIN "Pitstop" p ON p.id = ci."pitstopId"
    JOIN "Goal" g ON g.id = p."goalId"
    WHERE pe."deletedAt" IS NULL
      AND g."deletedAt" IS NOT NULL
  `;

  // Bucket 5: event has zero live pitstop linkages AND zero live checklist
  // linkage. Catches truly orphaned events (e.g. their only m2m link was
  // hard-deleted, or the checklist item was hard-deleted).
  const trulyOrphan = await prisma.$queryRaw<{ id: string }[]>`
    SELECT pe.id
    FROM "PitstopEvent" pe
    WHERE pe."deletedAt" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "PitstopEventPitstop" pep
        JOIN "Pitstop" p ON p.id = pep."pitstopId"
        JOIN "Goal" g ON g.id = p."goalId"
        WHERE pep."eventId" = pe.id
          AND p."deletedAt" IS NULL
          AND g."deletedAt" IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM "ChecklistItem" ci
        JOIN "Pitstop" p ON p.id = ci."pitstopId"
        JOIN "Goal" g ON g.id = p."goalId"
        WHERE ci.id = pe."checklistItemId"
          AND p."deletedAt" IS NULL
          AND g."deletedAt" IS NULL
      )
  `;

  const ids = new Set<string>();
  for (const r of viaPitstopLinkDeletedPitstop) ids.add(r.id);
  for (const r of viaPitstopLinkDeletedGoal)    ids.add(r.id);
  for (const r of viaChecklistDeletedPitstop)   ids.add(r.id);
  for (const r of viaChecklistDeletedGoal)      ids.add(r.id);
  for (const r of trulyOrphan)                  ids.add(r.id);

  console.log(`Bucket counts (overlap allowed):`);
  console.log(`  via pitstop-link → deleted pitstop  : ${viaPitstopLinkDeletedPitstop.length}`);
  console.log(`  via pitstop-link → deleted goal     : ${viaPitstopLinkDeletedGoal.length}`);
  console.log(`  via checklist   → deleted pitstop   : ${viaChecklistDeletedPitstop.length}`);
  console.log(`  via checklist   → deleted goal      : ${viaChecklistDeletedGoal.length}`);
  console.log(`  zero live linkage (truly orphan)    : ${trulyOrphan.length}`);
  console.log(`\nUnique events to soft-delete: ${ids.size}\n`);

  if (ids.size === 0) {
    console.log("Nothing to do.");
    await pool.end();
    return;
  }

  if (!APPLY) {
    console.log("Dry run — pass --apply to write.");
    await pool.end();
    return;
  }

  const now = new Date();
  const result = await prisma.pitstopEvent.updateMany({
    where: { id: { in: [...ids] }, deletedAt: null },
    data: { deletedAt: now },
  });
  console.log(`Soft-deleted ${result.count} event${result.count === 1 ? "" : "s"}.`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
