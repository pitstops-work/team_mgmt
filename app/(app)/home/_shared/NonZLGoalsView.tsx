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
import { GoalRow } from "../_shared/GoalRow";
import { EmptyState } from "../_shared/Primitives";

export function NonZLGoalsView({ goals, designation }: { goals: Goal[]; designation: string }) {
  const showOwner = designation !== "RP";
  const [groupBy, setGroupBy] = useState<"status" | "domain" | "owner" | "cluster" | "none">("status");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // SLA-due ordering: earliest targetDate first; goals without a date go last.
  const goalsByDate = useMemo(() => {
    const slaMs = (g: Goal) => g.targetDate ? new Date(g.targetDate).getTime() : Number.MAX_SAFE_INTEGER;
    return [...goals].sort((a, b) => slaMs(a) - slaMs(b));
  }, [goals]);

  const grouped = useMemo(() => {
    const out: Record<string, Goal[]> = {};
    if (groupBy === "none") { out[""] = [...goalsByDate]; return out; }
    for (const g of goalsByDate) {
      let key = "";
      if (groupBy === "status")  key = g.status ?? "Unknown";
      else if (groupBy === "domain")  key = g.needsDomain ?? "No domain";
      else if (groupBy === "owner")   key = g.owner?.name ?? "Unassigned";
      else if (groupBy === "cluster") key = g.needsCluster?.name ?? "No cluster";
      if (!out[key]) out[key] = [];
      out[key].push(g);
    }
    return out;
  }, [goalsByDate, groupBy]);

  // Deterministic order: known status order for "status", alpha for everything else.
  const groupOrder = useMemo(() => {
    if (groupBy === "status") {
      const ordered = ["Active", "Paused", "Complete", "Cancelled"];
      const keys = Object.keys(grouped);
      return [
        ...ordered.filter(k => keys.includes(k)),
        ...keys.filter(k => !ordered.includes(k)).sort(),
      ];
    }
    return Object.keys(grouped).sort();
  }, [grouped, groupBy]);

  // Collapse state. Default = all collapsed except the first non-empty group
  // (so the page lands with one expanded section instead of an empty page).
  const firstNonEmpty = groupOrder.find(k => (grouped[k]?.length ?? 0) > 0);
  const isOpen = (k: string) => {
    if (collapsed.has(k)) return false;
    if (collapsed.has(`${k}::open`)) return true;
    return k === firstNonEmpty;
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-xs text-stone-500">Group by</label>
        <select
          value={groupBy}
          onChange={e => setGroupBy(e.target.value as typeof groupBy)}
          className="text-sm border border-stone-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
        >
          <option value="status">Status</option>
          <option value="domain">Domain</option>
          <option value="owner">Owner</option>
          <option value="cluster">Cluster</option>
          <option value="none">No grouping</option>
        </select>
        <span className="ml-auto text-xs text-stone-400">{goals.length} goal{goals.length === 1 ? "" : "s"} · earliest SLA first</span>
      </div>

      {/* Groups */}
      {groupOrder.length === 0 && <EmptyState message="No goals yet." />}
      {groupOrder.map(gkey => {
        const items = grouped[gkey] ?? [];
        if (items.length === 0) return null;
        if (groupBy === "none") {
          return (
            <div key="all" className="space-y-2">
              {items.map(g => <GoalRow key={g.id} goal={g} showOwner={showOwner} />)}
            </div>
          );
        }
        const open = isOpen(gkey);
        const handleToggle = () => {
          // Encode explicit open/closed so the default rule doesn't override
          // a manual choice.
          setCollapsed(prev => {
            const next = new Set(prev);
            const closedKey = gkey;
            const openKey = `${gkey}::open`;
            const wasOpen = open;
            // Clear both, then set the appropriate one.
            next.delete(closedKey);
            next.delete(openKey);
            next.add(wasOpen ? closedKey : openKey);
            return next;
          });
        };
        return (
          <section key={gkey} className="rounded-xl border border-stone-200 bg-white overflow-hidden">
            <button
              onClick={handleToggle}
              className="w-full flex items-center gap-2 px-4 py-2.5 bg-stone-50 hover:bg-stone-100 transition-colors text-left"
            >
              <span className="text-xs font-semibold text-stone-700 uppercase tracking-wider flex-1">{gkey}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-200 text-stone-600 font-semibold">{items.length}</span>
              {open ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
            </button>
            {open && (
              <div className="p-3 space-y-2">
                {items.map(g => <GoalRow key={g.id} goal={g} showOwner={showOwner} />)}
              </div>
            )}
          </section>
        );
      })}

      <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700">
        All goals <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
