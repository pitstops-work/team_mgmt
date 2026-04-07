"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { GoalStatusBadge } from "@/components/StatusBadge";
import { ChevronDown, ChevronRight, AlertCircle } from "lucide-react";

type User = { id: string; name: string | null; image: string | null };
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
};
type Goal = {
  id: string;
  title: string;
  status: string;
  targetDate: string | null;
  owner: User;
  pitstops: Pitstop[];
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
  // rewind to Monday
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

const DAY_PX = 28;
const ROW_H = 36;
const LABEL_W = 220;

export default function GanttChart({ goals }: { goals: Goal[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<{ pitstop: Pitstop; goal: Goal; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Determine date range across all goals + pitstops
  const allDates: Date[] = [];
  for (const g of goals) {
    if (g.targetDate) allDates.push(new Date(g.targetDate));
    for (const p of g.pitstops) {
      if (p.startDate) allDates.push(new Date(p.startDate));
      if (p.targetDate) allDates.push(new Date(p.targetDate));
    }
  }

  const today = startOfDay(new Date());
  allDates.push(today);

  const minDate = startOfDay(allDates.length ? new Date(Math.min(...allDates.map((d) => d.getTime()))) : today);
  const maxDate = startOfDay(allDates.length ? new Date(Math.max(...allDates.map((d) => d.getTime()))) : addDays(today, 60));

  // Pad a bit
  const rangeStart = addDays(minDate, -7);
  const rangeEnd = addDays(maxDate, 14);
  const totalDays = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1;
  const totalWidth = totalDays * DAY_PX;

  function dayOffset(date: Date | string) {
    const d = startOfDay(new Date(date));
    return Math.round((d.getTime() - rangeStart.getTime()) / 86400000);
  }

  function todayOffset() {
    return dayOffset(today);
  }

  const months = eachMonthStart(rangeStart, rangeEnd);
  const weeks = eachWeekStart(rangeStart, rangeEnd);

  // Build rows
  type Row =
    | { kind: "goal"; goal: Goal }
    | { kind: "pitstop"; pitstop: Pitstop; goal: Goal };

  const rows: Row[] = [];
  for (const g of goals) {
    rows.push({ kind: "goal", goal: g });
    if (!collapsed.has(g.id)) {
      for (const p of g.pitstops) {
        rows.push({ kind: "pitstop", pitstop: p, goal: g });
      }
    }
  }

  const totalHeight = rows.length * ROW_H;

  const hasAnyDates = goals.some(
    (g) => g.targetDate || g.pitstops.some((p) => p.startDate || p.targetDate)
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-stone-100 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-stone-900">Gantt Chart</h1>
          <p className="text-sm text-stone-500">Goals and pitstops on a timeline</p>
        </div>
        {!hasAnyDates && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5" />
            Add dates to pitstops to see them on the timeline
          </div>
        )}
      </div>

      {goals.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-stone-400 text-sm">
          No goals yet.
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col">
          <div ref={containerRef} className="flex-1 overflow-auto">
            <div className="flex" style={{ minWidth: LABEL_W + totalWidth }}>
              {/* Label column */}
              <div className="flex-shrink-0 sticky left-0 z-20 bg-white border-r border-stone-200" style={{ width: LABEL_W }}>
                {/* Header spacer */}
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
                      <Link
                        href={`/goals/${row.goal.id}/pitstops/${row.pitstop.id}`}
                        className="flex items-center gap-2 w-full pl-5"
                      >
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[row.pitstop.status] ?? "bg-stone-300"}`}
                        />
                        <span className="text-xs text-stone-600 truncate hover:text-sky-600">
                          {row.pitstop.title}
                        </span>
                      </Link>
                    )}
                  </div>
                ))}
              </div>

              {/* Timeline column */}
              <div className="flex-1 overflow-x-visible relative" style={{ width: totalWidth }}>
                {/* Month headers */}
                <div className="sticky top-0 z-10 bg-white border-b border-stone-200" style={{ height: 48 }}>
                  <div className="relative" style={{ height: 24 }}>
                    {months.map((m, i) => {
                      const left = dayOffset(m) * DAY_PX;
                      return (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 flex items-center px-2 text-[11px] font-semibold text-stone-500 border-r border-stone-100"
                          style={{ left }}
                        >
                          {m.toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
                        </div>
                      );
                    })}
                  </div>
                  {/* Week ticks */}
                  <div className="relative" style={{ height: 24 }}>
                    {weeks.map((w, i) => {
                      const left = dayOffset(w) * DAY_PX;
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
                  {/* Vertical week lines */}
                  {weeks.map((w, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-l border-stone-100"
                      style={{ left: dayOffset(w) * DAY_PX }}
                    />
                  ))}

                  {/* Today line */}
                  <div
                    className="absolute top-0 bottom-0 border-l-2 border-sky-400 z-10"
                    style={{ left: todayOffset() * DAY_PX }}
                  >
                    <div className="absolute -top-0 -left-[13px] bg-sky-400 text-white text-[9px] px-1 py-0.5 rounded font-medium">
                      today
                    </div>
                  </div>

                  {/* Row backgrounds + bars */}
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

                    // Pitstop bar
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

                    return (
                      <div key={i}>
                        <div
                          className="absolute left-0 right-0 border-b border-stone-100"
                          style={{ top, height: ROW_H }}
                        />
                        <Link href={`/goals/${row.goal.id}/pitstops/${pitstop.id}`}>
                          <div
                            className={`absolute rounded-md flex items-center px-2 cursor-pointer transition-opacity hover:opacity-80 border ${
                              overdue ? "bg-red-400 border-red-500" : `${STATUS_COLORS[pitstop.status]} ${STATUS_BORDER[pitstop.status]}`
                            }`}
                            style={{
                              top: top + 6,
                              left: startX,
                              width,
                              height: ROW_H - 12,
                            }}
                            onMouseEnter={(e) => {
                              const rect = (e.target as HTMLElement).closest("[data-gantt]")?.getBoundingClientRect();
                              setTooltip({ pitstop, goal: row.goal, x: e.clientX, y: e.clientY });
                            }}
                            onMouseLeave={() => setTooltip(null)}
                          >
                            <span className="text-[11px] font-medium text-white truncate leading-none">
                              {width > 60 ? pitstop.title : ""}
                            </span>
                          </div>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-stone-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none max-w-[200px]"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          <p className="font-semibold">{tooltip.pitstop.title}</p>
          <p className="text-stone-400 mt-0.5">{tooltip.goal.title}</p>
          <p className="mt-1 text-stone-300">
            {tooltip.pitstop.startDate
              ? new Date(tooltip.pitstop.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : "—"}
            {" → "}
            {tooltip.pitstop.targetDate
              ? new Date(tooltip.pitstop.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : "—"}
          </p>
          <p className="text-stone-400">{tooltip.pitstop.status}</p>
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
      </div>
    </div>
  );
}
