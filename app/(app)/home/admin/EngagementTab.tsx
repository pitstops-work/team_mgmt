"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { CalendarClock, CheckSquare, Target, MapPin, BarChart3, ChevronRight, ChevronLeft, LayoutDashboard, Users, TrendingUp, AlertTriangle, CheckCircle2, Clock, Filter, ChevronDown, ChevronUp, Mic, Square, Loader2, Paperclip } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import Avatar from "@/components/Avatar";
import type { ActivityGoal, Activity, ChecklistItem, Goal, TeamMember, ZLTeamActivity, TabKey } from "../_lib/types";
import { fmtTime, fmtDate, fmtDateShort, isToday, daysDiff, daysAgo, activityMeta, groupByDay, fmtDomain, groupBySla, slaHeaderLabel, engLevel, istTodayStr, shiftIstDate } from "../_lib/helpers";
import { STATUS_BADGE, STATUS_DOT, CHECKLIST_STATUS_DOT, EVENT_TYPE_COLOR, ACTIVITY_TYPE_STYLE, DESIGNATION_ORDER, DESIGNATION_COLOR, PITSTOP_STATUS_COLOR } from "../_lib/constants";
import type { DomainStat, ClusterStat, ClusterStatus, RPHealthStat, ZLHealthStat, RPPitstopDetail, AdminDash, AdminGoal, AdminUser, AdminZone, OverduePitstop, AdminPersonHealth, AdminDelayedPitstop, AdminOverdueActivity, AdminEngagementStat, AdminCityCoverage, LeaderTeamMember, RPClusterDeckCluster, FacilityLayerConfigLite } from "../page";
import { ActivityFeedPanel } from "../_shared/ActivityFeedPanel";
import { EmptyState, SectionTitle } from "../_shared/Primitives";

const DESIGNATION_COLOR_ENG: Record<string, string> = {
  RP: "bg-violet-100 text-violet-700",
  ZL: "bg-sky-100 text-sky-700",
  PM: "bg-amber-100 text-amber-700",
};

export function AdminEngagementTab({ engagement }: { engagement: AdminEngagementStat[] }) {
  const [sortBy, setSortBy] = useState<"login" | "completion" | "freshness">("login");
  const [date, setDate] = useState<string>(istTodayStr());
  // Default expanded — all cards show their daily feed inline.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(engagement.map(e => e.userId)));

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

  const today = istTodayStr();
  const yesterday = shiftIstDate(today, -1);

  function toggleExpand(userId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

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
      {/* Daily activity feed date stepper */}
      <div className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-stone-500 font-medium">Daily activity for</span>
          <button type="button" onClick={() => setDate(shiftIstDate(date, -1))}
            className="text-stone-500 hover:text-stone-800 px-1" aria-label="Previous day">‹</button>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="text-xs px-2 py-1 rounded border border-stone-200 bg-white"
          />
          <button type="button" onClick={() => setDate(shiftIstDate(date, +1))}
            disabled={date >= today}
            className="text-stone-500 hover:text-stone-800 disabled:opacity-30 px-1" aria-label="Next day">›</button>
        </div>
        <div className="flex items-center gap-1.5">
          {[
            { label: "Yesterday", value: yesterday },
            { label: "Today", value: today },
          ].map(opt => (
            <button key={opt.value} type="button" onClick={() => setDate(opt.value)}
              className={`text-[11px] px-2 py-1 rounded-full border ${
                date === opt.value
                  ? "bg-stone-800 text-white border-stone-800"
                  : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

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

        const isOpen = expanded.has(s.userId);

        return (
          <div key={s.userId} className="bg-white border border-stone-200 rounded-xl p-4">
            {/* Header row */}
            <button type="button"
              onClick={() => toggleExpand(s.userId)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-3 mb-3 text-left">
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
              {isOpen
                ? <ChevronUp className="w-4 h-4 text-stone-400 shrink-0" />
                : <ChevronDown className="w-4 h-4 text-stone-400 shrink-0" />}
            </button>

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

            {isOpen && (
              <div className="mt-3 pt-3 border-t border-stone-100">
                <ActivityFeedPanel userId={s.userId} date={date} />
              </div>
            )}
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

// ── Activity feed panel (expanded per-person row in Engagement tab) ─────────

type ActivityFeedItem = {
  at: string;
  kind: string;
  summary: string;
  entityType: string;
  entityId: string;
  link?: string;
  detail?: { field?: string | null; oldValue?: string | null; newValue?: string | null };
};

const ACTIVITY_KIND_DOT: Record<string, string> = {
  goal_created: "bg-emerald-500",
  goal_updated: "bg-stone-400",
  goal_deleted: "bg-red-500",
  pitstop_created: "bg-emerald-500",
  pitstop_updated: "bg-stone-400",
  pitstop_deleted: "bg-red-500",
  pitstop_date_change: "bg-amber-500",
  activity_created: "bg-sky-500",
  activity_completed: "bg-emerald-500",
  activity_cancelled: "bg-red-400",
  activity_rescheduled: "bg-amber-500",
  activity_responded: "bg-sky-400",
  activity_updated: "bg-stone-400",
  checklist_created: "bg-sky-500",
  checklist_checked: "bg-emerald-500",
  checklist_status_change: "bg-amber-500",
  checklist_updated: "bg-stone-400",
  standup: "bg-violet-500",
  system: "bg-stone-300",
};

