import Link from "next/link";
import prisma from "@/lib/prisma";
import { computeTargets, pct, trackBand } from "@/lib/seeding/funnel";
import { currentWeek, daysUntil, fmtDate, weekLabel } from "@/lib/seeding/weeks";
import type { SeedingTaskStatus } from "@/app/generated/prisma/client";
import { StatusChip, ProgressBar } from "./_components/bits";
import RoadToLaunch from "./_components/RoadToLaunch";
import { loadLaunchMilestones } from "@/lib/seeding/milestones";

const trackColor = { ontrack: "bg-emerald-500", warn: "bg-amber-500", behind: "bg-rose-500" } as const;
const trackText = { ontrack: "text-emerald-600", warn: "text-amber-600", behind: "text-rose-600" } as const;
const kfmt = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString("en-IN", { maximumFractionDigits: 1 })}k` : `${n}`);

export default async function SeedingDashboard() {
  const [config, milestones, launchMilestones, subStatus, funnelConfig, geos, blockers, dueRows] = await Promise.all([
    prisma.seedingConfig.findUnique({ where: { id: 1 } }),
    prisma.seedingMilestone.findMany({ orderBy: { sortOrder: "asc" } }),
    loadLaunchMilestones(),
    prisma.seedingSubtask.groupBy({ by: ["status"], _count: true }),
    prisma.seedingFunnelConfig.findUnique({ where: { id: 1 } }),
    prisma.seedingGeo.findMany({ orderBy: { sortOrder: "asc" }, include: { funnel: true } }),
    prisma.seedingSubtask.findMany({ where: { status: "blocked" }, include: { task: { include: { workstream: true } } }, orderBy: { dueWeek: "asc" } }),
    prisma.seedingSubtask.findMany({ where: { status: { not: "done" }, dueWeek: { not: null } }, include: { task: { include: { workstream: true } } } }),
  ]);

  const week0 = config?.week0Date ?? new Date("2026-06-22T00:00:00Z");
  const launchWeek = config?.launchWeek ?? 14;
  const nowWeek = currentWeek(week0);

  const overall: Record<SeedingTaskStatus, number> = { not_started: 0, in_progress: 0, blocked: 0, done: 0 };
  for (const r of subStatus) overall[r.status] += r._count;
  const totalSubs = overall.not_started + overall.in_progress + overall.blocked + overall.done;
  const overallPct = totalSubs ? Math.round((overall.done / totalSubs) * 100) : 0;

  const launch = milestones.find((m) => m.kind === "launch");
  const launchDays = launch ? daysUntil(launch.date) : (launchWeek - nowWeek) * 7;
  const launchProgress = Math.max(0, Math.min(100, Math.round((nowWeek / launchWeek) * 100)));

  const targets = funnelConfig ? computeTargets(funnelConfig, geos.length) : null;
  const reachTotal = geos.reduce((s, g) => s + (g.funnel?.reachToDate ?? 0), 0);
  const leadsTotal = geos.reduce((s, g) => s + (g.funnel?.leadsToDate ?? 0), 0);
  const appsTotal = geos.reduce((s, g) => s + (g.funnel?.appsReceived ?? 0), 0);

  const overdue = dueRows.filter((t) => (t.dueWeek ?? 0) < nowWeek);
  const thisWeek = dueRows.filter((t) => (t.dueWeek ?? 0) === nowWeek);

  const chain = targets ? [
    { label: "reach", target: targets.peopleToReach, actual: reachTotal },
    { label: "leads", target: targets.leadsToCapture, actual: leadsTotal },
    { label: "apps", target: targets.appsFloor, actual: appsTotal },
    { label: "fellows", target: targets.totalFellows, actual: 0 },
  ] : [];

  return (
    <div className="space-y-6">
      {/* HERO — road to launch */}
      <div className="rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-700 text-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-sky-200">Road to launch</div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-5xl font-bold tabular-nums leading-none">{launchDays >= 0 ? launchDays : 0}</span>
              <span className="text-sky-100 text-sm">days to<br />call live</span>
            </div>
            <div className="text-xs text-sky-200 mt-2">{launch ? fmtDate(launch.date) : `W${launchWeek}`} · week {nowWeek} of {launchWeek}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-widest text-sky-200">Delivery</div>
            <div className="text-3xl font-bold tabular-nums">{overallPct}%</div>
            <div className="text-xs text-sky-200">{overall.done}/{totalSubs} sub-tasks</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="h-2 w-full rounded-full bg-white/20 overflow-hidden">
            <div className="h-full rounded-full bg-white/90" style={{ width: `${launchProgress}%` }} />
          </div>
        </div>

        {/* funnel chain */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {chain.map((c, i) => (
            <div key={c.label} className="flex items-center gap-2">
              <div className="rounded-lg bg-white/10 px-3 py-1.5 text-center min-w-[74px]">
                <div className="text-lg font-bold tabular-nums leading-none">{kfmt(c.target)}</div>
                <div className="text-[10px] text-sky-200 mt-0.5">{c.label}{c.actual > 0 ? ` · ${kfmt(c.actual)}` : ""}</div>
              </div>
              {i < chain.length - 1 && <span className="text-sky-300">▸</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ROAD TO LAUNCH — phases as expandable milestones */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-semibold text-stone-700">Road to launch — milestones</h2>
          <Link href="/seeding/workstreams" className="text-xs text-sky-600 hover:underline">All workstreams →</Link>
        </div>
        <RoadToLaunch milestones={launchMilestones} week0ISO={week0.toISOString()} launchWeek={launchWeek} nowWeek={nowWeek} />
      </div>

      {/* Funnel health */}
      {targets && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-[11px] uppercase tracking-wide text-stone-400">Pre-launch funnel (build reach → leads)</div>
            <Link href="/seeding/funnel" className="text-xs text-sky-600 hover:underline">Open funnel →</Link>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[{ label: "People reached", actual: reachTotal, target: targets.peopleToReach }, { label: "Leads captured", actual: leadsTotal, target: targets.leadsToCapture }, { label: "Applications", actual: appsTotal, target: targets.appsFloor }].map((row) => {
              const p = pct(row.actual, row.target); const band = trackBand(p);
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

      {/* Blockers + due */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-rose-200 bg-white overflow-hidden">
          <div className="px-4 py-3 bg-rose-50 border-b border-rose-100 text-sm font-medium text-rose-800">Blockers ({blockers.length})</div>
          <div className="divide-y divide-stone-100 max-h-72 overflow-auto">
            {blockers.length === 0 && <div className="px-4 py-6 text-sm text-stone-400 text-center">No blockers — surface them early.</div>}
            {blockers.map((s) => (
              <div key={s.id} className="px-4 py-2.5">
                <div className="text-sm text-stone-800">{s.title}</div>
                <div className="text-[11px] text-stone-400 mt-0.5">{s.task.workstream.label} · {s.task.title} · {s.ownerRole ?? "—"} · due {weekLabel(week0, s.dueWeek)}</div>
                {s.notes && <div className="text-[11px] text-rose-600 mt-0.5">{s.notes}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
          <div className="px-4 py-3 bg-stone-50 border-b border-stone-100 text-sm font-medium text-stone-700">Due now — overdue ({overdue.length}) · this week ({thisWeek.length})</div>
          <div className="divide-y divide-stone-100 max-h-72 overflow-auto">
            {[...overdue, ...thisWeek].length === 0 && <div className="px-4 py-6 text-sm text-stone-400 text-center">Nothing due this week.</div>}
            {[...overdue, ...thisWeek].map((s) => {
              const isOverdue = (s.dueWeek ?? 0) < nowWeek;
              return (
                <div key={s.id} className="px-4 py-2.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-stone-800 truncate">{s.title}</div>
                    <div className="text-[11px] text-stone-400 mt-0.5">{s.task.workstream.label} · {s.ownerRole ?? "—"}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusChip status={s.status} />
                    <div className={`text-[11px] mt-0.5 ${isOverdue ? "text-rose-600" : "text-stone-400"}`}>{isOverdue ? "overdue" : "this wk"} · {weekLabel(week0, s.dueWeek)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Long-term milestones — demoted */}
      <details className="rounded-xl border border-stone-200 bg-white">
        <summary className="px-4 py-3 text-sm font-medium text-stone-600 cursor-pointer select-none">Programme milestones (through 2029)</summary>
        <div className="px-4 pb-3 flex gap-3 overflow-x-auto">
          {milestones.map((m) => {
            const d = daysUntil(m.date); const past = d < 0;
            return (
              <div key={m.id} className={`shrink-0 min-w-[150px] rounded-lg border px-3 py-2 ${past ? "border-stone-100 bg-stone-50" : "border-stone-200"}`}>
                <div className={`text-xs font-medium ${past ? "text-stone-400" : "text-stone-800"}`}>{m.label}</div>
                <div className="text-[11px] text-stone-400 mt-1">{fmtDate(m.date)}</div>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}
