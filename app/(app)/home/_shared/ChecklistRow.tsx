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

export function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <Link href={`/goals/${item.pitstop.goal.id}`}
      className="flex items-start gap-3 px-4 py-2.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition-colors">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${CHECKLIST_STATUS_DOT[item.status] ?? "bg-stone-200"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-stone-800 truncate">{item.text}</p>
        <p className="text-xs text-stone-400 mt-0.5 truncate">
          {item.pitstop.goal.title} · {item.pitstop.title}
          {item.pitstop.owner?.name && ` · ${item.pitstop.owner.name}`}
        </p>
      </div>
      {item.pitstop.targetDate && (
        <span className="text-[10px] text-stone-400 flex-shrink-0">{fmtDate(item.pitstop.targetDate)}</span>
      )}
    </Link>
  );
}
