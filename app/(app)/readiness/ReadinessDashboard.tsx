"use client";

import { useState } from "react";
import Avatar from "@/components/Avatar";
import GeoFilter, { type GeoFilterValue } from "@/components/GeoFilter";

type ActivityTypes = Record<string, number>;

type UserReadiness = {
  user: { id: string; name: string | null; image: string | null; email: string | null };
  goalCount: number;
  goalsByStatus: { Active: number; Paused: number; Complete: number };
  pitstopTotal: number;
  pitstopsWithDate: number;
  fyPitstops: number;
  pitstopsWithChecklist: number;
  minDate: string | null;
  maxDate: string | null;
  activitiesTotal: number;
  activitiesNextQ: number;
  activityTypes: ActivityTypes;
  lastActive: string | null;
  signal: "green" | "amber" | "red";
  zones: string[];
  clusters: string[];
  needsZoneIds: string[];
  needsClusterIds: string[];
};

interface Props {
  readiness: UserReadiness[];
  fyStart: string;
  fyEnd: string;
  generatedAt: string;
}

const SIGNAL_CONFIG = {
  green: { label: "Ready", dot: "bg-emerald-500", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700" },
  amber: { label: "Partial", dot: "bg-amber-400", bg: "bg-amber-50 border-amber-200", text: "text-amber-700" },
  red:   { label: "Not started", dot: "bg-red-400", bg: "bg-red-50 border-red-200", text: "text-red-700" },
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

function daysAgo(d: string | null) {
  if (!d) return "Never";
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff}d ago`;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-stone-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-stone-400">{value}/{max}</span>
    </div>
  );
}

function SignalBadge({ signal }: { signal: "green" | "amber" | "red" }) {
  const c = SIGNAL_CONFIG[signal];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

export default function ReadinessDashboard({ readiness, generatedAt }: Props) {
  const [geoFilter, setGeoFilter] = useState<GeoFilterValue>({ cityId: "", zoneId: "", clusterId: "" });

  const filteredReadiness = readiness.filter(r => {
    if (geoFilter.clusterId) return r.needsClusterIds.some(id => id === geoFilter.clusterId);
    if (geoFilter.zoneId) return r.needsZoneIds.some(id => id === geoFilter.zoneId);
    // cityId filter not yet resolvable from user readiness data; show all
    return true;
  });

  const green = filteredReadiness.filter(r => r.signal === "green").length;
  const amber = filteredReadiness.filter(r => r.signal === "amber").length;
  const red   = filteredReadiness.filter(r => r.signal === "red").length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-stone-900">Team Readiness</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          FY April 2026 – March 2027 · goals, pitstops & quarterly activity plans
        </p>
        <p className="text-xs text-stone-400 mt-1">Refreshed {fmt(generatedAt)}</p>
      </div>

      {/* Summary bar */}
      <div className="flex gap-4 mb-4 p-4 bg-white rounded-xl border border-stone-200 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-sm font-medium text-stone-700">{green} Ready</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="text-sm font-medium text-stone-700">{amber} Partial</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span className="text-sm font-medium text-stone-700">{red} Not started</span>
        </div>
        <div className="ml-auto text-xs text-stone-400">{filteredReadiness.length} members</div>
      </div>

      {/* Geo filter */}
      <div className="mb-6">
        <GeoFilter value={geoFilter} onChange={setGeoFilter} compact />
      </div>

      {/* Member cards */}
      <div className="space-y-4">
        {filteredReadiness.map((r) => (
          <div key={r.user.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden">

            {/* Card header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <div className="flex items-center gap-3">
                <Avatar name={r.user.name} image={r.user.image} size="sm" />
                <div>
                  <p className="text-sm font-semibold text-stone-900">{r.user.name ?? r.user.email}</p>
                  <p className="text-xs text-stone-400">Last logged: {daysAgo(r.lastActive)}</p>
                  {(r.clusters.length > 0 || r.zones.length > 0) && (
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      {[...r.clusters, ...r.zones.filter(z => !r.clusters.length)].join(" · ")}
                    </p>
                  )}
                </div>
              </div>
              <SignalBadge signal={r.signal} />
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-stone-100">

              {/* Goals */}
              <div className="px-5 py-4">
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Goals</p>
                {r.goalCount === 0 ? (
                  <p className="text-xs text-red-400 font-medium">None added</p>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-stone-900 leading-none mb-1">{r.goalCount}</p>
                    <div className="flex gap-2 flex-wrap mt-1">
                      {r.goalsByStatus.Active > 0 && (
                        <span className="text-xs text-emerald-600 font-medium">{r.goalsByStatus.Active} active</span>
                      )}
                      {r.goalsByStatus.Paused > 0 && (
                        <span className="text-xs text-amber-600 font-medium">{r.goalsByStatus.Paused} paused</span>
                      )}
                      {r.goalsByStatus.Complete > 0 && (
                        <span className="text-xs text-stone-400">{r.goalsByStatus.Complete} done</span>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Pitstops */}
              <div className="px-5 py-4">
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Pitstops</p>
                {r.pitstopTotal === 0 ? (
                  <p className="text-xs text-red-400 font-medium">None added</p>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-stone-500 mb-0.5">Dates set</p>
                      <Bar value={r.pitstopsWithDate} max={r.pitstopTotal} color="bg-sky-400" />
                    </div>
                    <div>
                      <p className="text-xs text-stone-500 mb-0.5">Checklists</p>
                      <Bar value={r.pitstopsWithChecklist} max={r.pitstopTotal} color="bg-violet-400" />
                    </div>
                    {r.minDate && (
                      <p className="text-xs text-stone-400 mt-1">
                        {fmt(r.minDate)} → {fmt(r.maxDate)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* FY Coverage */}
              <div className="px-5 py-4">
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">FY Coverage</p>
                {r.pitstopsWithDate === 0 ? (
                  <p className="text-xs text-red-400 font-medium">No dates set</p>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      {[
                        { label: "Q1 Apr–Jun", start: "2026-04-01", end: "2026-06-30" },
                        { label: "Q2 Jul–Sep", start: "2026-07-01", end: "2026-09-30" },
                        { label: "Q3 Oct–Dec", start: "2026-10-01", end: "2026-12-31" },
                        { label: "Q4 Jan–Mar", start: "2027-01-01", end: "2027-03-31" },
                      ].map((q) => {
                        const inQ = r.minDate && r.maxDate
                          ? new Date(r.maxDate) >= new Date(q.start) && new Date(r.minDate) <= new Date(q.end)
                          : false;
                        return (
                          <div key={q.label} className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${inQ ? "bg-emerald-400" : "bg-stone-200"}`} />
                            <span className={`text-xs ${inQ ? "text-stone-700 font-medium" : "text-stone-300"}`}>{q.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Activities */}
              <div className="px-5 py-4">
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Activities</p>
                {r.activitiesTotal === 0 ? (
                  <p className="text-xs text-red-400 font-medium">None planned</p>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-stone-900 leading-none mb-1">{r.activitiesTotal}</p>
                    <p className="text-xs text-stone-500 mb-2">
                      {r.activitiesNextQ > 0
                        ? <span className="text-emerald-600 font-medium">{r.activitiesNextQ} in next 90 days</span>
                        : <span className="text-amber-500">0 in next 90 days</span>
                      }
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(r.activityTypes)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 4)
                        .map(([type, count]) => (
                          <span key={type} className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded">
                            {type} {count}
                          </span>
                        ))}
                    </div>
                  </>
                )}
              </div>

            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-8 p-4 bg-stone-50 rounded-xl border border-stone-100 text-xs text-stone-500 space-y-1">
        <p className="font-semibold text-stone-600 mb-2">Readiness criteria</p>
        <p><span className="text-emerald-600 font-medium">Ready</span> — has goals + pitstops spread beyond Q1 (FY) + activities planned in next 90 days</p>
        <p><span className="text-amber-600 font-medium">Partial</span> — has goals but missing pitstop dates, FY spread beyond Q1, or activities in next 90 days</p>
        <p><span className="text-red-500 font-medium">Not started</span> — no goals added yet</p>
      </div>
    </div>
  );
}
