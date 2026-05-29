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
import { DomainTable } from "../_shared/DomainTable";
import { EmptyState, SectionTitle, KpiTile } from "../_shared/Primitives";

export function AdminOverviewTab({ dash, todayActivities, onTabSwitch }: { dash: AdminDash; todayActivities: Activity[]; onTabSwitch: (tab: TabKey, goalStatus?: string) => void }) {
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
