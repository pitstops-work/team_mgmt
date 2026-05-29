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
import { PitstopDetailCard } from "../_shared/PitstopDetailCard";
import { HealthBar } from "../_shared/Primitives";

type PMTeamMember = { id: string; name: string | null; image: string | null; reportsToId: string | null };

export function RPHealthCards({
  rpMembers, rpHealth,
}: {
  rpMembers: PMTeamMember[];
  rpHealth: RPHealthStat[];
}) {
  const [expandedDelayed, setExpandedDelayed] = useState<string | null>(null);

  return (
    <>
      {rpMembers.map(rp => {
        const stat = rpHealth.find(s => s.rpId === rp.id);
        if (!stat) return null;

        const isDelayedOpen = expandedDelayed === rp.id;
        const clPct = stat.totalChecklists > 0 ? Math.round((stat.doneChecklists / stat.totalChecklists) * 100) : null;
        const dotColor = stat.overduePitstops > 0 ? "bg-red-500"
          : stat.overdueActivities > 0 ? "bg-amber-400"
          : "bg-emerald-500";

        return (
          <div key={rp.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div className="flex items-center gap-2">
                <Avatar name={rp.name} image={rp.image} size="xs" />
                <span className="text-xs font-semibold text-stone-800">{rp.name ?? "Unnamed"}</span>
              </div>
              <span className={`w-2 h-2 rounded-full ${dotColor}`} />
            </div>

            <div className="px-4 pb-3 space-y-2.5">
              {/* Goals */}
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide">Goals</span>
                  <span className="text-[11px] text-stone-500">{stat.completeGoals} / {stat.totalGoals} complete</span>
                </div>
                <HealthBar value={stat.completeGoals} total={stat.totalGoals} color="bg-emerald-500" />
              </div>

              {/* Pitstops */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">
                  {stat.onTrackPitstops} on track
                </span>
                {stat.overduePitstops > 0 ? (
                  <button
                    type="button"
                    onClick={() => setExpandedDelayed(isDelayedOpen ? null : rp.id)}
                    className="flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-md hover:bg-red-100 active:bg-red-200 transition-colors cursor-pointer"
                  >
                    {stat.overduePitstops} delayed
                    {isDelayedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                ) : (
                  <span className="text-xs text-stone-400 bg-stone-50 border border-stone-100 px-2 py-0.5 rounded-md">0 delayed</span>
                )}
              </div>

              {/* Delayed drill-down */}
              {isDelayedOpen && (
                <div className="space-y-2 pt-1 border-t border-stone-100">
                  {stat.delayedPitstops.length === 0 && (
                    <p className="text-xs text-stone-400 py-1">No detail available.</p>
                  )}
                  {stat.delayedPitstops.map(p => (
                    <div key={p.id} className="bg-red-50 border border-red-100 rounded-lg p-2.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-stone-800">{p.title}</p>
                          <p className="text-[11px] text-stone-500">{p.goalTitle}</p>
                        </div>
                        <span className="text-[11px] font-medium text-red-600 whitespace-nowrap">{p.daysOverdue}d overdue</span>
                      </div>
                      {p.pendingChecklists.length > 0 && (
                        <ul className="space-y-0.5">
                          {p.pendingChecklists.map(ci => (
                            <li key={ci.id} className="flex items-start gap-1.5 text-[11px] text-stone-600">
                              <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-300 flex-shrink-0" />
                              {ci.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Checklist + overdue activity */}
              <div className="flex items-center gap-3">
                {clPct !== null && (
                  <span className="text-[11px] text-teal-700">{clPct}% checklists done</span>
                )}
                {stat.overdueActivities > 0 && (
                  <span className="text-[11px] text-amber-700">{stat.overdueActivities} activity overdue</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ── ZL Team Health tab ───────────────────────────────────────────────────────

