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
import { EmptyState, SectionTitle } from "../_shared/Primitives";

export function AdminPipelineTab({ dash }: { dash: AdminDash }) {
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

