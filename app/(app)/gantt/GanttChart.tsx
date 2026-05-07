"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { GoalStatusBadge } from "@/components/StatusBadge";
import { ChevronDown, ChevronRight, AlertCircle, X, CheckSquare, ExternalLink } from "lucide-react";
import GeoFilter, { type GeoFilterValue } from "@/components/GeoFilter";

type User = { id: string; name: string | null; image: string | null };
type ChecklistItem = { id: string; text: string; checked: boolean };
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
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
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

type Zoom = "week" | "month" | "quarter" | "year";

const ZOOM_DAYS: Record<Zoom, number> = { week: 7, month: 30, quarter: 91, year: 365 };
const ZOOM_LABELS: Record<Zoom, string> = { week: "Week", month: "Month", quarter: "Quarter", year: "Year" };
const ROW_H = 36;

export default function GanttChart({ goals: initialGoals }: { goals: Goal[] }) {
  // Keep local mutable copy so checklist toggles update bar colors
  const [goals, setGoals] = useState(initialGoals);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<{ pitstop: Pitstop; goal: Goal } | null>(null);
  const [labelW, setLabelW] = useState(220);
  const [isMobile, setIsMobile] = useState(false);
  const [geoFilter, setGeoFilter] = useState<GeoFilterValue>({ cityId: "", zoneId: "", clusterId: "" });
  const [zoom, setZoom] = useState<Zoom>("month");
  const [timelineW, setTimelineW] = useState(800);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const mobile = window.innerWidth < 640;
      setIsMobile(mobile);
      setLabelW(mobile ? 130 : 220);
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

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const openPanel = (pitstop: Pitstop, goal: Goal) => {
    setPanel((prev) =>
      prev?.pitstop.id === pitstop.id ? null : { pitstop, goal }
    );
  };

  const handlePanelToggle = async (itemId: string, checked: boolean) => {
    if (!panel) return;
    const pitstopId = panel.pitstop.id;

    // Compute new items + auto-status
    const newItems = panel.pitstop.checklistItems.map((i) =>
      i.id === itemId ? { ...i, checked } : i
    );
    const allChecked = newItems.every((i) => i.checked);
    const anyChecked = newItems.some((i) => i.checked);
    const newStatus: string = allChecked ? "Done" : anyChecked ? "InProgress" : "Upcoming";
    const statusChanged = newStatus !== panel.pitstop.status;

    const updatedPitstop = { ...panel.pitstop, checklistItems: newItems, status: newStatus };

    // Update goals state so bar color updates
    setGoals((gs) =>
      gs.map((g) =>
        g.id !== panel.goal.id
          ? g
          : {
              ...g,
              pitstops: g.pitstops.map((p) =>
                p.id === pitstopId ? updatedPitstop : p
              ),
            }
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

  const filteredGoals = goals.filter(g => {
    if (geoFilter.clusterId) return g.needsCluster?.id === geoFilter.clusterId;
    if (geoFilter.zoneId) return g.needsZone?.id === geoFilter.zoneId || g.needsCluster?.zoneId === geoFilter.zoneId;
    if (geoFilter.cityId) return g.needsZone?.cityId === geoFilter.cityId;
    return true;
  });

  const today = startOfDay(new Date());

  // Fixed window based on zoom — always fits on screen, no horizontal scroll
  function zoomWindow(z: Zoom): { rangeStart: Date; rangeEnd: Date } {
    const t = today;
    if (z === "week") {
      const mon = new Date(t);
      mon.setDate(t.getDate() - ((t.getDay() + 6) % 7));
      return { rangeStart: mon, rangeEnd: addDays(mon, 6) };
    }
    if (z === "month") {
      const first = new Date(t.getFullYear(), t.getMonth(), 1);
      const last = new Date(t.getFullYear(), t.getMonth() + 1, 0);
      return { rangeStart: first, rangeEnd: last };
    }
    if (z === "quarter") {
      const q = Math.floor(t.getMonth() / 3);
      const first = new Date(t.getFullYear(), q * 3, 1);
      const last = new Date(t.getFullYear(), q * 3 + 3, 0);
      return { rangeStart: first, rangeEnd: last };
    }
    // year
    return {
      rangeStart: new Date(t.getFullYear(), 0, 1),
      rangeEnd: new Date(t.getFullYear(), 11, 31),
    };
  }

  const { rangeStart, rangeEnd } = zoomWindow(zoom);
  const totalDays = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1;
  const DAY_PX = Math.max(4, timelineW / totalDays);

  function dayOffset(date: Date | string) {
    const d = startOfDay(new Date(date));
    return Math.round((d.getTime() - rangeStart.getTime()) / 86400000);
  }

  const months = eachMonthStart(rangeStart, rangeEnd);
  const weeks = eachWeekStart(rangeStart, rangeEnd);

  type Row =
    | { kind: "goal"; goal: Goal }
    | { kind: "pitstop"; pitstop: Pitstop; goal: Goal };

  const rows: Row[] = [];
  for (const g of filteredGoals) {
    rows.push({ kind: "goal", goal: g });
    if (!collapsed.has(g.id)) {
      for (const p of g.pitstops) {
        rows.push({ kind: "pitstop", pitstop: p, goal: g });
      }
    }
  }

  const totalHeight = rows.length * ROW_H;
  const hasAnyDates = filteredGoals.some(
    (g) => g.targetDate || g.pitstops.some((p) => p.startDate || p.targetDate)
  );

  return (
    <div className="flex flex-col h-full relative">
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-stone-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-stone-900">Gantt Chart</h1>
          <p className="text-sm text-stone-500">Goals and pitstops on a timeline</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg border border-stone-200 overflow-hidden text-xs font-medium">
            {(["week", "month", "quarter", "year"] as Zoom[]).map((z) => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={`px-3 py-1.5 ${zoom === z ? "bg-stone-900 text-white" : "bg-white text-stone-500 hover:bg-stone-50"}`}
              >
                {ZOOM_LABELS[z]}
              </button>
            ))}
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
              {/* Label column */}
              <div className="flex-shrink-0 sticky left-0 z-20 bg-white border-r border-stone-200" style={{ width: labelW }}>
                <div className="border-b border-stone-200" style={{ height: 48 }} />
                {rows.map((row, i) => (
                  <div
                    key={i}
                    style={{ height: ROW_H }}
                    className={`flex items-center px-3 border-b border-stone-100 ${row.kind === "goal" ? "bg-stone-50" : "bg-white"}`}
                  >
                    {row.kind === "goal" ? (
                      <button
                        onClick={() => toggle(row.goal.id)}
                        className="flex items-center gap-1.5 w-full text-left group"
                      >
                        {collapsed.has(row.goal.id) ? (
                          <ChevronRight className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-stone-700 truncate group-hover:text-sky-600">
                          {row.goal.title}
                        </span>
                        <GoalStatusBadge status={row.goal.status as any} />
                      </button>
                    ) : (
                      <button
                        onClick={() => openPanel(row.pitstop, row.goal)}
                        className={`flex items-center gap-2 w-full pl-5 text-left ${panel?.pitstop.id === row.pitstop.id ? "text-sky-600 font-medium" : ""}`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[row.pitstop.status] ?? "bg-stone-300"}`}
                        />
                        <span className="text-xs text-stone-600 truncate hover:text-sky-600">
                          {row.pitstop.title}
                        </span>
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

              {/* Timeline column */}
              <div ref={timelineRef} className="flex-1 relative" style={{ minWidth: 0 }}>
                {/* Headers — content depends on zoom */}
                <div className="sticky top-0 z-10 bg-white border-b border-stone-200" style={{ height: 48 }}>
                  {/* Top row */}
                  <div className="relative border-b border-stone-100" style={{ height: 24 }}>
                    {zoom === "week" && weeks.map((w, i) => (
                      <div key={i} className="absolute top-0 bottom-0 flex items-center px-2 text-[11px] font-semibold text-stone-500 border-r border-stone-100" style={{ left: dayOffset(w) * DAY_PX }}>
                        {w.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                      </div>
                    ))}
                    {(zoom === "month" || zoom === "quarter") && months.map((m, i) => (
                      <div key={i} className="absolute top-0 bottom-0 flex items-center px-2 text-[11px] font-semibold text-stone-500 border-r border-stone-100" style={{ left: dayOffset(m) * DAY_PX }}>
                        {m.toLocaleDateString("en-US", { month: "short", year: zoom === "quarter" ? "numeric" : "2-digit" })}
                      </div>
                    ))}
                    {zoom === "year" && [0, 3, 6, 9].map((mo) => {
                      const d = new Date(today.getFullYear(), mo, 1);
                      return (
                        <div key={mo} className="absolute top-0 bottom-0 flex items-center px-2 text-[11px] font-semibold text-stone-500 border-r border-stone-100" style={{ left: dayOffset(d) * DAY_PX }}>
                          Q{mo / 3 + 1} {today.getFullYear()}
                        </div>
                      );
                    })}
                  </div>
                  {/* Bottom row */}
                  <div className="relative" style={{ height: 24 }}>
                    {zoom === "week" && Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i)).map((d, i) => (
                      <div key={i} className="absolute top-0 bottom-0 flex items-center justify-center text-[10px] text-stone-400 border-r border-stone-100" style={{ left: i * DAY_PX, width: DAY_PX }}>
                        {d.toLocaleDateString("en-US", { weekday: "short" })[0]}{d.getDate()}
                      </div>
                    ))}
                    {(zoom === "month" || zoom === "quarter") && weeks.map((w, i) => (
                      <div key={i} className="absolute top-0 bottom-0 flex items-center px-1 text-[10px] text-stone-400 border-r border-stone-100" style={{ left: dayOffset(w) * DAY_PX }}>
                        {w.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                      </div>
                    ))}
                    {zoom === "year" && months.map((m, i) => (
                      <div key={i} className="absolute top-0 bottom-0 flex items-center px-1 text-[10px] text-stone-400 border-r border-stone-100" style={{ left: dayOffset(m) * DAY_PX }}>
                        {m.toLocaleDateString("en-US", { month: "short" })}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Grid + bars */}
                <div className="relative" style={{ height: totalHeight }}>
                  {(zoom === "week"
                    ? Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i))
                    : weeks
                  ).map((w, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-l border-stone-100"
                      style={{ left: dayOffset(w) * DAY_PX }}
                    />
                  ))}

                  {/* Today line */}
                  <div
                    className="absolute top-0 bottom-0 border-l-2 border-sky-400 z-10"
                    style={{ left: dayOffset(today) * DAY_PX }}
                  >
                    <div className="absolute -top-0 -left-[13px] bg-sky-400 text-white text-[9px] px-1 py-0.5 rounded font-medium">
                      today
                    </div>
                  </div>

                  {rows.map((row, i) => {
                    const top = i * ROW_H;
                    if (row.kind === "goal") {
                      const hasDate = !!row.goal.targetDate;
                      return (
                        <div key={i}>
                          <div
                            className="absolute left-0 right-0 bg-stone-50 border-b border-stone-100"
                            style={{ top, height: ROW_H }}
                          />
                          {hasDate && (
                            <div
                              className="absolute top-0 flex items-center"
                              style={{ top: top + 10, left: dayOffset(row.goal.targetDate!) * DAY_PX - 6, height: ROW_H - 20 }}
                            >
                              <div className="w-3 h-3 rotate-45 bg-stone-600 border-2 border-white shadow" title={`Goal deadline: ${row.goal.targetDate}`} />
                            </div>
                          )}
                        </div>
                      );
                    }

                    const { pitstop } = row;
                    const start = pitstop.startDate || pitstop.targetDate;
                    const end = pitstop.targetDate || pitstop.startDate;

                    if (!start && !end) {
                      return (
                        <div
                          key={i}
                          className="absolute left-0 right-0 border-b border-stone-100"
                          style={{ top, height: ROW_H }}
                        />
                      );
                    }

                    const startX = dayOffset(start!) * DAY_PX;
                    const endX = end ? (dayOffset(end) + 1) * DAY_PX : startX + DAY_PX;
                    const width = Math.max(endX - startX, DAY_PX);
                    const overdue = pitstop.status !== "Done" && pitstop.targetDate && new Date(pitstop.targetDate) < today;
                    const isSelected = panel?.pitstop.id === pitstop.id;

                    return (
                      <div key={i}>
                        <div
                          className="absolute left-0 right-0 border-b border-stone-100"
                          style={{ top, height: ROW_H }}
                        />
                        <button
                          onClick={() => openPanel(pitstop, row.goal)}
                          className={`absolute rounded-md flex items-center px-2 cursor-pointer transition-opacity hover:opacity-80 border ${isSelected ? "ring-2 ring-sky-300 ring-offset-1" : ""} ${
                            overdue ? "bg-red-400 border-red-500" : `${STATUS_COLORS[pitstop.status]} ${STATUS_BORDER[pitstop.status]}`
                          }`}
                          style={{
                            top: top + 6,
                            left: startX,
                            width,
                            height: ROW_H - 12,
                          }}
                        >
                          <span className="text-[11px] font-medium text-white truncate leading-none">
                            {width > 60 ? pitstop.title : ""}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Checklist panel — side on desktop, bottom sheet on mobile */}
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
                            <span className="flex items-center gap-1">
                              <CheckSquare className="w-3.5 h-3.5" />
                              {done}/{total}
                            </span>
                            <span>{Math.round((done / total) * 100)}%</span>
                          </div>
                          <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-400 rounded-full transition-all"
                              style={{ width: `${Math.round((done / total) * 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                    <div className="space-y-2">
                      {panel.pitstop.checklistItems.map((item) => (
                        <label key={item.id} className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={(e) => handlePanelToggle(item.id, e.target.checked)}
                            className="mt-0.5 w-3.5 h-3.5 rounded border-stone-300 text-emerald-500 focus:ring-emerald-400 cursor-pointer flex-shrink-0"
                          />
                          <span className={`text-xs leading-relaxed ${item.checked ? "line-through text-stone-400" : "text-stone-700"}`}>
                            {item.text}
                          </span>
                        </label>
                      ))}
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
          <div className="absolute bottom-16 left-0 right-0 bg-white rounded-t-2xl shadow-xl max-h-[65vh] flex flex-col" onClick={e => e.stopPropagation()}>
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
                    const done = panel.pitstop.checklistItems.filter(i => i.checked).length;
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
                    {panel.pitstop.checklistItems.map(item => (
                      <label key={item.id} className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" checked={item.checked} onChange={e => handlePanelToggle(item.id, e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded border-stone-300 text-emerald-500 focus:ring-emerald-400 cursor-pointer flex-shrink-0" />
                        <span className={`text-sm leading-relaxed ${item.checked ? "line-through text-stone-400" : "text-stone-700"}`}>{item.text}</span>
                      </label>
                    ))}
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
      <div className="border-t border-stone-100 px-4 py-2 flex items-center gap-4 text-xs text-stone-500 bg-white flex-shrink-0">
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
        <p className="ml-auto text-stone-400">Click a bar to view checklist</p>
      </div>
    </div>
  );
}
