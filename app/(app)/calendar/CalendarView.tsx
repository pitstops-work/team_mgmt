"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays, ChevronDown, X, CalendarClock } from "lucide-react";

type Owner = { id: string; name: string | null; image: string | null };
type Pitstop = {
  id: string;
  title: string;
  status: "Upcoming" | "InProgress" | "Done";
  type: string;
  customType?: string | null;
  startDate: string | null;
  targetDate: string | null;
  goal: { id: string; title: string };
  owner: Owner | null;
};

type Event = {
  pitstop: Pitstop;
  kind: "start" | "target";
  date: string;
};

type ScheduledEvent = {
  id: string;
  title: string;
  type: "Meeting" | "Visit" | "Event";
  scheduledAt: string;
  pitstop: { id: string; title: string; goal: { id: string; title: string } } | null;
};

const EVENT_TYPE_DOT: Record<string, string> = {
  Meeting: "bg-sky-400",
  Visit:   "bg-violet-400",
  Event:   "bg-amber-400",
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

// ── Goal multi-select dropdown ────────────────────────────────────────────────

function GoalPicker({
  goals,
  selected,
  onChange,
}: {
  goals: { id: string; title: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = goals.filter(g => g.title.toLowerCase().includes(query.toLowerCase()));

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  };

  const label = selected.size === 0
    ? "All Goals"
    : selected.size === 1
    ? goals.find(g => selected.has(g.id))?.title ?? "1 goal"
    : `${selected.size} goals`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
          selected.size > 0
            ? "bg-sky-50 border-sky-300 text-sky-700"
            : "bg-white border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50"
        }`}
      >
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
      </button>

      {selected.size > 0 && (
        <button
          onClick={() => onChange(new Set())}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-sky-500 text-white rounded-full flex items-center justify-center hover:bg-sky-600 transition-colors"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}

      {open && (
        <div className="absolute top-full left-0 mt-1 w-60 bg-white border border-stone-200 rounded-xl shadow-lg z-30 overflow-hidden">
          <div className="p-2 border-b border-stone-100">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search goals..."
              className="w-full px-2 py-1 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-stone-400">No goals found.</p>
            )}
            {filtered.map(g => (
              <label key={g.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-stone-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(g.id)}
                  onChange={() => toggle(g.id)}
                  className="w-3.5 h-3.5 rounded border-stone-300 text-sky-500 focus:ring-sky-400"
                />
                <span className="text-xs text-stone-700 leading-snug">{g.title}</span>
              </label>
            ))}
          </div>
          {selected.size > 0 && (
            <div className="border-t border-stone-100 px-3 py-2">
              <button onClick={() => onChange(new Set())} className="text-xs text-stone-400 hover:text-stone-600">
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CalendarView({ pitstops, scheduledEvents }: { pitstops: Pitstop[]; scheduledEvents: ScheduledEvent[] }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"All" | "Upcoming" | "InProgress" | "Done">("All");

  // User + goal filters
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedGoals, setSelectedGoals] = useState<Set<string>>(new Set());

  // Derive unique users + goals from pitstop data
  const allUsers: Owner[] = [];
  const seenUsers = new Set<string>();
  for (const p of pitstops) {
    if (p.owner && !seenUsers.has(p.owner.id)) {
      seenUsers.add(p.owner.id);
      allUsers.push(p.owner);
    }
  }
  allUsers.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  const allGoals: { id: string; title: string }[] = [];
  const seenGoals = new Set<string>();
  for (const p of pitstops) {
    if (!seenGoals.has(p.goal.id)) {
      seenGoals.add(p.goal.id);
      allGoals.push(p.goal);
    }
  }
  allGoals.sort((a, b) => a.title.localeCompare(b.title));

  // Apply user + goal filters to pitstop list
  const filteredPitstops = pitstops.filter(p => {
    if (selectedUsers.size > 0 && (!p.owner || !selectedUsers.has(p.owner.id))) return false;
    if (selectedGoals.size > 0 && !selectedGoals.has(p.goal.id)) return false;
    return true;
  });

  const eventMap = buildEventMap(filteredPitstops);

  // Build date → scheduled events map
  const scheduledMap = new Map<string, ScheduledEvent[]>();
  for (const ev of scheduledEvents) {
    const ymd = ev.scheduledAt.slice(0, 10);
    if (!scheduledMap.has(ymd)) scheduledMap.set(ymd, []);
    scheduledMap.get(ymd)!.push(ev);
  }

  // Build calendar grid — weeks start Monday
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const cells: (Date | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startOffset + 1;
    if (dayNum < 1 || dayNum > lastDay.getDate()) return null;
    return new Date(year, month, dayNum);
  });

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1);
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1);
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

  const activeFilterCount = (selectedUsers.size > 0 ? 1 : 0) + (selectedGoals.size > 0 ? 1 : 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-stone-100">
        <div className="flex items-center justify-between gap-4 mb-3">
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

        {/* Filter bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {/* User chips */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setSelectedUsers(new Set())}
              className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                selectedUsers.size === 0
                  ? "bg-stone-900 text-white border-stone-900"
                  : "text-stone-500 border-stone-200 hover:border-stone-300 hover:bg-stone-50"
              }`}
            >
              All People
            </button>
            {allUsers.map(u => (
              <button
                key={u.id}
                onClick={() => {
                  const next = new Set(selectedUsers);
                  next.has(u.id) ? next.delete(u.id) : next.add(u.id);
                  setSelectedUsers(next);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                  selectedUsers.has(u.id)
                    ? "bg-sky-500 text-white border-sky-500"
                    : "text-stone-500 border-stone-200 hover:border-stone-300 hover:bg-stone-50"
                }`}
              >
                {u.image ? (
                  <img src={u.image} alt="" className="w-3.5 h-3.5 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full bg-stone-300 flex-shrink-0 flex items-center justify-center text-[8px] text-white font-bold">
                    {(u.name ?? "?")[0].toUpperCase()}
                  </span>
                )}
                {u.name ?? "Unknown"}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-stone-200" />

          {/* Goal multi-select */}
          <GoalPicker goals={allGoals} selected={selectedGoals} onChange={setSelectedGoals} />

          {/* Clear all */}
          {activeFilterCount > 0 && (
            <button
              onClick={() => { setSelectedUsers(new Set()); setSelectedGoals(new Set()); }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-stone-400 hover:text-stone-600 transition-colors"
            >
              <X className="w-3 h-3" />
              Clear filters
            </button>
          )}
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
                  <span className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0 ${
                    isToday ? "bg-sky-500 text-white" : "text-stone-600"
                  }`}>
                    {date.getDate()}
                  </span>
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

        {/* Side panel — selected day (bottom sheet on mobile, side panel on desktop) */}
        {selectedDate && (
          <div className="fixed inset-x-0 bottom-16 sm:bottom-auto sm:static z-30 sm:w-72 sm:flex-shrink-0 sm:border-l border-stone-200 bg-white flex flex-col overflow-hidden rounded-t-2xl sm:rounded-none shadow-xl sm:shadow-none max-h-[65vh] sm:max-h-none">
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
                    {ev.pitstop.owner && (
                      <p className="text-[10px] opacity-60 mt-0.5 truncate">{ev.pitstop.owner.name}</p>
                    )}
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[ev.pitstop.status]}`} />
                      <span className="text-[10px] opacity-60">
                        {ev.pitstop.status === "InProgress" ? "In Progress" : ev.pitstop.status}
                      </span>
                    </div>
                  </Link>
                ))
              )}

              {/* Scheduled events section */}
              {(() => {
                const dayEvents = scheduledMap.get(selectedDate) ?? [];
                if (dayEvents.length === 0) return null;
                return (
                  <div className="pt-2 mt-1 border-t border-stone-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide">Scheduled Events</p>
                      <Link href="/events" className="flex items-center gap-0.5 text-[10px] text-sky-500 hover:text-sky-700">
                        <CalendarClock className="w-3 h-3" /> View all
                      </Link>
                    </div>
                    <div className="space-y-1.5">
                      {dayEvents.map(ev => (
                        <Link key={ev.id} href="/events"
                          className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-stone-50 border border-stone-200 hover:bg-stone-100 transition-colors">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${EVENT_TYPE_DOT[ev.type]}`} />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-stone-700 truncate">{ev.title}</p>
                            <p className="text-[10px] text-stone-400 truncate">
                              {new Date(ev.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                              {ev.pitstop ? ` · ${ev.pitstop.title}` : ""}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
