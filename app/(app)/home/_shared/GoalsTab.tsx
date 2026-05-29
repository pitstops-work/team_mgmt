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
import { NonZLGoalsView } from "../_shared/NonZLGoalsView";
import { EmptyState, SectionTitle } from "../_shared/Primitives";

export function GoalsTab({
  goals, userId, designation, teamMembers,
}: {
  goals: Goal[];
  userId: string;
  designation: string;
  teamMembers: TeamMember[];
}) {
  if (designation === "ZL" && teamMembers.length > 0) {
    // Treat co-owners as owners for "My goals" — they share responsibility.
    const isMine = (g: Goal) =>
      g.ownerId === userId || (g.coOwners ?? []).some(co => co.userId === userId);
    const myGoals   = goals.filter(isMine);
    const teamGoals = goals.filter(g => !isMine(g));
    const byMember: Record<string, Goal[]> = {};
    for (const g of teamGoals) {
      const oid = g.ownerId ?? "unknown";
      if (!byMember[oid]) byMember[oid] = [];
      byMember[oid].push(g);
    }

    return (
      <div className="space-y-6">
        <div>
          <SectionTitle>My goals ({myGoals.length})</SectionTitle>
          {myGoals.length === 0
            ? <EmptyState message="No goals assigned to you." />
            : <div className="space-y-2">{myGoals.map(g => <GoalRow key={g.id} goal={g} />)}</div>
          }
        </div>

        {Object.entries(byMember).length > 0 && (
          <div>
            <SectionTitle>Team goals</SectionTitle>
            <div className="space-y-6">
              {Object.entries(byMember).map(([ownerId, memberGoals]) => {
                const member = teamMembers.find(m => m.id === ownerId);
                return (
                  <div key={ownerId}>
                    <p className="text-xs font-medium text-stone-500 mb-2">{member?.name ?? "Unknown"}</p>
                    <div className="space-y-2">
                      {memberGoals.map(g => <GoalRow key={g.id} goal={g} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700">
          All goals <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <NonZLGoalsView
      goals={goals}
      designation={designation}
    />
  );
}
