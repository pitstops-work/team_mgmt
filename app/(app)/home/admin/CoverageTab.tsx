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
import { EmptyState, SectionTitle } from "../_shared/Primitives";

export function AdminCoverageTab({ dash }: { dash: AdminDash }) {
  // Build a zone-name → DomainStat[] map from all goals, using the zones/clusters in adminDash
  const clusterToZone = new Map<string, { zoneId: string; zoneName: string }>();
  for (const zone of dash.zones) {
    for (const cluster of zone.clusters) {
      clusterToZone.set(cluster.id, { zoneId: zone.id, zoneName: zone.name });
    }
  }

  // Aggregate domain stats per zone
  const zoneStatMap: Record<string, Record<string, { label: string; planned: number; done: number; goalCount: number; doneGoalCount: number; hasParams: boolean }>> = {};
  for (const g of dash.goals) {
    if (!g.needsDomain || !g.needsClusterId) continue;
    const zoneInfo = clusterToZone.get(g.needsClusterId);
    if (!zoneInfo) continue;
    if (!zoneStatMap[zoneInfo.zoneId]) zoneStatMap[zoneInfo.zoneId] = {};
    const map = zoneStatMap[zoneInfo.zoneId];
    if (!map[g.needsDomain]) map[g.needsDomain] = { label: g.needsDomain, planned: 0, done: 0, goalCount: 0, doneGoalCount: 0, hasParams: false };
    const entry = map[g.needsDomain];
    if (g.status === "Complete") {
      entry.done += (g as any).outcomeCount ?? (g as any).parameter ?? 0;
      entry.doneGoalCount++;
    } else if (g.status !== "Cancelled") {
      entry.planned += (g as any).parameter ?? 0;
      entry.goalCount++;
      if ((g as any).parameter) entry.hasParams = true;
    }
  }

  // Resolve domain labels from global domainStats
  const labelMap = Object.fromEntries(dash.domainStats.map(d => [d.domain, d.label]));
  for (const zoneMap of Object.values(zoneStatMap)) {
    for (const entry of Object.values(zoneMap)) {
      if (labelMap[entry.label]) entry.label = labelMap[entry.label];
    }
  }

  const zonesWithStats = dash.zones
    .map(z => ({
      id: z.id,
      name: z.name,
      cityName: z.cityName,
      stats: Object.entries(zoneStatMap[z.id] ?? {})
        .map(([domain, v]) => ({
          domain,
          label: v.label,
          planned: v.planned,
          done: v.done,
          gap: Math.max(0, v.planned - v.done),
          goalCount: v.goalCount,
          doneGoalCount: v.doneGoalCount,
          hasParams: v.hasParams,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .filter(z => z.stats.length > 0);

  return (
    <div className="space-y-8">
      {/* Settlement coverage by city */}
      {dash.cities.length > 0 && (
        <div>
          <SectionTitle>Settlement coverage</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            {dash.cities.map((city: AdminCityCoverage) => {
              const pct = city.totalSettlements > 0
                ? Math.round((city.coveredCount / city.totalSettlements) * 100)
                : 0;
              return (
                <div key={city.id} className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-stone-800">{city.name}</p>
                    <span className="text-xs text-stone-400">{pct}%</span>
                  </div>
                  <div className="flex items-end gap-1.5">
                    <span className="text-2xl font-bold text-stone-900">{city.coveredCount.toLocaleString()}</span>
                    <span className="text-sm text-stone-400 mb-0.5">/ {city.totalSettlements.toLocaleString()} settlements</span>
                  </div>
                  <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[10px] text-stone-400">{(city.totalSettlements - city.coveredCount).toLocaleString()} not yet covered</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Overall */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionTitle>All zones — overall</SectionTitle>
          <Link href="/needs" className="text-[10px] text-sky-500 hover:text-sky-700 flex items-center gap-0.5">
            Full analysis <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <DomainTable stats={dash.domainStats} />
      </div>

      {/* Per zone */}
      {zonesWithStats.length > 0 && (
        <div>
          <SectionTitle>By zone</SectionTitle>
          <div className="space-y-6">
            {zonesWithStats.map(z => (
              <div key={z.id}>
                <p className="text-xs font-medium text-stone-600 mb-2">
                  {z.name}{z.cityName ? <span className="text-stone-400 font-normal"> · {z.cityName}</span> : null}
                </p>
                <DomainTable stats={z.stats} />
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-stone-300 px-1">
        Planned = active goal targets · Done = completed outcomes · Gap = planned − done.{" "}
        <Link href="/needs" className="text-sky-400 hover:text-sky-600">See full coverage analysis →</Link>
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN HomeView
