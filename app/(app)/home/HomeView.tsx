"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarDays, Flag, Clock, TrendingDown, Bell, CalendarClock, ChevronRight, Plus } from "lucide-react";

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

type HomeData = {
  overduePitstops: OverduePitstop[];
  thisWeekPitstops: WeekPitstop[];
  todayPlanItems: PlanItem[];
  todayActivities: TodayActivity[];
  noPlanPitstops: NoPlanPitstop[];
  goneQuietGoals: GoneQuietGoal[];
  flaggedActivities: FlaggedActivity[];
  recentNotifications: RecentNotification[];
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysLate(dateStr: string) {
  const diff = new Date().getTime() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
function daysSince(dateStr: string) {
  const diff = new Date().getTime() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, accent }: {
  label: string; value: number;
  icon: React.ReactNode;
  accent: "red" | "amber" | "sky" | "stone";
}) {
  const colors = {
    red:   { bg: value > 0 ? "bg-red-50 border-red-200"   : "bg-stone-50 border-stone-200", val: value > 0 ? "text-red-600"   : "text-stone-400" },
    amber: { bg: value > 0 ? "bg-amber-50 border-amber-200" : "bg-stone-50 border-stone-200", val: value > 0 ? "text-amber-600" : "text-stone-400" },
    sky:   { bg: value > 0 ? "bg-sky-50 border-sky-200"   : "bg-stone-50 border-stone-200", val: value > 0 ? "text-sky-600"   : "text-stone-400" },
    stone: { bg: "bg-stone-50 border-stone-200", val: "text-stone-500" },
  };
  const c = colors[accent];
  return (
    <div className={`flex-1 min-w-[110px] px-4 py-3 rounded-xl border ${c.bg} flex flex-col gap-1`}>
      <div className="flex items-center gap-1.5 text-stone-400">{icon}<span className="text-[10px] font-medium uppercase tracking-wide">{label}</span></div>
      <p className={`text-2xl font-bold ${c.val}`}>{value}</p>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, count, href }: { title: string; count?: number; href?: string }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
        {title}{count !== undefined && count > 0 && <span className="ml-1.5 text-stone-300">({count})</span>}
      </h2>
      {href && <Link href={href} className="text-[10px] text-sky-500 hover:text-sky-700 flex items-center gap-0.5">All <ChevronRight className="w-3 h-3" /></Link>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HomeView({
  currentUserId,
  users,
  initialData,
  greeting,
  todayLabel,
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

  const handleUserChange = (uid: string) => { setViewUserId(uid); load(uid); };

  const { overduePitstops, thisWeekPitstops, todayPlanItems, todayActivities,
          noPlanPitstops, goneQuietGoals, flaggedActivities, recentNotifications } = data;

  const attentionCount = overduePitstops.length + noPlanPitstops.length + goneQuietGoals.length + flaggedActivities.length;

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-stone-50/40">

      {/* Header */}
      <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-stone-100 bg-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-stone-900">
              {greeting}{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="text-sm text-stone-400 mt-0.5">{todayLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            {loading && <span className="text-xs text-stone-400 animate-pulse">Loading…</span>}
            <select
              value={viewUserId}
              onChange={e => handleUserChange(e.target.value)}
              className="px-3 py-1.5 text-xs border border-stone-200 rounded-lg bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
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
      <div className="flex gap-3 px-4 sm:px-6 py-4 overflow-x-auto no-scrollbar bg-white border-b border-stone-100">
        <StatCard label="Overdue" value={overduePitstops.length} icon={<AlertTriangle className="w-3.5 h-3.5" />} accent="red" />
        <StatCard label="Due this week" value={thisWeekPitstops.filter(p => p.targetDate).length} icon={<Clock className="w-3.5 h-3.5" />} accent="amber" />
        <StatCard label="No plan" value={noPlanPitstops.length} icon={<CalendarDays className="w-3.5 h-3.5" />} accent="amber" />
        <StatCard label="Flagged" value={flaggedActivities.length} icon={<Flag className="w-3.5 h-3.5" />} accent="red" />
      </div>

      {/* Main */}
      <div className="flex-1 px-4 sm:px-6 py-5">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left column ────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Today */}
            <div>
              <SectionHeader title="Today" href="/planner" />
              {todayPlanItems.length === 0 && todayActivities.length === 0 ? (
                <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-dashed border-stone-200 text-stone-400 text-xs">
                  <span>Nothing planned for today.</span>
                  <Link href="/planner" className="flex items-center gap-1 text-sky-500 hover:text-sky-700">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </Link>
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
                    <div key={item.id}
                      className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-stone-200 bg-white">
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

            {/* This week */}
            <div>
              <SectionHeader title="This week's pitstops" count={thisWeekPitstops.length} href="/timeline" />
              {thisWeekPitstops.length === 0 ? (
                <p className="text-xs text-stone-400 px-1">No pitstops due or starting this week.</p>
              ) : (
                <div className="space-y-1.5">
                  {thisWeekPitstops.map(p => {
                    const isDue   = p.targetDate && new Date(p.targetDate) <= new Date(new Date().setHours(23,59,59,999));
                    const isStart = p.startDate  && !isDue;
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

          {/* ── Right column ───────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Needs attention */}
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
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

                  {/* Overdue */}
                  {overduePitstops.length > 0 && (
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-2">Overdue ({overduePitstops.length})</p>
                      <div className="space-y-1.5">
                        {overduePitstops.slice(0, 5).map(p => (
                          <Link key={p.id} href={`/goals/${p.goal.id}/pitstops/${p.id}`}
                            className="flex items-start gap-2 group">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0 mt-1.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-stone-800 truncate group-hover:text-sky-600 transition-colors">{p.title}</p>
                              <p className="text-[10px] text-stone-400 truncate">{p.goal.title}</p>
                            </div>
                            <span className="text-[10px] text-red-500 font-medium flex-shrink-0">{daysLate(p.targetDate!)}d late</span>
                          </Link>
                        ))}
                        {overduePitstops.length > 5 && (
                          <p className="text-[10px] text-stone-400 pl-3.5">+{overduePitstops.length - 5} more</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* No plan this week */}
                  {noPlanPitstops.length > 0 && (
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide mb-2">No plan this week ({noPlanPitstops.length})</p>
                      <div className="space-y-1.5">
                        {noPlanPitstops.slice(0, 4).map(p => (
                          <Link key={p.id} href={`/goals/${p.goal.id}/pitstops/${p.id}`}
                            className="flex items-start gap-2 group">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-1.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-stone-800 truncate group-hover:text-sky-600 transition-colors">{p.title}</p>
                              <p className="text-[10px] text-stone-400 truncate">{p.goal.title}</p>
                            </div>
                            {p.targetDate && <span className="text-[10px] text-stone-400 flex-shrink-0">{fmtDate(p.targetDate)}</span>}
                          </Link>
                        ))}
                        {noPlanPitstops.length > 4 && (
                          <p className="text-[10px] text-stone-400 pl-3.5">+{noPlanPitstops.length - 4} more</p>
                        )}
                      </div>
                      <Link href="/planner" className="flex items-center gap-1 mt-2 text-[10px] text-sky-500 hover:text-sky-700">
                        <CalendarDays className="w-3 h-3" /> Plan in Planner
                      </Link>
                    </div>
                  )}

                  {/* Gone quiet */}
                  {goneQuietGoals.length > 0 && (
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-2">Gone quiet 14+ days ({goneQuietGoals.length})</p>
                      <div className="space-y-1.5">
                        {goneQuietGoals.slice(0, 4).map(g => (
                          <Link key={g.id} href={`/goals/${g.id}`}
                            className="flex items-start gap-2 group">
                            <span className="w-1.5 h-1.5 rounded-full bg-stone-300 flex-shrink-0 mt-1.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-stone-800 truncate group-hover:text-sky-600 transition-colors">{g.title}</p>
                            </div>
                            <span className="text-[10px] text-stone-400 flex-shrink-0">{daysSince(g.lastUpdated)}d</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Flagged activities */}
                  {flaggedActivities.length > 0 && (
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-semibold text-orange-500 uppercase tracking-wide mb-2">Flagged activities ({flaggedActivities.length})</p>
                      <div className="space-y-1.5">
                        {flaggedActivities.slice(0, 4).map(a => (
                          <Link key={a.id} href="/activities"
                            className="flex items-start gap-2 group">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0 mt-1.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-stone-800 truncate group-hover:text-sky-600 transition-colors">{a.title}</p>
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

            {/* Recent notifications */}
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-3.5 h-3.5 text-stone-400" />
                  <span className="text-xs font-semibold text-stone-600">Recent</span>
                </div>
                <Link href="/notifications" className="text-[10px] text-sky-500 hover:text-sky-700 flex items-center gap-0.5">
                  All <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              {recentNotifications.length === 0 ? (
                <div className="px-4 py-5 text-center">
                  <p className="text-xs text-stone-400">No notifications yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-stone-50">
                  {recentNotifications.map(n => {
                    const inner = (
                      <div className={`flex items-start gap-2.5 px-4 py-2.5 hover:bg-stone-50 transition-colors ${n.read ? "opacity-60" : ""}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${n.read ? "bg-transparent" : "bg-sky-500"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-stone-800 truncate">{n.title}</p>
                          <p className="text-[10px] text-stone-400 mt-0.5">
                            {new Date(n.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    );
                    return n.link ? (
                      <Link key={n.id} href={n.link}>{inner}</Link>
                    ) : (
                      <div key={n.id}>{inner}</div>
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
