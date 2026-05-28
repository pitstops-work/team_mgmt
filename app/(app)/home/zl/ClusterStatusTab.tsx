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

export function ZLClusterStatusTab({ clusterStatus }: { clusterStatus: ClusterStatus[] }) {
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
