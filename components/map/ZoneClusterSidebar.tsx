"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BarChart2 } from "lucide-react";
import type { GeoData } from "@/lib/useGeoData";
import NeedsPanel, { type NeedsGoalContext } from "./NeedsPanel";
import TemplatePickerModal from "@/components/TemplatePickerModal";
import type { GoalPrefill } from "@/app/(app)/dashboard/CreateGoalModal";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

interface GoalWithPitstops {
  id: string;
  title: string;
  status: string;
  owner: { id: string; name: string | null; image: string | null } | null;
  pitstops: {
    id: string; title: string; status: string; targetDate: string | null;
    owner: { id: string; name: string | null; image: string | null } | null;
  }[];
}

interface Props {
  type: "zone" | "cluster" | null;
  name: string | null;
  parentZone?: string;
  dbId?: string | null;
  geoData: GeoData | null;
  clusterIndex: Record<string, { zone: string; display?: string; settlements: string[] }>;
  zoneIndex: Record<string, string[]>;
  onClose: () => void;
  currentUserId?: string;
  currentUserDesignation?: string;
}

const STATUS_COLOR: Record<string, string> = {
  Active: "#10b981", Paused: "#f59e0b", Complete: "#94a3b8",
  Upcoming: "#6366f1", InProgress: "#f59e0b", Done: "#94a3b8",
};
const STATUS_DOT: Record<string, string> = {
  Upcoming: "bg-indigo-400", InProgress: "bg-amber-400", Done: "bg-slate-300",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function ZoneClusterSidebar({
  type, name, parentZone, dbId, geoData, clusterIndex, zoneIndex, onClose,
  currentUserId, currentUserDesignation,
}: Props) {
  const [goals, setGoals] = useState<GoalWithPitstops[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"goals" | "needs">("goals");
  const [goalPrefill, setGoalPrefill] = useState<GoalPrefill | null>(null);
  const prevKey = useRef<string | null>(null);
  const isMobile = useIsMobile();

  const isOpen = !!(type && name);

  useEffect(() => {
    const key = type && name ? `${type}:${name}` : null;
    if (!key || key === prevKey.current) return;
    prevKey.current = key;
    setGoals([]);
    setExpandedGoals(new Set());
    setActiveTab("goals");
    setLoading(true);

    const param = type === "cluster"
      ? `cluster=${encodeURIComponent(name!)}`
      : `zone=${encodeURIComponent(name!)}`;

    fetch(`/api/map/geo-goals?${param}`)
      .then(r => r.json())
      .then(d => setGoals(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [type, name]);

  // Settlement count
  const settlementCount = (() => {
    if (!name || !geoData) return 0;
    if (type === "cluster") return clusterIndex[name]?.settlements?.length ?? 0;
    if (type === "zone") return zoneIndex[name]?.length ?? 0;
    return 0;
  })();

  // Centre counts from geoData
  const centreCounts = (() => {
    if (!geoData || !name) return { children: 0, youth: 0, creches: 0 };
    const match = (props: Record<string, unknown>) =>
      type === "cluster"
        ? props.cluster === name
        : props.zone === name;
    return {
      children: geoData.centres.children.filter(f => match(f.properties as Record<string, unknown>)).length,
      youth:    geoData.centres.youth.filter(f => match(f.properties as Record<string, unknown>)).length,
      creches:  geoData.centres.creches.filter(f => match(f.properties as Record<string, unknown>)).length,
    };
  })();

  // Pitstop summary counts across all fetched goals
  const pitstopTotals = goals.reduce(
    (acc, g) => {
      g.pitstops.forEach(p => { acc[p.status] = (acc[p.status] ?? 0) + 1; });
      return acc;
    },
    {} as Record<string, number>
  );

  const toggleGoal = (id: string) => {
    setExpandedGoals(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const mobileClass = isOpen ? "translate-y-0" : "translate-y-full";
  const desktopClass = isOpen ? "sm:translate-x-0" : "sm:translate-x-full";

  // Use display field from index if available (handles en-dashes, &, etc.); else normalise underscores
  const displayName = (name && type === "cluster" ? clusterIndex[name]?.display : undefined)
    ?? name?.replace(/_/g, " ")
    ?? "";
  const typeLabel = type === "zone" ? "Zone" : "Cluster";

  return (
    <>
    <div
      className={[
        "bg-white shadow-2xl z-40 flex flex-col transition-transform duration-300",
        "fixed inset-x-0 bottom-16 rounded-t-2xl border-t border-slate-200 sm:border-t-0",
        "sm:absolute sm:inset-x-auto sm:top-0 sm:right-0 sm:bottom-0 sm:rounded-none sm:border-l sm:border-slate-200",
        "sm:w-80",
        "max-h-[72vh] sm:max-h-none",
        mobileClass, desktopClass,
      ].join(" ")}
    >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex-shrink-0 flex justify-center pt-2 pb-1">
        <div className="w-10 h-1 rounded-full bg-slate-300" />
      </div>

      {isOpen && (
        <>
          {/* Header */}
          <div className="flex-shrink-0 p-4 border-b border-slate-100">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${type === "zone" ? "bg-indigo-500" : "bg-amber-500"}`}>
                    {typeLabel}
                  </span>
                  {type === "cluster" && parentZone && (
                    <span className="text-xs text-slate-400">{parentZone} Zone</span>
                  )}
                </div>
                <h2 className="text-sm font-bold text-slate-800">{displayName}</h2>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {dbId && (
                  <Link
                    href={`/needs?${type === "zone" ? "zoneId" : "clusterId"}=${dbId}`}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-emerald-600 border border-emerald-200 hover:bg-emerald-50 transition-colors"
                    title="View Field Coverage"
                  >
                    <BarChart2 className="w-3 h-3" />
                    Coverage
                  </Link>
                )}
                <button
                  onClick={onClose}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition-colors text-lg"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-4 gap-2 mt-3">
              <div className="text-center">
                <p className="text-lg font-bold text-slate-800">{settlementCount}</p>
                <p className="text-[10px] text-slate-400 leading-tight">Settlements</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-orange-500">{centreCounts.children}</p>
                <p className="text-[10px] text-slate-400 leading-tight">Children</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-purple-500">{centreCounts.youth}</p>
                <p className="text-[10px] text-slate-400 leading-tight">Youth</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-pink-500">{centreCounts.creches}</p>
                <p className="text-[10px] text-slate-400 leading-tight">Creches</p>
              </div>
            </div>

            {/* Pitstop status strip */}
            {(pitstopTotals.Upcoming || pitstopTotals.InProgress || pitstopTotals.Done) ? (
              <div className="flex items-center gap-3 mt-3 px-1">
                {[
                  { key: "Upcoming", label: "Upcoming", color: "text-indigo-500" },
                  { key: "InProgress", label: "Active", color: "text-amber-500" },
                  { key: "Done", label: "Done", color: "text-slate-400" },
                ].map(({ key, label, color }) => (
                  <div key={key} className="flex items-center gap-1">
                    <span className={`text-sm font-bold ${color}`}>{pitstopTotals[key] ?? 0}</span>
                    <span className="text-[10px] text-slate-400">{label}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Tab bar */}
          <div className="flex-shrink-0 flex border-b border-slate-100">
            {(["goals", "needs"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-xs font-semibold capitalize transition-colors ${activeTab === tab ? "text-sky-600 border-b-2 border-sky-500" : "text-slate-400 hover:text-slate-600"}`}>
                {tab === "goals" ? "Goals" : "Needs"}
              </button>
            ))}
          </div>

          {/* Goals tab */}
          {activeTab === "goals" && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex gap-1">
                    {[0, 150, 300].map(d => (
                      <span key={d} className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              ) : goals.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-xs text-slate-400">No goals tagged to this {typeLabel.toLowerCase()}.</p>
                  <p className="text-[10px] text-slate-300 mt-1">Tag goals via Geography on the goal page.</p>
                </div>
              ) : (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1">
                    Goals ({goals.length})
                  </p>
                  {goals.map(goal => {
                    const done = goal.pitstops.filter(p => p.status === "Done").length;
                    const total = goal.pitstops.length;
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                    const expanded = expandedGoals.has(goal.id);
                    const activePitstops = goal.pitstops.filter(p => p.status !== "Done");

                    return (
                      <div key={goal.id} className="rounded-xl border border-slate-100 overflow-hidden">
                        {/* Goal header row */}
                        <div
                          className="px-3 py-2.5 flex items-center gap-2 cursor-pointer hover:bg-slate-50 transition-colors"
                          onClick={() => toggleGoal(goal.id)}
                        >
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: STATUS_COLOR[goal.status] ?? "#94a3b8" }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{goal.title}</p>
                            {total > 0 && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <div className="flex-1 h-0.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-sky-400 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-[10px] text-slate-400 flex-shrink-0">{done}/{total}</span>
                              </div>
                            )}
                          </div>
                          <Link
                            href={`/goals/${goal.id}`}
                            onClick={e => e.stopPropagation()}
                            className="flex-shrink-0 text-[10px] text-sky-500 hover:text-sky-700 px-1.5 py-0.5 rounded border border-sky-200 hover:border-sky-300 transition-colors"
                          >
                            Open
                          </Link>
                        </div>

                        {/* Expanded pitstops */}
                        {expanded && activePitstops.length > 0 && (
                          <div className="border-t border-slate-50 divide-y divide-slate-50">
                            {activePitstops.slice(0, 8).map(p => (
                              <Link
                                key={p.id}
                                href={`/goals/${goal.id}/pitstops/${p.id}`}
                                className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 transition-colors"
                              >
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[p.status] ?? "bg-slate-300"}`} />
                                <span className="flex-1 text-xs text-slate-600 truncate">{p.title}</span>
                                {p.targetDate && (
                                  <span className={`text-[10px] flex-shrink-0 ${new Date(p.targetDate) < new Date() ? "text-red-400 font-semibold" : "text-slate-400"}`}>
                                    {fmtDate(p.targetDate)}
                                  </span>
                                )}
                              </Link>
                            ))}
                            {activePitstops.length > 8 && (
                              <p className="px-3 py-1.5 text-[10px] text-slate-400">+{activePitstops.length - 8} more</p>
                            )}
                          </div>
                        )}
                        {expanded && activePitstops.length === 0 && (
                          <p className="px-3 py-2 text-[10px] text-slate-400 border-t border-slate-50">All pitstops done.</p>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* Needs tab */}
          {activeTab === "needs" && name && type && (
            <div className="flex-1 overflow-y-auto p-3">
              <NeedsPanel
                mode={type}
                name={displayName}
                zone={type === "cluster" ? parentZone : undefined}
                onCreateGoal={(ctx: NeedsGoalContext) => setGoalPrefill(ctx)}
              />
            </div>
          )}
        </>
      )}
    </div>

    {goalPrefill && (
      <TemplatePickerModal
        needsDomain={goalPrefill.needsDomain}
        needsZoneId={goalPrefill.needsZoneId}
        needsClusterId={goalPrefill.needsClusterId}
        needsSettlementId={goalPrefill.needsSettlementId}
        geographyLabel={goalPrefill.geoLabel}
        onClose={() => setGoalPrefill(null)}
        onCreated={() => setGoalPrefill(null)}
        currentUserId={currentUserId}
        currentUserDesignation={currentUserDesignation}
      />
    )}
    </>
  );
}
