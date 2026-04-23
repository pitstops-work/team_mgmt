"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  CalendarClock, CheckSquare, Target, MapPin, BarChart3, ChevronRight,
  LayoutDashboard, Users, TrendingUp, AlertTriangle, CheckCircle2,
  Clock, Activity, Filter, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";
import type { DomainStat, ClusterStat, ClusterStatus, AdminDash, AdminGoal, AdminUser, AdminZone, OverduePitstop } from "./page";

// ── Types ─────────────────────────────────────────────────────────────────────

type Activity = {
  id: string; title: string; type: string; scheduledAt: string;
  location: string | null; status: string;
  attendees?: { user: { id: string; name: string | null } }[];
};

type ChecklistItem = {
  id: string; text: string; status: string; checked: boolean;
  pitstop: {
    id: string; title: string; targetDate: string | null; ownerId: string;
    owner: { id: string; name: string | null };
    goal: { id: string; title: string };
  };
};

type Goal = {
  id: string; title: string; status: string;
  needsDomain: string | null; needsClusterId: string | null; needsZoneId: string | null;
  parameter: number | null; outcomeCount: number | null;
  ownerId: string | null;
  owner: { id: string; name: string | null } | null;
  pitstops: { id: string; status: string }[];
};

type TeamMember = { id: string; name: string | null; image: string | null };

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function isToday(iso: string) {
  const d = new Date(iso);
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}
function daysDiff(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
function daysAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

const STATUS_BADGE: Record<string, string> = {
  Active:   "bg-sky-50 text-sky-700 border-sky-200",
  Paused:   "bg-amber-50 text-amber-700 border-amber-200",
  Complete: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
const STATUS_DOT: Record<string, string> = {
  Active: "bg-sky-400", Paused: "bg-amber-400", Complete: "bg-emerald-400",
};
const CHECKLIST_STATUS_DOT: Record<string, string> = {
  NotStarted: "bg-stone-200", Scheduled: "bg-sky-300", InProgress: "bg-amber-400",
  Done: "bg-emerald-400", Blocked: "bg-red-400", Rescheduled: "bg-violet-400",
};
const EVENT_TYPE_COLOR: Record<string, string> = {
  Meeting: "bg-sky-400", Visit: "bg-violet-400", Event: "bg-amber-400", Training: "bg-emerald-400",
};
const DESIGNATION_ORDER = ["Leader", "PM", "ZL", "RP", "Other"];
const DESIGNATION_COLOR: Record<string, string> = {
  Leader: "bg-amber-100 text-amber-700",
  PM: "bg-violet-100 text-violet-700",
  ZL: "bg-sky-100 text-sky-700",
  RP: "bg-emerald-100 text-emerald-700",
  Other: "bg-stone-100 text-stone-600",
};
const PITSTOP_STATUS_COLOR: Record<string, string> = {
  Upcoming: "#60a5fa",
  InProgress: "#fbbf24",
  Done: "#34d399",
  Cancelled: "#d1d5db",
  Blocked: "#f87171",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-stone-400 py-4 px-1">{message}</p>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2">{children}</h3>
  );
}

function KpiTile({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 px-4 py-3.5">
      <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? "text-stone-800"}`}>{value}</p>
      {sub && <p className="text-[11px] text-stone-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex-1 bg-stone-100 rounded-full h-1.5 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

function ActivityRow({ a }: { a: Activity }) {
  return (
    <Link href="/activities"
      className="flex items-start gap-3 px-4 py-3 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition-colors">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${EVENT_TYPE_COLOR[a.type] ?? "bg-stone-300"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
        <p className="text-xs text-stone-400 mt-0.5">
          {fmtTime(a.scheduledAt)}{a.location ? ` · ${a.location}` : ""} · {a.type}
        </p>
      </div>
      {a.status !== "Scheduled" && (
        <span className="text-[10px] text-stone-400 border border-stone-200 rounded px-1.5 py-0.5 capitalize flex-shrink-0">
          {a.status.toLowerCase()}
        </span>
      )}
    </Link>
  );
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <Link href={`/goals/${item.pitstop.goal.id}`}
      className="flex items-start gap-3 px-4 py-2.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition-colors">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${CHECKLIST_STATUS_DOT[item.status] ?? "bg-stone-200"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-stone-800 truncate">{item.text}</p>
        <p className="text-xs text-stone-400 mt-0.5 truncate">
          {item.pitstop.goal.title} · {item.pitstop.title}
          {item.pitstop.owner?.name && ` · ${item.pitstop.owner.name}`}
        </p>
      </div>
      {item.pitstop.targetDate && (
        <span className="text-[10px] text-stone-400 flex-shrink-0">{fmtDate(item.pitstop.targetDate)}</span>
      )}
    </Link>
  );
}

function GoalRow({ goal, showOwner }: { goal: Goal; showOwner?: boolean }) {
  const done  = goal.pitstops.filter(p => p.status === "Done").length;
  const total = goal.pitstops.length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <Link href={`/goals/${goal.id}`}
      className="flex items-center gap-3 px-4 py-3 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition-colors group">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[goal.status] ?? "bg-stone-300"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-stone-800 group-hover:text-sky-700 truncate">{goal.title}</p>
        <div className="flex items-center gap-2 mt-1">
          {showOwner && goal.owner?.name && (
            <span className="text-[10px] text-stone-400">{goal.owner.name}</span>
          )}
          {goal.needsDomain && (
            <span className="text-[10px] text-stone-400">{goal.needsDomain}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {total > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1 bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-sky-400 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-stone-400">{done}/{total}</span>
          </div>
        )}
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_BADGE[goal.status] ?? "bg-stone-50 text-stone-500 border-stone-200"}`}>
          {goal.status}
        </span>
      </div>
    </Link>
  );
}

function DomainTable({ stats }: { stats: DomainStat[] }) {
  if (stats.length === 0) return <EmptyState message="No domain-tagged goals yet." />;
  const maxPlanned = Math.max(...stats.map(s => s.planned), 1);
  return (
    <div className="rounded-lg border border-stone-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-stone-50 border-b border-stone-200">
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Domain</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Planned</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Done</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Gap</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {stats.map(s => (
            <tr key={s.domain} className="bg-white hover:bg-stone-50 transition-colors">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-stone-700 font-medium">{s.label}</span>
                  {s.planned > 0 && (
                    <div className="hidden sm:flex flex-1 min-w-[60px] max-w-[100px]">
                      <div className="w-full bg-stone-100 rounded-full h-1 overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${Math.round((s.done / s.planned) * 100)}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              </td>
              <td className="px-4 py-2.5 text-sm text-right text-stone-600">{s.planned}</td>
              <td className="px-4 py-2.5 text-sm text-right text-emerald-600 font-medium">{s.done}</td>
              <td className={`px-4 py-2.5 text-sm text-right font-medium ${s.gap > 0 ? "text-amber-600" : "text-stone-400"}`}>{s.gap}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab: Today ────────────────────────────────────────────────────────────────

function TodayTab({
  todayActivities, weekActivities, weekChecklists, designation,
}: {
  todayActivities: Activity[];
  weekActivities: Activity[];
  weekChecklists: ChecklistItem[];
  designation: string;
}) {
  const laterThisWeek = weekActivities.filter(a => !isToday(a.scheduledAt));
  const todayIds = new Set(todayActivities.map(a => a.id));
  const weekOnly = laterThisWeek.filter(a => !todayIds.has(a.id));

  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + (6 - ((weekEnd.getDay() + 6) % 7)));
  weekEnd.setHours(23, 59, 59, 999);
  const thisWeekChecklists = weekChecklists.filter(ci => {
    if (!ci.pitstop.targetDate) return true;
    return new Date(ci.pitstop.targetDate) <= weekEnd;
  });

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>Today&apos;s activities</SectionTitle>
        {todayActivities.length === 0
          ? <EmptyState message="No activities scheduled for today." />
          : <div className="space-y-2">{todayActivities.map(a => <ActivityRow key={a.id} a={a} />)}</div>
        }
      </div>

      <div>
        <SectionTitle>Checklists this week{designation === "ZL" ? " (team)" : ""}</SectionTitle>
        {thisWeekChecklists.length === 0
          ? <EmptyState message="No open checklist items." />
          : (
            <div className="space-y-2">
              {thisWeekChecklists.slice(0, 20).map(ci => <ChecklistRow key={ci.id} item={ci} />)}
              {thisWeekChecklists.length > 20 && (
                <p className="text-xs text-stone-400 px-1">+{thisWeekChecklists.length - 20} more items</p>
              )}
            </div>
          )
        }
      </div>

      <div>
        <SectionTitle>Later this week{designation === "ZL" ? " (team)" : ""}</SectionTitle>
        {weekOnly.length === 0
          ? <EmptyState message="Nothing else scheduled this week." />
          : (
            <div className="space-y-2">
              {weekOnly.map(a => (
                <Link key={a.id} href="/activities"
                  className="flex items-start gap-3 px-4 py-3 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition-colors">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${EVENT_TYPE_COLOR[a.type] ?? "bg-stone-300"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {fmtDate(a.scheduledAt)} · {fmtTime(a.scheduledAt)}{a.location ? ` · ${a.location}` : ""}
                    </p>
                    {a.attendees && a.attendees.length > 0 && (
                      <p className="text-[10px] text-stone-300 mt-0.5">
                        {a.attendees.map(att => att.user.name).filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )
        }
      </div>
    </div>
  );
}

// ── Tab: RP Field Coverage ────────────────────────────────────────────────────

function RPCoverageTab({ clusterStats }: { clusterStats: ClusterStat[] }) {
  if (clusterStats.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-stone-400">No cluster assigned yet.</p>
        <Link href="/needs" className="mt-3 inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700">
          Full field coverage <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {clusterStats.map(c => (
        <div key={c.clusterId}>
          <div className="flex items-center justify-between mb-2">
            <SectionTitle>{c.clusterName}</SectionTitle>
            <Link href="/needs" className="text-[10px] text-sky-500 hover:text-sky-700 flex items-center gap-0.5">
              Full view <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <DomainTable stats={c.stats} />
        </div>
      ))}
      <p className="text-[10px] text-stone-300 px-1">
        Planned = active goal targets · Done = completed outcomes · Gap = planned − done.{" "}
        <Link href="/needs" className="text-sky-400 hover:text-sky-600">See full coverage analysis →</Link>
      </p>
    </div>
  );
}

// ── Tab: ZL Field Coverage ────────────────────────────────────────────────────

function ZLCoverageTab({ zoneName, clusterStats }: { zoneName: string | null; clusterStats: ClusterStat[] }) {
  if (clusterStats.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-stone-400">No zone assigned yet.</p>
        <Link href="/needs" className="mt-3 inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700">
          Full field coverage <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  const zoneStats: Record<string, { label: string; planned: number; done: number; gap: number }> = {};
  for (const c of clusterStats) {
    for (const s of c.stats) {
      if (!zoneStats[s.domain]) zoneStats[s.domain] = { label: s.label, planned: 0, done: 0, gap: 0 };
      zoneStats[s.domain].planned += s.planned;
      zoneStats[s.domain].done    += s.done;
      zoneStats[s.domain].gap     += s.gap;
    }
  }
  const zoneSummary: DomainStat[] = Object.entries(zoneStats).map(([domain, v]) => ({
    domain, ...v,
  })).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="space-y-8">
      {zoneName && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <SectionTitle>{zoneName} — Zone Total</SectionTitle>
            <Link href="/needs" className="text-[10px] text-sky-500 hover:text-sky-700 flex items-center gap-0.5">
              Full view <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <DomainTable stats={zoneSummary} />
        </div>
      )}

      <div>
        <SectionTitle>By cluster</SectionTitle>
        <div className="space-y-6">
          {clusterStats.map(c => (
            <div key={c.clusterId}>
              <p className="text-xs font-medium text-stone-600 mb-2">{c.clusterName}</p>
              <DomainTable stats={c.stats} />
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-stone-300 px-1">
        Planned = active goal targets · Done = completed outcomes · Gap = planned − done.{" "}
        <Link href="/needs" className="text-sky-400 hover:text-sky-600">See full analysis →</Link>
      </p>
    </div>
  );
}

// ── Tab: ZL Cluster Status ────────────────────────────────────────────────────

function ZLClusterStatusTab({ clusterStatus }: { clusterStatus: ClusterStatus[] }) {
  if (clusterStatus.length === 0) {
    return <EmptyState message="No clusters in your zone yet." />;
  }
  return (
    <div className="rounded-lg border border-stone-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-stone-50 border-b border-stone-200">
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Cluster</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Goals</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Pitstops</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Activities (wk)</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Open items</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {clusterStatus.map(c => (
            <tr key={c.clusterId} className="bg-white hover:bg-stone-50 transition-colors">
              <td className="px-4 py-2.5 text-sm text-stone-700 font-medium">{c.name}</td>
              <td className="px-4 py-2.5 text-sm text-right text-stone-600">{c.goalCount}</td>
              <td className="px-4 py-2.5 text-sm text-right text-stone-600">{c.pitstopCount}</td>
              <td className={`px-4 py-2.5 text-sm text-right font-medium ${c.activityCount > 0 ? "text-sky-600" : "text-stone-400"}`}>
                {c.activityCount}
              </td>
              <td className={`px-4 py-2.5 text-sm text-right font-medium ${c.checklistCount > 0 ? "text-amber-600" : "text-stone-400"}`}>
                {c.checklistCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab: Goals (RP/ZL) ────────────────────────────────────────────────────────

function GoalsTab({
  goals, userId, designation, teamMembers,
}: {
  goals: Goal[];
  userId: string;
  designation: string;
  teamMembers: TeamMember[];
}) {
  const active   = goals.filter(g => g.status === "Active");
  const paused   = goals.filter(g => g.status === "Paused");
  const complete = goals.filter(g => g.status === "Complete");

  if (designation === "ZL" && teamMembers.length > 0) {
    const myGoals   = goals.filter(g => g.ownerId === userId);
    const teamGoals = goals.filter(g => g.ownerId !== userId);
    const byMember: Record<string, Goal[]> = {};
    for (const g of teamGoals) {
      const oid = g.ownerId ?? "unknown";
      if (!byMember[oid]) byMember[oid] = [];
      byMember[oid].push(g);
    }

    return (
      <div className="space-y-6">
        <div>
          <SectionTitle>My goals ({myGoals.length})</SectionTitle>
          {myGoals.length === 0
            ? <EmptyState message="No goals assigned to you." />
            : <div className="space-y-2">{myGoals.map(g => <GoalRow key={g.id} goal={g} />)}</div>
          }
        </div>

        {Object.entries(byMember).length > 0 && (
          <div>
            <SectionTitle>Team goals</SectionTitle>
            <div className="space-y-6">
              {Object.entries(byMember).map(([ownerId, memberGoals]) => {
                const member = teamMembers.find(m => m.id === ownerId);
                return (
                  <div key={ownerId}>
                    <p className="text-xs font-medium text-stone-500 mb-2">{member?.name ?? "Unknown"}</p>
                    <div className="space-y-2">
                      {memberGoals.map(g => <GoalRow key={g.id} goal={g} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700">
          All goals <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  const showOwner = designation !== "RP";
  return (
    <div className="space-y-6">
      {active.length > 0 && (
        <div>
          <SectionTitle>Active ({active.length})</SectionTitle>
          <div className="space-y-2">{active.map(g => <GoalRow key={g.id} goal={g} showOwner={showOwner} />)}</div>
        </div>
      )}
      {paused.length > 0 && (
        <div>
          <SectionTitle>Paused ({paused.length})</SectionTitle>
          <div className="space-y-2">{paused.map(g => <GoalRow key={g.id} goal={g} showOwner={showOwner} />)}</div>
        </div>
      )}
      {complete.length > 0 && (
        <div>
          <SectionTitle>Complete ({complete.length})</SectionTitle>
          <div className="space-y-2">{complete.slice(0, 5).map(g => <GoalRow key={g.id} goal={g} showOwner={showOwner} />)}</div>
          {complete.length > 5 && (
            <Link href="/dashboard" className="text-xs text-sky-500 hover:text-sky-700 mt-1 block px-1">
              +{complete.length - 5} more completed goals
            </Link>
          )}
        </div>
      )}
      {goals.length === 0 && <EmptyState message="No goals yet." />}
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700">
        All goals <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN PILOT DASHBOARD TABS
// ══════════════════════════════════════════════════════════════════════════════

// ── Admin: Overview ───────────────────────────────────────────────────────────

function AdminOverviewTab({ dash, todayActivities }: { dash: AdminDash; todayActivities: Activity[] }) {
  const totalGoals = dash.kpis.activeGoals + dash.kpis.pausedGoals + dash.kpis.completeGoals;

  // Goal status data for bar chart
  const goalStatusData = [
    { name: "Active",   value: dash.kpis.activeGoals,   fill: "#38bdf8" },
    { name: "Paused",   value: dash.kpis.pausedGoals,   fill: "#fbbf24" },
    { name: "Complete", value: dash.kpis.completeGoals, fill: "#34d399" },
  ];

  // Pitstop status for pie chart (top 5)
  const topPitstopStatuses = dash.pitstopByStatus.slice(0, 5).map(p => ({
    name: p.status,
    value: p.count,
    fill: PITSTOP_STATUS_COLOR[p.status] ?? "#d1d5db",
  }));

  return (
    <div className="space-y-8">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <KpiTile label="Active Goals"    value={dash.kpis.activeGoals}    sub={`of ${totalGoals} total`} accent="text-sky-600" />
        <KpiTile label="Completed Goals" value={dash.kpis.completeGoals}  sub="all time"               accent="text-emerald-600" />
        <KpiTile label="Overdue Pitstops" value={dash.kpis.overduepitstops} sub="past target date"     accent={dash.kpis.overduepitstops > 0 ? "text-red-500" : "text-stone-800"} />
        <KpiTile label="Done This Month" value={dash.kpis.doneThisMonth}  sub="pitstops completed"     accent="text-violet-600" />
        <KpiTile label="This Week"       value={dash.kpis.activitiesThisWeek} sub="activities scheduled" />
        <KpiTile label="Paused Goals"    value={dash.kpis.pausedGoals}    sub="need attention"          accent={dash.kpis.pausedGoals > 0 ? "text-amber-500" : "text-stone-800"} />
        <KpiTile label="Team Members"    value={dash.kpis.totalUsers}     sub="registered users" />
        <KpiTile label="Active Zones"    value={dash.zones.filter(z => z.activeGoals > 0).length} sub={`of ${dash.zones.length} zones`} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Goal status bar chart */}
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mb-4">Goal Status Breakdown</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={goalStatusData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e7e5e4" }}
                cursor={{ fill: "#f5f5f4" }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={60}>
                {goalStatusData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pitstop status pie chart */}
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mb-4">Pitstop Status Distribution</p>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={topPitstopStatuses}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
              >
                {topPitstopStatuses.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e7e5e4" }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Domain coverage */}
      {dash.domainStats.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>Domain coverage</SectionTitle>
            <Link href="/needs" className="text-[10px] text-sky-500 hover:text-sky-700 flex items-center gap-0.5">
              Full analysis <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <DomainTable stats={dash.domainStats} />
        </div>
      )}

      {/* Alerts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Overdue pitstops */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <SectionTitle>Overdue pitstops ({dash.kpis.overduepitstops})</SectionTitle>
          </div>
          {dash.overdueList.length === 0
            ? <EmptyState message="No overdue pitstops." />
            : (
              <div className="space-y-2">
                {dash.overdueList.map(p => (
                  <Link key={p.id} href={`/goals/${p.goal.id}`}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-red-100 bg-red-50 hover:bg-red-100 transition-colors">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-800 truncate">{p.title}</p>
                      <p className="text-xs text-stone-500 truncate">{p.goal.title}</p>
                      {p.owner?.name && <p className="text-[10px] text-stone-400">{p.owner.name}</p>}
                    </div>
                    {p.targetDate && (
                      <span className="text-[10px] text-red-500 font-medium flex-shrink-0">
                        {daysAgo(p.targetDate)}d ago
                      </span>
                    )}
                  </Link>
                ))}
                {dash.kpis.overduepitstops > dash.overdueList.length && (
                  <p className="text-xs text-stone-400 px-1">+{dash.kpis.overduepitstops - dash.overdueList.length} more overdue</p>
                )}
              </div>
            )
          }
        </div>

        {/* Upcoming activities */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="w-3.5 h-3.5 text-sky-400" />
            <SectionTitle>Upcoming (next 14 days)</SectionTitle>
          </div>
          {dash.upcoming.length === 0
            ? <EmptyState message="No activities scheduled." />
            : (
              <div className="space-y-2">
                {dash.upcoming.slice(0, 8).map(a => (
                  <Link key={a.id} href="/activities"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition-colors">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${EVENT_TYPE_COLOR[a.type] ?? "bg-stone-300"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-stone-800 truncate">{a.title}</p>
                      <p className="text-xs text-stone-400">{fmtDate(a.scheduledAt)} · {fmtTime(a.scheduledAt)}</p>
                    </div>
                    <span className="text-[10px] text-stone-400 flex-shrink-0">{a.type}</span>
                  </Link>
                ))}
                {dash.upcoming.length > 8 && (
                  <Link href="/activities" className="text-xs text-sky-500 hover:text-sky-700 px-1 block">
                    +{dash.upcoming.length - 8} more →
                  </Link>
                )}
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
}

// ── Admin: Goals tab ──────────────────────────────────────────────────────────

function AdminGoalsTab({ goals }: { goals: AdminGoal[] }) {
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [domainFilter, setDomainFilter] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<"none" | "status" | "domain" | "owner">("status");
  const [sortBy, setSortBy] = useState<"title" | "progress" | "owner">("title");

  const allDomains = useMemo(() => {
    const ds = new Set(goals.map(g => g.needsDomain).filter(Boolean) as string[]);
    return Array.from(ds).sort();
  }, [goals]);

  const filtered = useMemo(() => {
    return goals.filter(g => {
      if (statusFilter !== "All" && g.status !== statusFilter) return false;
      if (domainFilter !== "All" && g.needsDomain !== domainFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!g.title.toLowerCase().includes(q) && !(g.owner?.name?.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [goals, statusFilter, domainFilter, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "progress") {
        const pa = a.pitstops.length > 0 ? a.pitstops.filter(p => p.status === "Done").length / a.pitstops.length : 0;
        const pb = b.pitstops.length > 0 ? b.pitstops.filter(p => p.status === "Done").length / b.pitstops.length : 0;
        return pa - pb;
      }
      if (sortBy === "owner") return (a.owner?.name ?? "").localeCompare(b.owner?.name ?? "");
      return a.title.localeCompare(b.title);
    });
  }, [filtered, sortBy]);

  const grouped = useMemo(() => {
    if (groupBy === "none") return { "": sorted };
    const groups: Record<string, AdminGoal[]> = {};
    for (const g of sorted) {
      let key = "";
      if (groupBy === "status") key = g.status;
      else if (groupBy === "domain") key = g.needsDomain ?? "No domain";
      else if (groupBy === "owner") key = g.owner?.name ?? "Unassigned";
      if (!groups[key]) groups[key] = [];
      groups[key].push(g);
    }
    return groups;
  }, [sorted, groupBy]);

  const groupOrder = groupBy === "status" ? ["Active", "Paused", "Complete"] : Object.keys(grouped).sort();

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="Search goals or owner…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[160px] max-w-xs text-sm border border-stone-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-sm border border-stone-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
        >
          <option value="All">All statuses</option>
          <option value="Active">Active</option>
          <option value="Paused">Paused</option>
          <option value="Complete">Complete</option>
        </select>
        {allDomains.length > 0 && (
          <select
            value={domainFilter}
            onChange={e => setDomainFilter(e.target.value)}
            className="text-sm border border-stone-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
          >
            <option value="All">All domains</option>
            {allDomains.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <select
          value={groupBy}
          onChange={e => setGroupBy(e.target.value as typeof groupBy)}
          className="text-sm border border-stone-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
        >
          <option value="status">Group by status</option>
          <option value="domain">Group by domain</option>
          <option value="owner">Group by owner</option>
          <option value="none">No grouping</option>
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="text-sm border border-stone-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
        >
          <option value="title">Sort: title</option>
          <option value="owner">Sort: owner</option>
          <option value="progress">Sort: progress ↑</option>
        </select>
        <span className="text-xs text-stone-400 ml-auto">{filtered.length} goals</span>
      </div>

      {/* Goal list */}
      {groupOrder.map(gkey => {
        const items = grouped[gkey] ?? [];
        if (items.length === 0) return null;
        return (
          <div key={gkey || "all"}>
            {groupBy !== "none" && (
              <div className="flex items-center gap-2 mb-2">
                {groupBy === "status" && <span className={`w-2 h-2 rounded-full ${STATUS_DOT[gkey] ?? "bg-stone-300"}`} />}
                <h3 className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                  {gkey} ({items.length})
                </h3>
              </div>
            )}
            <div className="space-y-2">
              {items.map(g => {
                const done  = g.pitstops.filter(p => p.status === "Done").length;
                const total = g.pitstops.length;
                const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
                return (
                  <Link key={g.id} href={`/goals/${g.id}`}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition-colors group">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[g.status] ?? "bg-stone-300"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-800 group-hover:text-sky-700 truncate">{g.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {g.owner?.name && (
                          <span className="text-[10px] text-stone-400">{g.owner.name}</span>
                        )}
                        {g.owner?.designation && (
                          <span className={`text-[10px] px-1 rounded ${DESIGNATION_COLOR[g.owner.designation] ?? "bg-stone-100 text-stone-600"}`}>
                            {g.owner.designation}
                          </span>
                        )}
                        {g.needsDomain && (
                          <span className="text-[10px] text-stone-300">{g.needsDomain}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {total > 0 && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-20 h-1 bg-stone-100 rounded-full overflow-hidden">
                            <div className="h-full bg-sky-400 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-stone-400 w-10 text-right">{done}/{total}</span>
                        </div>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_BADGE[g.status] ?? "bg-stone-50 text-stone-500 border-stone-200"}`}>
                        {g.status}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && <EmptyState message="No goals match the current filters." />}
    </div>
  );
}

// ── Admin: Geography tab ──────────────────────────────────────────────────────

function AdminGeoTab({ zones }: { zones: AdminZone[] }) {
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [cityFilter, setCityFilter] = useState<string>("All");

  const cities = useMemo(() => {
    const cs = new Set(zones.map(z => z.cityName).filter(Boolean) as string[]);
    return Array.from(cs).sort();
  }, [zones]);

  const filteredZones = cityFilter === "All" ? zones : zones.filter(z => z.cityName === cityFilter);

  // Group by city
  const byCity = useMemo(() => {
    const map: Record<string, AdminZone[]> = {};
    for (const z of filteredZones) {
      const city = z.cityName ?? "No city";
      if (!map[city]) map[city] = [];
      map[city].push(z);
    }
    return map;
  }, [filteredZones]);

  const maxZoneGoals = Math.max(...zones.map(z => z.activeGoals), 1);

  function toggleZone(id: string) {
    setExpandedZones(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* City filter */}
      {cities.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {["All", ...cities].map(c => (
            <button
              key={c}
              onClick={() => setCityFilter(c)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                cityFilter === c
                  ? "bg-sky-500 text-white border-sky-500"
                  : "border-stone-200 text-stone-600 hover:border-sky-300 hover:text-sky-600"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Zone cards by city */}
      {Object.entries(byCity).map(([city, cityZones]) => (
        <div key={city}>
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-3.5 h-3.5 text-stone-400" />
            <SectionTitle>{city}</SectionTitle>
            <span className="text-[10px] text-stone-400">{cityZones.length} zones</span>
          </div>
          <div className="space-y-2">
            {cityZones.map(z => {
              const isOpen = expandedZones.has(z.id);
              const barPct = Math.round((z.activeGoals / maxZoneGoals) * 100);
              return (
                <div key={z.id} className="rounded-lg border border-stone-200 bg-white overflow-hidden">
                  <button
                    onClick={() => toggleZone(z.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-stone-800">{z.name}</p>
                        {z.leadName && (
                          <span className="text-[10px] text-stone-400">Lead: {z.leadName}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 max-w-[120px]">
                          <ProgressBar pct={barPct} color="bg-sky-400" />
                        </div>
                        <span className="text-[11px] text-stone-500">{z.activeGoals} active goals</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] text-stone-400">{z.clusters.length} clusters</span>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
                    </div>
                  </button>

                  {isOpen && z.clusters.length > 0 && (
                    <div className="border-t border-stone-100 bg-stone-50 px-4 py-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {z.clusters.map(c => (
                          <div key={c.id} className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-stone-200">
                            <span className="text-sm text-stone-700">{c.name}</span>
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                              c.activeGoals > 0 ? "bg-sky-50 text-sky-600" : "bg-stone-100 text-stone-400"
                            }`}>
                              {c.activeGoals} goals
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {filteredZones.length === 0 && <EmptyState message="No zones found." />}
    </div>
  );
}

// ── Admin: Team tab ───────────────────────────────────────────────────────────

function AdminTeamTab({ users }: { users: AdminUser[] }) {
  const [sortCol, setSortCol] = useState<"name" | "designation" | "activeGoals" | "openPitstops">("designation");
  const [sortAsc, setSortAsc] = useState(true);
  const [desigFilter, setDesigFilter] = useState<string>("All");

  function handleSort(col: typeof sortCol) {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(true); }
  }

  const designations = useMemo(() => {
    const ds = new Set(users.map(u => u.designation));
    return DESIGNATION_ORDER.filter(d => ds.has(d));
  }, [users]);

  const filtered = desigFilter === "All" ? users : users.filter(u => u.designation === desigFilter);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortCol === "name") cmp = (a.name ?? "").localeCompare(b.name ?? "");
      else if (sortCol === "designation") {
        cmp = DESIGNATION_ORDER.indexOf(a.designation) - DESIGNATION_ORDER.indexOf(b.designation);
      }
      else if (sortCol === "activeGoals") cmp = a.activeGoals - b.activeGoals;
      else if (sortCol === "openPitstops") cmp = a.openPitstops - b.openPitstops;
      return sortAsc ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortAsc]);

  const usersById = Object.fromEntries(users.map(u => [u.id, u]));

  const maxGoals = Math.max(...users.map(u => u.activeGoals), 1);
  const maxPitstops = Math.max(...users.map(u => u.openPitstops), 1);

  function SortHeader({ col, children }: { col: typeof sortCol; children: React.ReactNode }) {
    const active = sortCol === col;
    return (
      <th
        className={`px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap ${active ? "text-sky-600" : "text-stone-500 hover:text-stone-700"}`}
        onClick={() => handleSort(col)}
      >
        {children} {active ? (sortAsc ? "↑" : "↓") : ""}
      </th>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["All", ...designations].map(d => (
          <button
            key={d}
            onClick={() => setDesigFilter(d)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              desigFilter === d
                ? "bg-sky-500 text-white border-sky-500"
                : "border-stone-200 text-stone-600 hover:border-sky-300"
            }`}
          >
            {d} {d !== "All" ? `(${users.filter(u => u.designation === d).length})` : ""}
          </button>
        ))}
        <span className="ml-auto text-xs text-stone-400 self-center">{sorted.length} members</span>
      </div>

      {/* Workload bar chart */}
      {sorted.length > 0 && sorted.length <= 20 && (
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mb-4">Active Goals per Person</p>
          <ResponsiveContainer width="100%" height={Math.max(100, sorted.length * 28)}>
            <BarChart
              data={sorted.map(u => ({ name: u.name ?? "?", goals: u.activeGoals, pitstops: u.openPitstops }))}
              layout="vertical"
              margin={{ top: 0, right: 40, left: 80, bottom: 0 }}
            >
              <XAxis type="number" tick={{ fontSize: 10, fill: "#78716c" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#57534e" }} axisLine={false} tickLine={false} width={75} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e7e5e4" }} cursor={{ fill: "#f5f5f4" }} />
              <Bar dataKey="goals" name="Active Goals" fill="#38bdf8" radius={[0, 4, 4, 0]} maxBarSize={16} />
              <Bar dataKey="pitstops" name="Open Pitstops" fill="#fbbf24" radius={[0, 4, 4, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-stone-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200">
              <th
                className={`px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide cursor-pointer ${sortCol === "name" ? "text-sky-600" : "text-stone-500 hover:text-stone-700"}`}
                onClick={() => handleSort("name")}
              >
                Name {sortCol === "name" ? (sortAsc ? "↑" : "↓") : ""}
              </th>
              <th
                className={`px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide cursor-pointer ${sortCol === "designation" ? "text-sky-600" : "text-stone-500 hover:text-stone-700"}`}
                onClick={() => handleSort("designation")}
              >
                Role {sortCol === "designation" ? (sortAsc ? "↑" : "↓") : ""}
              </th>
              <SortHeader col="activeGoals">Goals</SortHeader>
              <SortHeader col="openPitstops">Pitstops</SortHeader>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Reports to</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {sorted.map(u => {
              const manager = u.reportsToId ? usersById[u.reportsToId] : null;
              return (
                <tr key={u.id} className="bg-white hover:bg-stone-50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-stone-800">{u.name ?? <span className="text-stone-400 italic">unnamed</span>}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${DESIGNATION_COLOR[u.designation] ?? "bg-stone-100 text-stone-600"}`}>
                      {u.designation}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 justify-end">
                      <div className="w-12">
                        <ProgressBar pct={Math.round((u.activeGoals / maxGoals) * 100)} color="bg-sky-300" />
                      </div>
                      <span className={`text-sm font-medium w-5 text-right ${u.activeGoals > 0 ? "text-sky-600" : "text-stone-400"}`}>
                        {u.activeGoals}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 justify-end">
                      <div className="w-12">
                        <ProgressBar pct={Math.round((u.openPitstops / maxPitstops) * 100)} color="bg-amber-300" />
                      </div>
                      <span className={`text-sm font-medium w-5 text-right ${u.openPitstops > 5 ? "text-amber-600" : u.openPitstops > 0 ? "text-stone-700" : "text-stone-400"}`}>
                        {u.openPitstops}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-stone-500">{manager?.name ?? <span className="text-stone-300">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && <EmptyState message="No team members found." />}
    </div>
  );
}

// ── Admin: Pipeline tab ───────────────────────────────────────────────────────

function AdminPipelineTab({ dash, weekActivities }: { dash: AdminDash; weekActivities: Activity[] }) {
  const totalPitstops = dash.pitstopByStatus.reduce((s, p) => s + p.count, 0);
  const maxCount = Math.max(...dash.pitstopByStatus.map(p => p.count), 1);

  // Group upcoming by date
  const upcomingByDate = useMemo(() => {
    const map: Record<string, typeof dash.upcoming> = {};
    for (const a of dash.upcoming) {
      const dateKey = new Date(a.scheduledAt).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(a);
    }
    return map;
  }, [dash.upcoming]);

  const PITSTOP_STATUS_ORDER = ["Upcoming", "InProgress", "Blocked", "Done", "Cancelled"];

  return (
    <div className="space-y-8">
      {/* Pitstop funnel */}
      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide">Pitstop Pipeline</p>
          <span className="text-xs text-stone-400">{totalPitstops} total</span>
        </div>
        <div className="space-y-3">
          {PITSTOP_STATUS_ORDER.map(status => {
            const item = dash.pitstopByStatus.find(p => p.status === status);
            if (!item) return null;
            const pct = Math.round((item.count / maxCount) * 100);
            const pctOfTotal = totalPitstops > 0 ? Math.round((item.count / totalPitstops) * 100) : 0;
            return (
              <div key={status} className="flex items-center gap-3">
                <span className="w-20 text-xs text-stone-600 truncate">{status}</span>
                <div className="flex-1 bg-stone-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: PITSTOP_STATUS_COLOR[status] ?? "#d1d5db" }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-medium text-stone-700">{item.count}</span>
                <span className="w-9 text-right text-[10px] text-stone-400">{pctOfTotal}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pitstop status chart */}
      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mb-4">Pitstop Status Distribution</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dash.pitstopByStatus} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
            <XAxis dataKey="status" tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e7e5e4" }} cursor={{ fill: "#f5f5f4" }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {dash.pitstopByStatus.map((d, i) => (
                <Cell key={i} fill={PITSTOP_STATUS_COLOR[d.status] ?? "#d1d5db"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Upcoming activities by date */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="w-3.5 h-3.5 text-sky-400" />
          <SectionTitle>Upcoming activities — next 14 days</SectionTitle>
        </div>
        {Object.keys(upcomingByDate).length === 0
          ? <EmptyState message="No activities scheduled in the next 14 days." />
          : (
            <div className="space-y-4">
              {Object.entries(upcomingByDate).map(([dateLabel, acts]) => (
                <div key={dateLabel}>
                  <p className="text-xs font-semibold text-stone-500 mb-2">{dateLabel}</p>
                  <div className="space-y-1.5">
                    {acts.map(a => (
                      <Link key={a.id} href="/activities"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition-colors">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${EVENT_TYPE_COLOR[a.type] ?? "bg-stone-300"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-stone-800 truncate">{a.title}</p>
                          {a.location && <p className="text-xs text-stone-400">{a.location}</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] text-stone-400">{fmtTime(a.scheduledAt)}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            a.type === "Visit" ? "bg-violet-100 text-violet-600" :
                            a.type === "Meeting" ? "bg-sky-100 text-sky-600" :
                            a.type === "Training" ? "bg-emerald-100 text-emerald-600" :
                            "bg-stone-100 text-stone-500"
                          }`}>{a.type}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN HomeView
// ══════════════════════════════════════════════════════════════════════════════

const RP_TABS = [
  { key: "today",    label: "Today",          icon: CalendarClock },
  { key: "coverage", label: "Field Coverage", icon: BarChart3 },
  { key: "goals",    label: "My Goals",       icon: Target },
] as const;

const ZL_TABS = [
  { key: "today",    label: "Today",           icon: CalendarClock },
  { key: "coverage", label: "Field Coverage",  icon: BarChart3 },
  { key: "clusters", label: "Cluster Status",  icon: MapPin },
  { key: "goals",    label: "Goals",           icon: Target },
] as const;

const ADMIN_TABS = [
  { key: "overview",  label: "Overview",   icon: LayoutDashboard },
  { key: "goals",     label: "Goals",      icon: Target },
  { key: "geography", label: "Geography",  icon: MapPin },
  { key: "team",      label: "Team",       icon: Users },
  { key: "pipeline",  label: "Pipeline",   icon: TrendingUp },
  { key: "today",     label: "Today",      icon: CalendarClock },
] as const;

const OTHER_TABS = [
  { key: "today", label: "Today", icon: CalendarClock },
  { key: "goals", label: "Goals", icon: Target },
] as const;

type TabKey = "today" | "coverage" | "clusters" | "goals" | "overview" | "geography" | "team" | "pipeline";

export default function HomeView({
  userId, userName, designation, greeting, todayLabel,
  todayActivities, weekActivities, weekChecklists, myGoals,
  rpClusterStats, zlZoneName, zlClusterStats, clusterStatus, teamMembers,
  adminDash,
}: {
  userId: string;
  userName: string;
  designation: string;
  greeting: string;
  todayLabel: string;
  todayActivities: Activity[];
  weekActivities: Activity[];
  weekChecklists: ChecklistItem[];
  myGoals: Goal[];
  rpClusterStats: ClusterStat[];
  zlZoneName: string | null;
  zlClusterStats: ClusterStat[];
  clusterStatus: ClusterStatus[];
  teamMembers: TeamMember[];
  adminDash: AdminDash | null;
}) {
  const isAdmin = !!adminDash;
  const tabs = designation === "ZL" ? ZL_TABS
    : designation === "RP" ? RP_TABS
    : isAdmin ? ADMIN_TABS
    : OTHER_TABS;
  const defaultTab: TabKey = isAdmin ? "overview" : "today";
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);

  const firstName = userName.split(" ")[0] || userName;
  const designationBadge = designation !== "Other"
    ? <span className="text-xs text-stone-400 font-normal ml-1">({designation})</span>
    : null;

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-white">

      {/* Header */}
      <div className="px-5 sm:px-8 pt-6 pb-5 border-b border-stone-100">
        <h1 className="text-xl font-semibold text-stone-900">
          {greeting}{firstName ? `, ${firstName}` : ""}
          {designationBadge}
        </h1>
        <p className="text-sm text-stone-400 mt-0.5">{todayLabel}</p>
      </div>

      {/* Tab bar */}
      <div className="px-5 sm:px-8 border-b border-stone-100 overflow-x-auto">
        <div className="flex gap-1 -mb-px pt-3 min-w-max">
          {(tabs as readonly { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[]).map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-sky-500 text-sky-700"
                    : "border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className={`flex-1 px-5 sm:px-8 py-6 pb-24 sm:pb-8 ${activeTab === "overview" || activeTab === "pipeline" || activeTab === "team" ? "max-w-5xl" : "max-w-3xl"}`}>

        {/* Shared: Today */}
        {activeTab === "today" && (
          <TodayTab
            todayActivities={todayActivities}
            weekActivities={weekActivities}
            weekChecklists={weekChecklists}
            designation={designation}
          />
        )}

        {/* RP/ZL tabs */}
        {activeTab === "coverage" && designation === "RP" && (
          <RPCoverageTab clusterStats={rpClusterStats} />
        )}
        {activeTab === "coverage" && designation === "ZL" && (
          <ZLCoverageTab zoneName={zlZoneName} clusterStats={zlClusterStats} />
        )}
        {activeTab === "clusters" && designation === "ZL" && (
          <ZLClusterStatusTab clusterStatus={clusterStatus} />
        )}
        {activeTab === "goals" && !isAdmin && (
          <GoalsTab
            goals={myGoals}
            userId={userId}
            designation={designation}
            teamMembers={teamMembers}
          />
        )}

        {/* Admin tabs */}
        {activeTab === "overview" && adminDash && (
          <AdminOverviewTab dash={adminDash} todayActivities={todayActivities} />
        )}
        {activeTab === "goals" && adminDash && (
          <AdminGoalsTab goals={adminDash.goals} />
        )}
        {activeTab === "geography" && adminDash && (
          <AdminGeoTab zones={adminDash.zones} />
        )}
        {activeTab === "team" && adminDash && (
          <AdminTeamTab users={adminDash.users} />
        )}
        {activeTab === "pipeline" && adminDash && (
          <AdminPipelineTab dash={adminDash} weekActivities={weekActivities} />
        )}
      </div>
    </div>
  );
}
