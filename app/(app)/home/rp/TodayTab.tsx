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
import { ClusterTodayView } from "../_shared/ClusterTodayView";
import { RPClusterDeck } from "../_shared/RPClusterDeck";

export function RPTodayTab({
  userId,
  overdueActivities,
  todayActivities,
  weekActivities,
  weekChecklists,
  rpClusterDeck,
  facilityLayerConfigs,
}: {
  userId: string;
  overdueActivities: Activity[];
  todayActivities: Activity[];
  weekActivities: Activity[];
  weekChecklists: ChecklistItem[];
  doneActivities?: Activity[]; // accepted but unused; kept for backward compat
  rpClusterDeck: RPClusterDeckCluster[];
  facilityLayerConfigs: FacilityLayerConfigLite[];
}) {
  if (rpClusterDeck.length === 0) {
    return (
      <ClusterTodayView
        userId={userId}
        overdueActivities={overdueActivities}
        todayActivities={todayActivities}
        weekActivities={weekActivities}
        weekChecklists={weekChecklists}
      />
    );
  }
  return (
    <RPClusterDeck
      userId={userId}
      overdueActivities={overdueActivities}
      todayActivities={todayActivities}
      weekActivities={weekActivities}
      weekChecklists={weekChecklists}
      clusters={rpClusterDeck}
      facilityLayerConfigs={facilityLayerConfigs}
    />
  );
}

const FALLBACK_FACILITY_COLOR = "#6366f1";

type RPDeckBucket = {
  clusterId: string;
  clusterName: string;
  overdue: Activity[];
  today: Activity[];
  checklists: ChecklistItem[];
  week: Activity[];
};

