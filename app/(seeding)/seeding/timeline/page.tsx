import prisma from "@/lib/prisma";
import { fmtDate, currentWeek as weekNow } from "@/lib/seeding/weeks";
import { rollupStatus } from "@/lib/seeding/rollup";
import TimelineChart, { type TimelineRow } from "./TimelineChart";

/** Aggregate a set of leaf sub-tasks into one row's status/window/progress. */
function agg(subs: { status: TimelineRow["status"]; startWeek: number | null; dueWeek: number | null }[]) {
  const starts = subs.map((s) => s.startWeek).filter((v): v is number => v != null);
  const dues = subs.map((s) => s.dueWeek).filter((v): v is number => v != null);
  return {
    status: rollupStatus(subs),
    start: starts.length ? Math.min(...starts) : null,
    due: dues.length ? Math.max(...dues) : null,
    done: subs.filter((s) => s.status === "done").length,
    total: subs.length,
  };
}

export default async function TimelinePage() {
  const [config, workstreams] = await Promise.all([
    prisma.seedingConfig.findUnique({ where: { id: 1 } }),
    prisma.seedingWorkstream.findMany({
      where: { archivedAt: null },
      orderBy: { sortOrder: "asc" },
      include: {
        phases: { orderBy: { sortOrder: "asc" } },
        tasks: {
          where: { archivedAt: null },
          orderBy: [{ sortOrder: "asc" }, { startWeek: "asc" }],
          include: { subtasks: { orderBy: [{ startWeek: "asc" }, { sortOrder: "asc" }] } },
        },
      },
    }),
  ]);
  const week0 = config?.week0Date ?? new Date("2026-06-22T00:00:00Z");
  const launchWeek = config?.launchWeek ?? 14;

  // Flatten workstream → phase → task → sub-task, rolling status up each level.
  const rows: TimelineRow[] = [];
  for (const w of workstreams) {
    const href = `/seeding/workstream/${w.key}`;
    const wSubs = w.tasks.flatMap((t) => t.subtasks);
    rows.push({ id: w.id, parentId: null, level: 0, code: w.key, label: w.label, color: w.color, href, ...agg(wSubs) });

    const groups: { id: string; label: string; tasks: typeof w.tasks }[] = [
      ...w.phases.map((p) => ({ id: p.id, label: p.label, tasks: w.tasks.filter((t) => t.phaseId === p.id) })),
      { id: `${w.id}:unphased`, label: "Unphased", tasks: w.tasks.filter((t) => !t.phaseId) },
    ].filter((g) => g.tasks.length > 0);

    for (const g of groups) {
      const gSubs = g.tasks.flatMap((t) => t.subtasks);
      rows.push({ id: g.id, parentId: w.id, level: 1, code: null, label: g.label, color: w.color, href, ...agg(gSubs) });

      for (const t of g.tasks) {
        // Task fields are already rollups (recomputeTaskRollup); re-derive so the
        // chart never renders a stale header over fresh sub-tasks.
        const a = t.subtasks.length
          ? agg(t.subtasks)
          : { status: t.status, start: t.startWeek, due: t.dueWeek, done: t.status === "done" ? 1 : 0, total: 0 };
        rows.push({ id: t.id, parentId: g.id, level: 2, code: t.code, label: t.title, color: w.color, href, ...a });

        for (const s of t.subtasks) {
          rows.push({
            id: s.id, parentId: t.id, level: 3, code: s.code, label: s.title, color: w.color, href,
            status: s.status, start: s.startWeek, due: s.dueWeek,
            done: s.status === "done" ? 1 : 0, total: 1,
          });
        }
      }
    }
  }

  const allSubs = rows.filter((r) => r.level === 3);
  const doneSubs = allSubs.filter((r) => r.status === "done").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Timeline</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          Workstream → phase → task → sub-task, each bar coloured by its rolled-up status and filled by sub-tasks done.
          Week 0 = {fmtDate(week0)} · launch W{launchWeek} · {doneSubs}/{allSubs.length} sub-tasks done.
        </p>
      </div>
      <TimelineChart rows={rows} week0ISO={week0.toISOString()} launchWeek={launchWeek} currentWeek={weekNow(week0)} />
    </div>
  );
}
