"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays, ChevronDown, X, CalendarClock, Check } from "lucide-react";

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
type CalEvent = { pitstop: Pitstop; kind: "start" | "target"; date: string };
type ScheduledEvent = {
  id: string;
  title: string;
  type: "Meeting" | "Visit" | "Event";
  scheduledAt: string;
  pitstops: { pitstop: { id: string; title: string; goal: { id: string; title: string } } }[];
};
type ViewMode = "day" | "week" | "month";

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
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function toYMD(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function getWeekStart(d: Date) {
  const date = new Date(d);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  date.setHours(12, 0, 0, 0);
  return date;
}
function buildEventMap(pitstops: Pitstop[]): Map<string, CalEvent[]> {
  const map = new Map<string, CalEvent[]>();
  const add = (date: string, event: CalEvent) => {
    if (!map.has(date)) map.set(date, []); map.get(date)!.push(event);
  };
  for (const p of pitstops) {
    if (p.startDate) add(p.startDate.slice(0,10), { pitstop: p, kind: "start", date: p.startDate.slice(0,10) });
    if (p.targetDate && p.targetDate.slice(0,10) !== p.startDate?.slice(0,10))
      add(p.targetDate.slice(0,10), { pitstop: p, kind: "target", date: p.targetDate.slice(0,10) });
  }
  return map;
}

function GoalPicker({ goals, selected, onChange }: {
  goals: { id: string; title: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const toggle = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); onChange(n); };
  const label = selected.size === 0 ? "All Goals"
    : selected.size === 1 ? (goals.find(g => selected.has(g.id))?.title ?? "1 goal")
    : `${selected.size} goals`;
  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${selected.size > 0 ? "bg-sky-50 border-sky-300 text-sky-700" : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"}`}>
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-stone-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-stone-100 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
            Filter by Goal
          </div>
          <div className="max-h-64 overflow-y-auto">
            {goals.map(g => (
              <button key={g.id} onClick={() => toggle(g.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-stone-50 transition-colors border-b border-stone-50 last:border-0">
                <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${selected.has(g.id) ? "bg-sky-500 border-sky-500" : "border-stone-300 bg-white"}`}>
                  {selected.has(g.id) && <Check className="w-2.5 h-2.5 text-white" />}
                </span>
                <span className="text-xs text-stone-700 leading-snug">{g.title}</span>
              </button>
            ))}
          </div>
          {selected.size > 0 && (
            <div className="border-t border-stone-100 px-3 py-2">
              <button onClick={() => onChange(new Set())} className="w-full text-xs text-stone-400 hover:text-stone-600 py-1 text-center">
                Clear filter
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ViewSwitcher({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex bg-stone-100 rounded-lg p-0.5 flex-shrink-0">
      {(["day", "week", "month"] as const).map(v => (
        <button key={v} onClick={() => onChange(v)}
          className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors ${view === v ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
          {v}
        </button>
      ))}
    </div>
  );
}

export default function CalendarView({ pitstops, scheduledEvents }: { pitstops: Pitstop[]; scheduledEvents: ScheduledEvent[] }) {
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [anchorDate, setAnchorDate] = useState(today);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"All" | "Upcoming" | "InProgress" | "Done">("All");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedGoals, setSelectedGoals] = useState<Set<string>>(new Set());
  const [showActivities, setShowActivities] = useState(true);

  // Derive unique users + goals
  const allUsers: Owner[] = [];
  const seenUsers = new Set<string>();
  for (const p of pitstops) {
    if (p.owner && !seenUsers.has(p.owner.id)) { seenUsers.add(p.owner.id); allUsers.push(p.owner); }
  }
  allUsers.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const allGoals: { id: string; title: string }[] = [];
  const seenGoals = new Set<string>();
  for (const p of pitstops) {
    if (!seenGoals.has(p.goal.id)) { seenGoals.add(p.goal.id); allGoals.push(p.goal); }
  }
  allGoals.sort((a, b) => a.title.localeCompare(b.title));

  const filteredPitstops = pitstops.filter(p => {
    if (selectedUsers.size > 0 && (!p.owner || !selectedUsers.has(p.owner.id))) return false;
    if (selectedGoals.size > 0 && !selectedGoals.has(p.goal.id)) return false;
    return true;
  });
  const eventMap = buildEventMap(filteredPitstops);
  const scheduledMap = new Map<string, ScheduledEvent[]>();
  for (const ev of scheduledEvents) {
    const ymd = ev.scheduledAt.slice(0, 10);
    if (!scheduledMap.has(ymd)) scheduledMap.set(ymd, []);
    scheduledMap.get(ymd)!.push(ev);
  }

  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const todayYMD = toYMD(today);

  const navigate = (dir: -1 | 1) => {
    setAnchorDate(prev => {
      const d = new Date(prev);
      if (viewMode === "month") { d.setMonth(d.getMonth() + dir); return d; }
      if (viewMode === "week") return addDays(prev, dir * 7);
      return addDays(prev, dir);
    });
    if (viewMode === "month") setSelectedDate(null);
  };
  const goToday = () => { setAnchorDate(today); setSelectedDate(toYMD(today)); };
  const activeFilterCount = (selectedUsers.size > 0 ? 1 : 0) + (selectedGoals.size > 0 ? 1 : 0);

  const headerLabel = (() => {
    if (viewMode === "month") return `${MONTHS[month]} ${year}`;
    if (viewMode === "week") {
      const ws = getWeekStart(anchorDate);
      const we = addDays(ws, 6);
      if (ws.getMonth() === we.getMonth())
        return `${MONTHS[ws.getMonth()].slice(0,3)} ${ws.getDate()}–${we.getDate()}`;
      return `${ws.toLocaleDateString("en-US",{month:"short",day:"numeric"})} – ${we.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`;
    }
    return anchorDate.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
  })();

  // Month grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const cells: (Date | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const d = i - startOffset + 1;
    return d < 1 || d > lastDay.getDate() ? null : new Date(year, month, d);
  });

  // Month day panel
  const selectedEvents = selectedDate ? (eventMap.get(selectedDate) ?? []) : [];
  const filteredSelected = filterStatus === "All" ? selectedEvents : selectedEvents.filter(e => e.pitstop.status === filterStatus);

  // Week view
  const weekStart = getWeekStart(anchorDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Day view
  const dayYMD = toYMD(anchorDate);
  const dayPitstopEvents = eventMap.get(dayYMD) ?? [];
  const dayScheduledEvents = showActivities ? (scheduledMap.get(dayYMD) ?? []) : [];
  const filteredDayEvents = filterStatus === "All" ? dayPitstopEvents : dayPitstopEvents.filter(e => e.pitstop.status === filterStatus);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-stone-100">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h1 className="text-lg font-semibold text-stone-900">Timeline</h1>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={() => setShowActivities(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                showActivities
                  ? "bg-violet-50 border-violet-200 text-violet-700"
                  : "bg-stone-100 border-stone-200 text-stone-500 hover:text-stone-700"
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Activities
            </button>
            <ViewSwitcher view={viewMode} onChange={v => { setViewMode(v); setSelectedDate(null); setFilterStatus("All"); }} />
            <button onClick={goToday} className="px-2.5 py-1 text-xs font-medium text-stone-600 border border-stone-200 rounded-md hover:bg-stone-50 transition-colors">
              Today
            </button>
            <div className="flex items-center gap-0.5">
              <button onClick={() => navigate(-1)} className="p-1.5 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-semibold text-stone-800 min-w-[100px] sm:min-w-[140px] text-center whitespace-nowrap">
                {headerLabel}
              </span>
              <button onClick={() => navigate(1)} className="p-1.5 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setSelectedUsers(new Set())}
              className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${selectedUsers.size === 0 ? "bg-stone-900 text-white border-stone-900" : "text-stone-500 border-stone-200 hover:border-stone-300 hover:bg-stone-50"}`}>
              All
            </button>
            {allUsers.map(u => (
              <button key={u.id} onClick={() => {
                const next = new Set(selectedUsers);
                next.has(u.id) ? next.delete(u.id) : next.add(u.id);
                setSelectedUsers(next);
              }} className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors flex-shrink-0 ${selectedUsers.has(u.id) ? "bg-sky-500 text-white border-sky-500" : "text-stone-500 border-stone-200 hover:border-stone-300 hover:bg-stone-50"}`}>
                {u.name ?? "?"}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-stone-200 flex-shrink-0" />
          <GoalPicker goals={allGoals} selected={selectedGoals} onChange={setSelectedGoals} />
          {activeFilterCount > 0 && (
            <button onClick={() => { setSelectedUsers(new Set()); setSelectedGoals(new Set()); }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-stone-400 hover:text-stone-600 flex-shrink-0">
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── MONTH VIEW ─────────────────────────────────────────────────────────── */}
      {viewMode === "month" && (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto p-2 sm:p-6">
            <div className="grid grid-cols-7 mb-1">
              {DAYS.map(d => (
                <div key={d} className="text-center py-1">
                  <span className="hidden sm:inline text-[11px] font-semibold text-stone-400 uppercase tracking-wide">{d}</span>
                  <span className="sm:hidden text-[10px] font-semibold text-stone-400 uppercase">{d[0]}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-stone-200 rounded-xl overflow-hidden border border-stone-200">
              {cells.map((date, i) => {
                if (!date) return <div key={i} className="bg-stone-50 min-h-[48px] sm:min-h-[88px]" />;
                const ymd = toYMD(date);
                const events = eventMap.get(ymd) ?? [];
                const schedEvents = scheduledMap.get(ymd) ?? [];
                const isToday = ymd === todayYMD;
                const isSelected = ymd === selectedDate;
                return (
                  <button key={i} onClick={() => setSelectedDate(prev => prev === ymd ? null : ymd)}
                    className={`min-h-[48px] sm:min-h-[88px] bg-white p-1 sm:p-1.5 text-left flex flex-col transition-colors hover:bg-stone-50 ${isSelected ? "bg-sky-50 hover:bg-sky-50" : ""} ${date.getMonth() !== month ? "opacity-40" : ""}`}>
                    <span className={`text-[10px] sm:text-xs font-medium mb-0.5 sm:mb-1 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full flex-shrink-0 ${isToday ? "bg-sky-500 text-white" : "text-stone-600"}`}>
                      {date.getDate()}
                    </span>
                    {/* Mobile: dots only */}
                    <div className="flex flex-wrap gap-0.5 sm:hidden">
                      {events.slice(0, 4).map((ev, ei) => (
                        <span key={ei} className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[ev.pitstop.status]}`} />
                      ))}
                      {schedEvents.slice(0, 2).map((ev, ei) => (
                        <span key={`s${ei}`} className={`w-1.5 h-1.5 rounded-full ${EVENT_TYPE_DOT[ev.type]}`} />
                      ))}
                    </div>
                    {/* Desktop: labels */}
                    <div className="hidden sm:flex flex-1 flex-col space-y-0.5 overflow-hidden">
                      {events.slice(0, 3).map((ev, ei) => (
                        <div key={ei} className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] leading-tight border truncate ${STATUS_BG[ev.pitstop.status]}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[ev.pitstop.status]}`} />
                          <span className="truncate">{ev.pitstop.title}</span>
                          {ev.kind === "target" && <span className="flex-shrink-0 opacity-50 text-[8px]">●</span>}
                        </div>
                      ))}
                      {events.length > 3 && <p className="text-[10px] text-stone-400 px-1">+{events.length - 3}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-stone-500">
              {(["Done","InProgress","Upcoming"] as const).map(s => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`} />
                  <span className="hidden sm:inline">{s === "InProgress" ? "In Progress" : s}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Day panel (bottom sheet mobile, side panel desktop) */}
          {selectedDate && (
            <div className="fixed inset-x-0 bottom-16 sm:bottom-auto sm:static z-30 sm:w-72 sm:flex-shrink-0 sm:border-l border-stone-200 bg-white flex flex-col overflow-hidden rounded-t-2xl sm:rounded-none shadow-xl sm:shadow-none max-h-[65vh] sm:max-h-none">
              <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-stone-800">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })}
                  </p>
                  <p className="text-[11px] text-stone-400 mt-0.5">{selectedEvents.length} pitstop{selectedEvents.length !== 1 ? "s" : ""}</p>
                </div>
                <button onClick={() => setSelectedDate(null)} className="p-1.5 rounded-md text-stone-400 hover:text-stone-600 hover:bg-stone-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {selectedEvents.length > 0 && (
                <div className="flex gap-1 px-3 py-2 border-b border-stone-100">
                  {(["All","Upcoming","InProgress","Done"] as const).map(f => (
                    <button key={f} onClick={() => setFilterStatus(f)}
                      className={`px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors ${filterStatus === f ? "bg-stone-900 text-white" : "text-stone-400 hover:bg-stone-100"}`}>
                      {f === "InProgress" ? "IP" : f}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                {filteredSelected.length === 0 ? (
                  <div className="flex flex-col items-center py-10">
                    <CalendarDays className="w-8 h-8 text-stone-200 mb-2" />
                    <p className="text-xs text-stone-400">No pitstops on this day.</p>
                  </div>
                ) : filteredSelected.map((ev, i) => (
                  <Link key={i} href={`/goals/${ev.pitstop.goal.id}/pitstops/${ev.pitstop.id}`}
                    className={`block px-3 py-2.5 rounded-lg border transition-all hover:shadow-sm ${STATUS_BG[ev.pitstop.status]}`}>
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <span className="text-xs font-semibold leading-snug line-clamp-2">{ev.pitstop.title}</span>
                      <span className={`flex-shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${ev.kind === "target" ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-white border-stone-200 text-stone-500"}`}>
                        {ev.kind === "target" ? "Due" : "Starts"}
                      </span>
                    </div>
                    <p className="text-[10px] opacity-70 truncate">{ev.pitstop.goal.title}</p>
                    {ev.pitstop.owner && <p className="text-[10px] opacity-60 mt-0.5">{ev.pitstop.owner.name}</p>}
                  </Link>
                ))}
                {/* Scheduled events */}
                {showActivities && (() => {
                  const dayEvs = scheduledMap.get(selectedDate) ?? [];
                  return (
                    <div className="pt-2 border-t border-stone-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide">Scheduled</p>
                        <Link href="/activities" className="flex items-center gap-0.5 text-[10px] text-sky-500 hover:text-sky-700">
                          <CalendarClock className="w-3 h-3" /> All
                        </Link>
                      </div>
                      {dayEvs.map(ev => (
                        <Link key={ev.id} href="/activities"
                          className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-stone-50 border border-stone-200 hover:bg-stone-100 mb-1 transition-colors">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${EVENT_TYPE_DOT[ev.type]}`} />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-stone-700 truncate">{ev.title}</p>
                            <p className="text-[10px] text-stone-400">{new Date(ev.scheduledAt).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}</p>
                          </div>
                        </Link>
                      ))}
                      <Link
                        href={`/activities`}
                        className="flex items-center gap-1.5 w-full px-2.5 py-2 mt-1 text-[10px] text-stone-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg border border-dashed border-stone-200 hover:border-violet-300 transition-all">
                        <CalendarDays className="w-3 h-3" />
                        Add activity on this day
                      </Link>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── WEEK VIEW ──────────────────────────────────────────────────────────── */}
      {viewMode === "week" && (
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          <div className="space-y-5 max-w-2xl mx-auto">
            {weekDays.map(d => {
              const ymd = toYMD(d);
              const pvEvents = eventMap.get(ymd) ?? [];
              const schEvents = showActivities ? (scheduledMap.get(ymd) ?? []) : [];
              const isToday = ymd === todayYMD;
              const total = pvEvents.length + schEvents.length;
              return (
                <div key={ymd}>
                  <div className={`flex items-center gap-2 mb-2 pb-1.5 border-b ${isToday ? "border-sky-200" : "border-stone-100"}`}>
                    <span className={`text-xs font-semibold uppercase tracking-wider ${isToday ? "text-sky-600" : "text-stone-500"}`}>
                      {d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}
                    </span>
                    {isToday && <span className="text-[10px] bg-sky-100 text-sky-600 px-1.5 py-0.5 rounded-full font-medium">Today</span>}
                    {total === 0 && <span className="text-[11px] text-stone-300 ml-auto">nothing scheduled</span>}
                  </div>
                  {total > 0 && (
                    <div className="space-y-1.5">
                      {pvEvents.map((ev, i) => (
                        <Link key={i} href={`/goals/${ev.pitstop.goal.id}/pitstops/${ev.pitstop.id}`}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm hover:shadow-sm transition-all ${STATUS_BG[ev.pitstop.status]}`}>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[ev.pitstop.status]}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{ev.pitstop.title}</p>
                            <p className="text-[10px] opacity-60 truncate mt-0.5">{ev.pitstop.goal.title}{ev.pitstop.owner ? ` · ${ev.pitstop.owner.name}` : ""}</p>
                          </div>
                          <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border ${ev.kind === "target" ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-white/60 border-current opacity-70"}`}>
                            {ev.kind === "target" ? "Due" : "Starts"}
                          </span>
                        </Link>
                      ))}
                      {schEvents.map(ev => (
                        <Link key={ev.id} href="/activities"
                          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-stone-200 bg-white text-xs hover:bg-stone-50 transition-colors">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${EVENT_TYPE_DOT[ev.type]}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-stone-700 truncate">{ev.title}</p>
                            <p className="text-[10px] text-stone-400 mt-0.5">{ev.type}</p>
                          </div>
                          <span className="text-[10px] text-stone-400 flex-shrink-0">
                            {new Date(ev.scheduledAt).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── DAY VIEW ───────────────────────────────────────────────────────────── */}
      {viewMode === "day" && (
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          <div className="max-w-xl mx-auto">
            {dayPitstopEvents.length > 0 && (
              <div className="flex gap-1.5 mb-4 flex-wrap">
                {(["All","Upcoming","InProgress","Done"] as const).map(f => (
                  <button key={f} onClick={() => setFilterStatus(f)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${filterStatus === f ? "bg-stone-800 text-white border-stone-800" : "border-stone-200 text-stone-500 hover:border-stone-300"}`}>
                    {f === "InProgress" ? "In Progress" : f}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-2">
              {filteredDayEvents.map((ev, i) => (
                <Link key={i} href={`/goals/${ev.pitstop.goal.id}/pitstops/${ev.pitstop.id}`}
                  className={`block px-4 py-3 rounded-xl border hover:shadow-sm transition-all ${STATUS_BG[ev.pitstop.status]}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-snug">{ev.pitstop.title}</p>
                      <p className="text-xs opacity-70 mt-0.5 truncate">{ev.pitstop.goal.title}</p>
                      {ev.pitstop.owner && <p className="text-xs opacity-60 mt-0.5">{ev.pitstop.owner.name}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${ev.kind === "target" ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-white border-stone-200 text-stone-500"}`}>
                        {ev.kind === "target" ? "Due date" : "Start date"}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[ev.pitstop.status]}`} />
                        <span className="text-[10px] opacity-60">{ev.pitstop.status === "InProgress" ? "In Progress" : ev.pitstop.status}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}

              {dayScheduledEvents.length > 0 && (
                <div className={dayPitstopEvents.length > 0 ? "pt-3 border-t border-stone-100" : ""}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Scheduled Events</p>
                    <Link href="/activities" className="flex items-center gap-1 text-xs text-sky-500 hover:text-sky-700">
                      <CalendarClock className="w-3.5 h-3.5" /> View all
                    </Link>
                  </div>
                  {dayScheduledEvents.map(ev => (
                    <Link key={ev.id} href="/activities"
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 mb-2 transition-colors">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${EVENT_TYPE_DOT[ev.type]}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-800 truncate">{ev.title}</p>
                        <p className="text-xs text-stone-400 mt-0.5">
                          {ev.type} · {new Date(ev.scheduledAt).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}
                        </p>
                        {ev.pitstops.length > 0 && <p className="text-xs text-stone-400 truncate mt-0.5">{ev.pitstops.map(p => `${p.pitstop.goal.title} › ${p.pitstop.title}`).join(", ")}</p>}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {filteredDayEvents.length === 0 && dayScheduledEvents.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20">
                  <CalendarDays className="w-12 h-12 text-stone-200 mb-3" />
                  <p className="text-sm text-stone-400">Nothing scheduled for this day.</p>
                  <p className="text-xs text-stone-300 mt-1">Use ‹ › to navigate days.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
