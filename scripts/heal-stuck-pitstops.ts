/**
 * One-shot heal: find pitstops stuck in InProgress whose checklists are
 * actually all complete, and flip them to Done. Recurring pitstops also get
 * their next occurrence cloned, matching the runtime auto-advance path in
 * lib/autoAdvancePitstop.ts + lib/recurringPitstop.ts.
 *
 * Eligibility: status = 'InProgress', has ≥1 non-Cancelled checklist item,
 * every non-Cancelled item is Done.
 *
 * Usage:
 *   npx tsx scripts/heal-stuck-pitstops.ts                            # dry-run
 *   npx tsx scripts/heal-stuck-pitstops.ts --apply                    # write
 *   npx tsx scripts/heal-stuck-pitstops.ts --apply --skip-recurring   # skip clones
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY          = process.argv.includes("--apply");
const SKIP_RECURRING = process.argv.includes("--skip-recurring");

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

  console.log(`${APPLY ? "APPLY MODE" : "DRY RUN"} — heal stuck pitstops\n`);

  const candidates = await prisma.$queryRaw<{
    pitstopId:   string;
    title:       string;
    goalId:      string;
    goalTitle:   string;
    recurrence:  string;
    targetDate:  Date | null;
    total:       bigint;
    done:        bigint;
  }[]>`
    SELECT
      p.id            AS "pitstopId",
      p.title         AS "title",
      g.id            AS "goalId",
      g.title         AS "goalTitle",
      p.recurrence::text AS "recurrence",
      p."targetDate"  AS "targetDate",
      COUNT(ci.*) FILTER (WHERE ci.status <> 'Cancelled'::"ChecklistItemStatus")::bigint AS total,
      COUNT(ci.*) FILTER (WHERE ci.status = 'Done'::"ChecklistItemStatus")::bigint       AS done
    FROM "Pitstop" p
    JOIN "Goal" g ON g.id = p."goalId"
    LEFT JOIN "ChecklistItem" ci ON ci."pitstopId" = p.id
    WHERE p."deletedAt" IS NULL
      AND p.status = 'InProgress'::"PitstopStatus"
    GROUP BY p.id, p.title, g.id, g.title, p.recurrence, p."targetDate"
    HAVING
      COUNT(ci.*) FILTER (WHERE ci.status <> 'Cancelled'::"ChecklistItemStatus") > 0
      AND COUNT(ci.*) FILTER (
        WHERE ci.status NOT IN ('Done'::"ChecklistItemStatus", 'Cancelled'::"ChecklistItemStatus")
      ) = 0
    ORDER BY g.title, p.title
  `;

  if (candidates.length === 0) {
    console.log("No stuck pitstops — every InProgress pitstop has at least one open checklist item.");
    await pool.end();
    return;
  }

  console.log(`${candidates.length} pitstop${candidates.length === 1 ? "" : "s"} stuck in InProgress with all items Done.\n`);

  let recurringClones = 0;
  let recurringSkipped = 0;
  let flipped = 0;

  for (const c of candidates) {
    const tag = c.recurrence !== "None" ? `  [${c.recurrence}]` : "";
    const skipping = SKIP_RECURRING && c.recurrence !== "None";
    console.log(`  ${c.pitstopId}  ${c.goalTitle.slice(0, 40).padEnd(40)}  ${c.title.slice(0, 50)}${tag}${skipping ? "  (skipped: --skip-recurring)" : ""}`);
    console.log(`    ${Number(c.done)}/${Number(c.total)} items Done, target ${fmt(c.targetDate)}`);

    if (skipping) { recurringSkipped += 1; continue; }
    if (!APPLY) continue;

    await prisma.pitstop.update({
      where: { id: c.pitstopId },
      data: { status: "Done", completedAt: new Date() },
    });
    flipped += 1;

    if (c.recurrence !== "None") {
      const existing = await prisma.pitstop.findUnique({
        where: { id: c.pitstopId },
        select: {
          recurrence: true, startDate: true, targetDate: true, goalId: true,
          title: true, type: true, customType: true, notes: true,
          ownerId: true, ownerInherited: true,
          templateSlug: true, templateKey: true,
        },
      });
      if (!existing || existing.recurrence === "None" || !existing.startDate || !existing.targetDate) continue;

      const DAYS: Record<string, number> = { Weekly: 7, Monthly: 30, Quarterly: 91 };
      const shift = DAYS[existing.recurrence] ?? 0;
      if (shift === 0) continue;

      const rawNewStart  = new Date(existing.startDate);  rawNewStart.setUTCDate(rawNewStart.getUTCDate() + shift);
      const rawNewTarget = new Date(existing.targetDate); rawNewTarget.setUTCDate(rawNewTarget.getUTCDate() + shift);
      const newStart  = snapToWeekday(rawNewStart);
      const newTarget = snapToWeekday(rawNewTarget);

      const sibling = await prisma.pitstop.findFirst({
        where: { goalId: existing.goalId, deletedAt: null },
        orderBy: { order: "desc" },
        select: { order: true },
      });

      const clone = await prisma.pitstop.create({
        data: {
          title: existing.title,
          type: existing.type,
          customType: existing.customType,
          notes: existing.notes,
          ownerId: existing.ownerId,
          ownerInherited: existing.ownerInherited,
          goalId: existing.goalId,
          templateSlug: existing.templateSlug,
          templateKey: existing.templateKey,
          status: "Upcoming",
          recurrence: existing.recurrence,
          startDate: newStart,
          targetDate: newTarget,
          order: (sibling?.order ?? 0) + 1,
        },
      });

      const items = await prisma.checklistItem.findMany({
        where: { pitstopId: c.pitstopId },
        orderBy: { order: "asc" },
      });
      if (items.length > 0) {
        await prisma.checklistItem.createMany({
          data: items.map((item) => ({
            pitstopId: clone.id,
            text: item.text,
            order: item.order,
            checked: false,
            key: item.key,
            templateSlug: item.templateSlug,
            completionType: item.completionType,
          })),
        });
      }

      const parentGoal = await prisma.goal.findUnique({
        where: { id: existing.goalId },
        select: { targetDate: true },
      });
      if (parentGoal && (!parentGoal.targetDate || newTarget > parentGoal.targetDate)) {
        await prisma.goal.update({
          where: { id: existing.goalId },
          data: { targetDate: newTarget },
        });
      }

      recurringClones += 1;
      console.log(`    cloned next ${existing.recurrence.toLowerCase()} instance → ${fmt(newStart)} → ${fmt(newTarget)}`);
    }
  }

  console.log(`\nTotal: ${flipped} pitstop${flipped === 1 ? "" : "s"} flipped to Done${recurringClones > 0 ? `, ${recurringClones} recurring clone${recurringClones === 1 ? "" : "s"} created` : ""}${recurringSkipped > 0 ? `, ${recurringSkipped} recurring skipped` : ""}.`);
  if (!APPLY) console.log("\nDry run — pass --apply to write changes.");
  else        console.log("\nDone.");
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
