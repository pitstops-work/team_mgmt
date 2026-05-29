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
import { ProgressBar, EmptyState } from "../_shared/Primitives";

export function AdminTeamTab({ users }: { users: AdminUser[] }) {
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

