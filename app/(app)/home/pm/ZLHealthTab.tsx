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
import { EmptyState, SectionTitle, HealthBar } from "../_shared/Primitives";
import { RPHealthCards } from "../_shared/RPHealthCards";

type PMTeamMember = { id: string; name: string | null; image: string | null; reportsToId: string | null };

export function PMZLHealthTab({
  zlMembers, rpMembers, zlHealth, rpHealth,
}: {
  zlMembers: PMTeamMember[];
  rpMembers: PMTeamMember[];
  zlHealth: ZLHealthStat[];
  rpHealth: RPHealthStat[];
}) {
  const [expandedZL, setExpandedZL] = useState<string | null>(null);
  const [expandedDelayedZL, setExpandedDelayedZL] = useState<string | null>(null);

  if (zlMembers.length === 0) {
    return <div className="text-sm text-stone-400 text-center py-16">No ZLs reporting to you yet.</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-400 uppercase tracking-wide font-semibold">
        {zlMembers.length} ZL{zlMembers.length !== 1 ? "s" : ""}
      </p>

      {zlMembers.map(zl => {
        const stat = zlHealth.find(s => s.zlId === zl.id);
        if (!stat) return null;

        const dotColor = stat.totalDelayedPitstops > 0 ? "bg-red-500"
          : stat.totalOverdueActivities > 0 ? "bg-amber-400"
          : "bg-emerald-500";
        const dotLabel = stat.totalDelayedPitstops > 0 ? "Team needs attention"
          : stat.totalOverdueActivities > 0 ? "Team activities overdue"
          : "Team on track";
        const clPct = stat.totalChecklists > 0
          ? Math.round((stat.doneChecklists / stat.totalChecklists) * 100)
          : null;
        const isOpen = expandedZL === zl.id;
        const zlRPs = rpMembers.filter(r => r.reportsToId === zl.id);

        return (
          <div key={zl.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <div className="flex items-center gap-2.5">
                <Avatar name={zl.name} image={zl.image} size="sm" />
                <div>
                  <span className="text-sm font-semibold text-stone-800">{zl.name ?? "Unnamed"}</span>
                  <span className="ml-2 text-xs text-stone-400">{stat.rpCount} RP{stat.rpCount !== 1 ? "s" : ""}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                <span className="text-xs text-stone-500">{dotLabel}</span>
              </div>
            </div>

            <div className="px-4 pb-4 space-y-3">
              {/* ZL's own goal progress */}
              {stat.totalGoals > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide flex items-center gap-1">
                      <Target className="w-3 h-3" /> Own Goals
                    </span>
                    <span className="text-[11px] text-stone-500">
                      {stat.completeGoals} of {stat.totalGoals} complete
                      {stat.pausedGoals > 0 && <span className="ml-1.5 text-amber-500">· {stat.pausedGoals} paused</span>}
                    </span>
                  </div>
                  <HealthBar value={stat.completeGoals} total={stat.totalGoals} color="bg-emerald-500" />
                </div>
              )}

              {/* Team pitstop health */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-stone-50 rounded-lg p-2.5">
                  <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Team Pitstops
                  </p>
                  {stat.totalDelayedPitstops > 0 ? (
                    <button
                      type="button"
                      onClick={() => setExpandedDelayedZL(expandedDelayedZL === zl.id ? null : zl.id)}
                      className="text-xs font-medium text-red-700 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-md hover:bg-red-100 cursor-pointer transition-colors flex items-center gap-1"
                    >
                      {stat.totalDelayedPitstops} delayed
                      {expandedDelayedZL === zl.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  ) : (
                    <span className="text-xs text-stone-400">None delayed</span>
                  )}
                </div>

                <div className="bg-stone-50 rounded-lg p-2.5">
                  <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <CalendarClock className="w-3 h-3" /> Team Activities
                  </p>
                  {stat.totalOverdueActivities > 0 ? (
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-md">
                      {stat.totalOverdueActivities} overdue
                    </span>
                  ) : (
                    <span className="text-xs text-stone-400">None overdue</span>
                  )}
                </div>
              </div>

              {/* Delayed pitstop drill-down */}
              {expandedDelayedZL === zl.id && stat.delayedPitstops.length > 0 && (
                <div className="space-y-2 border-t border-stone-100 pt-2">
                  {(stat.delayedPitstops as RPPitstopDetail[]).map(p => (
                    <div key={p.id} className="bg-red-50 border border-red-100 rounded-lg p-2.5">
                      <p className="text-xs font-medium text-stone-800 truncate">{p.title}</p>
                      <p className="text-[10px] text-stone-500 truncate">{p.goalTitle}</p>
                      <div className="flex items-center justify-between mt-1">
                        {p.targetDate && (
                          <span className="text-[10px] font-medium text-red-700">{p.daysOverdue}d overdue</span>
                        )}
                        {p.pendingChecklists.length > 0 && (
                          <span className="text-[10px] text-stone-500">{p.pendingChecklists.length} pending checklist{p.pendingChecklists.length !== 1 ? "s" : ""}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Team checklist completion */}
              {stat.totalChecklists > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide flex items-center gap-1">
                      <CheckSquare className="w-3 h-3" /> Team Checklist Completion
                    </span>
                    <span className="text-[11px] text-stone-500">
                      {stat.doneChecklists} of {stat.totalChecklists} · {clPct}%
                    </span>
                  </div>
                  <HealthBar value={stat.doneChecklists} total={stat.totalChecklists} color="bg-teal-500" />
                </div>
              )}

              {/* Expand RPs */}
              {zlRPs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpandedZL(isOpen ? null : zl.id)}
                  className="flex items-center gap-1 text-xs text-sky-700 bg-sky-50 border border-sky-200 px-2.5 py-1.5 rounded-lg hover:bg-sky-100 active:bg-sky-200 transition-colors cursor-pointer w-full justify-center"
                >
                  {isOpen ? "Hide" : "Show"} {zlRPs.length} RP{zlRPs.length !== 1 ? "s" : ""}
                  {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}

              {/* Inline RP health cards */}
              {isOpen && (
                <div className="space-y-2 pt-1 border-t border-stone-100">
                  <RPHealthCards
                    rpMembers={zlRPs}
                    rpHealth={rpHealth.filter(r => r.zlId === zl.id)}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

