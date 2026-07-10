import Link from "next/link";
import prisma from "@/lib/prisma";
import { computeTargets, pct, trackBand } from "@/lib/seeding/funnel";
import { currentWeek, daysUntil, fmtDate, weekLabel } from "@/lib/seeding/weeks";
import type { SeedingTaskStatus } from "@/app/generated/prisma/client";
import { STATUS_META } from "./_lib/status";
import { ProgressBar, StatusChip } from "./_components/bits";

const trackColor = { ontrack: "bg-emerald-500", warn: "bg-amber-500", behind: "bg-rose-500" } as const;
const trackText = { ontrack: "text-emerald-600", warn: "text-amber-600", behind: "text-rose-600" } as const;

export default async function SeedingDashboard() {
  const [config, milestones, workstreams, statusRows, funnelConfig, geos, blockers, dueRows] = await Promise.all([
    prisma.seedingConfig.findUnique({ where: { id: 1 } }),
    prisma.seedingMilestone.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.seedingWorkstream.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" } }),
    prisma.seedingTask.groupBy({ by: ["workstreamId", "status"], _count: true }),
    prisma.seedingFunnelConfig.findUnique({ where: { id: 1 } }),
    prisma.seedingGeo.findMany({ orderBy: { sortOrder: "asc" }, include: { funnel: true } }),
    prisma.seedingTask.findMany({ where: { status: "blocked" }, include: { workstream: true }, orderBy: { dueWeek: "asc" } }),
    prisma.seedingTask.findMany({ where: { status: { not: "done" }, dueWeek: { not: null } }, include: { workstream: true } }),
  ]);

  const week0 = config?.week0Date ?? new Date("2026-06-22T00:00:00Z");
  const launchWeek = config?.launchWeek ?? 14;
  const nowWeek = currentWeek(week0);

  // status counts per workstream + overall
  const perWs = new Map<string, Record<string, number>>();
  const overall: Record<SeedingTaskStatus, number> = { not_started: 0, in_progress: 0, blocked: 0, done: 0 };
  for (const r of statusRows) {
    const m = perWs.get(r.workstreamId) ?? {};
    m[r.status] = r._count;
    perWs.set(r.workstreamId, m);
    overall[r.status] += r._count;
  }
  const totalTasks = overall.not_started + overall.in_progress + overall.blocked + overall.done;
  const overallPct = totalTasks ? Math.round((overall.done / totalTasks) * 100) : 0;

  const launch = milestones.find((m) => m.kind === "launch");
  const launchDays = launch ? daysUntil(launch.date) : (launchWeek - nowWeek) * 7;
  const nextMilestone = milestones.find((m) => daysUntil(m.date) >= 0);

  // funnel roll-up (pre-launch stage): reach + leads vs targets
  const targets = funnelConfig ? computeTargets(funnelConfig, geos.length) : null;
  const reachTotal = geos.reduce((s, g) => s + (g.funnel?.reachToDate ?? 0), 0);
  const leadsTotal = geos.reduce((s, g) => s + (g.funnel?.leadsToDate ?? 0), 0);
  const appsTotal = geos.reduce((s, g) => s + (g.funnel?.appsReceived ?? 0), 0);

  // due this week / overdue
  const overdue = dueRows.filter((t) => (t.dueWeek ?? 0) < nowWeek);
  const thisWeek = dueRows.filter((t) => (t.dueWeek ?? 0) === nowWeek);

  return (
    <div className="space-y-6">
      {/* Header + countdown */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Phase-1 Launch</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            Week {nowWeek} of the run · Kickoff {fmtDate(week0)} · 10,000 applications → 100 fellows across {geos.length} geographies
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-stone-400">Launch (portal opens)</div>
          <div className="text-3xl font-semibold tabular-nums text-sky-700">
            {launchDays >= 0 ? `${launchDays}d` : `${-launchDays}d ago`}
          </div>
          <div className="text-xs text-stone-400">{launch ? fmtDate(launch.date) : `W${launchWeek}`}</div>
        </div>
      </div>

      {/* Milestone rail — always visible */}
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="text-[11px] uppercase tracking-wide text-stone-400 mb-3">Key milestones</div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {milestones.map((m) => {
            const d = daysUntil(m.date);
            const isNext = nextMilestone?.id === m.id;
            const past = d < 0;
            return (
              <div key={m.id} className={`shrink-0 min-w-[150px] rounded-lg border px-3 py-2 ${isNext ? "border-sky-300 bg-sky-50" : past ? "border-stone-100 bg-stone-50" : "border-stone-200 bg-white"}`}>
                <div className={`text-xs font-medium ${past ? "text-stone-400" : "text-stone-800"}`}>{m.label}</div>
                <div className="text-[11px] text-stone-400 mt-1">{fmtDate(m.date)}</div>
                <div className={`text-[11px] mt-0.5 ${isNext ? "text-sky-600 font-medium" : "text-stone-400"}`}>
                  {past ? "done window" : d === 0 ? "today" : `in ${d}d`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Overall + funnel top line */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4 sm:col-span-1">
          <div className="flex items-baseline justify-between">
            <div className="text-[11px] uppercase tracking-wide text-stone-400">Overall progress</div>
            <div className="text-lg font-semibold tabular-nums text-stone-900">{overallPct}%</div>
          </div>
          <div className="mt-2"><ProgressBar pct={overallPct} /></div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            {(["done", "in_progress", "blocked", "not_started"] as SeedingTaskStatus[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1 text-stone-500">
                <span className={`w-2 h-2 rounded-full ${STATUS_META[s].dot}`} />
                {overall[s]} {STATUS_META[s].label.toLowerCase()}
              </span>
            ))}
          </div>
        </div>

        {targets && (
          <div className="rounded-xl border border-stone-200 bg-white p-4 sm:col-span-2">
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-[11px] uppercase tracking-wide text-stone-400">Pre-launch funnel (build reach → leads)</div>
              <Link href="/seeding/funnel" className="text-xs text-sky-600 hover:underline">Open funnel →</Link>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "People reached", actual: reachTotal, target: targets.peopleToReach },
                { label: "Leads captured", actual: leadsTotal, target: targets.leadsToCapture },
                { label: "Applications", actual: appsTotal, target: targets.appsFloor },
              ].map((row) => {
                const p = pct(row.actual, row.target);
                const band = trackBand(p);
                return (
                  <div key={row.label}>
                    <div className="text-xs text-stone-500">{row.label}</div>
                    <div className="text-lg font-semibold tabular-nums text-stone-900">{row.actual.toLocaleString("en-IN")}</div>
                    <div className="text-[11px] text-stone-400">of {row.target.toLocaleString("en-IN")} · <span className={trackText[band]}>{p}%</span></div>
                    <div className="mt-1"><ProgressBar pct={p} color={trackColor[band]} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Workstream progress */}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-stone-400 mb-2">Workstreams</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {workstreams.map((w) => {
            const c = perWs.get(w.id) ?? {};
            const total = (c.not_started ?? 0) + (c.in_progress ?? 0) + (c.blocked ?? 0) + (c.done ?? 0);
            const p = total ? Math.round(((c.done ?? 0) / total) * 100) : 0;
            const blocked = c.blocked ?? 0;
            return (
              <Link key={w.id} href={`/seeding/workstream/${w.key}`} className="rounded-xl border border-stone-200 bg-white p-4 hover:border-sky-300 hover:shadow-sm transition-all">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                  <span className="text-sm font-medium text-stone-900 truncate">{w.label}</span>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-xs text-stone-400">{c.done ?? 0}/{total} done</span>
                  <span className="text-sm font-semibold tabular-nums text-stone-900">{p}%</span>
                </div>
                <div className="mt-1.5"><ProgressBar pct={p} hex={w.color ?? undefined} /></div>
                {blocked > 0 && <div className="mt-2 text-[11px] text-rose-600">⚠ {blocked} blocked</div>}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Blockers + due */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-rose-200 bg-white overflow-hidden">
          <div className="px-4 py-3 bg-rose-50 border-b border-rose-100 text-sm font-medium text-rose-800">Blockers ({blockers.length})</div>
          <div className="divide-y divide-stone-100 max-h-72 overflow-auto">
            {blockers.length === 0 && <div className="px-4 py-6 text-sm text-stone-400 text-center">No blockers — surface them early.</div>}
            {blockers.map((t) => (
              <div key={t.id} className="px-4 py-2.5">
                <div className="text-sm text-stone-800">{t.title}</div>
                <div className="text-[11px] text-stone-400 mt-0.5">{t.workstream.label} · {t.ownerRole ?? "—"} · due {weekLabel(week0, t.dueWeek)}</div>
                {t.notes && <div className="text-[11px] text-rose-600 mt-0.5">{t.notes}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
          <div className="px-4 py-3 bg-stone-50 border-b border-stone-100 text-sm font-medium text-stone-700">
            Due now — overdue ({overdue.length}) · this week ({thisWeek.length})
          </div>
          <div className="divide-y divide-stone-100 max-h-72 overflow-auto">
            {[...overdue, ...thisWeek].length === 0 && <div className="px-4 py-6 text-sm text-stone-400 text-center">Nothing due this week.</div>}
            {[...overdue, ...thisWeek].map((t) => {
              const isOverdue = (t.dueWeek ?? 0) < nowWeek;
              return (
                <div key={t.id} className="px-4 py-2.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-stone-800 truncate">{t.title}</div>
                    <div className="text-[11px] text-stone-400 mt-0.5">{t.workstream.label} · {t.ownerRole ?? "—"}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusChip status={t.status} />
                    <div className={`text-[11px] mt-0.5 ${isOverdue ? "text-rose-600" : "text-stone-400"}`}>{isOverdue ? "overdue" : "this wk"} · {weekLabel(week0, t.dueWeek)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
