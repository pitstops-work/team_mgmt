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

export function DomainTable({ stats }: { stats: DomainStat[] }) {
  if (stats.length === 0) return <EmptyState message="No domain-tagged goals yet." />;
  const anyHasParams = stats.some(s => s.hasParams);
  return (
    <div className="rounded-lg border border-stone-200 overflow-hidden overflow-x-auto">
      <table className="w-full text-sm min-w-[320px]">
        <thead>
          <tr className="bg-stone-50 border-b border-stone-200">
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Domain</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-stone-500 uppercase tracking-wide">
              {anyHasParams ? "Planned" : "Goals"}
            </th>
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Done</th>
            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-stone-500 uppercase tracking-wide">Gap</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {stats.map(s => (
            <tr key={s.domain} className="bg-white hover:bg-stone-50 transition-colors">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-stone-700 font-medium">{s.label}</span>
                  {s.planned > 0 && (
                    <div className="hidden sm:flex flex-1 min-w-[60px] max-w-[100px]">
                      <div className="w-full bg-stone-100 rounded-full h-1 overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${Math.round((s.done / s.planned) * 100)}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              </td>
              <td className="px-4 py-2.5 text-sm text-right text-stone-600">
                {s.planned}
                {!s.hasParams && s.goalCount > 0 && (
                  <span className="text-[10px] text-stone-400 ml-1">goals</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-sm text-right text-emerald-600 font-medium">{s.done}</td>
              <td className={`px-4 py-2.5 text-sm text-right font-medium ${s.gap > 0 ? "text-amber-600" : "text-stone-400"}`}>{s.gap}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!anyHasParams && (
        <p className="px-4 py-2 text-[10px] text-stone-400 bg-stone-50 border-t border-stone-100">
          Showing goal counts — set targets on goals to see planned coverage numbers.
        </p>
      )}
    </div>
  );
}
