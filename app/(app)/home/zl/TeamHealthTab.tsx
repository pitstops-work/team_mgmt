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

export function ZLTeamHealthTab({
  teamMembers,
  rpTeamHealth,
}: {
  teamMembers: TeamMember[];
  rpTeamHealth: RPHealthStat[];
}) {
  const [expandedDelayed, setExpandedDelayed] = useState<string | null>(null);

  if (teamMembers.length === 0) {
    return <div className="text-sm text-stone-400 text-center py-16">No RPs reporting to you yet.</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-400 uppercase tracking-wide font-semibold">
        {teamMembers.length} RP{teamMembers.length !== 1 ? "s" : ""}
      </p>

      {teamMembers.map(rp => {
        const stat = rpTeamHealth.find(s => s.rpId === rp.id);
        if (!stat) return null;

        const isDelayedOpen = expandedDelayed === rp.id;
        const clPct = stat.totalChecklists > 0
          ? Math.round((stat.doneChecklists / stat.totalChecklists) * 100)
          : null;
        const dotColor = stat.overduePitstops > 0 ? "bg-red-500"
          : stat.overdueActivities > 0 ? "bg-amber-400"
          : "bg-emerald-500";
        const dotLabel = stat.overduePitstops > 0 ? "Needs attention"
          : stat.overdueActivities > 0 ? "Activities overdue"
          : "On track";

        return (
          <div key={rp.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <div className="flex items-center gap-2.5">
                <Avatar name={rp.name} image={rp.image} size="sm" />
                <span className="text-sm font-semibold text-stone-800">{rp.name ?? "Unnamed"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                <span className="text-xs text-stone-500">{dotLabel}</span>
              </div>
            </div>

            <div className="px-4 pb-4 space-y-3">
              {/* Goals progress */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide flex items-center gap-1">
                    <Target className="w-3 h-3" /> Goals
                  </span>
                  <span className="text-[11px] text-stone-500">
                    {stat.completeGoals} of {stat.totalGoals} complete
                    {stat.pausedGoals > 0 && (
                      <span className="ml-1.5 text-amber-500">· {stat.pausedGoals} paused</span>
                    )}
                  </span>
                </div>
                <HealthBar value={stat.completeGoals} total={stat.totalGoals} color="bg-emerald-500" />
              </div>

              {/* Pitstop SLA health */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Pitstops
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg">
                    {stat.onTrackPitstops} within SLA
                  </span>
                  {stat.overduePitstops > 0 ? (
                    <button
                      type="button"
                      onClick={() => setExpandedDelayed(isDelayedOpen ? null : rp.id)}
                      className="flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-100 active:bg-red-200 transition-colors cursor-pointer"
                    >
                      {stat.overduePitstops} delayed
                      {isDelayedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  ) : (
                    <span className="text-xs text-stone-400 bg-stone-50 border border-stone-100 px-2 py-1 rounded-lg">
                      0 delayed
                    </span>
                  )}
                </div>
              </div>

              {/* Delayed pitstops drill-down */}
              {isDelayedOpen && (
                <div className="space-y-2 pt-1 border-t border-stone-100">
                  {stat.delayedPitstops.length === 0 && (
                    <p className="text-xs text-stone-400 py-1">No detail available.</p>
                  )}
                  {stat.delayedPitstops.map(p => (
                    <div key={p.id} className="bg-red-50 border border-red-100 rounded-lg p-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-stone-800">{p.title}</p>
                          <p className="text-[11px] text-stone-500">{p.goalTitle}</p>
                        </div>
                        <span className="text-[11px] font-medium text-red-600 whitespace-nowrap">
                          {p.daysOverdue}d overdue
                        </span>
                      </div>
                      {p.pendingChecklists.length > 0 ? (
                        <div>
                          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">
                            Pending checklists
                          </p>
                          <ul className="space-y-0.5">
                            {p.pendingChecklists.map(ci => (
                              <li key={ci.id} className="flex items-start gap-1.5 text-[11px] text-stone-600">
                                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-300 flex-shrink-0" />
                                {ci.text}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="text-[11px] text-stone-400">No pending checklists</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Checklist completion */}
              {stat.totalChecklists > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide flex items-center gap-1">
                      <CheckSquare className="w-3 h-3" /> Checklist completion
                    </span>
                    <span className="text-[11px] text-stone-500">
                      {stat.doneChecklists} of {stat.totalChecklists} done · {clPct}%
                    </span>
                  </div>
                  <HealthBar value={stat.doneChecklists} total={stat.totalChecklists} color="bg-teal-500" />
                </div>
              )}

              {/* Overdue activities note */}
              {stat.overdueActivities > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {stat.overdueActivities} overdue activit{stat.overdueActivities === 1 ? "y" : "ies"} not yet marked done
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── ZL overdue card + carousel (mobile swipeable) ───────────────────────────

