"use client";

import Link from "next/link";
import Avatar from "@/components/Avatar";
import { AlertTriangle, CheckSquare, Users, MapPin, Clock } from "lucide-react";

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

type WorkloadRow = { ownerId: string | null; status: string; _count: { id: number } };

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
  workloadRaw: WorkloadRow[];
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
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABEL: Record<string, string> = { Upcoming: "Upcoming", InProgress: "In Progress", Done: "Done" };
const STATUS_ARROW: Record<string, string> = { Upcoming: "→ In Progress", InProgress: "→ Done", Done: "✓ Done" };

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-stone-400">{icon}</span>
      <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">{title}</h2>
      {count !== undefined && count > 0 && (
        <span className="ml-auto text-[10px] font-bold bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent: "red" | "sky" | "emerald" | "amber" | "stone" }) {
  const colors = {
    red:     { border: "border-red-200",     bg: "bg-red-50",     val: "text-red-600",     sub: "text-red-400" },
    sky:     { border: "border-sky-200",     bg: "bg-sky-50",     val: "text-sky-600",     sub: "text-sky-400" },
    emerald: { border: "border-emerald-200", bg: "bg-emerald-50", val: "text-emerald-600", sub: "text-emerald-400" },
    amber:   { border: "border-amber-200",   bg: "bg-amber-50",   val: "text-amber-600",   sub: "text-amber-400" },
    stone:   { border: "border-stone-200",   bg: "bg-white",      val: "text-stone-700",   sub: "text-stone-400" },
  };
  const c = colors[accent];
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} px-4 py-3`}>
      <p className={`text-2xl font-bold ${c.val}`}>{value}</p>
      <p className="text-xs text-stone-500 mt-0.5">{label}</p>
      {sub && <p className={`text-[10px] mt-0.5 ${c.sub}`}>{sub}</p>}
    </div>
  );
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
  const {
    overduePitstops, inProgressPitstops, workloadRaw,
    doneThisMonth, clusters, zones, recentActivity,
  } = overviewData;

  // Goal status counts
  const activeGoals   = goals.filter(g => g.status === "Active").length;
  const pausedGoals   = goals.filter(g => g.status === "Paused").length;
  const completeGoals = goals.filter(g => g.status === "Complete").length;

  // Pitstop totals
  const allPitstops = goals.flatMap(g => g.pitstops);
  const totalPitstops   = allPitstops.length;
  const upcomingCount   = allPitstops.filter(p => p.status === "Upcoming").length;
  const inProgressCount = allPitstops.filter(p => p.status === "InProgress").length;
  const doneCount       = allPitstops.filter(p => p.status === "Done").length;

  // Workload per user
  const workloadMap: Record<string, { upcoming: number; inProgress: number }> = {};
  workloadRaw.forEach(row => {
    if (!row.ownerId) return;
    if (!workloadMap[row.ownerId]) workloadMap[row.ownerId] = { upcoming: 0, inProgress: 0 };
    if (row.status === "Upcoming") workloadMap[row.ownerId].upcoming += row._count.id;
    if (row.status === "InProgress") workloadMap[row.ownerId].inProgress += row._count.id;
  });
  const workloadEntries = Object.entries(workloadMap)
    .map(([uid, counts]) => ({ user: users.find(u => u.id === uid), ...counts }))
    .filter(e => e.user)
    .sort((a, b) => (b.inProgress + b.upcoming) - (a.inProgress + a.upcoming));

  // Cluster performance (only clusters with linked goals)
  const clusterPerf = clusters
    .map(c => {
      const pitstops = c.goals.flatMap(g => g.goal?.pitstops ?? []);
      if (pitstops.length === 0) return null;
      const done = pitstops.filter(p => p.status === "Done").length;
      return { id: c.id, name: c.name, zone: c.zone.name, total: pitstops.length, done };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => (b.done / b.total) - (a.done / a.total));

  // Zone performance
  const zonePerf = zones
    .map(z => {
      const pitstops = z.goals.flatMap(g => g.goal?.pitstops ?? []);
      if (pitstops.length === 0) return null;
      const done = pitstops.filter(p => p.status === "Done").length;
      return { id: z.id, name: z.name, total: pitstops.length, done };
    })
    .filter((z): z is NonNullable<typeof z> => z !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  // InProgress pitstops sorted by checklist completion %
  const checklistPitstops = inProgressPitstops
    .map(p => {
      const total = p.checklistItems.length;
      const done = p.checklistItems.filter(i => i.checked).length;
      return { ...p, clTotal: total, clDone: done, clPct: total > 0 ? Math.round((done / total) * 100) : null };
    })
    .sort((a, b) => {
      // Show ones with checklists first, ordered by % completion descending
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
            sub={`${pausedGoals} paused · ${completeGoals} complete`} accent="sky" />
          <StatCard label="Total pitstops" value={totalPitstops}
            sub={`${upcomingCount} upcoming · ${inProgressCount} in progress`} accent="stone" />
          <StatCard label="Overdue" value={overduePitstops.length}
            sub={overduePitstops.length > 0 ? "Need attention" : "All on track"} accent={overduePitstops.length > 0 ? "red" : "stone"} />
          <StatCard label="Done this month" value={doneThisMonth}
            sub={`${doneCount} total done`} accent="emerald" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left column (2/3) */}
        <div className="lg:col-span-2 space-y-6">

          {/* Overdue pitstops */}
          <div>
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

          {/* Checklist progress */}
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

          {/* Team workload */}
          <div>
            <SectionHeader icon={<Users className="w-3.5 h-3.5" />} title="Team workload" />
            <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-50 overflow-hidden">
              {workloadEntries.length === 0 ? (
                <p className="px-4 py-3 text-xs text-stone-400">No active assignments.</p>
              ) : workloadEntries.map(e => {
                const total = e.inProgress + e.upcoming;
                const maxTotal = Math.max(...workloadEntries.map(w => w.inProgress + w.upcoming), 1);
                return (
                  <div key={e.user!.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <Avatar name={e.user!.name} image={e.user!.image} size="xs" />
                      <span className="text-xs font-medium text-stone-700 truncate flex-1">{e.user!.name ?? "—"}</span>
                      <span className="text-[10px] text-stone-500 flex-shrink-0">
                        {e.inProgress > 0 && <span className="text-sky-600 font-semibold">{e.inProgress} active</span>}
                        {e.inProgress > 0 && e.upcoming > 0 && <span className="text-stone-300"> · </span>}
                        {e.upcoming > 0 && <span>{e.upcoming} upcoming</span>}
                      </span>
                    </div>
                    <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
                      <div className="h-full flex">
                        <div className="bg-sky-400 rounded-full" style={{ width: `${(e.inProgress / maxTotal) * 100}%` }} />
                        <div className="bg-stone-200 rounded-full" style={{ width: `${(e.upcoming / maxTotal) * 100}%` }} />
                      </div>
                    </div>
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

          {/* Recent activity */}
          <div>
            <SectionHeader icon={<Clock className="w-3.5 h-3.5" />} title="Recent activity" />
            <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-50 overflow-hidden">
              {recentActivity.length === 0 ? (
                <p className="px-4 py-3 text-xs text-stone-400">No recent status changes.</p>
              ) : recentActivity.map(a => (
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
