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
import type { DomainStat, ClusterStat, ClusterStatus, RPHealthStat, ZLHealthStat, RPPitstopDetail, AdminDash, AdminGoal, AdminUser, AdminZone, OverduePitstop, AdminPersonHealth, AdminDelayedPitstop, AdminOverdueActivity, AdminEngagementStat, AdminCityCoverage } from "./page";
import Avatar from "@/components/Avatar";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActivityGoal = {
  id: string; title: string; needsDomain: string | null;
  needsCluster:    { id: string; name: string } | null;
  needsSettlement: { id: string; name: string } | null;
  needsZone:       { id: string; name: string } | null;
};
type Activity = {
  id: string; title: string; type: string; scheduledAt: string;
  location: string | null; status: string;
  attendees?: { user: { id: string; name: string | null } }[];
  pitstops?: { pitstop: { id: string; title: string; ownerId: string; goal: ActivityGoal } }[];
};

type ChecklistItem = {
  id: string; text: string; status: string; checked: boolean;
  completionType: "Activity" | "Voice" | "Upload";
  activities: { id: string; title: string; status: string; scheduledAt: string; type: string }[];
  pitstop: {
    id: string; title: string; targetDate: string | null; status: string; ownerId: string;
    owner: { id: string; name: string | null };
    goal: { id: string; title: string; needsDomain: string | null; needsCluster: { id: string; name: string } | null };
  };
};

type Goal = {
  id: string; title: string; status: string;
  needsDomain: string | null; needsClusterId: string | null; needsZoneId: string | null;
  parameter: number | null; outcomeCount: number | null;
  ownerId: string | null;
  owner: { id: string; name: string | null } | null;
  coOwners?: { userId: string }[];
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
      goal: {
        id: string; title: string; needsDomain: string | null; needsClusterId: string | null;
        needsCluster:    { id: string; name: string } | null;
        needsSettlement: { id: string; name: string } | null;
        needsZone:       { id: string; name: string } | null;
      };
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

function activityMeta(a: Activity, uid: string) {
  const ps = a.pitstops?.[0]?.pitstop;
  const goal = ps?.goal;
  const isOwner = ps?.ownerId === uid;
  const isAttendee = !isOwner && (a.attendees?.some(at => at.user.id === uid) ?? false);
  const geo = goal?.needsSettlement?.name ?? goal?.needsCluster?.name ?? goal?.needsZone?.name ?? null;
  const domain = goal?.needsDomain ? fmtDomain(goal.needsDomain) : null;
  return { ps, goal, isOwner, isAttendee, geo, domain };
}
function WeekCard({ title, type, scheduledAt, location, goalTitle, domain, geo, role }: {
  title: string; type: string; scheduledAt: string; location?: string | null;
  goalTitle?: string | null; domain?: string | null; geo?: string | null;
  role?: "Owner" | "Attendee" | null;
}) {
  return (
    <div className="px-4 py-3 rounded-xl border border-stone-200 bg-white">
      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
        <p className="text-sm font-medium text-stone-700 truncate">{title}</p>
        {type && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ACTIVITY_TYPE_STYLE[type] ?? "bg-stone-100 text-stone-600"}`}>{type}</span>}
        {role === "Owner" && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-violet-100 text-violet-700">Owner</span>}
        {role === "Attendee" && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-sky-100 text-sky-700">Attendee</span>}
      </div>
      <p className="text-xs text-stone-400">
        {fmtTime(scheduledAt)}{location ? ` · ${location}` : ""}
      </p>
      {(goalTitle || domain || geo) && (
        <p className="text-[11px] text-stone-400 mt-0.5 truncate">
          {[goalTitle, domain, geo].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

function groupByDay<T>(items: T[], getDate: (item: T) => string): { label: string; items: T[] }[] {
  const map = new Map<string, { label: string; items: T[] }>();
  for (const item of items) {
    const d = new Date(getDate(item));
    const key = d.toDateString();
    if (!map.has(key)) map.set(key, { label: fmtDate(getDate(item)), items: [] });
    map.get(key)!.items.push(item);
  }
  return Array.from(map.values());
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
    <Link href={`/activities?date=${a.scheduledAt.slice(0, 10)}`}
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
  userId, overdueActivities, myActivities, weekChecklists,
}: {
  userId: string;
  overdueActivities: Activity[];
  myActivities: Activity[];
  weekChecklists: ChecklistItem[];
}) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [loadingDoneId, setLoadingDoneId] = useState<string | null>(null);
  const [completedItemIds, setCompletedItemIds] = useState<Set<string>>(new Set());

  const now = new Date();
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  async function handleDone(eventId: string) {
    setLoadingDoneId(eventId);
    await fetch(`/api/pitstop-events/${eventId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Done" }),
    });
    setDoneIds(prev => new Set([...prev, eventId]));
    setLoadingDoneId(null);
  }

  function isVisible(id: string) { return !doneIds.has(id); }

  const overdueItems = overdueActivities.filter(a => isVisible(a.id));
  const todayItems = myActivities.filter(
    a => isVisible(a.id) && new Date(a.scheduledAt) >= now && new Date(a.scheduledAt) <= todayEnd
  );
  const weekItems = myActivities.filter(
    a => isVisible(a.id) && new Date(a.scheduledAt) > todayEnd
  );

  // Checklists owned by this user
  const myChecklists = weekChecklists.filter(
    ci => !completedItemIds.has(ci.id) && ci.pitstop.ownerId === userId
  );

  // Group by cluster. Goals without a cluster fall into a single "No cluster" bucket.
  const UNCLUSTERED_ID = "__unclustered__";
  type Bucket = {
    id: string;
    name: string;
    overdue: Activity[];
    today: Activity[];
    checklists: ChecklistItem[];
    week: Activity[];
  };
  const bucketMap = new Map<string, Bucket>();
  const ensureBucket = (c: { id: string; name: string } | null | undefined): Bucket => {
    const id = c?.id ?? UNCLUSTERED_ID;
    const name = c?.name ?? "No cluster";
    let b = bucketMap.get(id);
    if (!b) { b = { id, name, overdue: [], today: [], checklists: [], week: [] }; bucketMap.set(id, b); }
    return b;
  };
  const activityCluster = (a: Activity) => a.pitstops?.[0]?.pitstop?.goal?.needsCluster ?? null;
  const checklistCluster = (ci: ChecklistItem) => ci.pitstop.goal.needsCluster ?? null;

  for (const a of overdueItems)    ensureBucket(activityCluster(a)).overdue.push(a);
  for (const a of todayItems)      ensureBucket(activityCluster(a)).today.push(a);
  for (const ci of myChecklists)   ensureBucket(checklistCluster(ci)).checklists.push(ci);
  for (const a of weekItems)       ensureBucket(activityCluster(a)).week.push(a);

  const buckets = [...bucketMap.values()].sort((a, b) => {
    if (a.id === UNCLUSTERED_ID) return 1;
    if (b.id === UNCLUSTERED_ID) return -1;
    return a.name.localeCompare(b.name);
  });

  const allEmpty = overdueItems.length === 0 && todayItems.length === 0 && myChecklists.length === 0;

  // Shared inline activity row (desktop)
  function ActivityRowSimple({ a, isOverdue }: { a: Activity; isOverdue: boolean }) {
    const { goal, isOwner, isAttendee, geo, domain } = activityMeta(a, userId);
    return (
      <div className={`px-4 py-3 rounded-xl border transition-colors ${
        isOverdue ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-white"
      }`}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
              {a.type && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ACTIVITY_TYPE_STYLE[a.type] ?? "bg-stone-100 text-stone-600"}`}>{a.type}</span>}
              {(isOwner || isAttendee) && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${isOwner ? "bg-violet-50 text-violet-600" : "bg-stone-100 text-stone-500"}`}>
                  {isOwner ? "Owner" : "Attendee"}
                </span>
              )}
            </div>
            <p className={`text-xs ${isOverdue ? "text-amber-700" : "text-stone-400"}`}>
              {isOverdue ? `${daysAgo(a.scheduledAt)}d overdue` : fmtTime(a.scheduledAt)}
              {a.location ? ` · ${a.location}` : ""}
            </p>
            {(goal || domain || geo) && (
              <p className="text-[11px] text-stone-400 mt-0.5 truncate">
                {[goal?.title, domain, geo].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <button onClick={() => handleDone(a.id)} disabled={loadingDoneId === a.id}
            className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-medium flex-shrink-0 transition-colors mt-0.5">
            {loadingDoneId === a.id ? "…" : "Done"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {allEmpty && buckets.length === 0 && (
        <EmptyState message="You're all caught up for today." />
      )}

      {buckets.map(bucket => {
        const totals = bucket.overdue.length + bucket.today.length + bucket.checklists.length + bucket.week.length;
        if (totals === 0) return null;
        return (
          <section
            key={bucket.id}
            className="rounded-2xl border border-stone-200 bg-white overflow-hidden"
          >
            {/* Cluster header */}
            <header className="px-4 py-3 bg-stone-50 border-b border-stone-100 flex items-center gap-2 min-w-0">
              <MapPin className="w-4 h-4 text-stone-400 flex-shrink-0" />
              <h3 className="text-sm font-semibold text-stone-800 truncate">{bucket.name}</h3>
            </header>

            <div className="p-3 space-y-5">
              {/* Needs your update */}
              {bucket.overdue.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">Needs your update</p>
                  </div>
                  <div className="space-y-2">
                    {bucket.overdue.map(a => <ActivityRowSimple key={a.id} a={a} isOverdue />)}
                  </div>
                </div>
              )}

              {/* Today */}
              {bucket.today.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2">Today</p>
                  <div className="space-y-2">
                    {bucket.today.map(a => <ActivityRowSimple key={a.id} a={a} isOverdue={false} />)}
                  </div>
                </div>
              )}

              {/* Open checklists */}
              {bucket.checklists.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2">Open checklists</p>
                  <div className="rounded-xl border border-stone-100 bg-white divide-y divide-stone-100 overflow-hidden">
                    {bucket.checklists.map(ci => (
                      <RPChecklistRow key={ci.id} item={ci} onCompleted={id => setCompletedItemIds(prev => new Set([...prev, id]))} />
                    ))}
                  </div>
                </div>
              )}

              {/* Coming up this week */}
              {bucket.week.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2">Coming up this week ({bucket.week.length})</p>
                  <div className="space-y-2">
                    {bucket.week.map(a => {
                      const { goal, isOwner, isAttendee, geo, domain } = activityMeta(a, userId);
                      const role = isOwner ? "Owner" : isAttendee ? "Attendee" : null;
                      return <WeekCard key={a.id} title={a.title} type={a.type} scheduledAt={a.scheduledAt} location={a.location} goalTitle={goal?.title} domain={domain} geo={geo} role={role} />;
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      })}

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
    // Treat co-owners as owners for "My goals" — they share responsibility.
    const isMine = (g: Goal) =>
      g.ownerId === userId || (g.coOwners ?? []).some(co => co.userId === userId);
    const myGoals   = goals.filter(isMine);
    const teamGoals = goals.filter(g => !isMine(g));
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

  const pmMembers = dash.personHealth.filter(p => p.designation === "PM");
  const slaPct = (dash.kpis.slaOnTrack + dash.kpis.overduepitstops) > 0
    ? Math.round(dash.kpis.slaOnTrack / (dash.kpis.slaOnTrack + dash.kpis.overduepitstops) * 100)
    : 100;
  const clPct = dash.kpis.checklistTotal > 0
    ? Math.round(dash.kpis.checklistDone / dash.kpis.checklistTotal * 100)
    : null;

  return (
    <div className="space-y-8">
      {/* Org health signal row */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`rounded-xl border p-4 ${dash.kpis.overdueActivities > 0 ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-white"}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 mb-1 flex items-center gap-1">
            <CalendarClock className="w-3 h-3" /> Overdue Activities
          </p>
          <p className={`text-2xl font-bold ${dash.kpis.overdueActivities > 0 ? "text-amber-700" : "text-stone-800"}`}>
            {dash.kpis.overdueActivities}
          </p>
          <button onClick={() => onTabSwitch("attention")} className="text-[10px] text-sky-500 hover:text-sky-700 mt-1">
            View triage →
          </button>
        </div>
        <div className={`rounded-xl border p-4 ${slaPct < 80 ? "border-red-200 bg-red-50" : slaPct < 95 ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-white"}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 mb-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Pitstops On-Track
          </p>
          <p className={`text-2xl font-bold ${slaPct < 80 ? "text-red-700" : slaPct < 95 ? "text-amber-700" : "text-emerald-700"}`}>
            {slaPct}%
          </p>
          <p className="text-[10px] text-stone-400 mt-1">{dash.kpis.slaOnTrack} on-track · {dash.kpis.overduepitstops} delayed</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 mb-1 flex items-center gap-1">
            <CheckSquare className="w-3 h-3" /> Checklist Completion
          </p>
          <p className="text-2xl font-bold text-teal-700">{clPct !== null ? `${clPct}%` : "—"}</p>
          {clPct !== null && <p className="text-[10px] text-stone-400 mt-1">{dash.kpis.checklistDone} of {dash.kpis.checklistTotal}</p>}
        </div>
      </div>

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

      {/* PM health chips */}
      {pmMembers.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> PM Pulse
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pmMembers.map(pm => {
              const dot = pm.overduePitstops > 0 ? "bg-red-500" : pm.overdueActivities > 0 ? "bg-amber-400" : "bg-emerald-500";
              return (
                <button
                  key={pm.userId}
                  type="button"
                  onClick={() => onTabSwitch("team-health")}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 transition-colors text-left"
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                  <span className="text-sm font-medium text-stone-800 flex-1 truncate">{pm.name}</span>
                  {pm.overduePitstops > 0 && (
                    <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded flex-shrink-0">
                      {pm.overduePitstops} delayed
                    </span>
                  )}
                  {pm.overdueActivities > 0 && (
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded flex-shrink-0">
                      {pm.overdueActivities} overdue
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
                    <Link key={a.id} href={`/activities?date=${a.scheduledAt.slice(0, 10)}`}
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

// ── Admin: Attention tab ──────────────────────────────────────────────────────

function AdminAttentionTab({ dash }: { dash: AdminDash }) {
  const [section, setSection] = useState<"pitstops" | "activities">("pitstops");
  const [desigFilter, setDesigFilter] = useState("All");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleId(id: string) {
    setExpandedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  const filteredPitstops: AdminDelayedPitstop[] = desigFilter === "All"
    ? dash.delayedPitstopsAll
    : dash.delayedPitstopsAll.filter(p => p.ownerDesignation === desigFilter);

  const filteredActivities: AdminOverdueActivity[] = desigFilter === "All"
    ? dash.overdueActivitiesList
    : dash.overdueActivitiesList.filter(a => a.ownerDesignation === desigFilter);

  const sectionCount = section === "pitstops" ? filteredPitstops.length : filteredActivities.length;

  return (
    <div className="space-y-4">
      {/* Section toggle */}
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={() => setSection("pitstops")}
          className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors ${section === "pitstops" ? "bg-red-500 text-white border-red-500" : "border-stone-200 text-stone-600 hover:border-red-300"}`}>
          {dash.delayedPitstopsAll.length} Delayed Pitstops
        </button>
        <button type="button" onClick={() => setSection("activities")}
          className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors ${section === "activities" ? "bg-amber-500 text-white border-amber-500" : "border-stone-200 text-stone-600 hover:border-amber-300"}`}>
          {dash.overdueActivitiesList.length} Overdue Activities
        </button>
      </div>

      {/* Designation filter */}
      <div className="flex gap-2 flex-wrap">
        {["All", "PM", "ZL", "RP"].map(d => (
          <button key={d} type="button" onClick={() => setDesigFilter(d)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${desigFilter === d ? "bg-sky-500 text-white border-sky-500" : "border-stone-200 text-stone-600 hover:border-sky-300"}`}>
            {d}
          </button>
        ))}
        <span className="ml-auto text-xs text-stone-400 self-center">{sectionCount} item{sectionCount !== 1 ? "s" : ""}</span>
      </div>

      {/* Delayed pitstops */}
      {section === "pitstops" && (
        <div className="space-y-2">
          {filteredPitstops.length === 0
            ? <EmptyState message="No delayed pitstops." />
            : filteredPitstops.map(p => {
                const isOpen = expandedIds.has(p.id);
                return (
                  <div key={p.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <Link href={`/goals/${p.goalId}`} className="text-sm font-medium text-stone-800 hover:text-sky-700 truncate block">{p.title}</Link>
                        <p className="text-xs text-stone-500 truncate">{p.goalTitle}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {p.ownerName && <span className="text-[10px] text-stone-500">{p.ownerName}</span>}
                          {p.ownerDesignation && (
                            <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${DESIGNATION_COLOR[p.ownerDesignation] ?? "bg-stone-100 text-stone-500"}`}>
                              {p.ownerDesignation}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {p.targetDate && (
                          <span className="text-xs font-bold text-red-700">{p.daysOverdue}d</span>
                        )}
                        {p.pendingChecklists.length > 0 && (
                          <button type="button" onClick={() => toggleId(p.id)}
                            className="text-[10px] font-medium text-violet-700 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded hover:bg-violet-100 flex items-center gap-0.5">
                            {p.pendingChecklists.length} checklist
                            {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    </div>
                    {isOpen && (
                      <div className="border-t border-stone-100 bg-stone-50 px-4 py-2 space-y-1">
                        {p.pendingChecklists.map(ci => (
                          <p key={ci.id} className="text-xs text-stone-600 flex items-start gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-stone-400 mt-1.5 flex-shrink-0" />
                            {ci.text}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
          }
        </div>
      )}

      {/* Overdue activities */}
      {section === "activities" && (
        <div className="space-y-2">
          {filteredActivities.length === 0
            ? <EmptyState message="No overdue activities." />
            : filteredActivities.map(a => (
                <div key={a.id} className="bg-white border border-stone-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${EVENT_TYPE_COLOR[a.type] ?? "bg-stone-300"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
                    {a.goalTitle && <p className="text-xs text-stone-500 truncate">{a.goalTitle}</p>}
                    <div className="flex items-center gap-2 mt-0.5">
                      {a.ownerName && <span className="text-[10px] text-stone-500">{a.ownerName}</span>}
                      {a.ownerDesignation && (
                        <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${DESIGNATION_COLOR[a.ownerDesignation] ?? "bg-stone-100 text-stone-500"}`}>
                          {a.ownerDesignation}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-amber-700 flex-shrink-0">{fmtDateShort(a.scheduledAt)}</span>
                </div>
              ))
          }
        </div>
      )}
    </div>
  );
}

// ── Admin: Team Health tab ─────────────────────────────────────────────────────

function PitstopDetailCard({ p, ownerName }: { p: RPPitstopDetail; ownerName?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-red-50 border border-red-100 rounded p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-stone-800 truncate">{p.title}</p>
          <p className="text-[10px] text-stone-500 truncate">{p.goalTitle}{ownerName && ` · ${ownerName}`}</p>
        </div>
        {p.targetDate && <span className="text-[10px] font-semibold text-red-700 flex-shrink-0">{p.daysOverdue}d overdue</span>}
      </div>
      {p.pendingChecklists.length > 0 && (
        <button type="button" onClick={() => setOpen(v => !v)}
          className="mt-1 text-[10px] text-stone-500 hover:text-stone-700 flex items-center gap-0.5">
          {p.pendingChecklists.length} pending {open ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
        </button>
      )}
      {open && (
        <ul className="mt-1 space-y-0.5 pl-2 border-l-2 border-red-200">
          {p.pendingChecklists.map(ci => (
            <li key={ci.id} className="text-[10px] text-stone-600 leading-tight">{ci.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AdminTeamHealthTab({ personHealth }: { personHealth: AdminPersonHealth[] }) {
  const [expandedPMs, setExpandedPMs] = useState<Set<string>>(new Set());
  const [expandedZLs, setExpandedZLs] = useState<Set<string>>(new Set());
  const [expandedDelayedRP, setExpandedDelayedRP] = useState<string | null>(null);
  const [expandedDelayedZL, setExpandedDelayedZL] = useState<string | null>(null);
  const [expandedDelayedPM, setExpandedDelayedPM] = useState<string | null>(null);

  const pms = personHealth.filter(p => p.designation === "PM");
  const zls = personHealth.filter(p => p.designation === "ZL");
  const rps = personHealth.filter(p => p.designation === "RP");

  function togglePM(id: string) { setExpandedPMs(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; }); }
  function toggleZL(id: string) { setExpandedZLs(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; }); }

  function zlAllDelayed(zl: AdminPersonHealth): (RPPitstopDetail & { ownerName: string })[] {
    const zlRPs = rps.filter(r => r.reportsToId === zl.userId);
    return [
      ...zl.delayedPitstops.map(p => ({ ...p, ownerName: zl.name ?? "Unnamed" })),
      ...zlRPs.flatMap(r => r.delayedPitstops.map(p => ({ ...p, ownerName: r.name ?? "Unnamed" }))),
    ];
  }

  function pmAllDelayed(pm: AdminPersonHealth): (RPPitstopDetail & { ownerName: string })[] {
    const pmZLs = zls.filter(z => z.reportsToId === pm.userId);
    const pmRPs = rps.filter(r => pmZLs.some(z => z.userId === r.reportsToId));
    return [
      ...pm.delayedPitstops.map(p => ({ ...p, ownerName: pm.name ?? "Unnamed" })),
      ...pmZLs.flatMap(z => z.delayedPitstops.map(p => ({ ...p, ownerName: z.name ?? "Unnamed" }))),
      ...pmRPs.flatMap(r => r.delayedPitstops.map(p => ({ ...p, ownerName: r.name ?? "Unnamed" }))),
    ];
  }

  function pmAgg(pm: AdminPersonHealth) {
    const pmZLs = zls.filter(z => z.reportsToId === pm.userId);
    const pmRPs = rps.filter(r => pmZLs.some(z => z.userId === r.reportsToId));
    const team = [...pmZLs, ...pmRPs];
    return {
      zlCount: pmZLs.length, rpCount: pmRPs.length,
      delayed: pm.overduePitstops + team.reduce((s, m) => s + m.overduePitstops, 0),
      overdueActs: pm.overdueActivities + team.reduce((s, m) => s + m.overdueActivities, 0),
      clDone: pm.doneChecklists + team.reduce((s, m) => s + m.doneChecklists, 0),
      clTotal: pm.totalChecklists + team.reduce((s, m) => s + m.totalChecklists, 0),
    };
  }

  function zlAgg(zl: AdminPersonHealth) {
    const zlRPs = rps.filter(r => r.reportsToId === zl.userId);
    return {
      rpCount: zlRPs.length,
      delayed: zl.overduePitstops + zlRPs.reduce((s, r) => s + r.overduePitstops, 0),
      overdueActs: zl.overdueActivities + zlRPs.reduce((s, r) => s + r.overdueActivities, 0),
      clDone: zl.doneChecklists + zlRPs.reduce((s, r) => s + r.doneChecklists, 0),
      clTotal: zl.totalChecklists + zlRPs.reduce((s, r) => s + r.totalChecklists, 0),
    };
  }

  // ZLs not under any PM in the health list
  const unmanagedZLs = zls.filter(z => !pms.some(pm => pm.userId === z.reportsToId));
  // RPs not under any ZL in the health list
  const unmanagedRPs = rps.filter(r => !zls.some(z => z.userId === r.reportsToId));

  function RPCard({ rp }: { rp: AdminPersonHealth }) {
    const isDelayedOpen = expandedDelayedRP === rp.userId;
    const dot = rp.overduePitstops > 0 ? "bg-red-500" : rp.overdueActivities > 0 ? "bg-amber-400" : "bg-emerald-500";
    const clPct = rp.totalChecklists > 0 ? Math.round(rp.doneChecklists / rp.totalChecklists * 100) : null;
    return (
      <div className="bg-white border border-stone-200 rounded-lg p-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <Avatar name={rp.name} image={rp.image} size="xs" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-stone-800 truncate">{rp.name}</p>
            {clPct !== null && <p className="text-[10px] text-stone-400">{rp.doneChecklists}/{rp.totalChecklists} · {clPct}%</p>}
          </div>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
        </div>
        {rp.totalGoals > 0 && (
          <div className="mb-1.5">
            <HealthBar value={rp.completeGoals} total={rp.totalGoals} color="bg-emerald-500" />
            <p className="text-[10px] text-stone-400 mt-0.5">{rp.completeGoals}/{rp.totalGoals} goals</p>
          </div>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          {rp.overduePitstops > 0 ? (
            <button type="button" onClick={() => setExpandedDelayedRP(isDelayedOpen ? null : rp.userId)}
              className="text-[10px] font-medium text-red-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded hover:bg-red-100 flex items-center gap-0.5">
              {rp.overduePitstops} delayed {isDelayedOpen ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            </button>
          ) : <span className="text-[10px] text-stone-300">0 delayed</span>}
          {rp.overdueActivities > 0 && (
            <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
              {rp.overdueActivities} overdue
            </span>
          )}
        </div>
        {isDelayedOpen && rp.delayedPitstops.length > 0 && (
          <div className="mt-2 space-y-1.5 border-t border-stone-100 pt-2">
            {(rp.delayedPitstops as RPPitstopDetail[]).map(p => (
              <PitstopDetailCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (personHealth.length === 0) {
    return <EmptyState message="No team members found." />;
  }

  return (
    <div className="space-y-3">
      {/* PM-level cards */}
      {pms.map(pm => {
        const agg = pmAgg(pm);
        const isOpen = expandedPMs.has(pm.userId);
        const pmZLs = zls.filter(z => z.reportsToId === pm.userId);
        const dot = agg.delayed > 0 ? "bg-red-500" : agg.overdueActs > 0 ? "bg-amber-400" : "bg-emerald-500";
        const clPct = agg.clTotal > 0 ? Math.round(agg.clDone / agg.clTotal * 100) : null;
        const pmDelayed = pmAllDelayed(pm);
        const isPMDelayedOpen = expandedDelayedPM === pm.userId;
        return (
          <div key={pm.userId} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
              <Avatar name={pm.name} image={pm.image} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-800">{pm.name ?? "Unnamed"}</p>
                <p className="text-xs text-stone-400">{agg.zlCount} ZL{agg.zlCount !== 1 ? "s" : ""} · {agg.rpCount} RP{agg.rpCount !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {agg.delayed > 0 && (
                  <button type="button" onClick={() => setExpandedDelayedPM(isPMDelayedOpen ? null : pm.userId)}
                    className="text-xs font-medium text-red-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded hover:bg-red-100 flex items-center gap-0.5">
                    {agg.delayed} delayed
                    {isPMDelayedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
                {agg.overdueActs > 0 && (
                  <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">{agg.overdueActs} overdue</span>
                )}
                <span className={`w-2 h-2 rounded-full ${dot}`} />
              </div>
            </div>
            {isPMDelayedOpen && pmDelayed.length > 0 && (
              <div className="px-4 pb-3 pt-2 space-y-1.5 border-t border-red-50">
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Delayed Pitstops</p>
                {pmDelayed.map(p => <PitstopDetailCard key={`${pm.userId}-${p.id}`} p={p} ownerName={p.ownerName} />)}
              </div>
            )}
            {clPct !== null && (
              <div className="px-4 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-stone-400 flex items-center gap-1"><CheckSquare className="w-3 h-3" /> Team checklist</span>
                  <span className="text-[10px] text-stone-400">{agg.clDone}/{agg.clTotal} · {clPct}%</span>
                </div>
                <HealthBar value={agg.clDone} total={agg.clTotal} color="bg-teal-500" />
              </div>
            )}
            {pmZLs.length > 0 && (
              <button type="button" onClick={() => togglePM(pm.userId)}
                className="w-full text-xs text-sky-700 bg-sky-50 border-t border-sky-100 px-4 py-2 flex items-center justify-center gap-1 hover:bg-sky-100 transition-colors">
                {isOpen ? "Hide" : "Show"} {pmZLs.length} ZL{pmZLs.length !== 1 ? "s" : ""}
                {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
            {isOpen && (
              <div className="border-t border-stone-100 bg-stone-50 px-3 py-3 space-y-2">
                {pmZLs.map(zl => {
                  const zAgg = zlAgg(zl);
                  const zlRPs = rps.filter(r => r.reportsToId === zl.userId);
                  const zlOpen = expandedZLs.has(zl.userId);
                  const zDot = zAgg.delayed > 0 ? "bg-red-500" : zAgg.overdueActs > 0 ? "bg-amber-400" : "bg-emerald-500";
                  const zClPct = zAgg.clTotal > 0 ? Math.round(zAgg.clDone / zAgg.clTotal * 100) : null;
                  const zlDelayed = zlAllDelayed(zl);
                  const isZLDelayedOpen = expandedDelayedZL === zl.userId;
                  return (
                    <div key={zl.userId} className="bg-white border border-stone-200 rounded-lg overflow-hidden">
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        <Avatar name={zl.name} image={zl.image} size="xs" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-stone-800">{zl.name ?? "Unnamed"}</p>
                          <p className="text-[10px] text-stone-400">
                            {zAgg.rpCount} RP{zAgg.rpCount !== 1 ? "s" : ""}
                            {zClPct !== null && <span> · {zClPct}% checklist</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {zAgg.delayed > 0 && (
                            <button type="button" onClick={() => setExpandedDelayedZL(isZLDelayedOpen ? null : zl.userId)}
                              className="text-[10px] font-medium text-red-700 bg-red-50 border border-red-100 px-1 py-0.5 rounded hover:bg-red-100 flex items-center gap-0.5">
                              {zAgg.delayed} delayed
                              {isZLDelayedOpen ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                            </button>
                          )}
                          {zAgg.overdueActs > 0 && (
                            <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-100 px-1 py-0.5 rounded">{zAgg.overdueActs} overdue</span>
                          )}
                          <span className={`w-1.5 h-1.5 rounded-full ${zDot}`} />
                        </div>
                      </div>
                      {isZLDelayedOpen && zlDelayed.length > 0 && (
                        <div className="px-3 py-2 space-y-1.5 border-t border-red-50">
                          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Delayed Pitstops</p>
                          {zlDelayed.map(p => <PitstopDetailCard key={`${zl.userId}-${p.id}`} p={p} ownerName={p.ownerName} />)}
                        </div>
                      )}
                      {zlRPs.length > 0 && (
                        <button type="button" onClick={() => toggleZL(zl.userId)}
                          className="w-full text-[10px] text-stone-500 bg-stone-50 border-t border-stone-100 px-3 py-1.5 flex items-center justify-center gap-1 hover:bg-stone-100 transition-colors">
                          {zlOpen ? "Hide" : "Show"} {zlRPs.length} RP{zlRPs.length !== 1 ? "s" : ""}
                          {zlOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                      {zlOpen && (
                        <div className="border-t border-stone-100 bg-stone-50 px-2 py-2 space-y-1.5">
                          {zlRPs.map(rp => <RPCard key={rp.userId} rp={rp} />)}
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

      {/* ZLs not under any PM */}
      {unmanagedZLs.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">ZLs (unassigned to PM)</p>
          <div className="space-y-2">
            {unmanagedZLs.map(zl => {
              const zAgg = zlAgg(zl);
              const zlRPs = rps.filter(r => r.reportsToId === zl.userId);
              const zlOpen = expandedZLs.has(zl.userId);
              const dot = zAgg.delayed > 0 ? "bg-red-500" : zAgg.overdueActs > 0 ? "bg-amber-400" : "bg-emerald-500";
              const zlDelayed = zlAllDelayed(zl);
              const isZLDelayedOpen = expandedDelayedZL === zl.userId;
              return (
                <div key={zl.userId} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2.5 px-4 py-3">
                    <Avatar name={zl.name} image={zl.image} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-800">{zl.name ?? "Unnamed"}</p>
                      <p className="text-xs text-stone-400">{zAgg.rpCount} RP{zAgg.rpCount !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {zAgg.delayed > 0 && (
                        <button type="button" onClick={() => setExpandedDelayedZL(isZLDelayedOpen ? null : zl.userId)}
                          className="text-xs font-medium text-red-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded hover:bg-red-100 flex items-center gap-0.5">
                          {zAgg.delayed} delayed
                          {isZLDelayedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                      {zAgg.overdueActs > 0 && <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">{zAgg.overdueActs} overdue</span>}
                      <span className={`w-2 h-2 rounded-full ${dot}`} />
                    </div>
                  </div>
                  {isZLDelayedOpen && zlDelayed.length > 0 && (
                    <div className="px-4 py-2 space-y-1.5 border-t border-red-50">
                      <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Delayed Pitstops</p>
                      {zlDelayed.map(p => <PitstopDetailCard key={`${zl.userId}-${p.id}`} p={p} ownerName={p.ownerName} />)}
                    </div>
                  )}
                  {zlRPs.length > 0 && (
                    <button type="button" onClick={() => toggleZL(zl.userId)}
                      className="w-full text-xs text-stone-500 bg-stone-50 border-t border-stone-100 px-4 py-2 flex items-center justify-center gap-1 hover:bg-stone-100">
                      {zlOpen ? "Hide" : "Show"} {zlRPs.length} RP{zlRPs.length !== 1 ? "s" : ""}
                      {zlOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  )}
                  {zlOpen && (
                    <div className="border-t border-stone-100 bg-stone-50 px-2 py-2 space-y-1.5">
                      {zlRPs.map(rp => <RPCard key={rp.userId} rp={rp} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* RPs not under any ZL */}
      {unmanagedRPs.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">RPs (unassigned to ZL)</p>
          <div className="space-y-1.5">
            {unmanagedRPs.map(rp => <RPCard key={rp.userId} rp={rp} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin: Engagement tab ────────────────────────────────────────────────────

const DESIGNATION_COLOR_ENG: Record<string, string> = {
  RP: "bg-violet-100 text-violet-700",
  ZL: "bg-sky-100 text-sky-700",
  PM: "bg-amber-100 text-amber-700",
};

function engLevel(s: AdminEngagementStat): "good" | "at-risk" | "poor" | "inactive" {
  const daysAgo = s.lastLoginAt
    ? Math.floor((Date.now() - new Date(s.lastLoginAt).getTime()) / 86400000)
    : Infinity;
  if (daysAgo > 30 && s.logins30d === 0) return "inactive";
  if (daysAgo > 14 || s.completionRate < 30 || s.stalePitstopCount > 3) return "poor";
  if (daysAgo > 7  || s.completionRate < 60 || s.stalePitstopCount > 0) return "at-risk";
  return "good";
}

function AdminEngagementTab({ engagement }: { engagement: AdminEngagementStat[] }) {
  const [sortBy, setSortBy] = useState<"login" | "completion" | "freshness">("login");

  const sorted = useMemo(() => [...engagement].sort((a, b) => {
    if (sortBy === "login") {
      if (!a.lastLoginAt && !b.lastLoginAt) return 0;
      if (!a.lastLoginAt) return -1;
      if (!b.lastLoginAt) return 1;
      return new Date(a.lastLoginAt).getTime() - new Date(b.lastLoginAt).getTime();
    }
    if (sortBy === "completion") return a.completionRate - b.completionRate;
    // freshness
    if (!a.lastPitstopActivityAt && !b.lastPitstopActivityAt) return 0;
    if (!a.lastPitstopActivityAt) return -1;
    if (!b.lastPitstopActivityAt) return 1;
    return new Date(a.lastPitstopActivityAt).getTime() - new Date(b.lastPitstopActivityAt).getTime();
  }), [engagement, sortBy]);

  function daysAgoLabel(iso: string | null): { label: string; color: string } {
    if (!iso) return { label: "Never", color: "text-stone-400" };
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (d === 0) return { label: "Today",   color: "text-emerald-600" };
    if (d === 1) return { label: "Yesterday", color: "text-emerald-600" };
    if (d <= 7)  return { label: `${d}d ago`, color: "text-amber-600" };
    if (d <= 30) return { label: `${d}d ago`, color: "text-red-600" };
    return { label: `${d}d ago`, color: "text-red-700 font-semibold" };
  }

  const LEVEL_BADGE = {
    good:     "bg-emerald-100 text-emerald-700",
    "at-risk": "bg-amber-100 text-amber-700",
    poor:     "bg-red-100 text-red-700",
    inactive: "bg-stone-100 text-stone-500",
  };

  if (engagement.length === 0) return <EmptyState message="No engagement data yet." />;

  return (
    <div className="space-y-3">
      {/* Sort controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-stone-400 font-medium">Sort worst-first by:</span>
        {(["login", "completion", "freshness"] as const).map(k => (
          <button key={k} type="button" onClick={() => setSortBy(k)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              sortBy === k
                ? "bg-stone-800 text-white border-stone-800"
                : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
            }`}>
            {k === "login" ? "Last Login" : k === "completion" ? "Completion Rate" : "Pitstop Freshness"}
          </button>
        ))}
      </div>

      {/* Per-person cards */}
      {sorted.map(s => {
        const level = engLevel(s);
        const login = daysAgoLabel(s.lastLoginAt);
        const freshness = daysAgoLabel(s.lastPitstopActivityAt);
        const total = s.sameDayCount + s.nextDayCount + s.twothreeDayCount + s.withinWeekCount + s.weekPlusCount + s.neverCompletedCount;
        const crColor = s.activitiesTotal === 0 ? "text-stone-400"
          : s.completionRate >= 70 ? "text-emerald-600"
          : s.completionRate >= 40 ? "text-amber-600"
          : "text-red-600";

        return (
          <div key={s.userId} className="bg-white border border-stone-200 rounded-xl p-4">
            {/* Header row */}
            <div className="flex items-center gap-3 mb-3">
              <Avatar name={s.name} image={s.image} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-semibold text-stone-800">{s.name ?? "Unnamed"}</p>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${DESIGNATION_COLOR_ENG[s.designation] ?? "bg-stone-100 text-stone-600"}`}>
                    {s.designation}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${LEVEL_BADGE[level]}`}>
                    {level === "good" ? "Engaged" : level === "at-risk" ? "At Risk" : level === "poor" ? "Low Engagement" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-3 gap-3">
              {/* Login */}
              <div className="bg-stone-50 rounded-lg p-2.5">
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Last Login</p>
                <p className={`text-sm font-bold ${login.color}`}>{login.label}</p>
                <p className="text-[10px] text-stone-400 mt-0.5">
                  {s.logins7d}× this week · {s.logins30d}× this month
                </p>
              </div>

              {/* Activity completion */}
              <div className="bg-stone-50 rounded-lg p-2.5">
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Activity Completion</p>
                {s.activitiesTotal === 0 ? (
                  <p className="text-xs text-stone-400">No activities yet</p>
                ) : (
                  <>
                    <p className={`text-sm font-bold ${crColor}`}>
                      {s.completionRate}%
                      <span className="text-[10px] font-normal text-stone-400 ml-1">({s.activitiesCompleted}/{s.activitiesTotal})</span>
                    </p>
                    {total > 0 && (
                      <div className="flex gap-px mt-1.5 h-2 rounded overflow-hidden">
                        {s.sameDayCount      > 0 && <div className="bg-emerald-500" style={{ width: `${s.sameDayCount / total * 100}%` }} title={`Same day: ${s.sameDayCount}`} />}
                        {s.nextDayCount      > 0 && <div className="bg-lime-400"    style={{ width: `${s.nextDayCount / total * 100}%` }} title={`+1 day: ${s.nextDayCount}`} />}
                        {s.twothreeDayCount  > 0 && <div className="bg-amber-400"   style={{ width: `${s.twothreeDayCount / total * 100}%` }} title={`2-3 days: ${s.twothreeDayCount}`} />}
                        {s.withinWeekCount   > 0 && <div className="bg-orange-400"  style={{ width: `${s.withinWeekCount / total * 100}%` }} title={`4-7 days: ${s.withinWeekCount}`} />}
                        {s.weekPlusCount     > 0 && <div className="bg-red-400"     style={{ width: `${s.weekPlusCount / total * 100}%` }} title={`Week+: ${s.weekPlusCount}`} />}
                        {s.neverCompletedCount > 0 && <div className="bg-stone-300" style={{ width: `${s.neverCompletedCount / total * 100}%` }} title={`Never: ${s.neverCompletedCount}`} />}
                      </div>
                    )}
                    {total > 0 && (
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        {s.sameDayCount      > 0 && <span className="text-[9px] text-emerald-600">●{s.sameDayCount} same-day</span>}
                        {s.nextDayCount      > 0 && <span className="text-[9px] text-lime-600">●{s.nextDayCount} +1d</span>}
                        {s.twothreeDayCount  > 0 && <span className="text-[9px] text-amber-600">●{s.twothreeDayCount} 2-3d</span>}
                        {s.withinWeekCount   > 0 && <span className="text-[9px] text-orange-600">●{s.withinWeekCount} 4-7d</span>}
                        {s.weekPlusCount     > 0 && <span className="text-[9px] text-red-600">●{s.weekPlusCount} week+</span>}
                        {s.neverCompletedCount > 0 && <span className="text-[9px] text-stone-400">●{s.neverCompletedCount} never</span>}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Pitstop freshness */}
              <div className="bg-stone-50 rounded-lg p-2.5">
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Pitstop Activity</p>
                <p className={`text-sm font-bold ${freshness.color}`}>{freshness.label}</p>
                <p className="text-[10px] text-stone-400 mt-0.5">
                  {s.totalActivePitstops} open
                  {s.stalePitstopCount > 0 && (
                    <span className="text-red-600 font-medium"> · {s.stalePitstopCount} stale</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap pt-1">
        <p className="text-[10px] text-stone-400 font-medium">Completion speed:</p>
        {[
          { color: "bg-emerald-500", label: "same-day" },
          { color: "bg-lime-400",    label: "+1d" },
          { color: "bg-amber-400",   label: "2-3d" },
          { color: "bg-orange-400",  label: "4-7d" },
          { color: "bg-red-400",     label: "week+" },
          { color: "bg-stone-300",   label: "never" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1 text-[10px] text-stone-500">
            <span className={`w-2 h-2 rounded-sm ${color}`} />{label}
          </span>
        ))}
      </div>
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
                        <Link key={a.id} href={`/activities?date=${a.scheduledAt.slice(0, 10)}`}
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

// ── PM components ────────────────────────────────────────────────────────────

type PMTeamMember = { id: string; name: string | null; image: string | null; reportsToId: string | null };
type PMDrillDown =
  | { type: "zl-overdue"; zlId: string }
  | { type: "zl-checklists"; zlId: string }
  | { type: "rp-overdue"; rpId: string }
  | { type: "rp-checklists"; rpId: string }
  | null;

function PMTodayTab({
  userId,
  zlMembers,
  rpMembers,
  pmZLOverdueActivities,
  pmZLChecklists,
  pmMyActivities,
  pmRPOverdueActivities,
  pmRPChecklists,
}: {
  userId: string;
  zlMembers: PMTeamMember[];
  rpMembers: PMTeamMember[];
  pmZLOverdueActivities: ZLTeamActivity[];
  pmZLChecklists: ChecklistItem[];
  pmMyActivities: ZLTeamActivity[];
  pmRPOverdueActivities: ZLTeamActivity[];
  pmRPChecklists: ChecklistItem[];
}) {
  const [completedActivityIds, setCompletedActivityIds] = useState<Set<string>>(new Set());
  const [completedChecklistIds, setCompletedChecklistIds] = useState<Set<string>>(new Set());
  const [loadingDoneId, setLoadingDoneId] = useState<string | null>(null);
  const [expandedZLIds, setExpandedZLIds] = useState<Set<string>>(new Set());
  const [expandedRPIds, setExpandedRPIds] = useState<Set<string>>(new Set());
  const [expandedZLChecklistIds, setExpandedZLChecklistIds] = useState<Set<string>>(new Set());
  const [expandedRPChecklistIds, setExpandedRPChecklistIds] = useState<Set<string>>(new Set());
  const [weekExpanded, setWeekExpanded] = useState(false);

  const now = new Date();
  const todayStart = new Date(now.toDateString()).getTime();
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  function toggleId(id: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) {
    setter(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
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

  // ── Derived data ─────────────────────────────────────────────────────────────

  // ZL attention: ZLs with overdue activities (excluding PM's own)
  const zlAttention = zlMembers
    .map(zl => ({
      ...zl,
      overdueItems: pmZLOverdueActivities.filter(a => !completedActivityIds.has(a.id) && a.pitstops[0]?.pitstop.ownerId === zl.id),
    }))
    .filter(zl => zl.overdueItems.length > 0)
    .sort((a, b) => b.overdueItems.length - a.overdueItems.length);

  // RP attention: RPs with overdue activities, grouped by ZL
  const rpAttentionByZL = zlMembers.map(zl => ({
    zl,
    rps: rpMembers
      .filter(rp => rp.reportsToId === zl.id)
      .map(rp => ({
        ...rp,
        overdueItems: pmRPOverdueActivities.filter(a => !completedActivityIds.has(a.id) && a.pitstops[0]?.pitstop.ownerId === rp.id),
      }))
      .filter(rp => rp.overdueItems.length > 0)
      .sort((a, b) => b.overdueItems.length - a.overdueItems.length),
  })).filter(g => g.rps.length > 0);

  // ZL checklists
  const zlChecklists = zlMembers
    .map(zl => ({
      ...zl,
      items: pmZLChecklists.filter(ci => !completedChecklistIds.has(ci.id) && ci.pitstop.ownerId === zl.id),
    }))
    .filter(zl => zl.items.length > 0);

  // RP checklists grouped by ZL
  const rpChecklistsByZL = zlMembers.map(zl => ({
    zl,
    rps: rpMembers
      .filter(rp => rp.reportsToId === zl.id)
      .map(rp => ({
        ...rp,
        items: pmRPChecklists.filter(ci => !completedChecklistIds.has(ci.id) && ci.pitstop.ownerId === rp.id),
      }))
      .filter(rp => rp.items.length > 0),
  })).filter(g => g.rps.length > 0);

  const hasTeamChecklists = zlChecklists.length > 0 || rpChecklistsByZL.length > 0;

  // PM's own activities
  const myOverdue = pmZLOverdueActivities.filter(
    a => !completedActivityIds.has(a.id) && a.pitstops[0]?.pitstop.ownerId === userId
  );
  const myToday = pmMyActivities.filter(
    a => !completedActivityIds.has(a.id) && new Date(a.scheduledAt) >= now && new Date(a.scheduledAt) <= todayEnd
  );
  const myWeek = pmMyActivities.filter(
    a => !completedActivityIds.has(a.id) && new Date(a.scheduledAt) > todayEnd
  );

  const allClear = zlAttention.length === 0 && rpAttentionByZL.length === 0
    && myOverdue.length === 0 && myToday.length === 0 && !hasTeamChecklists;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* ZL attention — inline expand */}
      {zlAttention.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <SectionTitle>ZL attention</SectionTitle>
          </div>
          <div className="space-y-2">
            {zlAttention.map(zl => {
              const expanded = expandedZLIds.has(zl.id);
              const oldest = Math.max(...zl.overdueItems.map(a => daysAgo(a.scheduledAt)));
              return (
                <div key={zl.id} className="rounded-xl border border-amber-200 overflow-hidden">
                  <button
                    onClick={() => toggleId(zl.id, setExpandedZLIds)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 hover:bg-amber-100/70 transition-colors text-left"
                  >
                    <Avatar name={zl.name} size="xs" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-800 truncate">{zl.name}</p>
                      <p className="text-xs text-stone-400">Zone Leader</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-semibold text-amber-700">{zl.overdueItems.length} overdue</span>
                      {oldest > 0 && (
                        <span className="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">oldest {oldest}d</span>
                      )}
                      {expanded ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                    </div>
                  </button>
                  {expanded && (
                    <div className="divide-y divide-stone-100 bg-white">
                      {zl.overdueItems.map(a => {
                        const goal = a.pitstops[0]?.pitstop.goal;
                        const domain = goal?.needsDomain ? fmtDomain(goal.needsDomain) : null;
                        const geo = goal?.needsSettlement?.name ?? goal?.needsCluster?.name ?? goal?.needsZone?.name ?? null;
                        return (
                          <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
                                {a.type && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ACTIVITY_TYPE_STYLE[a.type] ?? "bg-stone-100 text-stone-600"}`}>{a.type}</span>}
                              </div>
                              <p className="text-xs text-amber-700">{daysAgo(a.scheduledAt)}d ago</p>
                              {(goal?.title || domain || geo) && (
                                <p className="text-[11px] text-stone-400 truncate mt-0.5">
                                  {[goal?.title, domain, geo].filter(Boolean).join(" · ")}
                                </p>
                              )}
                            </div>
                            <button onClick={() => handleDone(a.id)} disabled={loadingDoneId === a.id}
                              className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-medium flex-shrink-0 transition-colors">
                              {loadingDoneId === a.id ? "…" : "Done"}
                            </button>
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
      )}

      {/* RP attention — grouped by ZL, inline expand */}
      {rpAttentionByZL.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <SectionTitle>RP attention</SectionTitle>
          </div>
          <div className="space-y-4">
            {rpAttentionByZL.map(({ zl, rps }) => (
              <div key={zl.id}>
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-300 inline-block" />
                  {zl.name ?? "Unnamed ZL"}
                </p>
                <div className="space-y-2">
                  {rps.map(rp => {
                    const expanded = expandedRPIds.has(rp.id);
                    const oldest = Math.max(...rp.overdueItems.map(a => daysAgo(a.scheduledAt)));
                    return (
                      <div key={rp.id} className="rounded-xl border border-amber-200 overflow-hidden">
                        <button
                          onClick={() => toggleId(rp.id, setExpandedRPIds)}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 hover:bg-amber-100/70 transition-colors text-left"
                        >
                          <Avatar name={rp.name} size="xs" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-stone-800 truncate">{rp.name}</p>
                            <p className="text-xs text-stone-400">RP</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs font-semibold text-amber-700">{rp.overdueItems.length} overdue</span>
                            {oldest > 0 && (
                              <span className="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">oldest {oldest}d</span>
                            )}
                            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                          </div>
                        </button>
                        {expanded && (
                          <div className="divide-y divide-stone-100 bg-white">
                            {rp.overdueItems.map(a => {
                              const goal = a.pitstops[0]?.pitstop.goal;
                              const domain = goal?.needsDomain ? fmtDomain(goal.needsDomain) : null;
                              const geo = goal?.needsSettlement?.name ?? goal?.needsCluster?.name ?? goal?.needsZone?.name ?? null;
                              return (
                                <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                      <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
                                      {a.type && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ACTIVITY_TYPE_STYLE[a.type] ?? "bg-stone-100 text-stone-600"}`}>{a.type}</span>}
                                    </div>
                                    <p className="text-xs text-amber-700">{daysAgo(a.scheduledAt)}d ago</p>
                                    {(goal?.title || domain || geo) && (
                                      <p className="text-[11px] text-stone-400 truncate mt-0.5">
                                        {[goal?.title, domain, geo].filter(Boolean).join(" · ")}
                                      </p>
                                    )}
                                  </div>
                                  <button onClick={() => handleDone(a.id)} disabled={loadingDoneId === a.id}
                                    className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-medium flex-shrink-0 transition-colors">
                                    {loadingDoneId === a.id ? "…" : "Done"}
                                  </button>
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
          </div>
        </div>
      )}

      {/* PM's own overdue — carousel on mobile, list on desktop */}
      {myOverdue.length > 0 && (
        <>
          <div className="sm:hidden">
            <ZLOverdueCarousel items={myOverdue} loadingDoneId={loadingDoneId} onDone={handleDone} />
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-1.5 mb-3">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <SectionTitle>Your update needed</SectionTitle>
            </div>
            <div className="space-y-2">
              {myOverdue.map(a => {
                const goal = a.pitstops[0]?.pitstop.goal;
                const isOwner = a.pitstops[0]?.pitstop.ownerId === userId;
                const isAttendee = !isOwner && a.attendees.some(at => at.user.id === userId);
                const domain = goal?.needsDomain ? fmtDomain(goal.needsDomain) : null;
                const geo = goal?.needsSettlement?.name ?? goal?.needsCluster?.name ?? goal?.needsZone?.name ?? null;
                return (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
                        {a.type && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ACTIVITY_TYPE_STYLE[a.type] ?? "bg-stone-100 text-stone-600"}`}>{a.type}</span>}
                        {isOwner && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-violet-100 text-violet-700">Owner</span>}
                        {isAttendee && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-sky-100 text-sky-700">Attendee</span>}
                      </div>
                      <p className="text-xs text-amber-700">{daysAgo(a.scheduledAt)}d overdue</p>
                      {(goal?.title || domain || geo) && (
                        <p className="text-[11px] text-stone-400 truncate mt-0.5">
                          {[goal?.title, domain, geo].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <button onClick={() => handleDone(a.id)} disabled={loadingDoneId === a.id}
                      className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-medium flex-shrink-0 transition-colors">
                      {loadingDoneId === a.id ? "…" : "Done"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* PM's today — carousel on mobile, list on desktop */}
      {myToday.length === 0 ? (
        <div>
          <SectionTitle>Today</SectionTitle>
          <EmptyState message={myOverdue.length > 0 || zlAttention.length > 0 || rpAttentionByZL.length > 0 ? "Nothing else scheduled for today." : "Nothing scheduled for today."} />
        </div>
      ) : (
        <>
          <div className="sm:hidden">
            <ZLTodayCarousel items={myToday} loadingDoneId={loadingDoneId} onDone={handleDone} />
          </div>
          <div className="hidden sm:block">
            <SectionTitle>Today</SectionTitle>
            <div className="space-y-2 mt-3">
              {myToday.map(a => {
                const goal = a.pitstops[0]?.pitstop.goal;
                const isOwner = a.pitstops[0]?.pitstop.ownerId === userId;
                const isAttendee = !isOwner && a.attendees.some(at => at.user.id === userId);
                const geo = goal?.needsSettlement?.name ?? goal?.needsCluster?.name ?? goal?.needsZone?.name ?? null;
                const domain = goal?.needsDomain ? fmtDomain(goal.needsDomain) : null;
                return (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-stone-200 bg-white">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
                        {a.type && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ACTIVITY_TYPE_STYLE[a.type] ?? "bg-stone-100 text-stone-600"}`}>{a.type}</span>}
                        {isOwner && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-violet-100 text-violet-700">Owner</span>}
                        {isAttendee && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-sky-100 text-sky-700">Attendee</span>}
                      </div>
                      <p className="text-xs text-stone-400">{fmtTime(a.scheduledAt)}{a.location ? ` · ${a.location}` : ""}</p>
                      {(goal?.title || domain || geo) && (
                        <p className="text-[11px] text-stone-400 truncate mt-0.5">
                          {[goal?.title, domain, geo].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <button onClick={() => handleDone(a.id)} disabled={loadingDoneId === a.id}
                      className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-medium flex-shrink-0 transition-colors">
                      {loadingDoneId === a.id ? "…" : "Done"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Team checklists — ZLs then RPs inline expand */}
      {hasTeamChecklists && (
        <div>
          <SectionTitle>Team checklists</SectionTitle>
          <div className="space-y-2 mt-3">
            {zlChecklists.map(zl => {
              const expanded = expandedZLChecklistIds.has(zl.id);
              const overdueCount = zl.items.filter(ci => {
                const ms = ci.pitstop.targetDate ? new Date(ci.pitstop.targetDate).getTime() : null;
                return ms !== null && ms < Date.now();
              }).length;
              return (
                <div key={zl.id} className="rounded-xl border border-stone-200 overflow-hidden">
                  <button
                    onClick={() => toggleId(zl.id, setExpandedZLChecklistIds)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-stone-50 hover:bg-stone-100/70 transition-colors text-left"
                  >
                    <Avatar name={zl.name} size="xs" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-800 truncate">{zl.name}</p>
                      <p className="text-xs text-stone-400">Zone Leader</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-medium text-violet-700">{zl.items.length} open</span>
                      {overdueCount > 0 && <span className="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">{overdueCount} overdue</span>}
                      {expanded ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                    </div>
                  </button>
                  {expanded && (
                    <div className="divide-y divide-stone-100 bg-white">
                      {zl.items.map(ci => (
                        <RPChecklistRow key={ci.id} item={ci} onCompleted={id => setCompletedChecklistIds(prev => new Set([...prev, id]))} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {rpChecklistsByZL.map(({ zl, rps }) => (
              <div key={zl.id} className="space-y-2">
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide px-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-300 inline-block" />
                  {zl.name ?? "Unnamed ZL"} · RPs
                </p>
                {rps.map(rp => {
                  const expanded = expandedRPChecklistIds.has(rp.id);
                  const overdueCount = rp.items.filter(ci => {
                    const ms = ci.pitstop.targetDate ? new Date(ci.pitstop.targetDate).getTime() : null;
                    return ms !== null && ms < Date.now();
                  }).length;
                  return (
                    <div key={rp.id} className="rounded-xl border border-stone-200 overflow-hidden">
                      <button
                        onClick={() => toggleId(rp.id, setExpandedRPChecklistIds)}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-stone-50 hover:bg-stone-100/70 transition-colors text-left"
                      >
                        <Avatar name={rp.name} size="xs" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-stone-800 truncate">{rp.name}</p>
                          <p className="text-xs text-stone-400">RP</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs font-medium text-violet-700">{rp.items.length} open</span>
                          {overdueCount > 0 && <span className="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">{overdueCount} overdue</span>}
                          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                        </div>
                      </button>
                      {expanded && (
                        <div className="divide-y divide-stone-100 bg-white">
                          {rp.items.map(ci => (
                            <RPChecklistRow key={ci.id} item={ci} onCompleted={id => setCompletedChecklistIds(prev => new Set([...prev, id]))} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All clear */}
      {allClear && <EmptyState message="All caught up — no overdue items for you or your team." />}

      {/* Coming up this week */}
      {myWeek.length > 0 && (
        <div>
          <button
            onClick={() => setWeekExpanded(e => !e)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wider hover:text-stone-600 transition-colors mb-2"
          >
            Coming up this week ({myWeek.length})
            {weekExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {weekExpanded && (
            <div className="space-y-5">
              {groupByDay(myWeek, a => a.scheduledAt).map(({ label, items }) => (
                <div key={label}>
                  <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2">{label}</p>
                  <div className="space-y-2">
                    {items.map(a => {
                      const ps = a.pitstops[0]?.pitstop;
                      const g = ps?.goal;
                      const domain = g?.needsDomain ? fmtDomain(g.needsDomain) : null;
                      const geo = g?.needsSettlement?.name ?? g?.needsCluster?.name ?? g?.needsZone?.name ?? null;
                      const isOwner = ps?.ownerId === userId;
                      const isAttendee = !isOwner && a.attendees.some(at => at.user.id === userId);
                      const role = isOwner ? "Owner" : isAttendee ? "Attendee" : null;
                      return <WeekCard key={a.id} title={a.title} type={a.type} scheduledAt={a.scheduledAt} location={a.location} goalTitle={g?.title} domain={domain} geo={geo} role={role} />;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

function PMCoverageTab({
  zoneClusterMap,
  clusterStats,
}: {
  zoneClusterMap: { id: string; name: string; clusterIds: string[] }[];
  clusterStats: ClusterStat[];
}) {
  if (zoneClusterMap.length === 0) {
    return <div className="text-sm text-stone-400 text-center py-16">No zones found for your ZLs.</div>;
  }
  return (
    <div className="space-y-8">
      {zoneClusterMap.map(zone => {
        const zoneClusters = clusterStats.filter(c => zone.clusterIds.includes(c.clusterId));
        if (zoneClusters.length === 0) return null;
        return (
          <div key={zone.id}>
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <MapPin className="w-3 h-3" /> {zone.name}
            </p>
            <div className="space-y-4">
              {zoneClusters.map(c => (
                <div key={c.clusterId} className="bg-white border border-stone-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-stone-800 mb-3">{c.clusterName}</p>
                  {c.stats.length === 0
                    ? <p className="text-xs text-stone-400">No goals in this cluster.</p>
                    : <div className="space-y-2">
                        {c.stats.map(s => (
                          <div key={s.domain}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-stone-600">{s.label}</span>
                              <span className="text-xs text-stone-400">{s.done} / {s.hasParams ? s.planned + s.done : s.goalCount + s.doneGoalCount}</span>
                            </div>
                            <ProgressBar pct={s.hasParams ? (s.planned + s.done > 0 ? Math.round((s.done / (s.planned + s.done)) * 100) : 0) : (s.goalCount + s.doneGoalCount > 0 ? Math.round((s.doneGoalCount / (s.goalCount + s.doneGoalCount)) * 100) : 0)} color="bg-sky-500" />
                          </div>
                        ))}
                      </div>
                  }
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PMZLHealthTab({
  zlMembers, rpMembers, zlHealth, rpHealth,
}: {
  zlMembers: PMTeamMember[];
  rpMembers: PMTeamMember[];
  zlHealth: ZLHealthStat[];
  rpHealth: RPHealthStat[];
}) {
  const [expandedZL, setExpandedZL] = useState<string | null>(null);
  const [expandedDelayedZL, setExpandedDelayedZL] = useState<string | null>(null);

  if (zlMembers.length === 0) {
    return <div className="text-sm text-stone-400 text-center py-16">No ZLs reporting to you yet.</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-400 uppercase tracking-wide font-semibold">
        {zlMembers.length} ZL{zlMembers.length !== 1 ? "s" : ""}
      </p>

      {zlMembers.map(zl => {
        const stat = zlHealth.find(s => s.zlId === zl.id);
        if (!stat) return null;

        const dotColor = stat.totalDelayedPitstops > 0 ? "bg-red-500"
          : stat.totalOverdueActivities > 0 ? "bg-amber-400"
          : "bg-emerald-500";
        const dotLabel = stat.totalDelayedPitstops > 0 ? "Team needs attention"
          : stat.totalOverdueActivities > 0 ? "Team activities overdue"
          : "Team on track";
        const clPct = stat.totalChecklists > 0
          ? Math.round((stat.doneChecklists / stat.totalChecklists) * 100)
          : null;
        const isOpen = expandedZL === zl.id;
        const zlRPs = rpMembers.filter(r => r.reportsToId === zl.id);

        return (
          <div key={zl.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <div className="flex items-center gap-2.5">
                <Avatar name={zl.name} image={zl.image} size="sm" />
                <div>
                  <span className="text-sm font-semibold text-stone-800">{zl.name ?? "Unnamed"}</span>
                  <span className="ml-2 text-xs text-stone-400">{stat.rpCount} RP{stat.rpCount !== 1 ? "s" : ""}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                <span className="text-xs text-stone-500">{dotLabel}</span>
              </div>
            </div>

            <div className="px-4 pb-4 space-y-3">
              {/* ZL's own goal progress */}
              {stat.totalGoals > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide flex items-center gap-1">
                      <Target className="w-3 h-3" /> Own Goals
                    </span>
                    <span className="text-[11px] text-stone-500">
                      {stat.completeGoals} of {stat.totalGoals} complete
                      {stat.pausedGoals > 0 && <span className="ml-1.5 text-amber-500">· {stat.pausedGoals} paused</span>}
                    </span>
                  </div>
                  <HealthBar value={stat.completeGoals} total={stat.totalGoals} color="bg-emerald-500" />
                </div>
              )}

              {/* Team pitstop health */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-stone-50 rounded-lg p-2.5">
                  <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Team Pitstops
                  </p>
                  {stat.totalDelayedPitstops > 0 ? (
                    <button
                      type="button"
                      onClick={() => setExpandedDelayedZL(expandedDelayedZL === zl.id ? null : zl.id)}
                      className="text-xs font-medium text-red-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-md hover:bg-red-100 cursor-pointer transition-colors flex items-center gap-1"
                    >
                      {stat.totalDelayedPitstops} delayed
                      {expandedDelayedZL === zl.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  ) : (
                    <span className="text-xs text-stone-400">None delayed</span>
                  )}
                </div>

                <div className="bg-stone-50 rounded-lg p-2.5">
                  <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <CalendarClock className="w-3 h-3" /> Team Activities
                  </p>
                  {stat.totalOverdueActivities > 0 ? (
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-md">
                      {stat.totalOverdueActivities} overdue
                    </span>
                  ) : (
                    <span className="text-xs text-stone-400">None overdue</span>
                  )}
                </div>
              </div>

              {/* Delayed pitstop drill-down */}
              {expandedDelayedZL === zl.id && stat.delayedPitstops.length > 0 && (
                <div className="space-y-2 border-t border-stone-100 pt-2">
                  {(stat.delayedPitstops as RPPitstopDetail[]).map(p => (
                    <div key={p.id} className="bg-red-50 border border-red-100 rounded-lg p-2.5">
                      <p className="text-xs font-medium text-stone-800 truncate">{p.title}</p>
                      <p className="text-[10px] text-stone-500 truncate">{p.goalTitle}</p>
                      <div className="flex items-center justify-between mt-1">
                        {p.targetDate && (
                          <span className="text-[10px] font-medium text-red-700">{p.daysOverdue}d overdue</span>
                        )}
                        {p.pendingChecklists.length > 0 && (
                          <span className="text-[10px] text-stone-500">{p.pendingChecklists.length} pending checklist{p.pendingChecklists.length !== 1 ? "s" : ""}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Team checklist completion */}
              {stat.totalChecklists > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide flex items-center gap-1">
                      <CheckSquare className="w-3 h-3" /> Team Checklist Completion
                    </span>
                    <span className="text-[11px] text-stone-500">
                      {stat.doneChecklists} of {stat.totalChecklists} · {clPct}%
                    </span>
                  </div>
                  <HealthBar value={stat.doneChecklists} total={stat.totalChecklists} color="bg-teal-500" />
                </div>
              )}

              {/* Expand RPs */}
              {zlRPs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpandedZL(isOpen ? null : zl.id)}
                  className="flex items-center gap-1 text-xs text-sky-700 bg-sky-50 border border-sky-200 px-2.5 py-1.5 rounded-lg hover:bg-sky-100 active:bg-sky-200 transition-colors cursor-pointer w-full justify-center"
                >
                  {isOpen ? "Hide" : "Show"} {zlRPs.length} RP{zlRPs.length !== 1 ? "s" : ""}
                  {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}

              {/* Inline RP health cards */}
              {isOpen && (
                <div className="space-y-2 pt-1 border-t border-stone-100">
                  <RPHealthCards
                    rpMembers={zlRPs}
                    rpHealth={rpHealth.filter(r => r.zlId === zl.id)}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PMRPHealthTab({
  zlMembers, rpMembers, rpHealth,
}: {
  zlMembers: PMTeamMember[];
  rpMembers: PMTeamMember[];
  rpHealth: RPHealthStat[];
}) {
  const [collapsedZLs, setCollapsedZLs] = useState<Set<string>>(new Set());

  if (rpMembers.length === 0) {
    return <div className="text-sm text-stone-400 text-center py-16">No RPs in your team yet.</div>;
  }

  function toggle(zlId: string) {
    setCollapsedZLs(prev => {
      const next = new Set(prev);
      next.has(zlId) ? next.delete(zlId) : next.add(zlId);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      {zlMembers.map(zl => {
        const zlRPs = rpMembers.filter(r => r.reportsToId === zl.id);
        if (zlRPs.length === 0) return null;
        const isCollapsed = collapsedZLs.has(zl.id);

        return (
          <div key={zl.id}>
            <button
              type="button"
              onClick={() => toggle(zl.id)}
              className="flex items-center gap-2 w-full mb-2 cursor-pointer group"
            >
              <Avatar name={zl.name} image={zl.image} size="xs" />
              <span className="text-xs font-semibold text-stone-600 group-hover:text-stone-800 transition-colors">
                {zl.name ?? "Unnamed ZL"} · {zlRPs.length} RP{zlRPs.length !== 1 ? "s" : ""}
              </span>
              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-stone-400 ml-auto" /> : <ChevronUp className="w-3.5 h-3.5 text-stone-400 ml-auto" />}
            </button>

            {!isCollapsed && (
              <div className="space-y-3">
                <RPHealthCards
                  rpMembers={zlRPs}
                  rpHealth={rpHealth.filter(r => r.zlId === zl.id)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RPHealthCards({
  rpMembers, rpHealth,
}: {
  rpMembers: PMTeamMember[];
  rpHealth: RPHealthStat[];
}) {
  const [expandedDelayed, setExpandedDelayed] = useState<string | null>(null);

  return (
    <>
      {rpMembers.map(rp => {
        const stat = rpHealth.find(s => s.rpId === rp.id);
        if (!stat) return null;

        const isDelayedOpen = expandedDelayed === rp.id;
        const clPct = stat.totalChecklists > 0 ? Math.round((stat.doneChecklists / stat.totalChecklists) * 100) : null;
        const dotColor = stat.overduePitstops > 0 ? "bg-red-500"
          : stat.overdueActivities > 0 ? "bg-amber-400"
          : "bg-emerald-500";

        return (
          <div key={rp.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div className="flex items-center gap-2">
                <Avatar name={rp.name} image={rp.image} size="xs" />
                <span className="text-xs font-semibold text-stone-800">{rp.name ?? "Unnamed"}</span>
              </div>
              <span className={`w-2 h-2 rounded-full ${dotColor}`} />
            </div>

            <div className="px-4 pb-3 space-y-2.5">
              {/* Goals */}
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide">Goals</span>
                  <span className="text-[11px] text-stone-500">{stat.completeGoals} / {stat.totalGoals} complete</span>
                </div>
                <HealthBar value={stat.completeGoals} total={stat.totalGoals} color="bg-emerald-500" />
              </div>

              {/* Pitstops */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">
                  {stat.onTrackPitstops} on track
                </span>
                {stat.overduePitstops > 0 ? (
                  <button
                    type="button"
                    onClick={() => setExpandedDelayed(isDelayedOpen ? null : rp.id)}
                    className="flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-md hover:bg-red-100 active:bg-red-200 transition-colors cursor-pointer"
                  >
                    {stat.overduePitstops} delayed
                    {isDelayedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                ) : (
                  <span className="text-xs text-stone-400 bg-stone-50 border border-stone-100 px-2 py-0.5 rounded-md">0 delayed</span>
                )}
              </div>

              {/* Delayed drill-down */}
              {isDelayedOpen && (
                <div className="space-y-2 pt-1 border-t border-stone-100">
                  {stat.delayedPitstops.length === 0 && (
                    <p className="text-xs text-stone-400 py-1">No detail available.</p>
                  )}
                  {stat.delayedPitstops.map(p => (
                    <div key={p.id} className="bg-red-50 border border-red-100 rounded-lg p-2.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-stone-800">{p.title}</p>
                          <p className="text-[11px] text-stone-500">{p.goalTitle}</p>
                        </div>
                        <span className="text-[11px] font-medium text-red-600 whitespace-nowrap">{p.daysOverdue}d overdue</span>
                      </div>
                      {p.pendingChecklists.length > 0 && (
                        <ul className="space-y-0.5">
                          {p.pendingChecklists.map(ci => (
                            <li key={ci.id} className="flex items-start gap-1.5 text-[11px] text-stone-600">
                              <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-300 flex-shrink-0" />
                              {ci.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Checklist + overdue activity */}
              <div className="flex items-center gap-3">
                {clPct !== null && (
                  <span className="text-[11px] text-teal-700">{clPct}% checklists done</span>
                )}
                {stat.overdueActivities > 0 && (
                  <span className="text-[11px] text-amber-700">{stat.overdueActivities} activity overdue</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── ZL Team Health tab ───────────────────────────────────────────────────────

function HealthBar({ value, total, color = "bg-sky-500" }: { value: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-stone-500 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

function ZLTeamHealthTab({
  teamMembers,
  rpTeamHealth,
}: {
  teamMembers: TeamMember[];
  rpTeamHealth: RPHealthStat[];
}) {
  const [expandedDelayed, setExpandedDelayed] = useState<string | null>(null);

  if (teamMembers.length === 0) {
    return <div className="text-sm text-stone-400 text-center py-16">No RPs reporting to you yet.</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-400 uppercase tracking-wide font-semibold">
        {teamMembers.length} RP{teamMembers.length !== 1 ? "s" : ""}
      </p>

      {teamMembers.map(rp => {
        const stat = rpTeamHealth.find(s => s.rpId === rp.id);
        if (!stat) return null;

        const isDelayedOpen = expandedDelayed === rp.id;
        const clPct = stat.totalChecklists > 0
          ? Math.round((stat.doneChecklists / stat.totalChecklists) * 100)
          : null;
        const dotColor = stat.overduePitstops > 0 ? "bg-red-500"
          : stat.overdueActivities > 0 ? "bg-amber-400"
          : "bg-emerald-500";
        const dotLabel = stat.overduePitstops > 0 ? "Needs attention"
          : stat.overdueActivities > 0 ? "Activities overdue"
          : "On track";

        return (
          <div key={rp.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <div className="flex items-center gap-2.5">
                <Avatar name={rp.name} image={rp.image} size="sm" />
                <span className="text-sm font-semibold text-stone-800">{rp.name ?? "Unnamed"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                <span className="text-xs text-stone-500">{dotLabel}</span>
              </div>
            </div>

            <div className="px-4 pb-4 space-y-3">
              {/* Goals progress */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide flex items-center gap-1">
                    <Target className="w-3 h-3" /> Goals
                  </span>
                  <span className="text-[11px] text-stone-500">
                    {stat.completeGoals} of {stat.totalGoals} complete
                    {stat.pausedGoals > 0 && (
                      <span className="ml-1.5 text-amber-500">· {stat.pausedGoals} paused</span>
                    )}
                  </span>
                </div>
                <HealthBar value={stat.completeGoals} total={stat.totalGoals} color="bg-emerald-500" />
              </div>

              {/* Pitstop SLA health */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Pitstops
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg">
                    {stat.onTrackPitstops} within SLA
                  </span>
                  {stat.overduePitstops > 0 ? (
                    <button
                      type="button"
                      onClick={() => setExpandedDelayed(isDelayedOpen ? null : rp.id)}
                      className="flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-100 active:bg-red-200 transition-colors cursor-pointer"
                    >
                      {stat.overduePitstops} delayed
                      {isDelayedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  ) : (
                    <span className="text-xs text-stone-400 bg-stone-50 border border-stone-100 px-2 py-1 rounded-lg">
                      0 delayed
                    </span>
                  )}
                </div>
              </div>

              {/* Delayed pitstops drill-down */}
              {isDelayedOpen && (
                <div className="space-y-2 pt-1 border-t border-stone-100">
                  {stat.delayedPitstops.length === 0 && (
                    <p className="text-xs text-stone-400 py-1">No detail available.</p>
                  )}
                  {stat.delayedPitstops.map(p => (
                    <div key={p.id} className="bg-red-50 border border-red-100 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-stone-800">{p.title}</p>
                          <p className="text-[11px] text-stone-500">{p.goalTitle}</p>
                        </div>
                        <span className="text-[11px] font-medium text-red-600 whitespace-nowrap">
                          {p.daysOverdue}d overdue
                        </span>
                      </div>
                      {p.pendingChecklists.length > 0 ? (
                        <div>
                          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">
                            Pending checklists
                          </p>
                          <ul className="space-y-0.5">
                            {p.pendingChecklists.map(ci => (
                              <li key={ci.id} className="flex items-start gap-1.5 text-[11px] text-stone-600">
                                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-300 flex-shrink-0" />
                                {ci.text}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="text-[11px] text-stone-400">No pending checklists</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Checklist completion */}
              {stat.totalChecklists > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide flex items-center gap-1">
                      <CheckSquare className="w-3 h-3" /> Checklist completion
                    </span>
                    <span className="text-[11px] text-stone-500">
                      {stat.doneChecklists} of {stat.totalChecklists} done · {clPct}%
                    </span>
                  </div>
                  <HealthBar value={stat.doneChecklists} total={stat.totalChecklists} color="bg-teal-500" />
                </div>
              )}

              {/* Overdue activities note */}
              {stat.overdueActivities > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {stat.overdueActivities} overdue activit{stat.overdueActivities === 1 ? "y" : "ies"} not yet marked done
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── ZL overdue card + carousel (mobile swipeable) ───────────────────────────

function ZLOverdueCard({
  a, onDone, isLoadingDone, isOverdue = true,
}: {
  a: ZLTeamActivity;
  onDone: (id: string) => void;
  isLoadingDone: boolean;
  isOverdue?: boolean;
}) {
  const goal = a.pitstops[0]?.pitstop.goal;
  const domainLabel = goal?.needsDomain ? fmtDomain(goal.needsDomain) : null;
  const clusterName = goal?.needsCluster?.name ?? null;

  return (
    <div className={`rounded-2xl p-5 flex flex-col gap-3 shadow-sm min-h-[160px] border ${
      isOverdue ? "bg-amber-50 border-amber-200" : "bg-white border-stone-200"
    }`}>
      {(domainLabel || clusterName) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {domainLabel && (
            <span className={`text-[11px] font-semibold bg-white px-2 py-0.5 rounded-full border ${
              isOverdue ? "text-amber-700 border-amber-200" : "text-violet-700 border-violet-200"
            }`}>
              {domainLabel}
            </span>
          )}
          {clusterName && (
            <span className="text-[11px] text-stone-500 bg-white border border-stone-200 px-2 py-0.5 rounded-full">
              {clusterName}
            </span>
          )}
        </div>
      )}
      <div className="flex-1">
        <p className="text-base font-semibold text-stone-800 leading-snug mb-1">{a.title}</p>
        {goal?.title && (
          <p className="text-[11px] text-stone-400 mb-1.5 truncate">{goal.title}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {a.type && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ACTIVITY_TYPE_STYLE[a.type] ?? "bg-stone-100 text-stone-600"}`}>
              {a.type}
            </span>
          )}
          {isOverdue
            ? <span className="text-xs font-medium text-amber-700">{daysAgo(a.scheduledAt)}d overdue</span>
            : <span className="text-xs text-stone-400">{fmtTime(a.scheduledAt)}</span>
          }
          {a.location && <span className="text-xs text-stone-400 truncate">· {a.location}</span>}
        </div>
      </div>
      <button onClick={() => onDone(a.id)} disabled={isLoadingDone}
        className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors">
        {isLoadingDone ? "Updating…" : "Mark Done"}
      </button>
    </div>
  );
}

function ZLOverdueCarousel({
  items, loadingDoneId, onDone,
}: {
  items: ZLTeamActivity[];
  loadingDoneId: string | null;
  onDone: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIdx, setCurrentIdx] = useState(0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <SectionTitle>Your update needed</SectionTitle>
        </div>
        {items.length > 1 && (
          <span className="text-xs text-stone-400 tabular-nums">{currentIdx + 1} of {items.length}</span>
        )}
      </div>
      <div
        ref={scrollRef}
        onScroll={e => {
          const el = e.currentTarget;
          setCurrentIdx(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex overflow-x-auto snap-x snap-mandatory gap-3 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {items.map(a => (
          <div key={a.id} className="snap-start flex-shrink-0 w-full">
            <ZLOverdueCard a={a} onDone={onDone} isLoadingDone={loadingDoneId === a.id} />
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <div className="flex justify-center gap-1 mt-2">
          {items.map((_, i) => (
            <div key={i} className={`rounded-full transition-all ${i === currentIdx ? "w-4 h-1.5 bg-amber-400" : "w-1.5 h-1.5 bg-stone-300"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function ZLTodayCarousel({
  items, loadingDoneId, onDone,
}: {
  items: ZLTeamActivity[];
  loadingDoneId: string | null;
  onDone: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIdx, setCurrentIdx] = useState(0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <SectionTitle>Today</SectionTitle>
        {items.length > 1 && (
          <span className="text-xs text-stone-400 tabular-nums">{currentIdx + 1} of {items.length}</span>
        )}
      </div>
      <div
        ref={scrollRef}
        onScroll={e => setCurrentIdx(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {items.map(a => (
          <div key={a.id} className="snap-start flex-shrink-0 w-full">
            <ZLOverdueCard a={a} onDone={onDone} isLoadingDone={loadingDoneId === a.id} isOverdue={false} />
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <div className="flex justify-center gap-1 mt-2">
          {items.map((_, i) => (
            <div key={i} className={`rounded-full transition-all ${i === currentIdx ? "w-4 h-1.5 bg-stone-400" : "w-1.5 h-1.5 bg-stone-300"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── ZL Today tab ─────────────────────────────────────────────────────────────

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
  const [expandedAttentionIds, setExpandedAttentionIds] = useState<Set<string>>(new Set());
  const [expandedChecklistIds, setExpandedChecklistIds] = useState<Set<string>>(new Set());
  const [completedActivityIds, setCompletedActivityIds] = useState<Set<string>>(new Set());
  const [completedChecklistIds, setCompletedChecklistIds] = useState<Set<string>>(new Set());
  const [loadingDoneId, setLoadingDoneId] = useState<string | null>(null);
  const [weekExpanded, setWeekExpanded] = useState(false);

  function toggleId(id: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) {
    setter(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
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

  function getClusterName(clusterId: string | null | undefined) {
    if (!clusterId) return null;
    return clusterStatus.find(c => c.clusterId === clusterId)?.name ?? null;
  }

  // ZL's own activities
  const myOverdue = zlOverdueActivities.filter(
    a => a.pitstops[0]?.pitstop.ownerId === userId && !completedActivityIds.has(a.id)
  );
  const myToday = zlMyActivities.filter(
    a => isToday(a.scheduledAt) && !completedActivityIds.has(a.id)
  );
  const myWeek = zlMyActivities.filter(
    a => !isToday(a.scheduledAt) && !completedActivityIds.has(a.id)
  );

  // Per-RP overdue map (excluding ZL's own)
  const rpOverdueMap = useMemo(() => {
    const map = new Map<string, ZLTeamActivity[]>();
    for (const a of zlOverdueActivities) {
      if (completedActivityIds.has(a.id)) continue;
      const ownerId = a.pitstops[0]?.pitstop.ownerId;
      if (!ownerId || ownerId === userId) continue;
      if (!map.has(ownerId)) map.set(ownerId, []);
      map.get(ownerId)!.push(a);
    }
    return map;
  }, [zlOverdueActivities, completedActivityIds, userId]);

  // Per-RP checklist map (excluding ZL's own)
  const rpChecklistMap = useMemo(() => {
    const map = new Map<string, ChecklistItem[]>();
    for (const ci of weekChecklists) {
      if (completedChecklistIds.has(ci.id) || ci.pitstop.ownerId === userId) continue;
      if (!map.has(ci.pitstop.ownerId)) map.set(ci.pitstop.ownerId, []);
      map.get(ci.pitstop.ownerId)!.push(ci);
    }
    return map;
  }, [weekChecklists, completedChecklistIds, userId]);

  const attentionRPs = teamMembers
    .filter(rp => (rpOverdueMap.get(rp.id)?.length ?? 0) > 0)
    .sort((a, b) => (rpOverdueMap.get(b.id)?.length ?? 0) - (rpOverdueMap.get(a.id)?.length ?? 0));

  const checklistRPs = teamMembers.filter(rp => (rpChecklistMap.get(rp.id)?.length ?? 0) > 0);

  const allClear = attentionRPs.length === 0 && myOverdue.length === 0 && myToday.length === 0 && checklistRPs.length === 0;

  // Inline activity row for ZL's own overdue/today
  function ZLActivityRow({ a, isOverdue }: { a: ZLTeamActivity; isOverdue: boolean }) {
    const goal = a.pitstops[0]?.pitstop.goal;
    const isOwner = a.pitstops[0]?.pitstop.ownerId === userId;
    const isAttendee = !isOwner && a.attendees.some(at => at.user.id === userId);
    const geo = goal?.needsSettlement?.name ?? goal?.needsCluster?.name ?? goal?.needsZone?.name ?? null;
    const domain = goal?.needsDomain ? fmtDomain(goal.needsDomain) : null;
    return (
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
        isOverdue ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-white"
      }`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
            {a.type && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ACTIVITY_TYPE_STYLE[a.type] ?? "bg-stone-100 text-stone-600"}`}>{a.type}</span>}
            {isOwner && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-violet-100 text-violet-700">Owner</span>}
            {isAttendee && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-sky-100 text-sky-700">Attendee</span>}
          </div>
          <p className={`text-xs ${isOverdue ? "text-amber-700" : "text-stone-400"}`}>
            {isOverdue ? `${daysAgo(a.scheduledAt)}d ago` : fmtTime(a.scheduledAt)}
            {a.location ? ` · ${a.location}` : ""}
          </p>
          {(goal?.title || domain || geo) && (
            <p className="text-[11px] text-stone-400 truncate mt-0.5">
              {[goal?.title, domain, geo].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <button onClick={() => handleDone(a.id)} disabled={loadingDoneId === a.id}
          className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex-shrink-0">
          {loadingDoneId === a.id ? "…" : "Done"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* Team attention — RPs with overdue activities */}
      {attentionRPs.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <SectionTitle>Team attention</SectionTitle>
          </div>
          <div className="space-y-2">
            {attentionRPs.map(rp => {
              const items = rpOverdueMap.get(rp.id) ?? [];
              const oldestDays = Math.max(...items.map(a => daysAgo(a.scheduledAt)));
              const expanded = expandedAttentionIds.has(rp.id);
              return (
                <div key={rp.id} className="rounded-xl border border-amber-200 overflow-hidden">
                  <button
                    onClick={() => toggleId(rp.id, setExpandedAttentionIds)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 hover:bg-amber-100/70 transition-colors text-left"
                  >
                    <Avatar name={rp.name} size="xs" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-800 truncate">{rp.name}</p>
                      <p className="text-xs text-stone-400 truncate">{(rp.rpClusters ?? []).map(c => c.name).join(", ") || "No cluster"}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-semibold text-amber-700">{items.length} overdue</span>
                      {oldestDays > 0 && (
                        <span className="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">oldest {oldestDays}d</span>
                      )}
                      {expanded ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                    </div>
                  </button>
                  {expanded && (
                    <div className="divide-y divide-stone-100 bg-white">
                      {items.map(a => {
                        const goal = a.pitstops[0]?.pitstop.goal;
                        const domain = goal?.needsDomain ? fmtDomain(goal.needsDomain) : null;
                        const geo = goal?.needsSettlement?.name ?? goal?.needsCluster?.name ?? goal?.needsZone?.name ?? null;
                        return (
                          <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
                                {a.type && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ACTIVITY_TYPE_STYLE[a.type] ?? "bg-stone-100 text-stone-600"}`}>{a.type}</span>}
                              </div>
                              <p className="text-xs text-amber-700">{daysAgo(a.scheduledAt)}d ago</p>
                              {(goal?.title || domain || geo) && (
                                <p className="text-[11px] text-stone-400 truncate mt-0.5">
                                  {[goal?.title, domain, geo].filter(Boolean).join(" · ")}
                                </p>
                              )}
                            </div>
                            <button onClick={() => handleDone(a.id)} disabled={loadingDoneId === a.id}
                              className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-medium flex-shrink-0 transition-colors">
                              {loadingDoneId === a.id ? "…" : "Done"}
                            </button>
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
      )}

      {/* ZL's own overdue — carousel on mobile, list on desktop */}
      {myOverdue.length > 0 && (
        <>
          {/* Mobile carousel */}
          <div className="sm:hidden">
            <ZLOverdueCarousel items={myOverdue} loadingDoneId={loadingDoneId} onDone={handleDone} />
          </div>
          {/* Desktop list */}
          <div className="hidden sm:block">
            <div className="flex items-center gap-1.5 mb-3">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <SectionTitle>Your update needed</SectionTitle>
            </div>
            <div className="space-y-2">
              {myOverdue.map(a => <ZLActivityRow key={a.id} a={a} isOverdue />)}
            </div>
          </div>
        </>
      )}

      {/* ZL's today */}
      {myToday.length === 0 ? (
        <div>
          <SectionTitle>Today</SectionTitle>
          <EmptyState message={myOverdue.length > 0 || attentionRPs.length > 0 ? "Nothing else scheduled for today." : "Nothing scheduled for today."} />
        </div>
      ) : (
        <>
          {/* Mobile carousel */}
          <div className="sm:hidden">
            <ZLTodayCarousel items={myToday} loadingDoneId={loadingDoneId} onDone={handleDone} />
          </div>
          {/* Desktop list */}
          <div className="hidden sm:block">
            <SectionTitle>Today</SectionTitle>
            <div className="space-y-2 mt-3">
              {myToday.map(a => <ZLActivityRow key={a.id} a={a} isOverdue={false} />)}
            </div>
          </div>
        </>
      )}

      {/* Team checklists */}
      {checklistRPs.length > 0 && (
        <div>
          <SectionTitle>Team checklists</SectionTitle>
          <div className="space-y-2">
            {checklistRPs.map(rp => {
              const items = rpChecklistMap.get(rp.id) ?? [];
              const overdueCount = items.filter(ci => {
                const ms = ci.pitstop.targetDate ? new Date(ci.pitstop.targetDate).getTime() : null;
                return ms !== null && ms < Date.now();
              }).length;
              const expanded = expandedChecklistIds.has(rp.id);
              return (
                <div key={rp.id} className="rounded-xl border border-stone-200 overflow-hidden">
                  <button
                    onClick={() => toggleId(rp.id, setExpandedChecklistIds)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-stone-50 hover:bg-stone-100/70 transition-colors text-left"
                  >
                    <Avatar name={rp.name} size="xs" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-800 truncate">{rp.name}</p>
                      <p className="text-xs text-stone-400 truncate">{(rp.rpClusters ?? []).map(c => c.name).join(", ") || "No cluster"}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-medium text-violet-700">{items.length} open</span>
                      {overdueCount > 0 && (
                        <span className="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">{overdueCount} overdue</span>
                      )}
                      {expanded ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                    </div>
                  </button>
                  {expanded && (
                    <div className="divide-y divide-stone-100 bg-white">
                      {items.map(ci => (
                        <RPChecklistRow key={ci.id} item={ci}
                          onCompleted={id => setCompletedChecklistIds(prev => new Set([...prev, id]))} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All clear */}
      {allClear && <EmptyState message="All caught up — no overdue items for you or your team." />}

      {/* Coming up this week */}
      {myWeek.length > 0 && (
        <div>
          <button
            onClick={() => setWeekExpanded(e => !e)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wider hover:text-stone-600 transition-colors mb-2"
          >
            Coming up this week ({myWeek.length})
            {weekExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {weekExpanded && (
            <div className="space-y-5">
              {groupByDay(myWeek, a => a.scheduledAt).map(({ label, items }) => (
                <div key={label}>
                  <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2">{label}</p>
                  <div className="space-y-2">
                    {items.map(a => {
                      const ps = a.pitstops[0]?.pitstop;
                      const g = ps?.goal;
                      const domain = g?.needsDomain ? fmtDomain(g.needsDomain) : null;
                      const geo = g?.needsSettlement?.name ?? g?.needsCluster?.name ?? g?.needsZone?.name ?? null;
                      const isOwner = ps?.ownerId === userId;
                      const isAttendee = !isOwner && a.attendees.some(at => at.user.id === userId);
                      const role = isOwner ? "Owner" : isAttendee ? "Attendee" : null;
                      return <WeekCard key={a.id} title={a.title} type={a.type} scheduledAt={a.scheduledAt} location={a.location} goalTitle={g?.title} domain={domain} geo={geo} role={role} />;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// ── RP Today tab — flat priority list ────────────────────────────────────────

const PITSTOP_STATUS_PRIORITY: Record<string, number> = {
  InProgress: 0, Upcoming: 1, Blocked: 2,
};

const ACTIVITY_TYPE_STYLE: Record<string, string> = {
  Visit:    "bg-violet-100 text-violet-700",
  Meeting:  "bg-sky-100 text-sky-700",
  Training: "bg-emerald-100 text-emerald-700",
  Event:    "bg-amber-100 text-amber-700",
};

function fmtDomain(d: string) {
  return d.replace(/([A-Z])/g, " $1").trim();
}

// ── RP overdue card — rich card for mobile carousel ───────────────────────────

function RPOverdueCard({
  a, linkedChecklist, onDone, onCompleted, isLoadingDone, isOverdue = true,
}: {
  a: Activity;
  linkedChecklist: ChecklistItem | null;
  onDone: (eventId: string) => void;
  onCompleted: (checklistItemId: string) => void;
  isLoadingDone: boolean;
  isOverdue?: boolean;
}) {
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "processing">("idle");
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const completionType = linkedChecklist?.completionType ?? "Activity";
  const isBusy = voiceState !== "idle" || uploading || isLoadingDone;
  const ciGoal = linkedChecklist?.pitstop.goal;
  const actGoal = a.pitstops?.[0]?.pitstop.goal;
  const rawDomain = ciGoal?.needsDomain ?? actGoal?.needsDomain ?? null;
  const domainLabel = rawDomain ? fmtDomain(rawDomain) : null;
  const clusterName = ciGoal?.needsCluster?.name ?? actGoal?.needsCluster?.name ?? null;

  async function startVoiceLog() {
    if (!linkedChecklist) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setVoiceState("processing");
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, "voice.webm");
        const res = await fetch(`/api/checklist/${linkedChecklist.id}/voice`, { method: "POST", body: fd });
        if (res.ok) onCompleted(linkedChecklist.id);
        setVoiceState("idle");
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setVoiceState("recording");
    } catch { setVoiceState("idle"); }
  }

  function stopVoiceLog() { mediaRecorderRef.current?.stop(); }

  async function handleAttach(file: File) {
    if (!linkedChecklist) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("checklistItemId", linkedChecklist.id);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    setUploading(false);
    if (res.ok) onCompleted(linkedChecklist.id);
  }

  return (
    <div className={`rounded-2xl p-5 flex flex-col gap-3 shadow-sm min-h-[160px] border ${
      isOverdue ? "bg-amber-50 border-amber-200" : "bg-white border-stone-200"
    }`}>
      {/* Domain + cluster badges */}
      {(domainLabel || clusterName) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {domainLabel && (
            <span className={`text-[11px] font-semibold bg-white px-2 py-0.5 rounded-full border ${
              isOverdue ? "text-amber-700 border-amber-200" : "text-violet-700 border-violet-200"
            }`}>
              {domainLabel}
            </span>
          )}
          {clusterName && (
            <span className="text-[11px] text-stone-500 bg-white border border-stone-200 px-2 py-0.5 rounded-full">
              {clusterName}
            </span>
          )}
        </div>
      )}

      {/* Title + meta */}
      <div className="flex-1">
        <p className="text-base font-semibold text-stone-800 leading-snug mb-1">{a.title}</p>
        {actGoal?.title && (
          <p className="text-[11px] text-stone-400 mb-1.5 truncate">{actGoal.title}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {a.type && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ACTIVITY_TYPE_STYLE[a.type] ?? "bg-stone-100 text-stone-600"}`}>
              {a.type}
            </span>
          )}
          {isOverdue
            ? <span className="text-xs font-medium text-amber-700">{daysAgo(a.scheduledAt)}d overdue</span>
            : <span className="text-xs text-stone-400">{fmtTime(a.scheduledAt)}</span>
          }
          {a.location && <span className="text-xs text-stone-400 truncate">· {a.location}</span>}
        </div>
      </div>

      {/* Action */}
      {completionType === "Activity" && (
        <button onClick={() => onDone(a.id)} disabled={isBusy}
          className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-colors">
          {isLoadingDone ? "Updating…" : "Mark Done"}
        </button>
      )}
      {completionType === "Voice" && (
        voiceState === "recording"
          ? <button onClick={stopVoiceLog} className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold text-sm transition-colors">Stop Recording</button>
          : voiceState === "idle" && !isBusy
            ? <button onClick={startVoiceLog} className="w-full py-2.5 flex items-center justify-center gap-2 text-sm font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition-colors">
                <Mic className="w-4 h-4" /> Record Voice Log
              </button>
            : null
      )}
      {completionType === "Upload" && !isBusy && (
        <>
          <button onClick={() => fileInputRef.current?.click()}
            className="w-full py-2.5 flex items-center justify-center gap-2 text-sm font-semibold text-stone-600 bg-white hover:bg-stone-50 border border-stone-200 rounded-xl transition-colors">
            <Paperclip className="w-4 h-4" /> Attach File
          </button>
          <input type="file" ref={fileInputRef} className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleAttach(f); e.target.value = ""; }} />
        </>
      )}
      {(voiceState === "processing" || uploading) && (
        <div className="w-full py-2.5 flex items-center justify-center gap-2 text-sm text-stone-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          {voiceState === "processing" ? "Transcribing…" : "Uploading…"}
        </div>
      )}
    </div>
  );
}

// ── RP overdue carousel — horizontal scroll-snap for mobile ───────────────────

function RPOverdueCarousel({
  overdueItems, activityChecklistMap, loadingDoneId, onDone, onCompleted,
}: {
  overdueItems: Activity[];
  activityChecklistMap: Map<string, ChecklistItem>;
  loadingDoneId: string | null;
  onDone: (eventId: string) => void;
  onCompleted: (checklistItemId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIdx, setCurrentIdx] = useState(0);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setCurrentIdx(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <SectionTitle>Needs your update</SectionTitle>
        </div>
        {overdueItems.length > 1 && (
          <span className="text-xs text-stone-400 tabular-nums">{currentIdx + 1} of {overdueItems.length}</span>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {overdueItems.map(a => (
          <div key={a.id} className="snap-start flex-shrink-0 w-full pr-[1px]">
            <RPOverdueCard
              a={a}
              linkedChecklist={activityChecklistMap.get(a.id) ?? null}
              onDone={onDone} onCompleted={onCompleted}
              isLoadingDone={loadingDoneId === a.id}
            />
          </div>
        ))}
      </div>

      {overdueItems.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {overdueItems.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-200 ${
              i === currentIdx ? "w-4 bg-amber-500" : "w-1.5 bg-stone-200"
            }`} />
          ))}
        </div>
      )}
    </div>
  );
}

function RPTodayCarousel({
  todayItems, activityChecklistMap, loadingDoneId, onDone, onCompleted,
}: {
  todayItems: Activity[];
  activityChecklistMap: Map<string, ChecklistItem>;
  loadingDoneId: string | null;
  onDone: (id: string) => void;
  onCompleted: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentIdx, setCurrentIdx] = useState(0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <SectionTitle>Today</SectionTitle>
        {todayItems.length > 1 && (
          <span className="text-xs text-stone-400 tabular-nums">{currentIdx + 1} of {todayItems.length}</span>
        )}
      </div>
      <div
        ref={scrollRef}
        onScroll={e => setCurrentIdx(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {todayItems.map(a => (
          <div key={a.id} className="snap-start flex-shrink-0 w-full pr-[1px]">
            <RPOverdueCard
              a={a} isOverdue={false}
              linkedChecklist={activityChecklistMap.get(a.id) ?? null}
              onDone={onDone} onCompleted={onCompleted}
              isLoadingDone={loadingDoneId === a.id}
            />
          </div>
        ))}
      </div>
      {todayItems.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {todayItems.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-200 ${
              i === currentIdx ? "w-4 bg-stone-400" : "w-1.5 bg-stone-200"
            }`} />
          ))}
        </div>
      )}
    </div>
  );
}

function RPActivityRow({
  a, userId, isOverdue, linkedChecklist, onDone, onCompleted, isLoadingDone,
}: {
  a: Activity;
  userId: string;
  isOverdue: boolean;
  linkedChecklist: ChecklistItem | null;
  onDone: (eventId: string) => void;
  onCompleted: (checklistItemId: string) => void;
  isLoadingDone: boolean;
}) {
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "processing">("idle");
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const completionType = linkedChecklist?.completionType ?? "Activity";
  const isBusy = voiceState !== "idle" || uploading || isLoadingDone;

  const { goal, isOwner, isAttendee, geo, domain } = activityMeta(a, userId);

  async function startVoiceLog() {
    if (!linkedChecklist) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setVoiceState("processing");
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, "voice.webm");
        const res = await fetch(`/api/checklist/${linkedChecklist.id}/voice`, { method: "POST", body: fd });
        if (res.ok) onCompleted(linkedChecklist.id);
        setVoiceState("idle");
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setVoiceState("recording");
    } catch {
      setVoiceState("idle");
    }
  }

  function stopVoiceLog() { mediaRecorderRef.current?.stop(); }

  async function handleAttach(file: File) {
    if (!linkedChecklist) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("checklistItemId", linkedChecklist.id);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    setUploading(false);
    if (res.ok) onCompleted(linkedChecklist.id);
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
      isOverdue ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-white"
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
          {a.type && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ACTIVITY_TYPE_STYLE[a.type] ?? "bg-stone-100 text-stone-600"}`}>
              {a.type}
            </span>
          )}
          {isOwner && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-violet-100 text-violet-700">Owner</span>}
          {isAttendee && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-sky-100 text-sky-700">Attendee</span>}
        </div>
        <p className={`text-xs ${isOverdue ? "text-amber-700" : "text-stone-400"}`}>
          {isOverdue
            ? `${daysAgo(a.scheduledAt)}d ago${a.location ? ` · ${a.location}` : ""}`
            : `${fmtTime(a.scheduledAt)}${a.location ? ` · ${a.location}` : ""}`
          }
        </p>
        {(goal?.title || domain || geo) && (
          <p className="text-[11px] text-stone-400 truncate mt-0.5">
            {[goal?.title, domain, geo].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      {completionType === "Activity" && (
        <button onClick={() => onDone(a.id)} disabled={isBusy}
          className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex-shrink-0">
          {isLoadingDone ? "…" : "Done"}
        </button>
      )}
      {completionType === "Voice" && (
        voiceState === "recording"
          ? <button onClick={stopVoiceLog} className="text-xs px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex-shrink-0">Stop</button>
          : voiceState === "idle" && !isBusy
            ? <button onClick={startVoiceLog} className="flex items-center gap-1 text-xs px-2.5 py-1.5 text-stone-500 hover:text-sky-600 hover:bg-sky-50 rounded-md transition-colors flex-shrink-0">
                <Mic className="w-3 h-3" /> Log
              </button>
            : null
      )}
      {completionType === "Upload" && !isBusy && (
        <>
          <button onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 text-stone-500 hover:text-sky-600 hover:bg-sky-50 rounded-md transition-colors flex-shrink-0">
            <Paperclip className="w-3 h-3" /> Attach
          </button>
          <input type="file" ref={fileInputRef} className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleAttach(f); e.target.value = ""; }} />
        </>
      )}
      {(voiceState === "processing" || uploading) && (
        <Loader2 className="w-3.5 h-3.5 text-stone-400 animate-spin flex-shrink-0" />
      )}
    </div>
  );
}

function RPTodayTab({
  userId,
  overdueActivities,
  todayActivities,
  weekActivities,
  weekChecklists,
  doneActivities,
}: {
  userId: string;
  overdueActivities: Activity[];
  todayActivities: Activity[];
  weekActivities: Activity[];
  weekChecklists: ChecklistItem[];
  doneActivities: Activity[];
}) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [loadingDoneId, setLoadingDoneId] = useState<string | null>(null);
  const [completedItemIds, setCompletedItemIds] = useState<Set<string>>(new Set());
  // Set of "<clusterId>:<section>" keys for sections the user has expanded.
  // Everything starts collapsed so the page opens to a scannable list of
  // cluster cards with count badges.
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  // Mobile cluster carousel state.
  const carouselRef = useRef<HTMLDivElement>(null);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const handleCarouselScroll = () => {
    const el = carouselRef.current;
    if (!el || el.clientWidth === 0) return;
    setCarouselIdx(Math.round(el.scrollLeft / el.clientWidth));
  };
  const toggleSection = (clusterId: string, section: string) => {
    setOpenSections(prev => {
      const k = `${clusterId}:${section}`;
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const isOpen = (clusterId: string, section: string) =>
    openSections.has(`${clusterId}:${section}`);

  const now = new Date();
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const todayMs = new Date(now.toDateString()).getTime();

  // Activities whose linked checklist was completed (any completionType) should disappear
  const completedActivityIds = useMemo(() =>
    new Set(
      weekChecklists
        .filter(ci => completedItemIds.has(ci.id))
        .flatMap(ci => ci.activities.map(a => a.id))
    ),
    [weekChecklists, completedItemIds]
  );

  // Map: activityId → linked open ChecklistItem (for action button derivation)
  const activityChecklistMap = useMemo(() => {
    const map = new Map<string, ChecklistItem>();
    for (const ci of weekChecklists) {
      if (completedItemIds.has(ci.id)) continue;
      for (const act of ci.activities) map.set(act.id, ci);
    }
    return map;
  }, [weekChecklists, completedItemIds]);

  function isVisible(a: Activity) {
    return !doneIds.has(a.id) && !completedActivityIds.has(a.id);
  }

  // Overdue: past activities + past-due-today, still Scheduled, oldest first
  const pastDueToday = todayActivities.filter(
    a => new Date(a.scheduledAt) < now && a.status === "Scheduled" && isVisible(a)
  );
  const overdueItems = [
    ...overdueActivities.filter(a => isVisible(a)),
    ...pastDueToday,
  ].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  // Today: upcoming (not yet past), still Scheduled
  const todayItems = todayActivities.filter(
    a => new Date(a.scheduledAt) >= now && a.status === "Scheduled" && isVisible(a)
  );

  // Rest of week
  const weekItems = weekActivities.filter(
    a => new Date(a.scheduledAt) > todayEnd && a.status === "Scheduled"
  );

  // Checklists sorted overdue-first, then by pitstop targetDate
  const openChecklists = useMemo(() =>
    weekChecklists
      .filter(ci => !completedItemIds.has(ci.id))
      .sort((a, b) => {
        const aMs = a.pitstop.targetDate ? new Date(a.pitstop.targetDate).getTime() : Infinity;
        const bMs = b.pitstop.targetDate ? new Date(b.pitstop.targetDate).getTime() : Infinity;
        return aMs - bMs;
      }),
    [weekChecklists, completedItemIds]
  );

  function handleCompleted(checklistItemId: string) {
    setCompletedItemIds(prev => new Set([...prev, checklistItemId]));
  }

  async function handleDone(eventId: string) {
    setLoadingDoneId(eventId);
    try {
      await fetch(`/api/pitstop-events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Done" }),
      });
      setDoneIds(prev => new Set([...prev, eventId]));
      // Server closes Activity-type checklist items when their linked event is marked Done.
      // Mirror that here so "Open checklists" removes them immediately.
      const linkedIds = weekChecklists
        .filter(ci => ci.completionType === "Activity" && ci.activities.some(a => a.id === eventId))
        .map(ci => ci.id);
      if (linkedIds.length > 0) setCompletedItemIds(prev => new Set([...prev, ...linkedIds]));
    } finally {
      setLoadingDoneId(null);
    }
  }

  const allEmpty = overdueItems.length === 0 && todayItems.length === 0 && openChecklists.length === 0 && weekItems.length === 0;

  // Group every item by its cluster so the page renders one card per cluster.
  const UNCLUSTERED_ID = "__unclustered__";
  type Bucket = {
    id: string;
    name: string;
    overdue: Activity[];
    today: Activity[];
    checklists: ChecklistItem[];
    week: Activity[];
    earliestMs: number;
  };
  const bucketMap = new Map<string, Bucket>();
  const ensureBucket = (c: { id: string; name: string } | null | undefined): Bucket => {
    const id = c?.id ?? UNCLUSTERED_ID;
    const name = c?.name ?? "No cluster";
    let b = bucketMap.get(id);
    if (!b) { b = { id, name, overdue: [], today: [], checklists: [], week: [] , earliestMs: Infinity}; bucketMap.set(id, b); }
    return b;
  };
  const activityCluster = (a: Activity) => a.pitstops?.[0]?.pitstop?.goal?.needsCluster ?? null;
  const checklistCluster = (ci: ChecklistItem) => ci.pitstop.goal.needsCluster ?? null;
  for (const a of overdueItems)        ensureBucket(activityCluster(a)).overdue.push(a);
  for (const a of todayItems)          ensureBucket(activityCluster(a)).today.push(a);
  for (const ci of openChecklists)     ensureBucket(checklistCluster(ci)).checklists.push(ci);
  for (const a of weekItems)           ensureBucket(activityCluster(a)).week.push(a);

  // Sort items within each bucket by SLA-due (earliest first), and stamp the
  // bucket's earliest urgent date so we can order the cards too.
  const activityMs = (a: Activity) => new Date(a.scheduledAt).getTime();
  const checklistMs = (ci: ChecklistItem) =>
    ci.pitstop.targetDate ? new Date(ci.pitstop.targetDate).getTime() : Number.MAX_SAFE_INTEGER;
  for (const b of bucketMap.values()) {
    b.overdue.sort((x, y) => activityMs(x) - activityMs(y));
    b.today.sort((x, y) => activityMs(x) - activityMs(y));
    b.week.sort((x, y) => activityMs(x) - activityMs(y));
    b.checklists.sort((x, y) => checklistMs(x) - checklistMs(y));
    const candidates: number[] = [];
    if (b.overdue[0]) candidates.push(activityMs(b.overdue[0]));
    if (b.today[0]) candidates.push(activityMs(b.today[0]));
    if (b.checklists[0]) candidates.push(checklistMs(b.checklists[0]));
    if (b.week[0]) candidates.push(activityMs(b.week[0]));
    b.earliestMs = candidates.length > 0 ? Math.min(...candidates) : Number.MAX_SAFE_INTEGER;
  }

  // Most-urgent cluster first. "No cluster" bucket always last.
  const buckets = [...bucketMap.values()].sort((a, b) => {
    if (a.id === UNCLUSTERED_ID) return 1;
    if (b.id === UNCLUSTERED_ID) return -1;
    if (a.earliestMs !== b.earliestMs) return a.earliestMs - b.earliestMs;
    return a.name.localeCompare(b.name);
  });

  const nonEmptyBuckets = buckets.filter(b =>
    b.overdue.length + b.today.length + b.checklists.length + b.week.length > 0
  );

  // Render a single cluster card. Re-used by both the mobile carousel and the
  // desktop list — extracted so we don't have to fight Tailwind's responsive
  // class precedence with a dual-mode flex container.
  const renderClusterCard = (bucket: Bucket) => (
    <section
      key={bucket.id}
      className="rounded-2xl border border-stone-200 bg-white overflow-hidden"
    >
            {/* Cluster header */}
            <header className="px-4 py-3 bg-stone-50 border-b border-stone-100 flex items-center gap-2 min-w-0">
              <MapPin className="w-4 h-4 text-stone-400 flex-shrink-0" />
              <h3 className="text-sm font-semibold text-stone-800 truncate">{bucket.name}</h3>
            </header>

            <div className="divide-y divide-stone-100">
              {/* Needs your update */}
              {bucket.overdue.length > 0 && (() => {
                const open = isOpen(bucket.id, "overdue");
                return (
                  <div>
                    <button
                      onClick={() => toggleSection(bucket.id, "overdue")}
                      className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      <p className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider flex-1">Needs your update</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">{bucket.overdue.length}</span>
                      {open ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                    </button>
                    {open && (
                      <div className="px-3 pb-3 space-y-2">
                        {bucket.overdue.map(a => (
                          <RPActivityRow
                            key={a.id} a={a} userId={userId} isOverdue
                            linkedChecklist={activityChecklistMap.get(a.id) ?? null}
                            onDone={handleDone} onCompleted={handleCompleted}
                            isLoadingDone={loadingDoneId === a.id}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Today */}
              {bucket.today.length > 0 && (() => {
                const open = isOpen(bucket.id, "today");
                return (
                  <div>
                    <button
                      onClick={() => toggleSection(bucket.id, "today")}
                      className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
                    >
                      <p className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider flex-1">Today</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 font-semibold">{bucket.today.length}</span>
                      {open ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                    </button>
                    {open && (
                      <div className="px-3 pb-3 space-y-2">
                        {bucket.today.map(a => (
                          <RPActivityRow
                            key={a.id} a={a} userId={userId} isOverdue={false}
                            linkedChecklist={activityChecklistMap.get(a.id) ?? null}
                            onDone={handleDone} onCompleted={handleCompleted}
                            isLoadingDone={loadingDoneId === a.id}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Open checklists */}
              {bucket.checklists.length > 0 && (() => {
                const open = isOpen(bucket.id, "checklists");
                return (
                  <div>
                    <button
                      onClick={() => toggleSection(bucket.id, "checklists")}
                      className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
                    >
                      <p className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider flex-1">Open checklists</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold">{bucket.checklists.length}</span>
                      {open ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                    </button>
                    {open && (
                      <div className="px-3 pb-3">
                        <div className="rounded-xl border border-stone-100 bg-white divide-y divide-stone-100 overflow-hidden">
                          {bucket.checklists.map(ci => {
                            const pitstopMs = ci.pitstop.targetDate ? new Date(ci.pitstop.targetDate).getTime() : null;
                            const isOverdueChecklist = pitstopMs !== null && pitstopMs < todayMs;
                            return (
                              <div key={ci.id} className={isOverdueChecklist ? "bg-amber-50" : undefined}>
                                <RPChecklistRow item={ci} onCompleted={handleCompleted} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Coming up this week */}
              {bucket.week.length > 0 && (() => {
                const open = isOpen(bucket.id, "week");
                return (
                  <div>
                    <button
                      onClick={() => toggleSection(bucket.id, "week")}
                      className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
                    >
                      <p className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider flex-1">Coming up this week</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-200 text-stone-700 font-semibold">{bucket.week.length}</span>
                      {open ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                    </button>
                    {open && (
                      <div className="px-3 pb-3 space-y-2">
                        {bucket.week.map(a => {
                          const ps = a.pitstops?.[0]?.pitstop;
                          const g = ps?.goal;
                          const domain = g?.needsDomain ? fmtDomain(g.needsDomain) : null;
                          const geo = g?.needsSettlement?.name ?? g?.needsCluster?.name ?? g?.needsZone?.name ?? null;
                          const isOwner = ps?.ownerId === userId;
                          const isAttendee = !isOwner && (a.attendees?.some(at => at.user.id === userId) ?? false);
                          const role = isOwner ? "Owner" : isAttendee ? "Attendee" : null;
                          return <WeekCard key={a.id} title={a.title} type={a.type} scheduledAt={a.scheduledAt} location={a.location} goalTitle={g?.title} domain={domain} geo={geo} role={role} />;
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
    </section>
  );

  return (
    <div>
      {allEmpty && <EmptyState message="You're all caught up for today." />}

      {/* Mobile: horizontal swipe carousel of cluster cards */}
      <div className="sm:hidden">
        {nonEmptyBuckets.length > 1 && (
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-xs text-stone-400 tabular-nums">
              {Math.min(carouselIdx + 1, nonEmptyBuckets.length)} of {nonEmptyBuckets.length}
            </span>
            <span className="text-[11px] text-stone-400 truncate ml-2">
              ← swipe between clusters →
            </span>
          </div>
        )}
        <div
          ref={carouselRef}
          onScroll={handleCarouselScroll}
          className="flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {nonEmptyBuckets.map(bucket => (
            <div key={bucket.id} className="snap-start flex-shrink-0 w-full pr-[1px]">
              {renderClusterCard(bucket)}
            </div>
          ))}
        </div>
        {nonEmptyBuckets.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-3">
            {nonEmptyBuckets.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all duration-200 ${
                i === carouselIdx ? "w-4 bg-stone-700" : "w-1.5 bg-stone-200"
              }`} />
            ))}
          </div>
        )}
      </div>

      {/* Desktop: vertical list */}
      <div className="hidden sm:block space-y-4">
        {nonEmptyBuckets.map(bucket => renderClusterCard(bucket))}
      </div>
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
      {/* Settlement coverage by city */}
      {dash.cities.length > 0 && (
        <div>
          <SectionTitle>Settlement coverage</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            {dash.cities.map((city: AdminCityCoverage) => {
              const pct = city.totalSettlements > 0
                ? Math.round((city.coveredCount / city.totalSettlements) * 100)
                : 0;
              return (
                <div key={city.id} className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-stone-800">{city.name}</p>
                    <span className="text-xs text-stone-400">{pct}%</span>
                  </div>
                  <div className="flex items-end gap-1.5">
                    <span className="text-2xl font-bold text-stone-900">{city.coveredCount.toLocaleString()}</span>
                    <span className="text-sm text-stone-400 mb-0.5">/ {city.totalSettlements.toLocaleString()} settlements</span>
                  </div>
                  <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[10px] text-stone-400">{(city.totalSettlements - city.coveredCount).toLocaleString()} not yet covered</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
  { key: "today", label: "Today", icon: CalendarClock },
] as const;

const ZL_TABS = [
  { key: "today",    label: "Today",           icon: CalendarClock },
  { key: "health",   label: "Team Health",     icon: Activity },
  { key: "coverage", label: "Field Coverage",  icon: BarChart3 },
  { key: "clusters", label: "Cluster Status",  icon: MapPin },
  { key: "goals",    label: "Goals",           icon: Target },
] as const;

const ADMIN_TABS = [
  { key: "today",       label: "Today",         icon: CalendarClock },
  { key: "overview",    label: "Overview",      icon: LayoutDashboard },
  { key: "attention",   label: "Attention",     icon: AlertTriangle },
  { key: "team-health", label: "Team Health",   icon: Activity },
  { key: "engagement",  label: "Engagement",    icon: TrendingUp },
  { key: "goals",       label: "Goals",         icon: Target },
  { key: "coverage",    label: "Field Coverage", icon: BarChart3 },
  { key: "geography",   label: "Geography",     icon: MapPin },
  { key: "team",        label: "Team",          icon: Users },
] as const;

const PM_TABS = [
  { key: "today",     label: "Today",          icon: CalendarClock },
  { key: "zl-health", label: "ZL Health",      icon: Users },
  { key: "rp-health", label: "RP Health",      icon: Activity },
  { key: "coverage",  label: "Field Coverage", icon: BarChart3 },
  { key: "clusters",  label: "Cluster Status", icon: MapPin },
  { key: "goals",     label: "Goals",          icon: Target },
] as const;

const OTHER_TABS = [
  { key: "today", label: "Today", icon: CalendarClock },
  { key: "goals", label: "Goals", icon: Target },
] as const;

type TabKey = "today" | "health" | "zl-health" | "rp-health" | "coverage" | "clusters" | "goals" | "overview" | "geography" | "team" | "pipeline" | "attention" | "team-health" | "engagement";

export default function HomeView({
  userId, userName, designation, greeting, todayLabel,
  todayActivities, weekActivities, weekChecklists, myGoals,
  rpClusterStats, rpOverdueActivities, rpDoneActivities, zlOverdueActivities, zlMyActivities, zlZoneName, zlClusterStats, clusterStatus, teamMembers, rpTeamHealth,
  pmZLMembers, pmRPMembers, pmZLHealth, pmRPHealth, pmZLOverdueActivities, pmZLChecklists, pmMyActivities, pmRPOverdueActivities, pmRPChecklists, pmZoneClusterMap, pmClusterStats, pmClusterStatus,
  leaderOverdueActivities, leaderMyActivities,
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
  rpTeamHealth: RPHealthStat[];
  pmZLMembers: { id: string; name: string | null; image: string | null; reportsToId: string | null }[];
  pmRPMembers: { id: string; name: string | null; image: string | null; reportsToId: string | null }[];
  pmZLHealth: ZLHealthStat[];
  pmRPHealth: RPHealthStat[];
  pmZLOverdueActivities: ZLTeamActivity[];
  pmZLChecklists: ChecklistItem[];
  pmMyActivities: ZLTeamActivity[];
  pmRPOverdueActivities: ZLTeamActivity[];
  pmRPChecklists: ChecklistItem[];
  pmZoneClusterMap: { id: string; name: string; clusterIds: string[] }[];
  pmClusterStats: ClusterStat[];
  pmClusterStatus: ClusterStatus[];
  leaderOverdueActivities: Activity[];
  leaderMyActivities: Activity[];
  adminDash: AdminDash | null;
}) {
  const isAdmin = !!adminDash;
  const tabs = isAdmin ? ADMIN_TABS
    : designation === "ZL" ? ZL_TABS
    : designation === "RP" ? RP_TABS
    : designation === "PM" ? PM_TABS
    : OTHER_TABS;
  const defaultTab: TabKey = "today";
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
            userId={userId}
            overdueActivities={rpOverdueActivities}
            todayActivities={todayActivities}
            weekActivities={weekActivities}
            weekChecklists={weekChecklists}
            doneActivities={rpDoneActivities}
          />
        )}

        {/* ZL Team Health tab */}
        {activeTab === "health" && designation === "ZL" && (
          <ZLTeamHealthTab
            teamMembers={teamMembers}
            rpTeamHealth={rpTeamHealth}
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

        {/* PM tabs */}
        {activeTab === "today" && designation === "PM" && (
          <PMTodayTab
            userId={userId}
            zlMembers={pmZLMembers}
            rpMembers={pmRPMembers}
            pmZLOverdueActivities={pmZLOverdueActivities}
            pmZLChecklists={pmZLChecklists}
            pmMyActivities={pmMyActivities}
            pmRPOverdueActivities={pmRPOverdueActivities}
            pmRPChecklists={pmRPChecklists}
          />
        )}
        {activeTab === "zl-health" && designation === "PM" && (
          <PMZLHealthTab
            zlMembers={pmZLMembers}
            rpMembers={pmRPMembers}
            zlHealth={pmZLHealth}
            rpHealth={pmRPHealth}
          />
        )}
        {activeTab === "rp-health" && designation === "PM" && (
          <PMRPHealthTab
            zlMembers={pmZLMembers}
            rpMembers={pmRPMembers}
            rpHealth={pmRPHealth}
          />
        )}
        {activeTab === "coverage" && designation === "PM" && (
          <PMCoverageTab
            zoneClusterMap={pmZoneClusterMap}
            clusterStats={pmClusterStats}
          />
        )}
        {activeTab === "clusters" && designation === "PM" && (
          <ZLClusterStatusTab clusterStatus={pmClusterStatus} />
        )}

        {/* Non-RP/ZL/PM: shared Today tab */}
        {activeTab === "today" && designation !== "RP" && designation !== "ZL" && designation !== "PM" && (
          <TodayTab
            userId={userId}
            overdueActivities={leaderOverdueActivities}
            myActivities={leaderMyActivities}
            weekChecklists={weekChecklists}
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
        {activeTab === "attention" && adminDash && (
          <AdminAttentionTab dash={adminDash} />
        )}
        {activeTab === "team-health" && adminDash && (
          <AdminTeamHealthTab personHealth={adminDash.personHealth} />
        )}
        {activeTab === "engagement" && adminDash && (
          <AdminEngagementTab engagement={adminDash.engagement} />
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
