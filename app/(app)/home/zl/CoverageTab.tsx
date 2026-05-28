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
import { SectionTitle } from "../_shared/Primitives";

export function ZLCoverageTab({ zoneName, clusterStats }: { zoneName: string | null; clusterStats: ClusterStat[] }) {
  if (clusterStats.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-stone-400">No zone assigned yet.</p>
        <Link href="/needs" className="mt-3 inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700">
          Full field coverage <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  const zoneStats: Record<string, { label: string; planned: number; done: number; gap: number; goalCount: number; doneGoalCount: number; hasParams: boolean }> = {};
  for (const c of clusterStats) {
    for (const s of c.stats) {
      if (!zoneStats[s.domain]) zoneStats[s.domain] = { label: s.label, planned: 0, done: 0, gap: 0, goalCount: 0, doneGoalCount: 0, hasParams: false };
      zoneStats[s.domain].planned      += s.planned;
      zoneStats[s.domain].done         += s.done;
      zoneStats[s.domain].gap          += s.gap;
      zoneStats[s.domain].goalCount    += s.goalCount;
      zoneStats[s.domain].doneGoalCount += s.doneGoalCount;
      if (s.hasParams) zoneStats[s.domain].hasParams = true;
    }
  }
  const zoneSummary: DomainStat[] = Object.entries(zoneStats).map(([domain, v]) => ({
    domain, ...v,
  })).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="space-y-8">
      {zoneName && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <SectionTitle>{zoneName} — Zone Total</SectionTitle>
            <Link href="/needs" className="text-[10px] text-sky-500 hover:text-sky-700 flex items-center gap-0.5">
              Full view <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <DomainTable stats={zoneSummary} />
        </div>
      )}

      <div>
        <SectionTitle>By cluster</SectionTitle>
        <div className="space-y-6">
          {clusterStats.map(c => (
            <div key={c.clusterId}>
              <p className="text-xs font-medium text-stone-600 mb-2">{c.clusterName}</p>
              <DomainTable stats={c.stats} />
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-stone-300 px-1">
        Planned = active goal targets · Done = completed outcomes · Gap = planned − done.{" "}
        <Link href="/needs" className="text-sky-400 hover:text-sky-600">See full analysis →</Link>
      </p>
    </div>
  );
}
