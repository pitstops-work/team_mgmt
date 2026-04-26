"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import {
  CalendarClock, CheckSquare, Target, MapPin, BarChart3, ChevronRight,
  LayoutDashboard, Users, TrendingUp, AlertTriangle, CheckCircle2,
  Clock, Activity, Filter, ChevronDown, ChevronUp,
  Mic, Square, Loader2, Paperclip,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";
import type { DomainStat, ClusterStat, ClusterStatus, AdminDash, AdminGoal, AdminUser, AdminZone, OverduePitstop } from "./page";
import Avatar from "@/components/Avatar";

// ── Types ─────────────────────────────────────────────────────────────────────

type Activity = {
  id: string; title: string; type: string; scheduledAt: string;
  location: string | null; status: string;
  attendees?: { user: { id: string; name: string | null } }[];
};

type ChecklistItem = {
  id: string; text: string; status: string; checked: boolean;
  completionType: "Activity" | "Voice" | "Upload";
  activities: { id: string; title: string; status: string; scheduledAt: string; type: string }[];
  pitstop: {
    id: string; title: string; targetDate: string | null; status: string; ownerId: string;
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

type TeamMember = {
  id: string; name: string | null; image: string | null;
  rpClusters?: { id: string; name: string }[];
};

type ZLTeamActivity = {
  id: string; title: string; type: string; scheduledAt: string;
  location?: string | null; status: string;
  attendees: { user: { id: string; name: string | null } }[];
  pitstops: {
    pitstop: {
      ownerId: string;
      targetDate: string | null;
      goal: { id: string; title: string; needsClusterId: string | null };
    };
  }[];
};

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

function KpiTile({ label, value, sub, accent, href, onClick }: { label: string; value: number | string; sub?: string; accent?: string; href?: string; onClick?: () => void }) {
  const inner = (
    <>
      <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? "text-stone-800"}`}>{value}</p>
      {sub && <p className="text-[11px] text-stone-400 mt-0.5">{sub}</p>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="bg-white rounded-xl border border-stone-200 px-4 py-3.5 block hover:border-sky-200 hover:bg-sky-50/30 transition-colors">
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button onClick={onClick} className="bg-white rounded-xl border border-stone-200 px-4 py-3.5 text-left w-full hover:border-sky-200 hover:bg-sky-50/30 transition-colors">
        {inner}
      </button>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-stone-200 px-4 py-3.5">
      {inner}
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
  const names = a.attendees?.map(att => att.user.name).filter(Boolean) ?? [];
  return (
    <Link href="/activities"
      className="flex items-start gap-3 px-4 py-3 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition-colors">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${EVENT_TYPE_COLOR[a.type] ?? "bg-stone-300"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
        <p className="text-xs text-stone-400 mt-0.5">
          {fmtTime(a.scheduledAt)}{a.location ? ` · ${a.location}` : ""} · {a.type}
        </p>
        {names.length > 0 && (
          <p className="text-[10px] text-stone-400 mt-0.5 truncate">{names.join(", ")}</p>
        )}
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
  const anyHasParams = stats.some(s => s.hasParams);
  return (
    <div className="rounded-lg border border-stone-200 overflow-hidden overflow-x-auto">
      <table className="w-full text-sm min-w-[320px]">
        <thead>
          <tr className="bg-stone-50 border-b border-stone-200">
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Domain</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-stone-500 uppercase tracking-wide">
              {anyHasParams ? "Planned" : "Goals"}
            </th>
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
              <td className="px-4 py-2.5 text-sm text-right text-stone-600">
                {s.planned}
                {!s.hasParams && s.goalCount > 0 && (
                  <span className="text-[10px] text-stone-400 ml-1">goals</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-sm text-right text-emerald-600 font-medium">{s.done}</td>
              <td className={`px-4 py-2.5 text-sm text-right font-medium ${s.gap > 0 ? "text-amber-600" : "text-stone-400"}`}>{s.gap}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!anyHasParams && (
        <p className="px-4 py-2 text-[10px] text-stone-400 bg-stone-50 border-t border-stone-100">
          Showing goal counts — set targets on goals to see planned coverage numbers.
        </p>
      )}
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
                      <p className="text-[10px] text-stone-300 mt-0.5 truncate">
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

  const zoneStats: Record<string, { label: string; planned: number; done: number; gap: number; goalCount: number; doneGoalCount: number; hasParams: boolean }> = {};
  for (const c of clusterStats) {
    for (const s of c.stats) {
      if (!zoneStats[s.domain]) zoneStats[s.domain] = { label: s.label, planned: 0, done: 0, gap: 0, goalCount: 0, doneGoalCount: 0, hasParams: false };
      zoneStats[s.domain].planned      += s.planned;
      zoneStats[s.domain].done         += s.done;
      zoneStats[s.domain].gap          += s.gap;
      zoneStats[s.domain].goalCount    += s.goalCount;
      zoneStats[s.domain].doneGoalCount += s.doneGoalCount;
      if (s.hasParams) zoneStats[s.domain].hasParams = true;
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
    <div className="rounded-lg border border-stone-200 overflow-hidden overflow-x-auto">
      <table className="w-full text-sm min-w-[420px]">
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

function AdminOverviewTab({ dash, todayActivities, onTabSwitch }: { dash: AdminDash; todayActivities: Activity[]; onTabSwitch: (tab: TabKey, goalStatus?: string) => void }) {
  const totalGoals = dash.kpis.activeGoals + dash.kpis.pausedGoals + dash.kpis.completeGoals;
  const [drillDown, setDrillDown] = useState<"overdue" | "done" | null>(null);

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
        <KpiTile label="Active Goals"     value={dash.kpis.activeGoals}    sub={`of ${totalGoals} total`} accent="text-sky-600"    onClick={() => onTabSwitch("goals", "Active")} />
        <KpiTile label="Completed Goals"  value={dash.kpis.completeGoals}  sub="all time"               accent="text-emerald-600" onClick={() => onTabSwitch("goals", "Complete")} />
        <KpiTile label="Overdue Pitstops" value={dash.kpis.overduepitstops} sub="tap to see list"       accent={dash.kpis.overduepitstops > 0 ? "text-red-500" : "text-stone-800"} onClick={() => setDrillDown(v => v === "overdue" ? null : "overdue")} />
        <KpiTile label="Done This Month"  value={dash.kpis.doneThisMonth}  sub="tap to see list"        accent="text-violet-600" onClick={() => setDrillDown(v => v === "done" ? null : "done")} />
        <KpiTile label="This Week"        value={dash.kpis.activitiesThisWeek} sub="activities scheduled" href="/activities" />
        <KpiTile label="Paused Goals"     value={dash.kpis.pausedGoals}    sub="need attention"         accent={dash.kpis.pausedGoals > 0 ? "text-amber-500" : "text-stone-800"} onClick={() => onTabSwitch("goals", "Paused")} />
        <KpiTile label="Team Members"     value={dash.kpis.totalUsers}     sub="registered users"       href="/settings/users" />
        <KpiTile label="Active Zones"     value={dash.zones.filter(z => z.activeGoals > 0).length} sub={`of ${dash.zones.length} zones`} onClick={() => onTabSwitch("geography")} />
      </div>

      {/* KPI drill-down panels */}
      {drillDown === "overdue" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-sm font-semibold text-red-700">Overdue Pitstops ({dash.kpis.overduepitstops})</span>
            </div>
            <button onClick={() => setDrillDown(null)} className="text-xs text-red-400 hover:text-red-600">Close</button>
          </div>
          {dash.overdueList.length === 0
            ? <EmptyState message="No overdue pitstops." />
            : (
              <div className="space-y-2">
                {dash.overdueList.map(p => (
                  <Link key={p.id} href={`/goals/${p.goal.id}`}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-white border border-red-100 hover:border-red-300 transition-colors">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-800 truncate">{p.title}</p>
                      <p className="text-xs text-stone-500 truncate">{p.goal.title}</p>
                      {p.owner?.name && <p className="text-[10px] text-stone-400">{p.owner.name}</p>}
                    </div>
                    {p.targetDate && (
                      <span className="text-[10px] text-red-500 font-medium flex-shrink-0">
                        {daysAgo(p.targetDate)}d overdue
                      </span>
                    )}
                  </Link>
                ))}
                {dash.kpis.overduepitstops > dash.overdueList.length && (
                  <p className="text-xs text-stone-400 px-1">+{dash.kpis.overduepitstops - dash.overdueList.length} more</p>
                )}
              </div>
            )
          }
        </div>
      )}

      {drillDown === "done" && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-violet-500" />
              <span className="text-sm font-semibold text-violet-700">Done This Month ({dash.kpis.doneThisMonth})</span>
            </div>
            <button onClick={() => setDrillDown(null)} className="text-xs text-violet-400 hover:text-violet-600">Close</button>
          </div>
          {dash.doneThisMonthList.length === 0
            ? <EmptyState message="No pitstops completed this month yet." />
            : (
              <div className="space-y-2">
                {dash.doneThisMonthList.map(p => (
                  <Link key={p.id} href={`/goals/${p.goal.id}`}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-white border border-violet-100 hover:border-violet-300 transition-colors">
                    <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-800 truncate">{p.title}</p>
                      <p className="text-xs text-stone-500 truncate">{p.goal.title}</p>
                      {p.owner?.name && <p className="text-[10px] text-stone-400">{p.owner.name}</p>}
                    </div>
                  </Link>
                ))}
                {dash.kpis.doneThisMonth > dash.doneThisMonthList.length && (
                  <p className="text-xs text-stone-400 px-1">+{dash.kpis.doneThisMonth - dash.doneThisMonthList.length} more</p>
                )}
              </div>
            )
          }
        </div>
      )}

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
                {dash.upcoming.slice(0, 8).map(a => {
                  const names = a.attendees?.map(att => att.user.name).filter(Boolean) ?? [];
                  return (
                    <Link key={a.id} href="/activities"
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition-colors">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${EVENT_TYPE_COLOR[a.type] ?? "bg-stone-300"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-stone-800 truncate">{a.title}</p>
                        <p className="text-xs text-stone-400">{fmtDate(a.scheduledAt)} · {fmtTime(a.scheduledAt)}</p>
                        {names.length > 0 && (
                          <p className="text-[10px] text-stone-400 truncate">{names.join(", ")}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-stone-400 flex-shrink-0">{a.type}</span>
                    </Link>
                  );
                })}
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
  );
}

// ── Admin: Goals tab ──────────────────────────────────────────────────────────

function AdminGoalsTab({ goals, domainConfigs = [], initialStatusFilter = "All" }: { goals: AdminGoal[]; domainConfigs?: { domain: string; label: string }[]; initialStatusFilter?: string }) {
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [domainFilter, setDomainFilter] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<"none" | "status" | "domain" | "owner">("status");
  const [sortBy, setSortBy] = useState<"title" | "progress" | "owner">("title");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["Active", "Paused", "Complete"]));

  // Sync when parent changes the initial filter (e.g. clicking a KPI tile)
  const [prevInitial, setPrevInitial] = useState(initialStatusFilter);
  if (prevInitial !== initialStatusFilter) {
    setPrevInitial(initialStatusFilter);
    setStatusFilter(initialStatusFilter);
  }

  // Domain filter options from config (all domains, not just ones with goals)
  const allDomains = useMemo(() => {
    if (domainConfigs.length > 0) return domainConfigs;
    const ds = new Set(goals.map(g => g.needsDomain).filter(Boolean) as string[]);
    return Array.from(ds).sort().map(d => ({ domain: d, label: d }));
  }, [domainConfigs, goals]);

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

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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
            {allDomains.map(d => <option key={d.domain} value={d.domain}>{d.label}</option>)}
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
        const isExpanded = groupBy === "none" || expandedGroups.has(gkey);
        return (
          <div key={gkey || "all"}>
            {groupBy !== "none" && (
              <button
                onClick={() => toggleGroup(gkey)}
                className="flex items-center gap-2 mb-2 w-full text-left hover:opacity-80 transition-opacity"
              >
                {groupBy === "status" && <span className={`w-2 h-2 rounded-full ${STATUS_DOT[gkey] ?? "bg-stone-300"}`} />}
                <h3 className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider flex-1">
                  {gkey} ({items.length})
                </h3>
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
              </button>
            )}
            {isExpanded && (
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
            )}
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
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
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

  function toggleCluster(id: string) {
    setExpandedClusters(prev => {
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
                    <div className="border-t border-stone-100 bg-stone-50 px-4 py-3 space-y-2">
                      {z.clusters.map(c => {
                        const clusterOpen = expandedClusters.has(c.id);
                        return (
                          <div key={c.id} className="rounded-lg border border-stone-200 bg-white overflow-hidden">
                            <button
                              onClick={() => toggleCluster(c.id)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 transition-colors text-left"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="text-sm text-stone-700 font-medium">{c.name}</span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${
                                  c.activeGoals > 0 ? "bg-sky-50 text-sky-600" : "bg-stone-100 text-stone-400"
                                }`}>
                                  {c.activeGoals} goals
                                </span>
                                {c.settlements.length > 0 && (
                                  <span className="text-[10px] text-stone-400">{c.settlements.length} settlements</span>
                                )}
                                {c.settlements.length > 0 && (
                                  clusterOpen ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
                                )}
                              </div>
                            </button>
                            {clusterOpen && c.settlements.length > 0 && (
                              <div className="border-t border-stone-100 bg-stone-50 px-3 py-2">
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                  {c.settlements.map(s => (
                                    <span key={s.id} className="text-xs text-stone-600 px-2 py-1 bg-white rounded border border-stone-200 truncate">
                                      {s.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
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

function AdminPipelineTab({ dash }: { dash: AdminDash }) {
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

      {/* Goal status chart */}
      <div className="bg-white rounded-xl border border-stone-200 p-4">
        <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mb-4">Goal Status</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={[
              { name: "Active",   count: dash.kpis.activeGoals,   fill: "#38bdf8" },
              { name: "Paused",   count: dash.kpis.pausedGoals,   fill: "#fbbf24" },
              { name: "Complete", count: dash.kpis.completeGoals, fill: "#34d399" },
            ]}
            margin={{ top: 0, right: 8, left: -20, bottom: 0 }}
          >
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#78716c" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e7e5e4" }} cursor={{ fill: "#f5f5f4" }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={60}>
              {[{ fill: "#38bdf8" }, { fill: "#fbbf24" }, { fill: "#34d399" }].map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Upcoming activities by date */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="w-3.5 h-3.5 text-sky-400" />
          <SectionTitle>Upcoming pitstop activities — next 14 days</SectionTitle>
        </div>
        {Object.keys(upcomingByDate).length === 0
          ? <EmptyState message="No activities scheduled in the next 14 days." />
          : (
            <div className="space-y-4">
              {Object.entries(upcomingByDate).map(([dateLabel, acts]) => (
                <div key={dateLabel}>
                  <p className="text-xs font-semibold text-stone-500 mb-2">{dateLabel}</p>
                  <div className="space-y-1.5">
                    {acts.map(a => {
                      const names = a.attendees?.map(att => att.user.name).filter(Boolean) ?? [];
                      return (
                        <Link key={a.id} href="/activities"
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition-colors">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${EVENT_TYPE_COLOR[a.type] ?? "bg-stone-300"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-stone-800 truncate">{a.title}</p>
                            {a.location && <p className="text-xs text-stone-400">{a.location}</p>}
                            {names.length > 0 && <p className="text-[10px] text-stone-400 truncate">{names.join(", ")}</p>}
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
                      );
                    })}
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

// ── RP Checklist row — read-only item + activity with completion action ────────

function RPChecklistRow({
  item,
  onCompleted,
}: {
  item: ChecklistItem;
  onCompleted: (id: string) => void;
}) {
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "processing">("idle");
  const [uploading, setUploading] = useState(false);
  const [markingDone, setMarkingDone] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activity = item.activities[0] ?? null;

  async function handleActivityDone() {
    if (!activity) return;
    setMarkingDone(true);
    const res = await fetch(`/api/pitstop-events/${activity.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Done" }),
    });
    if (res.ok) onCompleted(item.id);
    setMarkingDone(false);
  }

  async function startVoiceLog() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setVoiceState("processing");
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, "voice.webm");
        const res = await fetch(`/api/checklist/${item.id}/voice`, { method: "POST", body: fd });
        if (res.ok) onCompleted(item.id);
        setVoiceState("idle");
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setVoiceState("recording");
    } catch {
      setVoiceState("idle");
    }
  }

  function stopVoiceLog() {
    mediaRecorderRef.current?.stop();
  }

  async function handleAttach(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("checklistItemId", item.id);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    setUploading(false);
    if (res.ok) onCompleted(item.id);
  }

  const isBusy = voiceState !== "idle" || uploading || markingDone;

  return (
    <div className="px-4 py-3 space-y-2">
      {/* Checklist item — read-only */}
      <div className="flex items-start gap-2.5">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${CHECKLIST_STATUS_DOT[item.status] ?? "bg-stone-200"}`} />
        <div className="min-w-0">
          <Link href={`/goals/${item.pitstop.goal.id}/pitstops/${item.pitstop.id}`}>
            <p className="text-sm text-stone-800 hover:text-sky-700 transition-colors">{item.text}</p>
            <p className="text-xs text-stone-400 mt-0.5 truncate">{item.pitstop.goal.title} · {item.pitstop.title}</p>
          </Link>
        </div>
      </div>

      {/* Linked activity with action */}
      {activity ? (
        <div className="ml-4.5 flex items-center gap-2 px-3 py-2 bg-stone-50 rounded-lg border border-stone-100">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${EVENT_TYPE_COLOR[activity.type] ?? "bg-stone-300"}`} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-stone-600 truncate">{activity.title}</p>
            <p className="text-[10px] text-stone-400">{fmtDate(activity.scheduledAt)} · {fmtTime(activity.scheduledAt)}</p>
          </div>
          {item.completionType === "Activity" && !isBusy && (
            <button
              onClick={handleActivityDone}
              className="text-xs px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-md font-medium transition-colors flex-shrink-0"
            >
              Done
            </button>
          )}
          {item.completionType === "Voice" && (
            voiceState === "recording" ? (
              <button onClick={stopVoiceLog} className="text-xs px-2.5 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-md font-medium transition-colors flex-shrink-0">
                Stop
              </button>
            ) : voiceState === "idle" && !uploading && !markingDone ? (
              <button onClick={startVoiceLog} className="flex items-center gap-1 text-xs px-2.5 py-1.5 text-stone-500 hover:text-sky-600 hover:bg-sky-50 rounded-md transition-colors flex-shrink-0">
                <Mic className="w-3 h-3" /> Log
              </button>
            ) : null
          )}
          {item.completionType === "Upload" && !isBusy && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 text-stone-500 hover:text-sky-600 hover:bg-sky-50 rounded-md transition-colors flex-shrink-0"
            >
              <Paperclip className="w-3 h-3" /> Attach
            </button>
          )}
          {(markingDone || uploading || voiceState === "processing") && (
            <Loader2 className="w-3.5 h-3.5 text-stone-400 animate-spin flex-shrink-0" />
          )}
          {voiceState === "processing" && (
            <span className="text-[10px] text-sky-600 flex-shrink-0">Transcribing…</span>
          )}
        </div>
      ) : (
        <p className="ml-4.5 text-[10px] text-stone-300 italic">No activity scheduled</p>
      )}

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleAttach(f); e.target.value = ""; }}
      />
    </div>
  );
}

// ── shared helpers ────────────────────────────────────────────────────────────

function groupBySla(activities: ZLTeamActivity[]) {
  const map: Record<string, ZLTeamActivity[]> = {};
  for (const a of activities) {
    const key = a.pitstops[0]?.pitstop.targetDate?.slice(0, 10) ?? "no-date";
    (map[key] ??= []).push(a);
  }
  return Object.entries(map).sort(([a], [b]) => {
    if (a === "no-date") return 1;
    if (b === "no-date") return -1;
    return new Date(a).getTime() - new Date(b).getTime();
  });
}

function slaHeaderLabel(dateKey: string, todayMs: number): { label: string; isOverdue: boolean } {
  if (dateKey === "no-date") return { label: "No due date", isOverdue: false };
  const dMs = new Date(dateKey).getTime();
  if (dMs === todayMs) return { label: "Due today", isOverdue: false };
  if (dMs < todayMs) return { label: `Overdue · ${fmtDate(dateKey)}`, isOverdue: true };
  return { label: `Due ${fmtDate(dateKey)}`, isOverdue: false };
}

// ── ZL Today tab ─────────────────────────────────────────────────────────────

type ZLDrillDown =
  | { type: "rp-overdue";    rpId: string }
  | { type: "rp-checklists"; rpId: string }
  | null;

function ZLTodayTab({
  userId,
  teamMembers,
  weekChecklists,
  zlOverdueActivities,
  zlMyActivities,
  clusterStatus,
}: {
  userId: string;
  teamMembers: TeamMember[];
  weekChecklists: ChecklistItem[];
  zlOverdueActivities: ZLTeamActivity[];
  zlMyActivities: ZLTeamActivity[];
  clusterStatus: ClusterStatus[];
}) {
  const [drillDown, setDrillDown] = useState<ZLDrillDown>(null);
  const [completedActivityIds, setCompletedActivityIds] = useState<Set<string>>(new Set());
  const [completedChecklistIds, setCompletedChecklistIds] = useState<Set<string>>(new Set());
  const [loadingDoneId, setLoadingDoneId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [goalFilter, setGoalFilter] = useState("all");
  const [myClusterFilter, setMyClusterFilter] = useState("all");
  const [myGoalFilter, setMyGoalFilter] = useState("all");
  const [myExpandedGroups, setMyExpandedGroups] = useState<Set<string>>(new Set());

  const todayMs = new Date(new Date().toDateString()).getTime();

  function backToTeam() {
    setDrillDown(null);
    setGoalFilter("all");
    setExpandedGroups(new Set());
  }

  function toggleGroup(key: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) {
    setter(prev => { const s = new Set(prev); if (s.has(key)) s.delete(key); else s.add(key); return s; });
  }

  async function handleDone(activityId: string) {
    setLoadingDoneId(activityId);
    await fetch(`/api/pitstop-events/${activityId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Done" }),
    });
    setCompletedActivityIds(prev => new Set([...prev, activityId]));
    setLoadingDoneId(null);
  }

  // Per-RP summaries
  const rpSummaries = teamMembers.map(rp => ({
    ...rp,
    clusterLabel: (rp.rpClusters ?? []).map(c => c.name).join(", ") || "—",
    overdueCount: zlOverdueActivities.filter(a => !completedActivityIds.has(a.id) && a.pitstops[0]?.pitstop.ownerId === rp.id).length,
    checklistCount: weekChecklists.filter(ci => !completedChecklistIds.has(ci.id) && ci.pitstop.ownerId === rp.id).length,
  }));

  // ZL's own activities: overdue + upcoming (merged)
  const myAllActivities = [
    ...zlOverdueActivities.filter(a => !completedActivityIds.has(a.id) && a.pitstops[0]?.pitstop.ownerId === userId),
    ...zlMyActivities.filter(a => !completedActivityIds.has(a.id)),
  ];

  // Cascading cluster→goal for "my activities"
  const myClusters = Array.from(
    new Map(myAllActivities.flatMap(a => {
      const cId = a.pitstops[0]?.pitstop.goal.needsClusterId;
      if (!cId) return [];
      const name = clusterStatus.find(c => c.clusterId === cId)?.name ?? cId;
      return [[cId, name]];
    })).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const myGoals = Array.from(
    new Map(myAllActivities
      .filter(a => myClusterFilter === "all" || a.pitstops[0]?.pitstop.goal.needsClusterId === myClusterFilter)
      .map(a => { const g = a.pitstops[0]?.pitstop.goal; return g ? [g.id, g.title] as [string,string] : null; })
      .filter((x): x is [string,string] => x !== null)
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const myFiltered = myAllActivities.filter(a => {
    const p = a.pitstops[0]?.pitstop;
    if (myClusterFilter !== "all" && p?.goal.needsClusterId !== myClusterFilter) return false;
    if (myGoalFilter !== "all" && p?.goal.id !== myGoalFilter) return false;
    return true;
  });
  const myByDate = groupBySla(myFiltered);

  // ── RP overdue drill-down ───────────────────────────────────────────────────
  if (drillDown?.type === "rp-overdue") {
    const rp = teamMembers.find(m => m.id === drillDown.rpId)!;
    const items = zlOverdueActivities.filter(a => !completedActivityIds.has(a.id) && a.pitstops[0]?.pitstop.ownerId === drillDown.rpId);
    const goals = Array.from(new Map(items.map(a => { const g = a.pitstops[0]?.pitstop.goal; return [g.id, g.title] as [string,string]; })).entries()).sort((a,b) => a[1].localeCompare(b[1]));
    const filtered = goalFilter === "all" ? items : items.filter(a => a.pitstops[0]?.pitstop.goal.id === goalFilter);
    const grouped = groupBySla(filtered);

    return (
      <div>
        <button onClick={backToTeam} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 mb-5 transition-colors">
          <ChevronDown className="w-4 h-4 rotate-90" /> Back to team
        </button>
        <div className="flex items-center gap-3 mb-5">
          <Avatar name={rp.name} size="sm" />
          <div>
            <p className="text-sm font-semibold text-stone-800">{rp.name}</p>
            <p className="text-xs text-stone-400">{(rp.rpClusters ?? []).map(c => c.name).join(", ") || "No cluster"} · Overdue activities</p>
          </div>
        </div>
        {goals.length > 1 && (
          <select value={goalFilter} onChange={e => { setGoalFilter(e.target.value); setExpandedGroups(new Set()); }}
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white text-stone-700 mb-3">
            <option value="all">All goals</option>
            {goals.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </select>
        )}
        {grouped.length === 0
          ? <p className="text-sm text-stone-400">No overdue activities{goalFilter !== "all" ? " for this goal" : ""}.</p>
          : <div className="space-y-3">{grouped.map(([dateKey, acts]) => {
              const { label, isOverdue: ov } = slaHeaderLabel(dateKey, todayMs);
              const expanded = expandedGroups.has(dateKey);
              return (
                <div key={dateKey} className={`rounded-xl border overflow-hidden ${ov ? "border-amber-200" : "border-stone-200"}`}>
                  <button onClick={() => toggleGroup(dateKey, setExpandedGroups)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${ov ? "bg-amber-50 hover:bg-amber-100/70" : "bg-stone-50 hover:bg-stone-100/70"}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${ov ? "text-amber-700" : "text-stone-700"}`}>{label}</p>
                      <p className="text-xs text-stone-400">{acts.length} activit{acts.length !== 1 ? "ies" : "y"}</p>
                    </div>
                    {expanded ? <ChevronUp className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />}
                  </button>
                  {expanded && (
                    <div className="divide-y divide-stone-100">
                      {acts.map(a => (
                        <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${EVENT_TYPE_COLOR[a.type] ?? "bg-stone-300"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
                            <p className="text-xs text-amber-700">{fmtDate(a.scheduledAt)} · {fmtTime(a.scheduledAt)}</p>
                          </div>
                          <button onClick={() => handleDone(a.id)} disabled={loadingDoneId === a.id}
                            className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-medium flex-shrink-0">
                            {loadingDoneId === a.id ? "…" : "Done"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}</div>
        }
      </div>
    );
  }

  // ── RP checklists drill-down ────────────────────────────────────────────────
  if (drillDown?.type === "rp-checklists") {
    const rp = teamMembers.find(m => m.id === drillDown.rpId)!;
    const items = weekChecklists.filter(ci => !completedChecklistIds.has(ci.id) && ci.pitstop.ownerId === drillDown.rpId);
    const goals = Array.from(new Map(items.map(ci => [ci.pitstop.goal.id, ci.pitstop.goal.title] as [string,string])).entries()).sort((a,b) => a[1].localeCompare(b[1]));
    const filtered = goalFilter === "all" ? items : items.filter(ci => ci.pitstop.goal.id === goalFilter);
    const grouped = Object.entries(
      filtered.reduce<Record<string, ChecklistItem[]>>((acc, ci) => {
        const key = ci.pitstop.targetDate?.slice(0, 10) ?? "no-date";
        (acc[key] ??= []).push(ci); return acc;
      }, {})
    ).sort(([a],[b]) => { if (a==="no-date") return 1; if (b==="no-date") return -1; return new Date(a).getTime()-new Date(b).getTime(); });

    return (
      <div>
        <button onClick={backToTeam} className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 mb-5 transition-colors">
          <ChevronDown className="w-4 h-4 rotate-90" /> Back to team
        </button>
        <div className="flex items-center gap-3 mb-5">
          <Avatar name={rp.name} size="sm" />
          <div>
            <p className="text-sm font-semibold text-stone-800">{rp.name}</p>
            <p className="text-xs text-stone-400">{(rp.rpClusters ?? []).map(c => c.name).join(", ") || "No cluster"} · Open checklists</p>
          </div>
        </div>
        {goals.length > 1 && (
          <select value={goalFilter} onChange={e => { setGoalFilter(e.target.value); setExpandedGroups(new Set()); }}
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white text-stone-700 mb-3">
            <option value="all">All goals</option>
            {goals.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </select>
        )}
        {items.length === 0
          ? <p className="text-sm text-stone-400">No open checklist items.</p>
          : grouped.length === 0
          ? <p className="text-sm text-stone-400">No items for this goal.</p>
          : <div className="space-y-3">{grouped.map(([dateKey, cis]) => {
              const { label, isOverdue: ov } = slaHeaderLabel(dateKey, todayMs);
              const expanded = expandedGroups.has(dateKey);
              return (
                <div key={dateKey} className={`rounded-xl border overflow-hidden ${ov ? "border-amber-200" : "border-stone-200"}`}>
                  <button onClick={() => toggleGroup(dateKey, setExpandedGroups)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${ov ? "bg-amber-50 hover:bg-amber-100/70" : "bg-stone-50 hover:bg-stone-100/70"}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${ov ? "text-amber-700" : "text-stone-700"}`}>{label}</p>
                      <p className="text-xs text-stone-400">{cis.length} item{cis.length !== 1 ? "s" : ""}</p>
                    </div>
                    {expanded ? <ChevronUp className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />}
                  </button>
                  {expanded && (
                    <div className="divide-y divide-stone-100">
                      {cis.map(ci => (
                        <RPChecklistRow key={ci.id} item={ci} onCompleted={id => setCompletedChecklistIds(prev => new Set([...prev, id]))} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}</div>
        }
      </div>
    );
  }

  // ── Summary view ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* RP health rows */}
      <div>
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Your team</p>
        {teamMembers.length === 0
          ? <p className="text-sm text-stone-400">No RPs assigned yet.</p>
          : <div className="space-y-2">
              {rpSummaries.map(rp => (
                <div key={rp.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-stone-200 bg-white">
                  <Avatar name={rp.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-stone-800 truncate">{rp.name}</p>
                    <p className="text-xs text-stone-400 truncate">{rp.clusterLabel}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {rp.overdueCount > 0
                      ? <button onClick={() => { setDrillDown({ type: "rp-overdue", rpId: rp.id }); setGoalFilter("all"); setExpandedGroups(new Set()); }}
                          className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors">
                          {rp.overdueCount} overdue
                        </button>
                      : <span className="text-xs text-stone-300">0 overdue</span>
                    }
                    {rp.checklistCount > 0
                      ? <button onClick={() => { setDrillDown({ type: "rp-checklists", rpId: rp.id }); setGoalFilter("all"); setExpandedGroups(new Set()); }}
                          className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors">
                          {rp.checklistCount} checklist
                        </button>
                      : <span className="text-xs text-stone-300">0 checklist</span>
                    }
                  </div>
                </div>
              ))}
            </div>
        }
      </div>

      {/* ZL's own activities */}
      {myAllActivities.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Your activities</p>
          {/* Filters */}
          <div className="flex gap-2 mb-3">
            {myClusters.length > 1 && (
              <select value={myClusterFilter}
                onChange={e => { setMyClusterFilter(e.target.value); setMyGoalFilter("all"); setMyExpandedGroups(new Set()); }}
                className="flex-1 px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white text-stone-700">
                <option value="all">All clusters</option>
                {myClusters.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            )}
            {myGoals.length > 1 && (
              <select value={myGoalFilter}
                onChange={e => { setMyGoalFilter(e.target.value); setMyExpandedGroups(new Set()); }}
                className="flex-1 px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white text-stone-700">
                <option value="all">All goals</option>
                {myGoals.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
              </select>
            )}
          </div>
          {myByDate.length === 0
            ? <p className="text-sm text-stone-400">No activities for this filter.</p>
            : <div className="space-y-3">{myByDate.map(([dateKey, acts]) => {
                const { label, isOverdue: ov } = slaHeaderLabel(dateKey, todayMs);
                const expanded = myExpandedGroups.has(dateKey);
                return (
                  <div key={dateKey} className={`rounded-xl border overflow-hidden ${ov ? "border-amber-200" : "border-stone-200"}`}>
                    <button onClick={() => toggleGroup(dateKey, setMyExpandedGroups)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${ov ? "bg-amber-50 hover:bg-amber-100/70" : "bg-stone-50 hover:bg-stone-100/70"}`}>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${ov ? "text-amber-700" : "text-stone-700"}`}>{label}</p>
                        <p className="text-xs text-stone-400">{acts.length} activit{acts.length !== 1 ? "ies" : "y"}</p>
                      </div>
                      {expanded ? <ChevronUp className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />}
                    </button>
                    {expanded && (
                      <div className="divide-y divide-stone-100">
                        {acts.map(a => {
                          const isOv = new Date(a.scheduledAt) < new Date(new Date().toDateString());
                          return (
                            <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${EVENT_TYPE_COLOR[a.type] ?? "bg-stone-300"}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
                                <p className={`text-xs ${isOv ? "text-amber-700" : "text-stone-400"}`}>
                                  {fmtDate(a.scheduledAt)} · {fmtTime(a.scheduledAt)}
                                </p>
                              </div>
                              {isOv && (
                                <button onClick={() => handleDone(a.id)} disabled={loadingDoneId === a.id}
                                  className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-medium flex-shrink-0">
                                  {loadingDoneId === a.id ? "…" : "Done"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}</div>
          }
        </div>
      )}
    </div>
  );
}

// ── RP Today tab — tile overview + drill-down ─────────────────────────────────

const PITSTOP_STATUS_PRIORITY: Record<string, number> = {
  InProgress: 0, Upcoming: 1, Blocked: 2,
};

function RPTodayTab({
  overdueActivities,
  todayActivities,
  weekActivities,
  weekChecklists,
  doneActivities,
}: {
  overdueActivities: Activity[];
  todayActivities: Activity[];
  weekActivities: Activity[];
  weekChecklists: ChecklistItem[];
  doneActivities: Activity[];
}) {
  type Bucket = "overdue" | "today" | "week" | "checklists" | "done";
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [loadingDoneId, setLoadingDoneId] = useState<string | null>(null);
  const [completedItemIds, setCompletedItemIds] = useState<Set<string>>(new Set());
  const [expandedSlaGroups, setExpandedSlaGroups] = useState<Set<string>>(new Set());
  const [checklistGoalFilter, setChecklistGoalFilter] = useState<string>("all");

  const now = new Date();
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  // Bucket: overdue — past + past-due-today, still Scheduled
  const pastDueToday = todayActivities.filter(
    a => new Date(a.scheduledAt) < now && a.status === "Scheduled" && !doneIds.has(a.id)
  );
  const overdueItems = [
    ...overdueActivities.filter(a => !doneIds.has(a.id)),
    ...pastDueToday,
  ].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  // Bucket: today — scheduled for today, not yet past due
  const todayItems = todayActivities.filter(
    a => new Date(a.scheduledAt) >= now && a.status === "Scheduled" && !doneIds.has(a.id)
  );

  // Bucket: rest of week — after today, still Scheduled
  const weekItems = weekActivities.filter(
    a => new Date(a.scheduledAt) > todayEnd && a.status === "Scheduled"
  );

  // Bucket: checklists — open items
  const openChecklists = weekChecklists.filter(ci => !completedItemIds.has(ci.id));
  const checklistGoals = useMemo(() => {
    const seen = new Map<string, string>();
    for (const ci of openChecklists) seen.set(ci.pitstop.goal.id, ci.pitstop.goal.title);
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [openChecklists]);
  const checklistBySlaDate = useMemo(() => {
    const filtered = checklistGoalFilter === "all"
      ? openChecklists
      : openChecklists.filter(ci => ci.pitstop.goal.id === checklistGoalFilter);
    const map: Record<string, ChecklistItem[]> = {};
    for (const ci of filtered) {
      const key = ci.pitstop.targetDate ? ci.pitstop.targetDate.slice(0, 10) : "no-date";
      if (!map[key]) map[key] = [];
      map[key].push(ci);
    }
    return Object.entries(map).sort(([a], [b]) => {
      if (a === "no-date") return 1;
      if (b === "no-date") return -1;
      return new Date(a).getTime() - new Date(b).getTime();
    });
  }, [openChecklists, checklistGoalFilter]);

  async function handleDone(eventId: string) {
    setLoadingDoneId(eventId);
    try {
      await fetch(`/api/pitstop-events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Done" }),
      });
      setDoneIds(prev => new Set([...prev, eventId]));
    } finally {
      setLoadingDoneId(null);
    }
  }

  function toggleSlaGroup(key: string) {
    setExpandedSlaGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // Activity drill-down list — used by overdue, today, week buckets
  function ActivityDrillList({
    items,
    showDone,
    emptyMsg,
  }: {
    items: Activity[];
    showDone: boolean;
    emptyMsg: string;
  }) {
    if (items.length === 0) return <EmptyState message={emptyMsg} />;

    // Group by day for week view
    const grouped: Record<string, Activity[]> = {};
    for (const a of items) {
      const day = new Date(a.scheduledAt).toDateString();
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(a);
    }
    const days = Object.keys(grouped);

    return (
      <div className="space-y-4">
        {days.map(day => (
          <div key={day}>
            {days.length > 1 && (
              <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2">
                {fmtDate(grouped[day][0].scheduledAt)}
              </p>
            )}
            <div className="space-y-2">
              {grouped[day].map(a => (
                <div
                  key={a.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                    doneIds.has(a.id)
                      ? "border-emerald-200 bg-emerald-50 opacity-60"
                      : a.status === "Done"
                      ? "border-emerald-200 bg-emerald-50"
                      : bucket === "overdue"
                      ? "border-amber-200 bg-amber-50"
                      : "border-stone-200 bg-white"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${EVENT_TYPE_COLOR[a.type] ?? "bg-stone-300"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
                    <p className={`text-xs mt-0.5 ${bucket === "overdue" ? "text-amber-700" : "text-stone-400"}`}>
                      {fmtDate(a.scheduledAt)} · {fmtTime(a.scheduledAt)}
                      {a.location ? ` · ${a.location}` : ""}
                    </p>
                  </div>
                  {a.status === "Done" || doneIds.has(a.id) ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  ) : showDone ? (
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleDone(a.id)}
                        disabled={loadingDoneId === a.id}
                        className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                      >
                        {loadingDoneId === a.id ? "…" : "Done"}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Checklist drill-down — grouped by SLA date, filterable by goal
  function ChecklistDrillList() {
    if (openChecklists.length === 0) return <EmptyState message="No open checklist items." />;
    const todayMs = new Date(new Date().toDateString()).getTime();
    return (
      <div className="space-y-3">
        {checklistGoals.length > 1 && (
          <select
            value={checklistGoalFilter}
            onChange={e => setChecklistGoalFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white text-stone-700"
          >
            <option value="all">All goals</option>
            {checklistGoals.map(([id, title]) => (
              <option key={id} value={id}>{title}</option>
            ))}
          </select>
        )}
        {checklistBySlaDate.length === 0 && <EmptyState message="No items for this goal." />}
        {checklistBySlaDate.map(([dateKey, items]) => {
          const expanded = expandedSlaGroups.has(dateKey);
          let label: string;
          let isOverdue = false;
          if (dateKey === "no-date") {
            label = "No due date";
          } else {
            const dMs = new Date(dateKey).getTime();
            if (dMs === todayMs) {
              label = "Due today";
            } else if (dMs < todayMs) {
              isOverdue = true;
              label = `Overdue · ${fmtDate(dateKey)}`;
            } else {
              label = `Due ${fmtDate(dateKey)}`;
            }
          }
          return (
            <div key={dateKey} className={`rounded-xl border overflow-hidden ${isOverdue ? "border-amber-200" : "border-stone-200"}`}>
              <button
                onClick={() => toggleSlaGroup(dateKey)}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${isOverdue ? "bg-amber-50 hover:bg-amber-100/70" : "bg-stone-50 hover:bg-stone-100/70"}`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${isOverdue ? "text-amber-700" : "text-stone-700"}`}>{label}</p>
                  <p className="text-xs text-stone-400">{items.length} item{items.length !== 1 ? "s" : ""}</p>
                </div>
                {expanded
                  ? <ChevronUp className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                  : <ChevronDown className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                }
              </button>
              {expanded && (
                <div className="divide-y divide-stone-100">
                  {items.map(ci => (
                    <RPChecklistRow
                      key={ci.id}
                      item={ci}
                      onCompleted={id => setCompletedItemIds(prev => new Set([...prev, id]))}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Tile grid
  const tiles: {
    key: Bucket; label: string; sub: string; count: number;
    bg: string; border: string; numColor: string; icon: React.ReactNode;
  }[] = [
    {
      key: "overdue",
      label: "Needs action",
      sub: "Past activities without update",
      count: overdueItems.length,
      bg: "bg-amber-50", border: "border-amber-200", numColor: "text-amber-600",
      icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    },
    {
      key: "today",
      label: "Today",
      sub: "Activities scheduled for today",
      count: todayItems.length,
      bg: "bg-sky-50", border: "border-sky-200", numColor: "text-sky-600",
      icon: <CalendarClock className="w-5 h-5 text-sky-500" />,
    },
    {
      key: "week",
      label: "Rest of week",
      sub: "Activities scheduled this week",
      count: weekItems.length,
      bg: "bg-indigo-50", border: "border-indigo-200", numColor: "text-indigo-600",
      icon: <Clock className="w-5 h-5 text-indigo-500" />,
    },
    {
      key: "checklists",
      label: "Open checklists",
      sub: "Checklist items not yet done",
      count: openChecklists.length,
      bg: "bg-violet-50", border: "border-violet-200", numColor: "text-violet-600",
      icon: <CheckSquare className="w-5 h-5 text-violet-500" />,
    },
    {
      key: "done",
      label: "Past updated",
      sub: "Activities already marked done",
      count: doneActivities.length,
      bg: "bg-emerald-50", border: "border-emerald-200", numColor: "text-emerald-600",
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
    },
  ];

  // Drill-down view
  if (bucket !== null) {
    const tile = tiles.find(t => t.key === bucket)!;
    return (
      <div>
        <button
          onClick={() => setBucket(null)}
          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 mb-5 transition-colors"
        >
          <ChevronDown className="w-4 h-4 rotate-90" />
          Back to overview
        </button>
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${tile.border} ${tile.bg} mb-5`}>
          {tile.icon}
          <div>
            <p className="text-sm font-semibold text-stone-800">{tile.label}</p>
            <p className="text-xs text-stone-500">{tile.sub}</p>
          </div>
          <span className={`ml-auto text-2xl font-bold ${tile.numColor}`}>{tile.count}</span>
        </div>

        {bucket === "overdue" && (
          <ActivityDrillList items={overdueItems} showDone emptyMsg="No overdue activities." />
        )}
        {bucket === "today" && (
          <ActivityDrillList items={todayItems} showDone emptyMsg="No activities remaining today." />
        )}
        {bucket === "week" && (
          <ActivityDrillList items={weekItems} showDone={false} emptyMsg="No activities scheduled for the rest of this week." />
        )}
        {bucket === "checklists" && <ChecklistDrillList />}
        {bucket === "done" && (
          <ActivityDrillList items={doneActivities} showDone={false} emptyMsg="No past activities marked done yet." />
        )}
      </div>
    );
  }

  // Tile overview
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t, idx) => (
          <button
            key={t.key}
            onClick={() => setBucket(t.key)}
            className={`text-left px-4 py-4 rounded-xl border ${t.border} ${t.bg} hover:shadow-sm transition-all ${
              idx === tiles.length - 1 && tiles.length % 2 !== 0 ? "col-span-2" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              {t.icon}
              <span className={`text-3xl font-bold leading-none ${t.numColor}`}>{t.count}</span>
            </div>
            <p className="text-sm font-semibold text-stone-800">{t.label}</p>
            <p className="text-[11px] text-stone-500 mt-0.5">{t.sub}</p>
          </button>
        ))}
      </div>

      {overdueItems.length > 0 && (
        <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700 font-medium flex-1">
            {overdueItems.length} activit{overdueItems.length === 1 ? "y" : "ies"} overdue — tap to update
          </p>
          <button
            onClick={() => setBucket("overdue")}
            className="text-xs font-semibold text-amber-700 hover:text-amber-900"
          >
            View →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tab: Admin Field Coverage ─────────────────────────────────────────────────

function AdminCoverageTab({ dash }: { dash: AdminDash }) {
  // Build a zone-name → DomainStat[] map from all goals, using the zones/clusters in adminDash
  const clusterToZone = new Map<string, { zoneId: string; zoneName: string }>();
  for (const zone of dash.zones) {
    for (const cluster of zone.clusters) {
      clusterToZone.set(cluster.id, { zoneId: zone.id, zoneName: zone.name });
    }
  }

  // Aggregate domain stats per zone
  const zoneStatMap: Record<string, Record<string, { label: string; planned: number; done: number; goalCount: number; doneGoalCount: number; hasParams: boolean }>> = {};
  for (const g of dash.goals) {
    if (!g.needsDomain || !g.needsClusterId) continue;
    const zoneInfo = clusterToZone.get(g.needsClusterId);
    if (!zoneInfo) continue;
    if (!zoneStatMap[zoneInfo.zoneId]) zoneStatMap[zoneInfo.zoneId] = {};
    const map = zoneStatMap[zoneInfo.zoneId];
    if (!map[g.needsDomain]) map[g.needsDomain] = { label: g.needsDomain, planned: 0, done: 0, goalCount: 0, doneGoalCount: 0, hasParams: false };
    const entry = map[g.needsDomain];
    if (g.status === "Complete") {
      entry.done += (g as any).outcomeCount ?? (g as any).parameter ?? 0;
      entry.doneGoalCount++;
    } else if (g.status !== "Cancelled") {
      entry.planned += (g as any).parameter ?? 0;
      entry.goalCount++;
      if ((g as any).parameter) entry.hasParams = true;
    }
  }

  // Resolve domain labels from global domainStats
  const labelMap = Object.fromEntries(dash.domainStats.map(d => [d.domain, d.label]));
  for (const zoneMap of Object.values(zoneStatMap)) {
    for (const entry of Object.values(zoneMap)) {
      if (labelMap[entry.label]) entry.label = labelMap[entry.label];
    }
  }

  const zonesWithStats = dash.zones
    .map(z => ({
      id: z.id,
      name: z.name,
      cityName: z.cityName,
      stats: Object.entries(zoneStatMap[z.id] ?? {})
        .map(([domain, v]) => ({
          domain,
          label: v.label,
          planned: v.planned,
          done: v.done,
          gap: Math.max(0, v.planned - v.done),
          goalCount: v.goalCount,
          doneGoalCount: v.doneGoalCount,
          hasParams: v.hasParams,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .filter(z => z.stats.length > 0);

  return (
    <div className="space-y-8">
      {/* Overall */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionTitle>All zones — overall</SectionTitle>
          <Link href="/needs" className="text-[10px] text-sky-500 hover:text-sky-700 flex items-center gap-0.5">
            Full analysis <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <DomainTable stats={dash.domainStats} />
      </div>

      {/* Per zone */}
      {zonesWithStats.length > 0 && (
        <div>
          <SectionTitle>By zone</SectionTitle>
          <div className="space-y-6">
            {zonesWithStats.map(z => (
              <div key={z.id}>
                <p className="text-xs font-medium text-stone-600 mb-2">
                  {z.name}{z.cityName ? <span className="text-stone-400 font-normal"> · {z.cityName}</span> : null}
                </p>
                <DomainTable stats={z.stats} />
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-stone-300 px-1">
        Planned = active goal targets · Done = completed outcomes · Gap = planned − done.{" "}
        <Link href="/needs" className="text-sky-400 hover:text-sky-600">See full coverage analysis →</Link>
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN HomeView
// ══════════════════════════════════════════════════════════════════════════════

const RP_TABS = [
  { key: "today",    label: "Today",          icon: CalendarClock },
  { key: "coverage", label: "Field Coverage", icon: BarChart3 },
] as const;

const ZL_TABS = [
  { key: "today",    label: "Today",           icon: CalendarClock },
  { key: "coverage", label: "Field Coverage",  icon: BarChart3 },
  { key: "clusters", label: "Cluster Status",  icon: MapPin },
  { key: "goals",    label: "Goals",           icon: Target },
] as const;

const ADMIN_TABS = [
  { key: "overview",  label: "Overview",        icon: LayoutDashboard },
  { key: "goals",     label: "Goals",           icon: Target },
  { key: "coverage",  label: "Field Coverage",  icon: BarChart3 },
  { key: "geography", label: "Geography",       icon: MapPin },
  { key: "team",      label: "Team",            icon: Users },
  { key: "pipeline",  label: "Pipeline",        icon: TrendingUp },
  { key: "today",     label: "Today",           icon: CalendarClock },
] as const;

const OTHER_TABS = [
  { key: "today", label: "Today", icon: CalendarClock },
  { key: "goals", label: "Goals", icon: Target },
] as const;

type TabKey = "today" | "coverage" | "clusters" | "goals" | "overview" | "geography" | "team" | "pipeline";

export default function HomeView({
  userId, userName, designation, greeting, todayLabel,
  todayActivities, weekActivities, weekChecklists, myGoals,
  rpClusterStats, rpOverdueActivities, rpDoneActivities, zlOverdueActivities, zlMyActivities, zlZoneName, zlClusterStats, clusterStatus, teamMembers,
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
  rpOverdueActivities: Activity[];
  rpDoneActivities: Activity[];
  zlOverdueActivities: ZLTeamActivity[];
  zlMyActivities: ZLTeamActivity[];
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
  const [goalInitialStatus, setGoalInitialStatus] = useState<string>("All");

  function onTabSwitch(tab: TabKey, goalStatus?: string) {
    if (goalStatus !== undefined) setGoalInitialStatus(goalStatus);
    setActiveTab(tab);
  }

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
      <div className="border-b border-stone-200 bg-white">
        <div className="px-5 sm:px-8 flex gap-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {(tabs as readonly { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[]).map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                  isActive
                    ? "border-sky-500 text-sky-700"
                    : "border-transparent text-stone-500 hover:text-stone-800"
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className={`flex-1 px-5 sm:px-8 py-6 pb-24 sm:pb-8 ${activeTab === "overview" || activeTab === "pipeline" || activeTab === "team" ? "max-w-5xl" : "max-w-3xl"}`}>

        {/* RP: tile overview + drill-down today view */}
        {activeTab === "today" && designation === "RP" && (
          <RPTodayTab
            overdueActivities={rpOverdueActivities}
            todayActivities={todayActivities}
            weekActivities={weekActivities}
            weekChecklists={weekChecklists}
            doneActivities={rpDoneActivities}
          />
        )}

        {/* ZL Today tab */}
        {activeTab === "today" && designation === "ZL" && (
          <ZLTodayTab
            userId={userId}
            teamMembers={teamMembers}
            weekChecklists={weekChecklists}
            zlOverdueActivities={zlOverdueActivities}
            zlMyActivities={zlMyActivities}
            clusterStatus={clusterStatus}
          />
        )}

        {/* Non-RP/ZL: shared Today tab */}
        {activeTab === "today" && designation !== "RP" && designation !== "ZL" && (
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
        {activeTab === "coverage" && isAdmin && adminDash && (
          <AdminCoverageTab dash={adminDash} />
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
          <AdminOverviewTab dash={adminDash} todayActivities={todayActivities} onTabSwitch={onTabSwitch} />
        )}
        {activeTab === "goals" && adminDash && (
          <AdminGoalsTab goals={adminDash.goals} domainConfigs={adminDash.domainConfigs} initialStatusFilter={goalInitialStatus} />
        )}
        {activeTab === "geography" && adminDash && (
          <AdminGeoTab zones={adminDash.zones} />
        )}
        {activeTab === "team" && adminDash && (
          <AdminTeamTab users={adminDash.users} />
        )}
        {activeTab === "pipeline" && adminDash && (
          <AdminPipelineTab dash={adminDash} />
        )}
      </div>
    </div>
  );
}
