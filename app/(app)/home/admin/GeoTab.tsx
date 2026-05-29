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
import { EmptyState, SectionTitle, ProgressBar } from "../_shared/Primitives";

export function AdminGeoTab({ zones }: { zones: AdminZone[] }) {
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [cityFilter, setCityFilter] = useState<string>("All");

  const cities = useMemo(() => {
    const cs = new Set(zones.map(z => z.cityName).filter(Boolean) as string[]);
    return Array.from(cs).sort();
  }, [zones]);

  const filteredZones = cityFilter === "All" ? zones : zones.filter(z => z.cityName === cityFilter);

  // Group by city
  const byCity = useMemo(() => {
    const map: Record<string, AdminZone[]> = {};
    for (const z of filteredZones) {
      const city = z.cityName ?? "No city";
      if (!map[city]) map[city] = [];
      map[city].push(z);
    }
    return map;
  }, [filteredZones]);

  const maxZoneGoals = Math.max(...zones.map(z => z.activeGoals), 1);

  function toggleZone(id: string) {
    setExpandedZones(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCluster(id: string) {
    setExpandedClusters(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* City filter */}
      {cities.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {["All", ...cities].map(c => (
            <button
              key={c}
              onClick={() => setCityFilter(c)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                cityFilter === c
                  ? "bg-sky-500 text-white border-sky-500"
                  : "border-stone-200 text-stone-600 hover:border-sky-300 hover:text-sky-600"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Zone cards by city */}
      {Object.entries(byCity).map(([city, cityZones]) => (
        <div key={city}>
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-3.5 h-3.5 text-stone-400" />
            <SectionTitle>{city}</SectionTitle>
            <span className="text-[10px] text-stone-400">{cityZones.length} zones</span>
          </div>
          <div className="space-y-2">
            {cityZones.map(z => {
              const isOpen = expandedZones.has(z.id);
              const barPct = Math.round((z.activeGoals / maxZoneGoals) * 100);
              return (
                <div key={z.id} className="rounded-lg border border-stone-200 bg-white overflow-hidden">
                  <button
                    onClick={() => toggleZone(z.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-stone-800">{z.name}</p>
                        {z.leadName && (
                          <span className="text-[10px] text-stone-400">Lead: {z.leadName}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 max-w-[120px]">
                          <ProgressBar pct={barPct} color="bg-sky-400" />
                        </div>
                        <span className="text-[11px] text-stone-500">{z.activeGoals} active goals</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] text-stone-400">{z.clusters.length} clusters</span>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
                    </div>
                  </button>

                  {isOpen && z.clusters.length > 0 && (
                    <div className="border-t border-stone-100 bg-stone-50 px-4 py-3 space-y-2">
                      {z.clusters.map(c => {
                        const clusterOpen = expandedClusters.has(c.id);
                        return (
                          <div key={c.id} className="rounded-lg border border-stone-200 bg-white overflow-hidden">
                            <button
                              onClick={() => toggleCluster(c.id)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 transition-colors text-left"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="text-sm text-stone-700 font-medium">{c.name}</span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${
                                  c.activeGoals > 0 ? "bg-sky-50 text-sky-600" : "bg-stone-100 text-stone-400"
                                }`}>
                                  {c.activeGoals} goals
                                </span>
                                {c.settlements.length > 0 && (
                                  <span className="text-[10px] text-stone-400">{c.settlements.length} settlements</span>
                                )}
                                {c.settlements.length > 0 && (
                                  clusterOpen ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
                                )}
                              </div>
                            </button>
                            {clusterOpen && c.settlements.length > 0 && (
                              <div className="border-t border-stone-100 bg-stone-50 px-3 py-2">
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                  {c.settlements.map(s => (
                                    <span key={s.id} className="text-xs text-stone-600 px-2 py-1 bg-white rounded border border-stone-200 truncate">
                                      {s.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {filteredZones.length === 0 && <EmptyState message="No zones found." />}
    </div>
  );
}
