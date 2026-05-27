/**
 * Trim surplus pitstop instances created by the old repeatCount:12 template
 * misconfig on -existing/monthly templates. For each monthly group (instances
 * sharing a base title "... (Month N)"), keep the earliest instance (rename to
 * base title), soft-delete the rest, cancel their auto-created PitstopEvents,
 * and recompute the goal targetDate to the remaining max. One-time pitstops and
 * any surplus instance with real progress are left untouched.
 *
 *   npx tsx scripts/trim-repeatcount-surplus.ts          # dry run
 *   npx tsx scripts/trim-repeatcount-surplus.ts --apply  # write
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const ACTOR = "cmnlqtlnu000004js9km2w1i7"; // kotlerster@gmail.com (super-admin)
const SLUGS = ["creche-program-existing", "food-distribution-monthly"];
const baseTitle = (t: string) => t.replace(/\s*\(Month \d+\)\s*$/, "").trim();
const monthNum = (t: string) => { const m = t.match(/\(Month (\d+)\)\s*$/); return m ? +m[1] : 0; };
const d = (x: any) => (x ? new Date(x).toISOString().slice(0, 10) : "-");

async function main() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool as never) } as never);

  let totDel = 0, totRename = 0, totRetarget = 0, totSkipProgress = 0, totEvents = 0;

  for (const slug of SLUGS) {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT p.id, p."goalId", g.title AS goal, g."targetDate" AS goal_target, p.title,
             p."targetDate", p."startDate",
        (p.status <> 'Upcoming'
         OR p."completedAt" IS NOT NULL OR p."verifiedById" IS NOT NULL
         OR EXISTS(SELECT 1 FROM "ChecklistItem" ci WHERE ci."pitstopId"=p.id AND (ci.checked OR ci.status IN ('InProgress','Done','Blocked','Rescheduled') OR ci."completedById" IS NOT NULL))
         OR EXISTS(SELECT 1 FROM "PitstopEventPitstop" pep JOIN "PitstopEvent" pe ON pe.id=pep."eventId" WHERE pep."pitstopId"=p.id AND pe."deletedAt" IS NULL AND (pe.status <> 'Scheduled' OR pe."completedAt" IS NOT NULL OR pe."completedById" IS NOT NULL))
         OR EXISTS(SELECT 1 FROM "Attachment" a WHERE a."pitstopId"=p.id)
         OR EXISTS(SELECT 1 FROM "Thread" th JOIN "Message" m ON m."threadId"=th.id WHERE th."pitstopId"=p.id AND th."deletedAt" IS NULL AND m."deletedAt" IS NULL)
        ) AS progress
      FROM "Pitstop" p JOIN "Goal" g ON g.id=p."goalId"
      WHERE p."templateSlug"=${slug} AND p."deletedAt" IS NULL AND g."deletedAt" IS NULL
      ORDER BY g.title, p.title`;

    const byGoal = new Map<string, any[]>();
    for (const r of rows) { if (!byGoal.has(r.goalId)) byGoal.set(r.goalId, []); byGoal.get(r.goalId)!.push(r); }

    console.log(`\n######## ${slug} — ${byGoal.size} goal(s) ########`);
    for (const [goalId, ps] of byGoal) {
      const groups = new Map<string, any[]>();
      for (const p of ps) { const k = baseTitle(p.title); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(p); }

      const deletes: any[] = [], renames: any[] = [], skipped: any[] = [];
      for (const [, grp] of groups) {
        if (grp.length <= 1) continue;
        grp.sort((a, b) => (monthNum(a.title) - monthNum(b.title)) || (+new Date(a.startDate) - +new Date(b.startDate)));
        const keep = grp[0];
        if (/\(Month \d+\)\s*$/.test(keep.title)) renames.push(keep);
        for (const p of grp.slice(1)) (p.progress ? skipped : deletes).push(p);
      }
      if (deletes.length === 0 && renames.length === 0) continue;

      const deleteIds = new Set(deletes.map(x => x.id));
      const remaining = ps.filter(p => !deleteIds.has(p.id));
      const newTarget = remaining.reduce((mx, p) => p.targetDate && new Date(p.targetDate) > mx ? new Date(p.targetDate) : mx, new Date(0));
      const curTarget = ps[0].goal_target ? new Date(ps[0].goal_target) : null;
      const retarget = newTarget.getTime() > 0 && (!curTarget || newTarget.getTime() !== curTarget.getTime());

      console.log(`\n  ${ps[0].goal}`);
      console.log(`    delete ${deletes.length}, rename ${renames.length}${skipped.length ? `, SKIP(progress) ${skipped.length}` : ""}`);
      console.log(`    goal target ${d(curTarget)} -> ${retarget ? d(newTarget) : "(unchanged)"}`);
      for (const r of renames) console.log(`    rename: "${r.title}" -> "${baseTitle(r.title)}"`);
      for (const s of skipped) console.log(`    KEEP(progress): "${s.title}"`);

      totDel += deletes.length; totRename += renames.length; totSkipProgress += skipped.length; if (retarget) totRetarget++;

      if (APPLY) {
        for (const del of deletes) {
          await prisma.$executeRaw`UPDATE "Pitstop" SET "deletedAt"=NOW() WHERE id=${del.id}`;
          const ev = await prisma.$executeRaw`
            UPDATE "PitstopEvent" SET status='Cancelled'::"PitstopEventStatus",
              "cancellationReason"='Removed: surplus repeatCount instance (trim 2026-05-27)', "updatedAt"=NOW()
            WHERE "deletedAt" IS NULL AND status <> 'Cancelled'
              AND (id IN (SELECT "eventId" FROM "PitstopEventPitstop" WHERE "pitstopId"=${del.id})
                   OR "checklistItemId" IN (SELECT id FROM "ChecklistItem" WHERE "pitstopId"=${del.id}))`;
          totEvents += Number(ev);
          await prisma.auditLog.create({ data: { entityType: "Pitstop", entityId: del.id, userId: ACTOR, action: "deleted", field: "deletedAt", oldValue: null, newValue: "trim surplus repeatCount instance" } });
        }
        for (const r of renames) {
          await prisma.$executeRaw`UPDATE "Pitstop" SET title=${baseTitle(r.title)} WHERE id=${r.id}`;
          await prisma.auditLog.create({ data: { entityType: "Pitstop", entityId: r.id, userId: ACTOR, action: "title_change", field: "title", oldValue: r.title, newValue: baseTitle(r.title) } });
        }
        if (retarget) {
          await prisma.$executeRaw`UPDATE "Goal" SET "targetDate"=${newTarget} WHERE id=${goalId}`;
          await prisma.auditLog.create({ data: { entityType: "Goal", entityId: goalId, userId: ACTOR, action: "targetDate_change", field: "targetDate", oldValue: curTarget?.toISOString() ?? null, newValue: newTarget.toISOString() } });
        }
      }
    }
  }
  console.log(`\n==== ${APPLY ? "APPLIED" : "DRY RUN"} ====`);
  console.log(`pitstops soft-deleted: ${totDel}`);
  console.log(`events cancelled:      ${APPLY ? totEvents : "(computed on apply)"}`);
  console.log(`pitstops renamed:      ${totRename}`);
  console.log(`goals retargeted:      ${totRetarget}`);
  console.log(`surplus kept (progress): ${totSkipProgress}`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
