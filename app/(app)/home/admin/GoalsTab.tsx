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
import { EmptyState } from "../_shared/Primitives";

export function AdminGoalsTab({ goals, domainConfigs = [], initialStatusFilter = "All" }: { goals: AdminGoal[]; domainConfigs?: { domain: string; label: string }[]; initialStatusFilter?: string }) {
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
