"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, CheckSquare, Target, MapPin, BarChart3, ChevronRight } from "lucide-react";
import type { DomainStat, ClusterStat, ClusterStatus } from "./page";

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
function isToday(iso: string) {
  const d = new Date(iso);
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
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

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-sm text-stone-400 py-4 px-1">{message}</p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2">{children}</h3>
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
  if (stats.length === 0) return <EmptyState message="No goals recorded for this cluster yet." />;
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
              <td className="px-4 py-2.5 text-sm text-stone-700 font-medium">{s.label}</td>
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

  // Checklists due this week
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
      {/* Today's activities */}
      <div>
        <SectionTitle>Today&apos;s activities</SectionTitle>
        {todayActivities.length === 0
          ? <EmptyState message="No activities scheduled for today." />
          : <div className="space-y-2">{todayActivities.map(a => <ActivityRow key={a.id} a={a} />)}</div>
        }
      </div>

      {/* Checklists this week */}
      <div>
        <SectionTitle>
          Checklists this week{designation === "ZL" ? " (team)" : ""}
        </SectionTitle>
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

      {/* Rest of week activities */}
      <div>
        <SectionTitle>
          Later this week{designation === "ZL" ? " (team)" : ""}
        </SectionTitle>
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
        <p className="text-xs text-stone-300 mt-1">Create goals with a cluster to see coverage data here.</p>
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

  // Zone-level aggregate
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
      {/* Zone summary */}
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

      {/* Per-cluster breakdown */}
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

// ── Tab: Goals ────────────────────────────────────────────────────────────────

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
    // Group by owner for ZL
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
        {/* My goals */}
        <div>
          <SectionTitle>My goals ({myGoals.length})</SectionTitle>
          {myGoals.length === 0
            ? <EmptyState message="No goals assigned to you." />
            : <div className="space-y-2">{myGoals.map(g => <GoalRow key={g.id} goal={g} />)}</div>
          }
        </div>

        {/* Team goals by RP */}
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

  // RP / default: flat list grouped by status
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

// ── Main ──────────────────────────────────────────────────────────────────────

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

const OTHER_TABS = [
  { key: "today",    label: "Today",    icon: CalendarClock },
  { key: "goals",    label: "Goals",    icon: Target },
] as const;

type TabKey = "today" | "coverage" | "clusters" | "goals";

export default function HomeView({
  userId, userName, designation, greeting, todayLabel,
  todayActivities, weekActivities, weekChecklists, myGoals,
  rpClusterStats, zlZoneName, zlClusterStats, clusterStatus, teamMembers,
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
}) {
  const tabs = designation === "ZL" ? ZL_TABS : designation === "RP" ? RP_TABS : OTHER_TABS;
  const [activeTab, setActiveTab] = useState<TabKey>("today");

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
      <div className="px-5 sm:px-8 border-b border-stone-100">
        <div className="flex gap-1 -mb-px pt-3">
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
      <div className="flex-1 px-5 sm:px-8 py-6 pb-24 sm:pb-8 max-w-3xl">
        {activeTab === "today" && (
          <TodayTab
            todayActivities={todayActivities}
            weekActivities={weekActivities}
            weekChecklists={weekChecklists}
            designation={designation}
          />
        )}
        {activeTab === "coverage" && designation === "RP" && (
          <RPCoverageTab clusterStats={rpClusterStats} />
        )}
        {activeTab === "coverage" && designation === "ZL" && (
          <ZLCoverageTab zoneName={zlZoneName} clusterStats={zlClusterStats} />
        )}
        {activeTab === "clusters" && designation === "ZL" && (
          <ZLClusterStatusTab clusterStatus={clusterStatus} />
        )}
        {activeTab === "goals" && (
          <GoalsTab
            goals={myGoals}
            userId={userId}
            designation={designation}
            teamMembers={teamMembers}
          />
        )}
        {activeTab === "coverage" && designation !== "RP" && designation !== "ZL" && (
          <div className="text-center py-10">
            <p className="text-sm text-stone-400">Coverage data is role-specific.</p>
            <Link href="/needs" className="mt-2 inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700">
              View field coverage <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
