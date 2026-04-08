"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

type Pitstop = {
  id: string;
  title: string;
  status: "Upcoming" | "InProgress" | "Done";
  type: string;
  customType?: string | null;
  startDate: string | null;
  targetDate: string | null;
  goal: { id: string; title: string };
  owner: { id: string; name: string | null; image: string | null } | null;
};

// An "event" is a pitstop appearing on a specific date (start or target)
type Event = {
  pitstop: Pitstop;
  kind: "start" | "target";
  date: string; // YYYY-MM-DD
};

const STATUS_DOT: Record<string, string> = {
  Done: "bg-emerald-400",
  InProgress: "bg-sky-400",
  Upcoming: "bg-stone-300",
};

const STATUS_BG: Record<string, string> = {
  Done: "bg-emerald-50 border-emerald-200 text-emerald-800",
  InProgress: "bg-sky-50 border-sky-200 text-sky-800",
  Upcoming: "bg-stone-50 border-stone-200 text-stone-700",
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toYMD(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildEventMap(pitstops: Pitstop[]): Map<string, Event[]> {
  const map = new Map<string, Event[]>();
  const add = (date: string, event: Event) => {
    if (!map.has(date)) map.set(date, []);
    map.get(date)!.push(event);
  };
  for (const p of pitstops) {
    if (p.startDate) add(p.startDate.slice(0, 10), { pitstop: p, kind: "start", date: p.startDate.slice(0, 10) });
    if (p.targetDate && p.targetDate.slice(0, 10) !== p.startDate?.slice(0, 10)) {
      add(p.targetDate.slice(0, 10), { pitstop: p, kind: "target", date: p.targetDate.slice(0, 10) });
    }
  }
  return map;
}

export default function CalendarView({ pitstops }: { pitstops: Pitstop[] }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"All" | "Upcoming" | "InProgress" | "Done">("All");

  const eventMap = buildEventMap(pitstops);

  // Build calendar grid — weeks start Monday
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Day-of-week offset for Monday-start (Mon=0 … Sun=6)
  const startOffset = (firstDay.getDay() + 6) % 7;

  // Total cells: pad to full weeks
  const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const cells: (Date | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startOffset + 1;
    if (dayNum < 1 || dayNum > lastDay.getDate()) return null;
    return new Date(year, month, dayNum);
  });

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(toYMD(today));
  };

  const todayYMD = toYMD(today);
  const selectedEvents = selectedDate ? (eventMap.get(selectedDate) ?? []) : [];
  const filteredSelected = filterStatus === "All"
    ? selectedEvents
    : selectedEvents.filter(e => e.pitstop.status === filterStatus);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-stone-100 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-stone-900">Calendar</h1>
          <p className="text-sm text-stone-500">Pitstop start and target dates</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goToday}
            className="px-3 py-1 text-xs font-medium text-stone-600 border border-stone-200 rounded-md hover:bg-stone-50 transition-colors"
          >
            Today
          </button>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="p-1.5 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-stone-800 w-36 text-center">
              {MONTHS[month]} {year}
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Calendar grid */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[11px] font-semibold text-stone-400 uppercase tracking-wide py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Cells */}
          <div className="grid grid-cols-7 gap-px bg-stone-200 rounded-xl overflow-hidden border border-stone-200">
            {cells.map((date, i) => {
              if (!date) return <div key={i} className="bg-stone-50 min-h-[88px]" />;
              const ymd = toYMD(date);
              const events = eventMap.get(ymd) ?? [];
              const isToday = ymd === todayYMD;
              const isSelected = ymd === selectedDate;
              const isCurrentMonth = date.getMonth() === month;

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(prev => prev === ymd ? null : ymd)}
                  className={`min-h-[88px] bg-white p-1.5 text-left flex flex-col transition-colors hover:bg-stone-50 ${
                    isSelected ? "bg-sky-50 hover:bg-sky-50" : ""
                  } ${!isCurrentMonth ? "opacity-40" : ""}`}
                >
                  {/* Date number */}
                  <span className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0 ${
                    isToday ? "bg-sky-500 text-white" : "text-stone-600"
                  }`}>
                    {date.getDate()}
                  </span>

                  {/* Events */}
                  <div className="flex-1 space-y-0.5 overflow-hidden">
                    {events.slice(0, 3).map((ev, ei) => (
                      <div
                        key={ei}
                        className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] leading-tight border truncate ${STATUS_BG[ev.pitstop.status]}`}
                        title={`${ev.pitstop.title} (${ev.kind === "start" ? "starts" : "due"})`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[ev.pitstop.status]}`} />
                        <span className="truncate">{ev.pitstop.title}</span>
                        {ev.kind === "target" && <span className="flex-shrink-0 opacity-60">●</span>}
                      </div>
                    ))}
                    {events.length > 3 && (
                      <p className="text-[10px] text-stone-400 px-1">+{events.length - 3} more</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 text-xs text-stone-500">
            {(["Done", "InProgress", "Upcoming"] as const).map(s => (
              <div key={s} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`} />
                {s === "InProgress" ? "In Progress" : s}
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="text-stone-400 text-[10px]">●</span>
              Due date
            </div>
          </div>
        </div>

        {/* Side panel — selected day */}
        {selectedDate && (
          <div className="w-72 flex-shrink-0 border-l border-stone-200 bg-white flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-stone-800">
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
                    weekday: "long", month: "long", day: "numeric",
                  })}
                </p>
                <p className="text-[11px] text-stone-400 mt-0.5">{selectedEvents.length} pitstop{selectedEvents.length !== 1 ? "s" : ""}</p>
              </div>
            </div>

            {/* Filter */}
            {selectedEvents.length > 0 && (
              <div className="flex gap-1 px-3 py-2 border-b border-stone-100">
                {(["All", "Upcoming", "InProgress", "Done"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilterStatus(f)}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors ${
                      filterStatus === f ? "bg-stone-900 text-white" : "text-stone-400 hover:bg-stone-100"
                    }`}
                  >
                    {f === "InProgress" ? "In Progress" : f}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {filteredSelected.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <CalendarDays className="w-8 h-8 text-stone-200 mb-2" />
                  <p className="text-xs text-stone-400">No pitstops on this day.</p>
                </div>
              ) : (
                filteredSelected.map((ev, i) => (
                  <Link
                    key={i}
                    href={`/goals/${ev.pitstop.goal.id}/pitstops/${ev.pitstop.id}`}
                    className={`block px-3 py-2.5 rounded-lg border transition-all hover:shadow-sm ${STATUS_BG[ev.pitstop.status]}`}
                  >
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <span className="text-xs font-semibold leading-snug line-clamp-2">{ev.pitstop.title}</span>
                      <span className={`flex-shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${
                        ev.kind === "target"
                          ? "bg-amber-50 border-amber-200 text-amber-700"
                          : "bg-white border-stone-200 text-stone-500"
                      }`}>
                        {ev.kind === "target" ? "Due" : "Starts"}
                      </span>
                    </div>
                    <p className="text-[10px] opacity-70 truncate">{ev.pitstop.goal.title}</p>
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[ev.pitstop.status]}`} />
                      <span className="text-[10px] opacity-60">
                        {ev.pitstop.status === "InProgress" ? "In Progress" : ev.pitstop.status}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
