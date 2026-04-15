"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  AlertTriangle, CalendarDays, Clock, Bell, ChevronRight, Plus,
  CalendarRange, Megaphone, Tag, ShieldCheck, BadgeCheck,
} from "lucide-react";
import Avatar from "@/components/Avatar";

// ── Types ─────────────────────────────────────────────────────────────────────

type User = { id: string; name: string | null; image: string | null; email: string | null };

type OverduePitstop = {
  id: string; title: string; status: string; targetDate: string;
  goal: { id: string; title: string };
  owner: { id: string; name: string | null; image: string | null };
};
type WeekPitstop = {
  id: string; title: string; status: string; targetDate: string | null; startDate: string | null;
  goal: { id: string; title: string };
  owner: { id: string; name: string | null; image: string | null };
};
type PlanItem = {
  id: string; title: string; type: string; date: string;
  pitstops: { pitstop: { id: string; title: string; goal: { id: string; title: string } } }[];
};
type TodayActivity = {
  id: string; title: string; type: string; scheduledAt: string; location: string | null; status: string;
};
type NoPlanPitstop = {
  id: string; title: string; targetDate: string | null;
  goal: { id: string; title: string };
};
type GoneQuietGoal = { id: string; title: string; lastUpdated: string };
type FlaggedActivity = { id: string; title: string; scheduledAt: string; type: string };
type RecentNotification = { id: string; type: string; title: string; read: boolean; createdAt: string; link: string | null };
type QuarterGoal = {
  goal: { id: string; title: string; status: string; pitstops: { id: string; status: string }[] };
};
type Quarter = { id: string; year: number; quarter: number; focus: string | null; goals: QuarterGoal[] };
type Broadcast = {
  id: string; message: string; createdAt: string;
  author: { id: string; name: string | null; image: string | null };
  goal: { id: string; title: string };
};
type StandupLog = {
  id: string; yesterday: string | null; today: string | null; blockers: string | null; createdAt: string;
  user: { id: string; name: string | null; image: string | null };
};
type StalePitstop = { id: string; title: string; goal: { id: string; title: string } };
type PendingVerification = {
  id: string; title: string; completedAt: string | null;
  goal: { id: string; title: string };
  owner: { id: string; name: string | null; image: string | null };
};
type UnconfirmedGoal = {
  id: string; title: string; createdAt: string;
  owner: { id: string; name: string | null; image: string | null };
};

type HomeData = {
  overduePitstops: OverduePitstop[];
  thisWeekPitstops: WeekPitstop[];
  todayPlanItems: PlanItem[];
  todayActivities: TodayActivity[];
  noPlanPitstops: NoPlanPitstop[];
  goneQuietGoals: GoneQuietGoal[];
  flaggedActivities: FlaggedActivity[];
  recentNotifications: RecentNotification[];
  currentQuarter: Quarter | null;
  recentBroadcasts: Broadcast[];
  recentStandups: StandupLog[];
  staleCheckins: StalePitstop[];
  driftingThemes: { id: string; name: string; color: string | null }[];
  pendingVerifications: PendingVerification[];
  unconfirmedGoals: UnconfirmedGoal[];
  fyYear: number;
  fyQ: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BG: Record<string, string> = {
  Done:       "bg-emerald-50 border-emerald-200 text-emerald-800",
  InProgress: "bg-sky-50 border-sky-200 text-sky-800",
  Upcoming:   "bg-stone-50 border-stone-200 text-stone-700",
};
const STATUS_DOT: Record<string, string> = {
  Done: "bg-emerald-400", InProgress: "bg-sky-400", Upcoming: "bg-stone-300",
};
const PLAN_TYPE_DOT: Record<string, string> = {
  Meeting: "bg-sky-400", Visit: "bg-violet-400", Review: "bg-amber-400",
  Internal: "bg-stone-400", "Data Work": "bg-emerald-400", Proposal: "bg-pink-400", Note: "bg-stone-300",
};
const ACT_DOT: Record<string, string> = {
  Meeting: "bg-sky-400", Visit: "bg-violet-400", Event: "bg-amber-400",
};
const GOAL_STATUS_DOT: Record<string, string> = {
  Complete: "bg-emerald-400", Active: "bg-sky-400", Paused: "bg-amber-400",
};
const QTR_LABELS = ["Apr–Jun", "Jul–Sep", "Oct–Dec", "Jan–Mar"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysLate(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}
function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, accent, href }: {
  label: string; value: number; icon: React.ReactNode;
  accent: "red" | "amber" | "sky" | "stone";
  href?: string;
}) {
  const colors = {
    red:   { bg: value > 0 ? "bg-red-50 border-red-200"     : "bg-stone-50 border-stone-200", val: value > 0 ? "text-red-600"   : "text-stone-400" },
    amber: { bg: value > 0 ? "bg-amber-50 border-amber-200" : "bg-stone-50 border-stone-200", val: value > 0 ? "text-amber-600" : "text-stone-400" },
    sky:   { bg: value > 0 ? "bg-sky-50 border-sky-200"     : "bg-stone-50 border-stone-200", val: value > 0 ? "text-sky-600"   : "text-stone-400" },
    stone: { bg: "bg-stone-50 border-stone-200", val: "text-stone-500" },
  };
  const c = colors[accent];
  const inner = (
    <>
      <div className="flex items-center gap-1.5 text-stone-400">{icon}<span className="text-[10px] font-medium uppercase tracking-wide">{label}</span></div>
      <p className={`text-2xl font-bold ${c.val}`}>{value}</p>
    </>
  );
  const cls = `px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl border ${c.bg} flex flex-col gap-0.5${href ? " hover:shadow-sm transition-shadow cursor-pointer" : ""}`;
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <div className={cls}>{inner}</div>;
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, count, href, icon }: { title: string; count?: number; href?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
        {icon}{title}
        {count !== undefined && count > 0 && <span className="text-stone-300">({count})</span>}
      </h2>
      {href && (
        <Link href={href} className="text-[10px] text-sky-500 hover:text-sky-700 flex items-center gap-0.5">
          All <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

// ── Current quarter card ──────────────────────────────────────────────────────

function CurrentQuarterCard({ quarter, fyYear, fyQ }: { quarter: Quarter | null; fyYear: number; fyQ: number }) {
  if (!quarter) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarRange className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-xs font-semibold text-stone-600">
              Q{fyQ} FY{fyYear} <span className="text-stone-400 font-normal">· {QTR_LABELS[fyQ - 1]}</span>
            </span>
          </div>
          <Link href="/quarters" className="text-[10px] text-sky-500 hover:text-sky-700">Set up →</Link>
        </div>
        <div className="px-4 py-4 text-center">
          <p className="text-xs text-stone-400">No quarter plan yet.</p>
          <Link href="/quarters" className="mt-1 inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700">
            <Plus className="w-3 h-3" /> Create quarter plan
          </Link>
        </div>
      </div>
    );
  }

  const totalPitstops = quarter.goals.reduce((s, qg) => s + qg.goal.pitstops.length, 0);
  const donePitstops  = quarter.goals.reduce((s, qg) => s + qg.goal.pitstops.filter(p => p.status === "Done").length, 0);
  const pct = totalPitstops > 0 ? Math.round((donePitstops / totalPitstops) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-sky-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-sky-100 bg-sky-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarRange className="w-3.5 h-3.5 text-sky-500" />
          <div>
            <span className="text-xs font-semibold text-sky-800">
              Q{quarter.quarter} FY{quarter.year}
              <span className="font-normal text-sky-500 ml-1">{QTR_LABELS[quarter.quarter - 1]}</span>
            </span>
            {quarter.focus && <p className="text-[10px] text-sky-600">{quarter.focus}</p>}
          </div>
        </div>
        <Link href="/quarters" className="text-[10px] text-sky-600 hover:text-sky-700 flex items-center gap-0.5">
          View <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {totalPitstops > 0 && (
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center justify-between text-[10px] text-stone-400 mb-1">
            <span>{donePitstops}/{totalPitstops} pitstops done</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full bg-sky-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {quarter.goals.length === 0 ? (
        <div className="px-4 py-3">
          <p className="text-xs text-stone-400">No goals tagged to this quarter.</p>
          <Link href="/quarters" className="text-xs text-sky-600 hover:text-sky-700">Tag goals →</Link>
        </div>
      ) : (
        <div className="divide-y divide-stone-50">
          {quarter.goals.map(({ goal }) => {
            const done  = goal.pitstops.filter(p => p.status === "Done").length;
            const total = goal.pitstops.length;
            return (
              <Link key={goal.id} href={`/goals/${goal.id}`}
                className="flex items-center gap-3 px-4 py-2 hover:bg-stone-50 transition-colors group">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${GOAL_STATUS_DOT[goal.status] ?? "bg-stone-300"}`} />
                <span className="flex-1 text-xs text-stone-700 group-hover:text-sky-600 truncate">{goal.title}</span>
                {total > 0 && <span className="text-[10px] text-stone-400 flex-shrink-0">{done}/{total}</span>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Recent broadcasts ─────────────────────────────────────────────────────────

function BroadcastsCard({ broadcasts }: { broadcasts: Broadcast[] }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="w-3.5 h-3.5 text-stone-400" />
          <span className="text-xs font-semibold text-stone-600">Recent updates</span>
        </div>
      </div>
      {broadcasts.length === 0 ? (
        <div className="px-4 py-5 text-center">
          <p className="text-xs text-stone-400">No updates posted yet.</p>
          <p className="text-[10px] text-stone-300 mt-1">Goal owners can broadcast updates from any goal page.</p>
        </div>
      ) : (
        <div className="divide-y divide-stone-50">
          {broadcasts.map(b => (
            <Link key={b.id} href={`/goals/${b.goal.id}`}
              className="block px-4 py-2.5 hover:bg-stone-50 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <Avatar name={b.author.name} image={b.author.image} size="xs" />
                <span className="text-xs font-medium text-stone-700 truncate">{b.goal.title}</span>
                <span className="text-[10px] text-stone-400 ml-auto flex-shrink-0">{fmtDate(b.createdAt)}</span>
              </div>
              <p className="text-xs text-stone-600 line-clamp-2 pl-5">{b.message}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function HomeView({
  currentUserId, users, initialData, greeting, todayLabel,
}: {
  currentUserId: string;
  users: User[];
  initialData: HomeData;
  greeting: string;
  todayLabel: string;
}) {
  const [viewUserId, setViewUserId] = useState(currentUserId);
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);

  const viewUser = users.find(u => u.id === viewUserId);
  const firstName = viewUser?.name?.split(" ")[0] ?? viewUser?.email ?? "";

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    const res = await fetch(`/api/home-data?userId=${uid}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  const {
    overduePitstops, thisWeekPitstops, todayPlanItems, todayActivities,
    noPlanPitstops, goneQuietGoals, flaggedActivities, recentNotifications,
    currentQuarter, recentBroadcasts, driftingThemes, fyYear, fyQ,
    pendingVerifications = [], unconfirmedGoals = [],
  } = data;

  const attentionCount = overduePitstops.length + goneQuietGoals.length + flaggedActivities.length;

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-stone-50/40">

      {/* Header */}
      <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-stone-100 bg-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-stone-900 truncate">
              {greeting}{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="text-sm text-stone-400 mt-0.5">{todayLabel}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {loading && <span className="text-xs text-stone-400 animate-pulse">Loading…</span>}
            <select
              value={viewUserId}
              onChange={e => { setViewUserId(e.target.value); load(e.target.value); }}
              className="max-w-[130px] sm:max-w-none px-2.5 py-1.5 text-xs border border-stone-200 rounded-lg bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.id === currentUserId ? `${u.name ?? u.email} (me)` : u.name ?? u.email ?? u.id}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:flex sm:flex-row gap-3 px-4 sm:px-6 py-4 bg-white border-b border-stone-100">
        <StatCard label="Overdue"         value={overduePitstops.length}                            icon={<AlertTriangle className="w-3.5 h-3.5" />} accent="red"   href="#attention" />
        <StatCard label="Due this week"   value={thisWeekPitstops.filter(p => p.targetDate).length} icon={<Clock className="w-3.5 h-3.5" />}          accent="amber" href="#this-week" />
        <StatCard label="No plan"         value={noPlanPitstops.length}                              icon={<CalendarDays className="w-3.5 h-3.5" />}    accent="amber" href="/planner" />
        <StatCard label="Drifting themes" value={driftingThemes.length}                              icon={<Tag className="w-3.5 h-3.5" />}             accent="amber" href="#drifting" />
      </div>

      {/* Main grid */}
      <div className="flex-1 px-4 sm:px-6 py-5 pb-24 lg:pb-8">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Right sidebar — first on mobile ── */}
          <div className="order-1 lg:order-2 space-y-5">

            {/* Current quarter */}
            <CurrentQuarterCard quarter={currentQuarter} fyYear={fyYear} fyQ={fyQ} />

            {/* Needs attention */}
            <div id="attention" className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-2">
                <AlertTriangle className={`w-3.5 h-3.5 ${attentionCount > 0 ? "text-red-400" : "text-stone-300"}`} />
                <span className="text-xs font-semibold text-stone-600">Needs attention</span>
                {attentionCount > 0 && (
                  <span className="ml-auto text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{attentionCount}</span>
                )}
              </div>
              {attentionCount === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs text-stone-400">All clear. Nothing needs attention.</p>
                </div>
              ) : (
                <div className="divide-y divide-stone-100">

                  {overduePitstops.length > 0 && (
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-2">Overdue ({overduePitstops.length})</p>
                      <div className="space-y-1.5">
                        {overduePitstops.slice(0, 5).map(p => (
                          <Link key={p.id} href={`/goals/${p.goal.id}/pitstops/${p.id}`} className="flex items-start gap-2 group">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0 mt-1.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-stone-800 truncate group-hover:text-sky-600 transition-colors">{p.title}</p>
                              <p className="text-[10px] text-stone-400 truncate">{p.goal.title}</p>
                            </div>
                            <span className="text-[10px] text-red-500 font-medium flex-shrink-0">{daysLate(p.targetDate!)}d late</span>
                          </Link>
                        ))}
                        {overduePitstops.length > 5 && <p className="text-[10px] text-stone-400 pl-3.5">+{overduePitstops.length - 5} more</p>}
                      </div>
                    </div>
                  )}

                  {goneQuietGoals.length > 0 && (
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-2">No updates in 14+ days ({goneQuietGoals.length})</p>
                      <div className="space-y-1.5">
                        {goneQuietGoals.slice(0, 4).map(g => (
                          <Link key={g.id} href={`/goals/${g.id}`} className="flex items-start gap-2 group">
                            <span className="w-1.5 h-1.5 rounded-full bg-stone-300 flex-shrink-0 mt-1.5" />
                            <p className="flex-1 text-xs font-medium text-stone-800 truncate group-hover:text-sky-600">{g.title}</p>
                            <span className="text-[10px] text-stone-400 flex-shrink-0">{daysSince(g.lastUpdated)}d</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {flaggedActivities.length > 0 && (
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-semibold text-orange-500 uppercase tracking-wide mb-2">Flagged activities ({flaggedActivities.length})</p>
                      <div className="space-y-1.5">
                        {flaggedActivities.slice(0, 4).map(a => (
                          <Link key={a.id} href="/activities" className="flex items-start gap-2 group">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0 mt-1.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-stone-800 truncate group-hover:text-sky-600">{a.title}</p>
                              <p className="text-[10px] text-stone-400">{fmtDate(a.scheduledAt)}</p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* Notifications */}
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-3.5 h-3.5 text-stone-400" />
                  <span className="text-xs font-semibold text-stone-600">Notifications</span>
                </div>
                <Link href="/notifications" className="text-[10px] text-sky-500 hover:text-sky-700 flex items-center gap-0.5">
                  All <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              {recentNotifications.length === 0 ? (
                <div className="px-4 py-5 text-center"><p className="text-xs text-stone-400">No notifications yet.</p></div>
              ) : (
                <div className="divide-y divide-stone-50">
                  {recentNotifications.map(n => {
                    const inner = (
                      <div className={`flex items-start gap-2.5 px-4 py-2.5 hover:bg-stone-50 transition-colors ${n.read ? "opacity-60" : ""}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${n.read ? "bg-transparent" : "bg-sky-500"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-stone-800 truncate">{n.title}</p>
                          <p className="text-[10px] text-stone-400 mt-0.5">{fmtDatetime(n.createdAt)}</p>
                        </div>
                      </div>
                    );
                    return n.link ? <Link key={n.id} href={n.link}>{inner}</Link> : <div key={n.id}>{inner}</div>;
                  })}
                </div>
              )}
            </div>

          </div>

          {/* ── Main column — second on mobile ── */}
          <div className="order-2 lg:order-1 lg:col-span-2 space-y-6">

            {/* Today */}
            <div>
              <SectionHeader title="Today" href="/planner" icon={<CalendarDays className="w-3.5 h-3.5" />} />
              {todayPlanItems.length === 0 && todayActivities.length === 0 ? (
                <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-dashed border-stone-200 text-stone-400 text-xs">
                  <span>Nothing planned for today.</span>
                  <Link href="/planner" className="flex items-center gap-1 text-sky-500 hover:text-sky-700"><Plus className="w-3.5 h-3.5" /> Add</Link>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {todayActivities.map(a => (
                    <Link key={a.id} href="/activities"
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 transition-colors">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ACT_DOT[a.type] ?? "bg-stone-400"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
                        <p className="text-[11px] text-stone-400">{fmtTime(a.scheduledAt)} · {a.type}{a.location ? ` · ${a.location}` : ""}</p>
                      </div>
                      <span className="text-[10px] text-stone-400 bg-stone-50 border border-stone-200 px-2 py-0.5 rounded-full flex-shrink-0">Activity</span>
                    </Link>
                  ))}
                  {todayPlanItems.map(item => (
                    <div key={item.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-stone-200 bg-white">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${PLAN_TYPE_DOT[item.type] ?? "bg-stone-300"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-800 truncate">{item.title}</p>
                        {item.pitstops.length > 0 && (
                          <p className="text-[11px] text-stone-400 truncate mt-0.5">
                            {item.pitstops.map(p => p.pitstop.goal.title + " › " + p.pitstop.title).join(", ")}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] text-stone-400 bg-stone-50 border border-stone-200 px-2 py-0.5 rounded-full flex-shrink-0">{item.type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent broadcasts */}
            <div>
              <SectionHeader title="Recent updates" icon={<Megaphone className="w-3.5 h-3.5" />} />
              <BroadcastsCard broadcasts={recentBroadcasts} />
            </div>

            {/* Drifting themes */}
            {driftingThemes.length > 0 && (
              <div id="drifting">
                <SectionHeader title="Drifting themes" icon={<Tag className="w-3.5 h-3.5" />} href="/themes" />
                <div className="flex flex-wrap gap-2">
                  {driftingThemes.map(t => (
                    <Link key={t.id} href="/themes"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 transition-colors">
                      <span className="w-2 h-2 rounded-full flex-shrink-0"
                        style={t.color ? { backgroundColor: t.color } : { backgroundColor: '#d97706' }} />
                      {t.name}
                      <span className="text-[10px] font-normal text-amber-600">21d quiet</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Pending verifications */}
            {pendingVerifications.length > 0 && (
              <div>
                <SectionHeader title="Awaiting your review" count={pendingVerifications.length} icon={<ShieldCheck className="w-3.5 h-3.5" />} />
                <div className="space-y-1.5">
                  {pendingVerifications.map(p => (
                    <Link key={p.id} href={`/goals/${p.goal.id}/pitstops/${p.id}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-stone-800 truncate">{p.title}</p>
                        <p className="text-[10px] text-stone-500 truncate">{p.goal.title} · done by {p.owner.name}</p>
                      </div>
                      {p.completedAt && (
                        <span className="text-[10px] text-emerald-600 flex-shrink-0">{fmtDate(p.completedAt)}</span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Unconfirmed goals */}
            {unconfirmedGoals.length > 0 && (
              <div>
                <SectionHeader title="Goals awaiting confirmation" count={unconfirmedGoals.length} icon={<BadgeCheck className="w-3.5 h-3.5" />} />
                <div className="space-y-1.5">
                  {unconfirmedGoals.map(g => (
                    <Link key={g.id} href={`/goals/${g.id}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 transition-colors">
                      <BadgeCheck className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-stone-800 truncate">{g.title}</p>
                        <p className="text-[10px] text-stone-500 truncate">by {g.owner.name}</p>
                      </div>
                      <span className="text-[10px] text-sky-600 flex-shrink-0">{fmtDate(g.createdAt)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* This week */}
            <div id="this-week">
              <SectionHeader title="This week's pitstops" count={thisWeekPitstops.length} href="/timeline" icon={<Clock className="w-3.5 h-3.5" />} />
              {thisWeekPitstops.length === 0 ? (
                <p className="text-xs text-stone-400 px-1">No pitstops due or starting this week.</p>
              ) : (
                <div className="space-y-1.5">
                  {thisWeekPitstops.map(p => {
                    const isDue = p.targetDate && new Date(p.targetDate) <= new Date(new Date().setHours(23, 59, 59, 999));
                    return (
                      <Link key={p.id} href={`/goals/${p.goal.id}/pitstops/${p.id}`}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border hover:shadow-sm transition-all ${STATUS_BG[p.status]}`}>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[p.status]}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.title}</p>
                          <p className="text-[11px] opacity-60 truncate">{p.goal.title}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {p.owner && <p className="text-[10px] opacity-60 hidden sm:block">{p.owner.name}</p>}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${isDue ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-white/60 border-current opacity-70"}`}>
                            {isDue ? (p.targetDate ? `Due ${fmtDate(p.targetDate)}` : "Due") : (p.startDate ? `Starts ${fmtDate(p.startDate)}` : "Starts")}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
