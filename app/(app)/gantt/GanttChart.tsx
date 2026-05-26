"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { GoalStatusBadge } from "@/components/StatusBadge";
import { ChevronDown, ChevronRight, AlertCircle, X, CheckSquare, ExternalLink, ChevronLeft } from "lucide-react";
import GeoFilter, { type GeoFilterValue } from "@/components/GeoFilter";
import { confirmManualChecklistTick } from "@/lib/checklistGate";

type User = { id: string; name: string | null; image: string | null };
type ChecklistItem = { id: string; text: string; checked: boolean; completionType?: string | null };
type Pitstop = {
  id: string;
  title: string;
  type: string;
  status: string;
  order: number;
  startDate: string | null;
  targetDate: string | null;
  completedAt: string | null;
  ownerId: string | null;
  owner: User | null;
  checklistItems: ChecklistItem[];
};
type Goal = {
  id: string;
  title: string;
  status: string;
  targetDate: string | null;
  owner: User;
  pitstops: Pitstop[];
  needsZone: { id: string; name: string; cityId: string | null } | null;
  needsCluster: { id: string; name: string; zoneId: string } | null;
};

const STATUS_COLORS: Record<string, string> = {
  Done: "bg-emerald-400",
  InProgress: "bg-sky-400",
  Upcoming: "bg-stone-300",
};
const STATUS_BORDER: Record<string, string> = {
  Done: "border-emerald-500",
  InProgress: "border-sky-500",
  Upcoming: "border-stone-300",
};

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function eachWeekStart(start: Date, end: Date): Date[] {
  const weeks: Date[] = [];
  const d = new Date(start);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  while (d <= end) {
    weeks.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}
function eachMonthStart(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  const d = new Date(start.getFullYear(), start.getMonth(), 1);
  while (d <= end) {
    months.push(new Date(d));
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

// Duration-based zoom: how many days the window spans
type Zoom = "2m" | "3m" | "6m" | "1y";
const ZOOM_DAYS: Record<Zoom, number> = { "2m": 60, "3m": 90, "6m": 180, "1y": 365 };
const ZOOM_LABELS: Record<Zoom, string> = { "2m": "2 Mo", "3m": "3 Mo", "6m": "6 Mo", "1y": "1 Yr" };
const MOBILE_ZOOMS: Zoom[] = ["2m", "3m"];
const DESKTOP_ZOOMS: Zoom[] = ["2m", "3m", "6m", "1y"];

const ROW_H = 36;

export default function GanttChart({ goals: initialGoals, checklistUpdatablePitstopIds = [] }: { goals: Goal[]; checklistUpdatablePitstopIds?: string[] }) {
  const [goals, setGoals] = useState(initialGoals);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<{ pitstop: Pitstop; goal: Goal } | null>(null);
  // Pitstops whose checklist this user may tick (scope = own/team/all).
  const canUpdateChecklistFor = (pitstopId: string) => checklistUpdatablePitstopIds.includes(pitstopId);
  const [labelW, setLabelW] = useState(220);
  const [isMobile, setIsMobile] = useState(false);
  const [geoFilter, setGeoFilter] = useState<GeoFilterValue>({ cityId: "", zoneId: "", clusterId: "" });
  const [zoom, setZoom] = useState<Zoom>("3m");
  const [windowStart, setWindowStart] = useState<Date>(() => addDays(startOfDay(new Date()), -30));
  const [timelineW, setTimelineW] = useState(800);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const mobile = window.innerWidth < 640;
      setIsMobile(mobile);
      setLabelW(mobile ? 120 : 220);
      if (mobile) setZoom((z) => (z === "6m" || z === "1y" ? "3m" : z));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!timelineRef.current) return;
    const ro = new ResizeObserver(([entry]) => setTimelineW(entry.contentRect.width));
    ro.observe(timelineRef.current);
    return () => ro.disconnect();
  }, []);

  const today = startOfDay(new Date());
  const windowDays = ZOOM_DAYS[zoom];
  const windowEnd = addDays(windowStart, windowDays - 1);
  const DAY_PX = timelineW / windowDays;

  function centerOnToday() {
    setWindowStart(addDays(today, -Math.floor(windowDays / 3)));
  }

  function pan(direction: 1 | -1) {
    const step = Math.floor(windowDays / 3);
    setWindowStart((s) => addDays(s, direction * step));
  }

  function handleZoom(z: Zoom) {
    // Keep today visible after zoom change
    setZoom(z);
    setWindowStart(addDays(today, -Math.floor(ZOOM_DAYS[z] / 3)));
  }

  function dayOffset(date: Date | string) {
    const d = startOfDay(typeof date === "string" ? new Date(date) : date);
    return Math.round((d.getTime() - windowStart.getTime()) / 86400000);
  }

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const openPanel = (pitstop: Pitstop, goal: Goal) =>
    setPanel((prev) => (prev?.pitstop.id === pitstop.id ? null : { pitstop, goal }));

  const handlePanelToggle = async (itemId: string, checked: boolean) => {
    if (!panel) return;
    if (!canUpdateChecklistFor(panel.pitstop.id)) return;
    const targetItem = panel.pitstop.checklistItems.find((i) => i.id === itemId);
    if (!confirmManualChecklistTick(targetItem?.completionType, checked)) return;
    const pitstopId = panel.pitstop.id;
    const newItems = panel.pitstop.checklistItems.map((i) =>
      i.id === itemId ? { ...i, checked } : i
    );
    const allChecked = newItems.every((i) => i.checked);
    const anyChecked = newItems.some((i) => i.checked);
    const newStatus = allChecked ? "Done" : anyChecked ? "InProgress" : "Upcoming";
    const statusChanged = newStatus !== panel.pitstop.status;
    const updatedPitstop = { ...panel.pitstop, checklistItems: newItems, status: newStatus };
    setGoals((gs) =>
      gs.map((g) =>
        g.id !== panel.goal.id
          ? g
          : { ...g, pitstops: g.pitstops.map((p) => (p.id === pitstopId ? updatedPitstop : p)) }
      )
    );
    setPanel({ pitstop: updatedPitstop, goal: panel.goal });
    const calls: Promise<Response>[] = [
      fetch(`/api/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked }),
      }),
    ];
    if (statusChanged) {
      calls.push(
        fetch(`/api/pitstops/${pitstopId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        })
      );
    }
    await Promise.all(calls);
  };

  const filteredGoals = goals.filter((g) => {
    if (geoFilter.clusterId) return g.needsCluster?.id === geoFilter.clusterId;
    if (geoFilter.zoneId) return g.needsZone?.id === geoFilter.zoneId || g.needsCluster?.zoneId === geoFilter.zoneId;
    if (geoFilter.cityId) return g.needsZone?.cityId === geoFilter.cityId;
    return true;
  });

  const months = eachMonthStart(windowStart, windowEnd);
  const weeks = eachWeekStart(windowStart, windowEnd);

  type Row = { kind: "goal"; goal: Goal } | { kind: "pitstop"; pitstop: Pitstop; goal: Goal };
  const rows: Row[] = [];
  for (const g of filteredGoals) {
    rows.push({ kind: "goal", goal: g });
    if (!collapsed.has(g.id)) {
      for (const p of g.pitstops) rows.push({ kind: "pitstop", pitstop: p, goal: g });
    }
  }
  const totalHeight = rows.length * ROW_H;
  const hasAnyDates = filteredGoals.some(
    (g) => g.targetDate || g.pitstops.some((p) => p.startDate || p.targetDate)
  );
  const todayOffset = dayOffset(today);
  const todayVisible = todayOffset >= 0 && todayOffset <= windowDays;

  // Header label for current window
  const windowLabel = (() => {
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    return `${fmt(windowStart)} – ${fmt(windowEnd)}`;
  })();

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-stone-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-stone-900">Gantt Chart</h1>
          <p className="text-xs text-stone-400 mt-0.5">{windowLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Zoom */}
          <div className="flex rounded-lg border border-stone-200 overflow-hidden text-xs font-medium">
            {(isMobile ? MOBILE_ZOOMS : DESKTOP_ZOOMS).map((z) => (
              <button
                key={z}
                onClick={() => handleZoom(z)}
                className={`px-2.5 py-1.5 ${zoom === z ? "bg-stone-900 text-white" : "bg-white text-stone-500 hover:bg-stone-50"}`}
              >
                {ZOOM_LABELS[z]}
              </button>
            ))}
          </div>
          {/* Pan controls */}
          <div className="flex items-center rounded-lg border border-stone-200 overflow-hidden text-xs">
            <button onClick={() => pan(-1)} className="px-2.5 py-1.5 bg-white text-stone-500 hover:bg-stone-50 border-r border-stone-200">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={centerOnToday}
              className={`px-3 py-1.5 font-medium ${todayVisible ? "bg-white text-stone-500 hover:bg-stone-50" : "bg-sky-50 text-sky-600 hover:bg-sky-100"}`}
            >
              Today
            </button>
            <button onClick={() => pan(1)} className="px-2.5 py-1.5 bg-white text-stone-500 hover:bg-stone-50 border-l border-stone-200">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <GeoFilter value={geoFilter} onChange={setGeoFilter} compact />
          {!hasAnyDates && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5" />
              Add dates to pitstops to see them on the timeline
            </div>
          )}
        </div>
      </div>

      {filteredGoals.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-stone-400 text-sm">
          {goals.length === 0 ? "No goals yet." : "No goals match the current geo filter."}
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex">
          {/* Main chart area */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col">
            <div className="flex" style={{ width: "100%" }}>
              {/* Label column — sticky left */}
              <div className="flex-shrink-0 sticky left-0 z-20 bg-white border-r border-stone-200" style={{ width: labelW }}>
                <div className="border-b border-stone-200" style={{ height: 48 }} />
                {rows.map((row, i) => (
                  <div
                    key={i}
                    style={{ height: ROW_H }}
                    className={`flex items-center px-3 border-b border-stone-100 ${row.kind === "goal" ? "bg-stone-50" : "bg-white"}`}
                  >
                    {row.kind === "goal" ? (
                      <button onClick={() => toggle(row.goal.id)} className="flex items-center gap-1.5 w-full text-left group">
                        {collapsed.has(row.goal.id)
                          ? <ChevronRight className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                          : <ChevronDown className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />}
                        <span className="text-xs font-semibold text-stone-700 truncate group-hover:text-sky-600">{row.goal.title}</span>
                        <GoalStatusBadge status={row.goal.status as any} />
                      </button>
                    ) : (
                      <button
                        onClick={() => openPanel(row.pitstop, row.goal)}
                        className={`flex items-center gap-2 w-full pl-5 text-left ${panel?.pitstop.id === row.pitstop.id ? "text-sky-600 font-medium" : ""}`}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[row.pitstop.status] ?? "bg-stone-300"}`} />
                        <span className="text-xs text-stone-600 truncate hover:text-sky-600">{row.pitstop.title}</span>
                        {row.pitstop.checklistItems.length > 0 && (
                          <span className="flex-shrink-0 text-[10px] text-stone-400">
                            {row.pitstop.checklistItems.filter((i) => i.checked).length}/{row.pitstop.checklistItems.length}
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Timeline */}
              <div ref={timelineRef} className="flex-1 relative" style={{ minWidth: 0 }}>
                {/* Header rows */}
                <div className="sticky top-0 z-10 bg-white border-b border-stone-200" style={{ height: 48 }}>
                  {/* Month row */}
                  <div className="relative border-b border-stone-100" style={{ height: 24 }}>
                    {months.map((m, i) => (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 flex items-center px-2 text-[11px] font-semibold text-stone-600 border-r border-stone-100"
                        style={{ left: Math.max(0, dayOffset(m)) * DAY_PX }}
                      >
                        {m.toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
                      </div>
                    ))}
                  </div>
                  {/* Week row */}
                  <div className="relative" style={{ height: 24 }}>
                    {weeks.map((w, i) => {
                      const left = dayOffset(w) * DAY_PX;
                      if (left < 0 || left > timelineW) return null;
                      return (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 flex items-center px-1 text-[10px] text-stone-400 border-r border-stone-100"
                          style={{ left }}
                        >
                          {w.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Grid + bars */}
                <div className="relative" style={{ height: totalHeight }}>
                  {/* Week grid lines */}
                  {weeks.map((w, i) => {
                    const left = dayOffset(w) * DAY_PX;
                    if (left < 0 || left > timelineW) return null;
                    return <div key={i} className="absolute top-0 bottom-0 border-l border-stone-100" style={{ left }} />;
                  })}

                  {/* Today line */}
                  {todayVisible && (
                    <div className="absolute top-0 bottom-0 border-l-2 border-sky-400 z-10" style={{ left: todayOffset * DAY_PX }}>
                      <div className="absolute -top-0 -left-[13px] bg-sky-400 text-white text-[9px] px-1 py-0.5 rounded font-medium">
                        today
                      </div>
                    </div>
                  )}

                  {rows.map((row, i) => {
                    const top = i * ROW_H;
                    if (row.kind === "goal") {
                      const hasDate = !!row.goal.targetDate;
                      const deadlineOffset = hasDate ? dayOffset(row.goal.targetDate!) : null;
                      const deadlineVisible = deadlineOffset !== null && deadlineOffset >= 0 && deadlineOffset <= windowDays;
                      return (
                        <div key={i}>
                          <div className="absolute left-0 right-0 bg-stone-50 border-b border-stone-100" style={{ top, height: ROW_H }} />
                          {deadlineVisible && (
                            <div
                              className="absolute flex items-center"
                              style={{ top: top + 10, left: deadlineOffset! * DAY_PX - 6, height: ROW_H - 20 }}
                            >
                              <div className="w-3 h-3 rotate-45 bg-stone-600 border-2 border-white shadow" title={`Deadline: ${row.goal.targetDate}`} />
                            </div>
                          )}
                        </div>
                      );
                    }

                    const { pitstop } = row;
                    const start = pitstop.startDate || pitstop.targetDate;
                    const end = pitstop.targetDate || pitstop.startDate;

                    if (!start && !end) {
                      return <div key={i} className="absolute left-0 right-0 border-b border-stone-100" style={{ top, height: ROW_H }} />;
                    }

                    const rawStartX = dayOffset(start!) * DAY_PX;
                    const rawEndX = end ? (dayOffset(end) + 1) * DAY_PX : rawStartX + DAY_PX;

                    // Clip bars to visible area
                    const startX = Math.max(0, rawStartX);
                    const endX = Math.min(timelineW, rawEndX);

                    // Entirely outside view
                    if (rawEndX < 0 || rawStartX > timelineW) {
                      return <div key={i} className="absolute left-0 right-0 border-b border-stone-100" style={{ top, height: ROW_H }} />;
                    }

                    const width = Math.max(endX - startX, 4);
                    const overdue = pitstop.status !== "Done" && pitstop.targetDate && new Date(pitstop.targetDate) < today;
                    const isSelected = panel?.pitstop.id === pitstop.id;
                    const clippedLeft = rawStartX < 0;
                    const clippedRight = rawEndX > timelineW;

                    return (
                      <div key={i}>
                        <div className="absolute left-0 right-0 border-b border-stone-100" style={{ top, height: ROW_H }} />
                        <button
                          onClick={() => openPanel(pitstop, row.goal)}
                          className={`absolute flex items-center px-2 cursor-pointer transition-opacity hover:opacity-80 border ${
                            isSelected ? "ring-2 ring-sky-300 ring-offset-1" : ""
                          } ${overdue ? "bg-red-400 border-red-500" : `${STATUS_COLORS[pitstop.status]} ${STATUS_BORDER[pitstop.status]}`} ${
                            clippedLeft ? "rounded-r-md" : clippedRight ? "rounded-l-md" : "rounded-md"
                          }`}
                          style={{ top: top + 6, left: startX, width, height: ROW_H - 12 }}
                        >
                          <span className="text-[11px] font-medium text-white truncate leading-none">
                            {width > 50 ? pitstop.title : ""}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Checklist panel — desktop side panel */}
          {panel && !isMobile && (
            <div className="w-72 flex-shrink-0 border-l border-stone-200 bg-white flex flex-col overflow-hidden">
              <div className="flex items-start justify-between px-4 py-3 border-b border-stone-100">
                <div className="min-w-0 pr-2">
                  <p className="text-[10px] text-stone-400 uppercase tracking-wide mb-0.5">{panel.goal.title}</p>
                  <h3 className="text-sm font-semibold text-stone-900 leading-snug">{panel.pitstop.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      panel.pitstop.status === "Done" ? "bg-emerald-100 text-emerald-700" :
                      panel.pitstop.status === "InProgress" ? "bg-sky-100 text-sky-700" :
                      "bg-stone-100 text-stone-500"
                    }`}>
                      {panel.pitstop.status === "InProgress" ? "In Progress" : panel.pitstop.status}
                    </span>
                    {panel.pitstop.targetDate && (
                      <span className="text-[10px] text-stone-400">
                        Due {new Date(panel.pitstop.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => setPanel(null)} className="flex-shrink-0 p-1 text-stone-400 hover:text-stone-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {panel.pitstop.checklistItems.length === 0 ? (
                  <p className="text-xs text-stone-400">No checklist items.</p>
                ) : (
                  <>
                    {(() => {
                      const done = panel.pitstop.checklistItems.filter((i) => i.checked).length;
                      const total = panel.pitstop.checklistItems.length;
                      return (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                            <span className="flex items-center gap-1"><CheckSquare className="w-3.5 h-3.5" />{done}/{total}</span>
                            <span>{Math.round((done / total) * 100)}%</span>
                          </div>
                          <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${Math.round((done / total) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })()}
                    <div className="space-y-2">
                      {(() => {
                        const panelCanUpdate = canUpdateChecklistFor(panel.pitstop.id);
                        return panel.pitstop.checklistItems.map((item) => (
                          <label key={item.id} className={`flex items-start gap-2 ${panelCanUpdate ? "cursor-pointer" : "cursor-not-allowed"}`}>
                            <input
                              type="checkbox"
                              checked={item.checked}
                              disabled={!panelCanUpdate}
                              onChange={(e) => handlePanelToggle(item.id, e.target.checked)}
                              className={`mt-0.5 w-3.5 h-3.5 rounded border-stone-300 text-emerald-500 focus:ring-emerald-400 flex-shrink-0 ${panelCanUpdate ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                            />
                            <span className={`text-xs leading-relaxed ${item.checked ? "line-through text-stone-400" : "text-stone-700"}`}>
                              {item.text}
                            </span>
                          </label>
                        ));
                      })()}
                    </div>
                  </>
                )}
              </div>
              <div className="px-4 py-3 border-t border-stone-100">
                <Link
                  href={`/goals/${panel.goal.id}/pitstops/${panel.pitstop.id}`}
                  className="flex items-center justify-center gap-1.5 w-full py-2 text-xs font-medium text-sky-600 hover:text-sky-700 hover:bg-sky-50 rounded-lg transition-colors border border-sky-200 hover:border-sky-300"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open full pitstop
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mobile checklist bottom sheet */}
      {panel && isMobile && (
        <div className="fixed inset-0 z-50" onClick={() => setPanel(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute bottom-16 left-0 right-0 bg-white rounded-t-2xl shadow-xl max-h-[65vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-stone-100">
              <div className="min-w-0 pr-2">
                <p className="text-[10px] text-stone-400 uppercase tracking-wide mb-0.5">{panel.goal.title}</p>
                <h3 className="text-sm font-semibold text-stone-900 leading-snug">{panel.pitstop.title}</h3>
                <span className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  panel.pitstop.status === "Done" ? "bg-emerald-100 text-emerald-700" :
                  panel.pitstop.status === "InProgress" ? "bg-sky-100 text-sky-700" :
                  "bg-stone-100 text-stone-500"
                }`}>
                  {panel.pitstop.status === "InProgress" ? "In Progress" : panel.pitstop.status}
                </span>
              </div>
              <button onClick={() => setPanel(null)} className="flex-shrink-0 p-1 text-stone-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {panel.pitstop.checklistItems.length === 0 ? (
                <p className="text-xs text-stone-400">No checklist items.</p>
              ) : (
                <>
                  {(() => {
                    const done = panel.pitstop.checklistItems.filter((i) => i.checked).length;
                    const total = panel.pitstop.checklistItems.length;
                    return (
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                          <span className="flex items-center gap-1"><CheckSquare className="w-3.5 h-3.5" />{done}/{total}</span>
                          <span>{Math.round((done / total) * 100)}%</span>
                        </div>
                        <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${Math.round((done / total) * 100)}%` }} />
                        </div>
                      </div>
                    );
                  })()}
                  <div className="space-y-3">
                    {(() => {
                      const panelCanUpdate = canUpdateChecklistFor(panel.pitstop.id);
                      return panel.pitstop.checklistItems.map((item) => (
                        <label key={item.id} className={`flex items-start gap-3 ${panelCanUpdate ? "cursor-pointer" : "cursor-not-allowed"}`}>
                          <input type="checkbox" checked={item.checked} disabled={!panelCanUpdate} onChange={(e) => handlePanelToggle(item.id, e.target.checked)}
                            className={`mt-0.5 w-4 h-4 rounded border-stone-300 text-emerald-500 focus:ring-emerald-400 flex-shrink-0 ${panelCanUpdate ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`} />
                          <span className={`text-sm leading-relaxed ${item.checked ? "line-through text-stone-400" : "text-stone-700"}`}>{item.text}</span>
                        </label>
                      ));
                    })()}
                  </div>
                </>
              )}
            </div>
            <div className="px-4 py-3 border-t border-stone-100">
              <Link href={`/goals/${panel.goal.id}/pitstops/${panel.pitstop.id}`}
                className="flex items-center justify-center gap-1.5 w-full py-2.5 text-sm font-medium text-sky-600 hover:bg-sky-50 rounded-xl border border-sky-200">
                <ExternalLink className="w-4 h-4" /> Open full pitstop
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="border-t border-stone-100 px-4 py-2 flex items-center gap-4 text-xs text-stone-500 bg-white flex-shrink-0 flex-wrap">
        {[
          { color: "bg-sky-400", label: "In Progress" },
          { color: "bg-emerald-400", label: "Done" },
          { color: "bg-stone-300", label: "Upcoming" },
          { color: "bg-red-400", label: "Overdue" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded ${color}`} />
            {label}
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rotate-45 bg-stone-600" />
          Goal deadline
        </div>
        <p className="ml-auto text-stone-400 hidden sm:block">Click a bar to view checklist</p>
      </div>
    </div>
  );
}
