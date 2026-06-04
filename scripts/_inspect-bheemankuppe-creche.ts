/**
 * Read-only diagnostic for the Bheemankuppe creche pitstop reschedule issue.
 * Prints the pitstop's identity columns, every checklist item under it, and
 * every PitstopEvent linked to it, so we can see whether templateKey /
 * templateSlug are populated (= template-sync matchable) on each row.
 *
 * Run: npx tsx scripts/_inspect-bheemankuppe-creche.ts <pitstopId>
 * Default pitstopId is the one from the reschedule log on 2026-06-04.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const DEFAULT_PITSTOP_ID = "cmpxwn2x3000204ifzqffn61j";

async function main() {
  // Dynamic import so DATABASE_URL is set before the Prisma adapter is built.
  const { default: prisma } = await import("../lib/prisma");
  const pitstopId = process.argv[2] ?? DEFAULT_PITSTOP_ID;

  const pitstop = await prisma.pitstop.findUnique({
    where: { id: pitstopId },
    select: {
      id: true, title: true,
      templateSlug: true, templateKey: true,
      startDate: true, targetDate: true,
      goalId: true,
      goal: { select: { id: true, title: true, targetDate: true, startDate: true } },
    },
  });
  if (!pitstop) {
    console.log("No pitstop found with id", pitstopId);
    return;
  }

  console.log("\n=== Pitstop ===");
  console.log(JSON.stringify({
    id: pitstop.id,
    title: pitstop.title,
    templateSlug: pitstop.templateSlug,
    templateKey: pitstop.templateKey,
    startDate: pitstop.startDate?.toISOString() ?? null,
    targetDate: pitstop.targetDate?.toISOString() ?? null,
  }, null, 2));

  console.log("\n=== Goal ===");
  console.log(JSON.stringify({
    id: pitstop.goal?.id,
    title: pitstop.goal?.title,
    startDate: pitstop.goal?.startDate?.toISOString() ?? null,
    targetDate: pitstop.goal?.targetDate?.toISOString() ?? null,
  }, null, 2));

  const checklistItems = await prisma.checklistItem.findMany({
    where: { pitstopId },
    select: { id: true, text: true, key: true, templateSlug: true, status: true, completionType: true, order: true },
    orderBy: { order: "asc" },
  });
  console.log(`\n=== ChecklistItems (${checklistItems.length}) ===`);
  for (const ci of checklistItems) {
    console.log(JSON.stringify({
      id: ci.id,
      text: ci.text,
      key: ci.key,                 // <- null = sync diffActivities can't match
      templateSlug: ci.templateSlug,
      status: ci.status,
      completionType: ci.completionType,
    }));
  }

  // PitstopEvents under this pitstop (via the join table)
  const events = await prisma.$queryRaw<{
    id: string; title: string; templateKey: string | null;
    status: string; scheduledAt: Date | null; checklistItemId: string | null;
  }[]>`
    SELECT pe.id, pe.title, pe."templateKey",
           pe.status::text AS status,
           pe."scheduledAt", pe."checklistItemId"
    FROM "PitstopEvent" pe
    JOIN "PitstopEventPitstop" pep ON pep."eventId" = pe.id
    WHERE pep."pitstopId" = ${pitstopId}
      AND pe."deletedAt" IS NULL
    ORDER BY pe."scheduledAt" NULLS LAST
  `;
  console.log(`\n=== PitstopEvents (${events.length}) ===`);
  for (const ev of events) {
    console.log(JSON.stringify({
      id: ev.id,
      title: ev.title,
      templateKey: ev.templateKey,    // <- null = sync diffActivities can't match
      status: ev.status,
      scheduledAt: ev.scheduledAt?.toISOString() ?? null,
      checklistItemId: ev.checklistItemId,
    }));
  }

  // If the pitstop has a templateSlug, show what the live template thinks the
  // activity layout should be for comparison.
  if (pitstop.templateSlug) {
    const tpl = await prisma.goalTemplateDef.findUnique({
      where: { slug: pitstop.templateSlug },
      select: { slug: true, name: true, pitstops: true },
    });
    if (tpl) {
      const pitstops = tpl.pitstops as Array<{
        title: string; key?: string; slaDays?: number; startSlaDays?: number;
        checklist: Array<{ text: string; key?: string; activities?: Array<{ title: string; key?: string; dayOffset?: number }> }>;
      }>;
      const tplPt = pitstop.templateKey
        ? pitstops.find(p => (p.key ?? "") === pitstop.templateKey)
        : pitstops.find(p => p.title === pitstop.title);
      console.log(`\n=== Template "${tpl.name}" pitstop slot ===`);
      console.log(JSON.stringify({
        title: tplPt?.title,
        key: tplPt?.key,
        slaDays: tplPt?.slaDays,
        startSlaDays: tplPt?.startSlaDays,
        checklist: tplPt?.checklist.map(ci => ({
          text: ci.text,
          key: ci.key,
          activities: (ci.activities ?? []).map(a => ({
            title: a.title,
            key: a.key,
            dayOffset: a.dayOffset,
            dayOffsetType: typeof a.dayOffset,
          })),
        })),
      }, null, 2));
    }
  }

  // What does the current template-sync diff think should happen for this
  // goal RIGHT NOW? If it shows pending scheduledAt edits, the data is just
  // stale from an earlier sync run with a different template config and we
  // need to re-apply. If it shows nothing, the diff math is wrong.
  if (pitstop.templateSlug) {
    const tplRow = await prisma.goalTemplateDef.findUnique({
      where: { slug: pitstop.templateSlug },
      select: { id: true },
    });
    if (tplRow) {
      const { previewSync } = await import("../lib/templateSync");
      const preview = await previewSync(tplRow.id);
      const plan = preview?.goals.find((g) => g.goalId === pitstop.goalId);
      console.log(`\n=== previewSync plan for this goal ===`);
      if (!plan) {
        console.log("(no plan returned — goal not in preview)");
      } else {
        console.log(`changes: ${plan.changes.length}`);
        for (const c of plan.changes) {
          console.log(JSON.stringify({
            kind: c.kind, entity: c.entity, field: c.field,
            templateKey: c.templateKey, instanceId: c.instanceId,
            description: c.description, oldValue: c.oldValue, newValue: c.newValue,
            blocked: c.blocked, blockedReason: c.blockedReason,
          }));
        }
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
