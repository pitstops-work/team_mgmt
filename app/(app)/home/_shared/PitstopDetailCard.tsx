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

export function PitstopDetailCard({ p, ownerName }: { p: RPPitstopDetail; ownerName?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-red-50 border border-red-100 rounded p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-stone-800 truncate">{p.title}</p>
          <p className="text-[10px] text-stone-500 truncate">{p.goalTitle}{ownerName && ` · ${ownerName}`}</p>
        </div>
        {p.targetDate && <span className="text-[10px] font-semibold text-red-700 flex-shrink-0">{p.daysOverdue}d overdue</span>}
      </div>
      {p.pendingChecklists.length > 0 && (
        <button type="button" onClick={() => setOpen(v => !v)}
          className="mt-1 text-[10px] text-stone-500 hover:text-stone-700 flex items-center gap-0.5">
          {p.pendingChecklists.length} pending {open ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
        </button>
      )}
      {open && (
        <ul className="mt-1 space-y-0.5 pl-2 border-l-2 border-red-200">
          {p.pendingChecklists.map(ci => (
            <li key={ci.id} className="text-[10px] text-stone-600 leading-tight">{ci.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

