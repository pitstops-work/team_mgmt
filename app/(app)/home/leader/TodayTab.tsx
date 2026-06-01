"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckSquare, Target, MapPin, BarChart3, ChevronRight, ChevronLeft, LayoutDashboard, Users, TrendingUp, AlertTriangle, CheckCircle2, Clock, Filter, ChevronDown, ChevronUp, Mic, Square, Loader2, Paperclip, Plus } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import Avatar from "@/components/Avatar";
import type { ActivityGoal, Activity, ChecklistItem, Goal, TeamMember, ZLTeamActivity, TabKey } from "../_lib/types";
import { fmtTime, fmtDate, fmtDateShort, isToday, daysDiff, daysAgo, activityMeta, groupByDay, fmtDomain, groupBySla, slaHeaderLabel, engLevel, istTodayStr, shiftIstDate } from "../_lib/helpers";
import { STATUS_BADGE, STATUS_DOT, CHECKLIST_STATUS_DOT, EVENT_TYPE_COLOR, ACTIVITY_TYPE_STYLE, DESIGNATION_ORDER, DESIGNATION_COLOR, PITSTOP_STATUS_COLOR } from "../_lib/constants";
import type { DomainStat, ClusterStat, ClusterStatus, RPHealthStat, ZLHealthStat, RPPitstopDetail, AdminDash, AdminGoal, AdminUser, AdminZone, OverduePitstop, AdminPersonHealth, AdminDelayedPitstop, AdminOverdueActivity, AdminEngagementStat, AdminCityCoverage, LeaderTeamMember, RPClusterDeckCluster, FacilityLayerConfigLite } from "../page";
import { ClusterTodayView } from "../_shared/ClusterTodayView";
import { TeamSlaPanel, TeamOverduePanel } from "../TeamPerformance";
import AddActivityModal, { type ActivityModalPitstopRef, type ActivityModalUser } from "../_shared/AddActivityModal";

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TodayTab({
  userId, overdueActivities, myActivities, weekChecklists, leaderTeam,
  addActivityPitstops, addActivityUsers,
}: {
  userId: string;
  overdueActivities: Activity[];
  myActivities: Activity[];
  weekChecklists: ChecklistItem[];
  leaderTeam?: LeaderTeamMember[];
  addActivityPitstops: ActivityModalPitstopRef[];
  addActivityUsers: ActivityModalUser[];
}) {
  const router = useRouter();
  const [showAddActivity, setShowAddActivity] = useState(false);

  // Leader / Other Today view — cluster-card layout for personal work, then
  // SLA performance + overdue panels for the recursive reporting tree.
  const todayActivities = myActivities.filter(a => isToday(a.scheduledAt));
  const weekActivities = myActivities.filter(a => !isToday(a.scheduledAt));
  const myChecklists = weekChecklists.filter(ci => ci.pitstop.ownerId === userId);
  const team = leaderTeam ?? [];

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button
          onClick={() => setShowAddActivity(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New activity
        </button>
      </div>

      <ClusterTodayView
        userId={userId}
        overdueActivities={overdueActivities}
        todayActivities={todayActivities}
        weekActivities={weekActivities}
        weekChecklists={myChecklists}
      />

      {/* SLA Performance + Overdue panels — replaces the old per-reportee
          counts roll-up. Both fetch their own data; they only appear for
          users who actually have reportees. */}
      {team.length > 0 && (
        <>
          <TeamSlaPanel />
          <TeamOverduePanel />
        </>
      )}

      {showAddActivity && (
        <AddActivityModal
          pitstops={addActivityPitstops}
          users={addActivityUsers}
          defaultDate={todayYMD()}
          onClose={() => setShowAddActivity(false)}
          onSaved={() => { setShowAddActivity(false); router.refresh(); }}
        />
      )}
    </div>
  );
}
