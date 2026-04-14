"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoData } from "@/lib/useGeoData";
import type { SettlementFeature } from "./MapView";
import NeedsPanel from "./NeedsPanel";

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

interface SettlementSidebarProps {
  feature: SettlementFeature | null;
  geoData: GeoData | null;
  onClose: () => void;
}

interface ClusterPitstop {
  goalId: string;
  goalTitle: string;
  goalStatus: string;
  pitstops: { id: string; title: string; status: string; targetDate: string | null }[];
}

interface ClusterActivity {
  id: string;
  title: string;
  type: string;
  status: string;
  scheduledAt: string;
  location: string | null;
  pitstops: { pitstop: { id: string; title: string; goal: { id: string; title: string } } }[];
}

const CENTRE_CONFIG = [
  { key: "children" as const, label: "Children Centre", color: "#f97316", emoji: "🧒" },
  { key: "youth" as const,    label: "Youth Centre",    color: "#8b5cf6", emoji: "👥" },
  { key: "creches" as const,  label: "Creche",          color: "#ec4899", emoji: "👶" },
  { key: "resource" as const, label: "Resource Centre", color: "#1d4ed8", emoji: "🏠" },
];

function parseHH(desc: string): string | null {
  const m = desc.match(/(\d+)\s*HH/i);
  return m ? `${m[1]} HH` : null;
}

export default function SettlementSidebar({ feature, geoData, onClose }: SettlementSidebarProps) {
  const [note, setNote] = useState("");
  const [noteDirty, setNoteDirty] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [clusterData, setClusterData] = useState<ClusterPitstop[]>([]);
  const [activities, setActivities] = useState<ClusterActivity[]>([]);
  const [activeTab, setActiveTab] = useState<"programme" | "needs">("programme");
  const prevName = useRef<string | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!feature || feature.name === prevName.current) return;
    prevName.current = feature.name;
    setNote("");
    setNoteDirty(false);
    setClusterData([]);
    setActivities([]);
    setActiveTab("programme");

    fetch(`/api/map/notes?settlement=${encodeURIComponent(feature.name)}`)
      .then((r) => r.json())
      .then((d) => setNote(d.note ?? ""))
      .catch(() => {});

    if (feature.cluster) {
      const enc = encodeURIComponent(feature.cluster);
      fetch(`/api/map/cluster-pitstops?cluster=${enc}`)
        .then((r) => r.json())
        .then((d) => setClusterData(Array.isArray(d) ? d : []))
        .catch(() => {});
      fetch(`/api/map/cluster-activities?cluster=${enc}`)
        .then((r) => r.json())
        .then((d) => setActivities(Array.isArray(d) ? d : []))
        .catch(() => {});
    }
  }, [feature]);

  async function saveNote() {
    if (!feature || !noteDirty) return;
    setNoteSaving(true);
    try {
      await fetch("/api/map/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settlement: feature.name, note }),
      });
      setNoteDirty(false);
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    } finally {
      setNoteSaving(false);
    }
  }

  const colocated = CENTRE_CONFIG.flatMap(({ key, label, color, emoji }) => {
    if (!geoData) return [];
    return geoData.centres[key]
      .filter((f) => {
        const ms = f.properties.matched_settlement ?? "";
        const nm = f.properties.name ?? "";
        return (
          ms === feature?.name ||
          nm === feature?.name ||
          ms.toLowerCase() === feature?.name.toLowerCase()
        );
      })
      .map((f) => ({ label, color, emoji, name: f.properties.name ?? label }));
  });

  const isOpen = !!feature;

  const STATUS_COLORS: Record<string, string> = {
    Active: "#10b981", Upcoming: "#6366f1", InProgress: "#f59e0b",
    Done: "#94a3b8", Completed: "#94a3b8", Blocked: "#ef4444",
  };

  // Mobile: bottom sheet that slides up from just above the bottom control bar
  // Desktop: right-side panel that slides in from the right
  const mobileClass = isOpen
    ? "translate-y-0"
    : "translate-y-full";
  const desktopClass = isOpen
    ? "sm:translate-x-0"
    : "sm:translate-x-full";

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && isOpen && (
        <div
          className="sm:hidden fixed inset-0 z-30 bg-black/40"
          onClick={onClose}
        />
      )}
      <div
        className={[
          "bg-white shadow-2xl z-40 flex flex-col transition-transform duration-300",
          // Mobile: fixed bottom sheet above nav + control bar
          "fixed inset-x-0 bottom-16 rounded-t-2xl border-t border-slate-200 sm:border-t-0",
          "sm:absolute sm:inset-x-auto sm:top-0 sm:right-0 sm:bottom-0 sm:rounded-none sm:border-l sm:border-slate-200",
          "sm:w-80",
          // Mobile height
          "max-h-[72vh] sm:max-h-none",
          mobileClass,
          desktopClass,
        ].join(" ")}
      >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex-shrink-0 flex justify-center pt-2 pb-1">
        <div className="w-10 h-1 rounded-full bg-slate-300" />
      </div>

      {feature && (
        <>
          {/* Header */}
          <div className="flex-shrink-0 p-4 border-b border-slate-100">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div
                  className="inline-block text-xs font-bold px-2 py-0.5 rounded-full text-white mb-2"
                  style={{ background: feature.layerColor }}
                >
                  {feature.layerLabel}
                </div>
                <h2 className="text-sm font-bold text-slate-800 leading-tight">{feature.name}</h2>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {feature.centroid && feature.centroid[0] !== 0 && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${feature.centroid[0]},${feature.centroid[1]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition-colors"
                    title="Get directions in Google Maps"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Directions
                  </a>
                )}
                <button
                  onClick={onClose}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors text-lg leading-none"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap mt-2">
              {feature.zone && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  {feature.zone} Zone
                </span>
              )}
              {feature.cluster && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {feature.cluster.replace(/_/g, " ")}
                </span>
              )}
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex-shrink-0 flex border-b border-slate-100">
            {(["programme", "needs"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-xs font-semibold capitalize transition-colors ${activeTab === tab ? "text-sky-600 border-b-2 border-sky-500" : "text-slate-400 hover:text-slate-600"}`}>
                {tab === "programme" ? "Programme" : "Needs"}
              </button>
            ))}
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {activeTab === "programme" && (
              <>
                {/* Household count */}
                {feature.description && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">Households</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-slate-800">
                        {parseHH(feature.description) ?? "—"}
                      </span>
                      {!parseHH(feature.description) && (
                        <span className="text-sm text-slate-500">{feature.description}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Programme Centres */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                    Programme in this settlement
                  </p>
                  {colocated.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No centres recorded here</p>
                  ) : (
                    <div className="space-y-1.5">
                      {colocated.map((c, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
                          style={{ background: c.color + "15" }}
                        >
                          <span className="text-base">{c.emoji}</span>
                          <div>
                            <div className="text-xs font-bold" style={{ color: c.color }}>{c.label}</div>
                            <div className="text-xs text-slate-500">{c.name}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Active Goals & Pitstops for this cluster */}
                {feature.cluster && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                      Cluster Goals & Pitstops
                    </p>
                    {clusterData.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No active goals for this cluster</p>
                    ) : (
                      <div className="space-y-3">
                        {clusterData.map((goal) => (
                          <div key={goal.goalId} className="rounded-lg border border-slate-100 overflow-hidden">
                            <div className="px-3 py-2 bg-slate-50 flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-700 truncate flex-1">{goal.goalTitle}</span>
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                                style={{
                                  background: (STATUS_COLORS[goal.goalStatus] ?? "#94a3b8") + "20",
                                  color: STATUS_COLORS[goal.goalStatus] ?? "#94a3b8",
                                }}
                              >
                                {goal.goalStatus}
                              </span>
                            </div>
                            {goal.pitstops.length > 0 && (
                              <div className="divide-y divide-slate-50">
                                {goal.pitstops.map((p) => (
                                  <div key={p.id} className="px-3 py-1.5 flex items-center gap-2">
                                    <span
                                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                      style={{ background: STATUS_COLORS[p.status] ?? "#94a3b8" }}
                                    />
                                    <span className="text-xs text-slate-600 flex-1 truncate">{p.title}</span>
                                    {p.targetDate && (
                                      <span className="text-[10px] text-slate-400 flex-shrink-0">
                                        {new Date(p.targetDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Cluster activities */}
                {feature.cluster && activities.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                      Cluster Activities
                    </p>
                    <div className="space-y-1.5">
                      {activities.map((a) => {
                        const isPast = new Date(a.scheduledAt) < new Date();
                        const TYPE_COLOR: Record<string, string> = {
                          Meeting: "#0ea5e9", Visit: "#8b5cf6", Event: "#f59e0b",
                        };
                        const color = TYPE_COLOR[a.type] ?? "#64748b";
                        return (
                          <div key={a.id}
                            className="rounded-lg border border-slate-100 px-3 py-2 flex items-start gap-2"
                            style={{ opacity: isPast && a.status !== "Done" ? 0.65 : 1 }}
                          >
                            <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: color }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-700 truncate">{a.title}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {a.type} · {new Date(a.scheduledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                {a.location ? ` · ${a.location}` : ""}
                              </p>
                            </div>
                            {a.status !== "Scheduled" && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                                style={{ background: color + "20", color }}>
                                {a.status}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">Notes</p>
                  <textarea
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none text-slate-700 placeholder:text-slate-300"
                    rows={4}
                    placeholder="Add programme notes, observations, contacts…"
                    value={note}
                    onChange={(e) => { setNote(e.target.value); setNoteDirty(true); setNoteSaved(false); }}
                    onBlur={saveNote}
                  />
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs text-slate-400">Auto-saves on blur</span>
                    {noteSaving && <span className="text-xs text-slate-400">Saving…</span>}
                    {noteSaved && <span className="text-xs text-emerald-600 font-semibold">Saved ✓</span>}
                    {noteDirty && !noteSaving && (
                      <button
                        onClick={saveNote}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                      >
                        Save now
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {activeTab === "needs" && (
              <NeedsPanel
                mode="settlement"
                name={feature.name}
                cluster={feature.cluster ?? undefined}
              />
            )}
          </div>
        </>
      )}
    </div>
    </>
  );
}
