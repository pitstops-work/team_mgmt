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

export function GoalRow({ goal, showOwner }: { goal: Goal; showOwner?: boolean }) {
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
