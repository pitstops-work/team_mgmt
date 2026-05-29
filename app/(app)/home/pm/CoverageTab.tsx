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
import { EmptyState, SectionTitle, ProgressBar } from "../_shared/Primitives";

export function PMCoverageTab({
  zoneClusterMap,
  clusterStats,
}: {
  zoneClusterMap: { id: string; name: string; clusterIds: string[] }[];
  clusterStats: ClusterStat[];
}) {
  if (zoneClusterMap.length === 0) {
    return <div className="text-sm text-stone-400 text-center py-16">No zones found for your ZLs.</div>;
  }
  return (
    <div className="space-y-8">
      {zoneClusterMap.map(zone => {
        const zoneClusters = clusterStats.filter(c => zone.clusterIds.includes(c.clusterId));
        if (zoneClusters.length === 0) return null;
        return (
          <div key={zone.id}>
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <MapPin className="w-3 h-3" /> {zone.name}
            </p>
            <div className="space-y-4">
              {zoneClusters.map(c => (
                <div key={c.clusterId} className="bg-white border border-stone-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-stone-800 mb-3">{c.clusterName}</p>
                  {c.stats.length === 0
                    ? <p className="text-xs text-stone-400">No goals in this cluster.</p>
                    : <div className="space-y-2">
                        {c.stats.map(s => (
                          <div key={s.domain}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-stone-600">{s.label}</span>
                              <span className="text-xs text-stone-400">{s.done} / {s.hasParams ? s.planned + s.done : s.goalCount + s.doneGoalCount}</span>
                            </div>
                            <ProgressBar pct={s.hasParams ? (s.planned + s.done > 0 ? Math.round((s.done / (s.planned + s.done)) * 100) : 0) : (s.goalCount + s.doneGoalCount > 0 ? Math.round((s.doneGoalCount / (s.goalCount + s.doneGoalCount)) * 100) : 0)} color="bg-sky-500" />
                          </div>
                        ))}
                      </div>
                  }
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

