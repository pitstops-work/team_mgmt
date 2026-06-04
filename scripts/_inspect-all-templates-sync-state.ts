/**
 * Read-only sweep: for every active GoalTemplateDef, run previewSync and
 * report any goals with pending changes (specifically pending scheduledAt
 * edits — the staleness pattern caught on Bheemankuppe creche 2026-06-04).
 *
 * Usage: npx tsx scripts/_inspect-all-templates-sync-state.ts
 *
 * Output columns per template:
 *   slug | goals total | goals with changes | total changes | scheduledAt edits | targetDate edits | other edits | adds | removes | blocked
 *
 * Then a per-goal breakdown for any goal with non-zero scheduledAt edits so
 * you can spot which ones need a re-apply.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const { previewSync } = await import("../lib/templateSync");

  const templates = await prisma.goalTemplateDef.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true, category: true },
    orderBy: { slug: "asc" },
  });

  console.log(`Found ${templates.length} active templates.\n`);

  type Row = {
    slug: string;
    name: string;
    totalGoals: number;
    goalsWithChanges: number;
    totalChanges: number;
    scheduledAtEdits: number;
    targetDateEdits: number;
    startDateEdits: number;
    otherPitstopEdits: number;
    goalTargetEdits: number;
    checklistEdits: number;
    otherActivityEdits: number;
    adds: number;
    removes: number;
    blocked: number;
    goalsWithStaleSchedule: { id: string; title: string; scheduledAtEdits: number }[];
  };

  const rows: Row[] = [];

  for (const tpl of templates) {
    try {
      const preview = await previewSync(tpl.id);
      if (!preview) {
        console.log(`!! ${tpl.slug} — preview returned null`);
        continue;
      }
      const row: Row = {
        slug: tpl.slug,
        name: tpl.name,
        totalGoals: preview.totalGoals,
        goalsWithChanges: preview.goalsWithChanges,
        totalChanges: preview.totalChanges,
        scheduledAtEdits: 0,
        targetDateEdits: 0,
        startDateEdits: 0,
        otherPitstopEdits: 0,
        goalTargetEdits: 0,
        checklistEdits: 0,
        otherActivityEdits: 0,
        adds: 0,
        removes: 0,
        blocked: 0,
        goalsWithStaleSchedule: [],
      };
      for (const g of preview.goals) {
        if (g.changes.length === 0) continue;
        let scheduledAtCountForGoal = 0;
        for (const c of g.changes) {
          if (c.blocked) row.blocked++;
          if (c.kind === "add") row.adds++;
          else if (c.kind === "remove") row.removes++;
          else if (c.kind === "edit") {
            if (c.entity === "activity" && c.field === "scheduledAt") {
              row.scheduledAtEdits++;
              scheduledAtCountForGoal++;
            } else if (c.entity === "activity") {
              row.otherActivityEdits++;
            } else if (c.entity === "pitstop" && c.field === "targetDate") {
              row.targetDateEdits++;
            } else if (c.entity === "pitstop" && c.field === "startDate") {
              row.startDateEdits++;
            } else if (c.entity === "pitstop") {
              row.otherPitstopEdits++;
            } else if (c.entity === "goal") {
              row.goalTargetEdits++;
            } else if (c.entity === "checklistItem") {
              row.checklistEdits++;
            }
          }
        }
        if (scheduledAtCountForGoal > 0) {
          row.goalsWithStaleSchedule.push({
            id: g.goalId,
            title: g.goalTitle,
            scheduledAtEdits: scheduledAtCountForGoal,
          });
        }
      }
      rows.push(row);
      console.log(
        `${tpl.slug.padEnd(40)} ` +
        `goals=${String(row.totalGoals).padStart(3)} ` +
        `withChanges=${String(row.goalsWithChanges).padStart(3)} ` +
        `total=${String(row.totalChanges).padStart(4)} ` +
        `schedAt=${String(row.scheduledAtEdits).padStart(4)} ` +
        `pitTarget=${String(row.targetDateEdits).padStart(3)} ` +
        `pitStart=${String(row.startDateEdits).padStart(3)} ` +
        `goalTarget=${String(row.goalTargetEdits).padStart(3)} ` +
        `checklist=${String(row.checklistEdits).padStart(3)} ` +
        `otherAct=${String(row.otherActivityEdits).padStart(3)} ` +
        `adds=${String(row.adds).padStart(3)} ` +
        `removes=${String(row.removes).padStart(3)} ` +
        `blocked=${String(row.blocked).padStart(3)}`
      );
    } catch (e: unknown) {
      console.error(`!! ${tpl.slug} — preview failed:`, (e as Error).message);
    }
  }

  // Per-template breakdown of which goals have stale scheduledAt
  const flagged = rows.filter((r) => r.scheduledAtEdits > 0);
  if (flagged.length > 0) {
    console.log(`\n=== Templates with stale activity scheduledAt (${flagged.length}) ===`);
    for (const r of flagged) {
      console.log(`\n● ${r.slug} (${r.name}) — ${r.scheduledAtEdits} stale events across ${r.goalsWithStaleSchedule.length} goals`);
      for (const g of r.goalsWithStaleSchedule.slice(0, 20)) {
        console.log(`    ${g.scheduledAtEdits.toString().padStart(3)}× ${g.title} (${g.id})`);
      }
      if (r.goalsWithStaleSchedule.length > 20) {
        console.log(`    … and ${r.goalsWithStaleSchedule.length - 20} more`);
      }
    }
  } else {
    console.log(`\nNo templates have stale scheduledAt edits. Sync is fully applied across the board.`);
  }

  // Summary list of templates that need a re-sync of any kind
  const dirty = rows.filter((r) => r.totalChanges > 0);
  if (dirty.length > 0) {
    console.log(`\n=== Templates with ANY pending changes (${dirty.length}) ===`);
    for (const r of dirty) {
      console.log(`  ${r.slug.padEnd(40)} ${r.totalChanges} pending change(s) across ${r.goalsWithChanges} goal(s)`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
