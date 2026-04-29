"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { AlertTriangle, CheckSquare, Users, MapPin, Clock, ChevronDown, ChevronRight, AlertCircle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Owner = { id: string; name: string | null; image: string | null };

type OverduePitstop = {
  id: string; title: string; status: string; targetDate: string;
  goal: { id: string; title: string };
  owner: Owner | null;
};

type InProgressPitstop = {
  id: string; title: string; targetDate: string | null;
  goal: { id: string; title: string };
  owner: Owner | null;
  checklistItems: { id: string; checked: boolean }[];
};

type PitstopWorkloadEntry = {
  id: string; title: string; status: string; targetDate: string | null;
  ownerId: string | null; updatedAt: string;
  goal: { id: string; title: string };
  checklistItems: { id: string; checked: boolean }[];
};

type ClWeeklyCompletion = { ownerId: string; count: number };

type ClusterData = {
  id: string; name: string;
  zone: { name: string };
  goals: { goal: { id: string; pitstops: { id: string; status: string }[] } | null }[];
};

type ZoneData = {
  id: string; name: string;
  goals: { goal: { id: string; pitstops: { id: string; status: string }[] } | null }[];
};

type ActivityEntry = {
  id: string; entityId: string; oldValue: string | null; newValue: string | null; createdAt: string;
  user: Owner;
};

export type OverviewData = {
  overduePitstops: OverduePitstop[];
  inProgressPitstops: InProgressPitstop[];
  pitstopWorkloadDetail: PitstopWorkloadEntry[];
  clCompletionsThisWeek: ClWeeklyCompletion[];
  doneThisMonth: number;
  clusters: ClusterData[];
  zones: ZoneData[];
  recentActivity: ActivityEntry[];
};

type Goal = { id: string; status: string; pitstops: { id: string; status: string }[] };
type User = { id: string; name: string | null; image: string | null };

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysLate(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}
function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABEL: Record<string, string> = { Upcoming: "Upcoming", InProgress: "In Progress", Done: "Done" };

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({
  icon, title, count, action,
}: {
  icon: React.ReactNode; title: string; count?: number; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-stone-400">{icon}</span>
      <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">{title}</h2>
      <div className="ml-auto flex items-center gap-2">
        {count !== undefined && count > 0 && (
          <span className="text-[10px] font-bold bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full">{count}</span>
        )}
        {action}
      </div>
    </div>
  );
}

function StatCard({
  label, value, sub, accent, href,
}: {
  label: string; value: number | string; sub?: string;
  accent: "red" | "sky" | "emerald" | "amber" | "stone"; href?: string;
}) {
  const colors = {
    red:     { border: "border-red-200",     bg: "bg-red-50",     val: "text-red-600",     sub: "text-red-400" },
    sky:     { border: "border-sky-200",     bg: "bg-sky-50",     val: "text-sky-600",     sub: "text-sky-400" },
    emerald: { border: "border-emerald-200", bg: "bg-emerald-50", val: "text-emerald-600", sub: "text-emerald-400" },
    amber:   { border: "border-amber-200",   bg: "bg-amber-50",   val: "text-amber-600",   sub: "text-amber-400" },
    stone:   { border: "border-stone-200",   bg: "bg-white",      val: "text-stone-700",   sub: "text-stone-400" },
  };
  const c = colors[accent];
  const inner = (
    <>
      <p className={`text-2xl font-bold ${c.val}`}>{value}</p>
      <p className="text-xs text-stone-500 mt-0.5">{label}</p>
      {sub && <p className={`text-[10px] mt-0.5 ${c.sub}`}>{sub}</p>}
    </>
  );
  const cls = `rounded-xl border ${c.border} ${c.bg} px-4 py-3${href ? " hover:shadow-sm transition-shadow cursor-pointer" : ""}`;
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <div className={cls}>{inner}</div>;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function OrgOverview({
  overviewData,
  goals,
  users,
}: {
  overviewData: OverviewData;
  goals: Goal[];
  users: User[];
}) {
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [activityWeekOnly, setActivityWeekOnly] = useState(false);

  const {
    overduePitstops, inProgressPitstops,
    pitstopWorkloadDetail = [], clCompletionsThisWeek = [],
    doneThisMonth, clusters, zones, recentActivity,
  } = overviewData;

  // Goal status counts
  const activeGoals   = goals.filter(g => g.status === "Active").length;
  const pausedGoals   = goals.filter(g => g.status === "Paused").length;
  const completeGoals = goals.filter(g => g.status === "Complete").length;

  // Pitstop totals
  const allPitstops     = goals.flatMap(g => g.pitstops);
  const totalPitstops   = allPitstops.length;
  const upcomingCount   = allPitstops.filter(p => p.status === "Upcoming").length;
  const inProgressCount = allPitstops.filter(p => p.status === "InProgress").length;
  const doneCount       = allPitstops.filter(p => p.status === "Done").length;

  // ── Workload derived from pitstopWorkloadDetail ───────────────────────────

  const workloadDetailMap: Record<string, {
    upcoming: number; inProgress: number;
    pitstops: PitstopWorkloadEntry[]; clPending: number;
  }> = {};
  pitstopWorkloadDetail.forEach(p => {
    if (!p.ownerId) return;
    if (!workloadDetailMap[p.ownerId]) {
      workloadDetailMap[p.ownerId] = { upcoming: 0, inProgress: 0, pitstops: [], clPending: 0 };
    }
    if (p.status === "Upcoming") workloadDetailMap[p.ownerId].upcoming++;
    if (p.status === "InProgress") workloadDetailMap[p.ownerId].inProgress++;
    workloadDetailMap[p.ownerId].pitstops.push(p);
    workloadDetailMap[p.ownerId].clPending += p.checklistItems.filter(i => !i.checked).length;
  });

  const weeklyCompMap: Record<string, number> = {};
  clCompletionsThisWeek.forEach(c => { weeklyCompMap[c.ownerId] = c.count; });

  const workloadEntries = Object.entries(workloadDetailMap)
    .map(([uid, counts]) => ({
      user: users.find(u => u.id === uid),
      ...counts,
      clDoneThisWeek: weeklyCompMap[uid] ?? 0,
    }))
    .filter(e => e.user != null)
    .sort((a, b) => (b.inProgress + b.upcoming) - (a.inProgress + a.upcoming));

  // ── Stalled pitstops: InProgress, has checklist, 0 done, stale > 3 days ──

  const threeDaysAgo = Date.now() - 3 * 86400000;
  const stalledPitstops = pitstopWorkloadDetail
    .filter(p => {
      if (p.status !== "InProgress") return false;
      const clTotal = p.checklistItems.length;
      const clDone  = p.checklistItems.filter(i => i.checked).length;
      return clTotal > 0 && clDone === 0 && new Date(p.updatedAt).getTime() < threeDaysAgo;
    })
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());

  // ── Activity filter ───────────────────────────────────────────────────────

  const weekMs = Date.now() - 7 * 86400000;
  const filteredActivity = activityWeekOnly
    ? recentActivity.filter(a => new Date(a.createdAt).getTime() >= weekMs)
    : recentActivity;

  // ── Cluster/zone performance ──────────────────────────────────────────────

  const clusterPerf = clusters
    .map(c => {
      const pitstops = c.goals.flatMap(g => g.goal?.pitstops ?? []);
      if (pitstops.length === 0) return null;
      const done = pitstops.filter(p => p.status === "Done").length;
      return { id: c.id, name: c.name, zone: c.zone.name, total: pitstops.length, done };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => (b.done / b.total) - (a.done / a.total));

  const zonePerf = zones
    .map(z => {
      const pitstops = z.goals.flatMap(g => g.goal?.pitstops ?? []);
      if (pitstops.length === 0) return null;
      const done = pitstops.filter(p => p.status === "Done").length;
      return { id: z.id, name: z.name, total: pitstops.length, done };
    })
    .filter((z): z is NonNullable<typeof z> => z !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  // ── InProgress pitstops sorted by checklist completion % ─────────────────

  const checklistPitstops = inProgressPitstops
    .map(p => {
      const total = p.checklistItems.length;
      const done  = p.checklistItems.filter(i => i.checked).length;
      return { ...p, clTotal: total, clDone: done, clPct: total > 0 ? Math.round((done / total) * 100) : null };
    })
    .sort((a, b) => {
      if (a.clTotal === 0 && b.clTotal > 0) return 1;
      if (b.clTotal === 0 && a.clTotal > 0) return -1;
      return (b.clPct ?? 0) - (a.clPct ?? 0);
    });

  return (
    <div className="space-y-6">

      {/* Stats strip */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Active goals" value={activeGoals}
            sub={`${pausedGoals} paused · ${completeGoals} complete`} accent="sky" href="/dashboard?tab=goals&filter=Active" />
          <StatCard label="Total pitstops" value={totalPitstops}
            sub={`${upcomingCount} upcoming · ${inProgressCount} in progress`} accent="stone" href="/pitstops" />
          <StatCard label="Overdue" value={overduePitstops.length}
            sub={overduePitstops.length > 0 ? "Need attention" : "All on track"} accent={overduePitstops.length > 0 ? "red" : "stone"} href="#overdue" />
          <StatCard label="Done this month" value={doneThisMonth}
            sub={`${doneCount} total done`} accent="emerald" href="/pitstops?status=Done" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left column (2/3) */}
        <div className="lg:col-span-2 space-y-6">

          {/* Overdue pitstops */}
          <div id="overdue">
            <SectionHeader icon={<AlertTriangle className="w-3.5 h-3.5" />} title="Overdue pitstops" count={overduePitstops.length} />
            {overduePitstops.length === 0 ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-700">
                Nothing overdue. All pitstops are on track.
              </div>
            ) : (
              <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-50 overflow-hidden">
                {overduePitstops.map(p => (
                  <Link key={p.id} href={`/goals/${p.goal.id}/pitstops/${p.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 transition-colors group">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-stone-800 truncate group-hover:text-sky-600">{p.title}</p>
                      <p className="text-[10px] text-stone-400 truncate">{p.goal.title}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {p.owner && <Avatar name={p.owner.name} image={p.owner.image} size="xs" />}
                      <span className="text-[10px] font-semibold text-red-500">{daysLate(p.targetDate)}d late</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Stalled pitstops */}
          {stalledPitstops.length > 0 && (
            <div>
              <SectionHeader icon={<AlertCircle className="w-3.5 h-3.5 text-amber-500" />} title="Stalled pitstops" count={stalledPitstops.length} />
              <div className="bg-amber-50 border border-amber-200 rounded-xl divide-y divide-amber-100 overflow-hidden">
                {stalledPitstops.map(p => {
                  const owner = users.find(u => u.id === p.ownerId);
                  const ds = daysSince(p.updatedAt);
                  return (
                    <Link key={p.id} href={`/goals/${p.goal.id}/pitstops/${p.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-amber-100 transition-colors group">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-stone-800 truncate group-hover:text-sky-600">{p.title}</p>
                        <p className="text-[10px] text-stone-400 truncate">{p.goal.title}</p>
                        <p className="text-[10px] text-amber-600 mt-0.5">{p.checklistItems.length} checks · 0 done</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {owner && <Avatar name={owner.name} image={owner.image} size="xs" />}
                        <span className="text-[10px] font-semibold text-amber-600">{ds}d stale</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* In-progress pitstops with checklist progress */}
          <div>
            <SectionHeader icon={<CheckSquare className="w-3.5 h-3.5" />} title="In-progress pitstops" count={checklistPitstops.length} />
            {checklistPitstops.length === 0 ? (
              <p className="text-xs text-stone-400">No pitstops currently in progress.</p>
            ) : (
              <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-50 overflow-hidden">
                {checklistPitstops.slice(0, 15).map(p => (
                  <Link key={p.id} href={`/goals/${p.goal.id}/pitstops/${p.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-stone-800 truncate group-hover:text-sky-600">{p.title}</p>
                      <p className="text-[10px] text-stone-400 truncate">{p.goal.title}</p>
                      {p.clTotal > 0 && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="flex-1 h-1 bg-stone-100 rounded-full overflow-hidden max-w-[100px]">
                            <div className="h-full bg-sky-400 rounded-full" style={{ width: `${p.clPct}%` }} />
                          </div>
                          <span className="text-[10px] text-stone-400">{p.clDone}/{p.clTotal} checks</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {p.owner && <Avatar name={p.owner.name} image={p.owner.image} size="xs" />}
                      {p.targetDate && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${new Date(p.targetDate) < new Date() ? "bg-red-50 border-red-200 text-red-600" : "bg-stone-50 border-stone-200 text-stone-500"}`}>
                          {fmtDate(p.targetDate)}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Right column (1/3) */}
        <div className="space-y-6">

          {/* Team workload — enriched with cl detail + drill-down */}
          <div>
            <SectionHeader icon={<Users className="w-3.5 h-3.5" />} title="Team workload" />
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              {workloadEntries.length === 0 ? (
                <p className="px-4 py-3 text-xs text-stone-400">No active assignments.</p>
              ) : workloadEntries.map(e => {
                const total    = e.inProgress + e.upcoming;
                const maxTotal = Math.max(...workloadEntries.map(w => w.inProgress + w.upcoming), 1);
                const isExpanded = expandedUser === e.user!.id;
                return (
                  <div key={e.user!.id} className="border-b border-stone-50 last:border-0">
                    <button
                      onClick={() => setExpandedUser(isExpanded ? null : e.user!.id)}
                      className="w-full px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Avatar name={e.user!.name} image={e.user!.image} size="xs" />
                        <span className="text-xs font-medium text-stone-700 truncate flex-1">{e.user!.name ?? "—"}</span>
                        <span className="text-[10px] text-stone-500 flex-shrink-0">
                          {e.inProgress > 0 && <span className="text-sky-600 font-semibold">{e.inProgress} active</span>}
                          {e.inProgress > 0 && e.upcoming > 0 && <span className="text-stone-300"> · </span>}
                          {e.upcoming > 0 && <span>{e.upcoming} upcoming</span>}
                        </span>
                        {isExpanded
                          ? <ChevronDown className="w-3 h-3 text-stone-400 flex-shrink-0" />
                          : <ChevronRight className="w-3 h-3 text-stone-400 flex-shrink-0" />}
                      </div>
                      <div className="h-1 bg-stone-100 rounded-full overflow-hidden mb-1.5">
                        <div className="h-full flex">
                          <div className="bg-sky-400 rounded-full" style={{ width: `${(e.inProgress / maxTotal) * 100}%` }} />
                          <div className="bg-stone-200 rounded-full" style={{ width: `${(e.upcoming / maxTotal) * 100}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {e.clPending > 0 && (
                          <span className="text-[10px] text-stone-400">{e.clPending} checks pending</span>
                        )}
                        {e.clDoneThisWeek > 0 && (
                          <>
                            {e.clPending > 0 && <span className="text-[10px] text-stone-300">·</span>}
                            <span className="text-[10px] text-emerald-600 font-medium">{e.clDoneThisWeek} done this week</span>
                          </>
                        )}
                        {e.clPending === 0 && e.clDoneThisWeek === 0 && (
                          <span className="text-[10px] text-stone-300">no checklist items</span>
                        )}
                      </div>
                    </button>

                    {/* Drill-down: per-user pitstop list */}
                    {isExpanded && (
                      <div className="bg-stone-50 border-t border-stone-100 divide-y divide-stone-100">
                        {e.pitstops.length === 0 ? (
                          <p className="px-4 py-2 text-[10px] text-stone-400">No active pitstops.</p>
                        ) : e.pitstops.map(p => {
                          const clTotal   = p.checklistItems.length;
                          const clDone    = p.checklistItems.filter(i => i.checked).length;
                          const isOverdue = p.targetDate && new Date(p.targetDate) < new Date();
                          return (
                            <Link key={p.id} href={`/goals/${p.goal.id}/pitstops/${p.id}`}
                              className="flex items-start gap-2 px-4 py-2 hover:bg-stone-100 transition-colors group">
                              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${p.status === "InProgress" ? "bg-sky-400" : "bg-stone-300"}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-medium text-stone-700 truncate group-hover:text-sky-600">{p.title}</p>
                                <p className="text-[10px] text-stone-400 truncate">{p.goal.title}</p>
                              </div>
                              <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                                {clTotal > 0 && (
                                  <span className="text-[10px] text-stone-400">{clDone}/{clTotal} ☑</span>
                                )}
                                {p.targetDate && (
                                  <span className={`text-[10px] ${isOverdue ? "text-red-500 font-semibold" : "text-stone-400"}`}>
                                    {isOverdue ? `${daysLate(p.targetDate)}d late` : fmtDate(p.targetDate)}
                                  </span>
                                )}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Zone performance */}
          {zonePerf.length > 0 && (
            <div>
              <SectionHeader icon={<MapPin className="w-3.5 h-3.5" />} title="Zone performance" />
              <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-50 overflow-hidden">
                {zonePerf.map(z => {
                  const pct = z.total > 0 ? Math.round((z.done / z.total) * 100) : 0;
                  return (
                    <div key={z.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-stone-700">{z.name}</span>
                        <span className="text-[10px] text-stone-400">{z.done}/{z.total} done · {pct}%</span>
                      </div>
                      <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cluster performance */}
          {clusterPerf.length > 0 && (
            <div>
              <SectionHeader icon={<MapPin className="w-3.5 h-3.5" />} title="Cluster performance" />
              <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-50 overflow-hidden">
                {clusterPerf.slice(0, 10).map(c => {
                  const pct = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
                  return (
                    <div key={c.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <span className="text-xs font-medium text-stone-700">{c.name.replace(/_/g, " ")}</span>
                          <span className="text-[10px] text-stone-400 ml-1">· {c.zone}</span>
                        </div>
                        <span className="text-[10px] text-stone-400 flex-shrink-0">{c.done}/{c.total} · {pct}%</span>
                      </div>
                      <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent activity with week filter */}
          <div>
            <SectionHeader
              icon={<Clock className="w-3.5 h-3.5" />}
              title="Recent activity"
              action={
                <div className="flex gap-0.5 bg-stone-100 rounded-md p-0.5">
                  <button
                    onClick={() => setActivityWeekOnly(false)}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${!activityWeekOnly ? "bg-white text-stone-700 shadow-sm" : "text-stone-400 hover:text-stone-600"}`}
                  >All</button>
                  <button
                    onClick={() => setActivityWeekOnly(true)}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${activityWeekOnly ? "bg-white text-stone-700 shadow-sm" : "text-stone-400 hover:text-stone-600"}`}
                  >This week</button>
                </div>
              }
            />
            <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-50 overflow-hidden">
              {filteredActivity.length === 0 ? (
                <p className="px-4 py-3 text-xs text-stone-400">
                  {activityWeekOnly ? "No status changes this week." : "No recent status changes."}
                </p>
              ) : filteredActivity.map(a => (
                <div key={a.id} className="flex items-start gap-2.5 px-4 py-2.5">
                  <Avatar name={a.user.name} image={a.user.image} size="xs" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-stone-600">
                      <span className="font-medium">{a.user.name ?? "Someone"}</span>
                      {" moved "}
                      <span className="font-medium">{a.newValue ? STATUS_LABEL[a.newValue] ?? a.newValue : "—"}</span>
                    </p>
                    <p className="text-[10px] text-stone-400 mt-0.5">{fmtDatetime(a.createdAt)}</p>
                  </div>
                  {a.oldValue && a.newValue && (
                    <span className="text-[9px] text-stone-400 flex-shrink-0">
                      {STATUS_LABEL[a.oldValue] ?? a.oldValue} → {STATUS_LABEL[a.newValue] ?? a.newValue}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
