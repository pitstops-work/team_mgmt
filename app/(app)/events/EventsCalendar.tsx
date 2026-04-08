"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, X, MapPin, ExternalLink, Trash2, Pencil, ChevronDown, Check } from "lucide-react";

type User = { id: string; name: string | null; image: string | null };
type PitstopOwner = { id: string; name: string | null; image: string | null };
type PitstopRef = {
  id: string; title: string;
  owner: PitstopOwner;
  goal: { id: string; title: string };
};
type Attendee = { id: string; userId: string; user: User };
type PitstopEvent = {
  id: string;
  title: string;
  description: string | null;
  type: "Meeting" | "Visit" | "Event";
  scheduledAt: string;
  location: string | null;
  pitstop: PitstopRef | null;
  createdBy: User;
  attendees: Attendee[];
};

const TYPE_COLORS: Record<string, string> = {
  Meeting: "bg-sky-50 border-sky-200 text-sky-800",
  Visit:   "bg-violet-50 border-violet-200 text-violet-800",
  Event:   "bg-amber-50 border-amber-200 text-amber-800",
};
const TYPE_DOT: Record<string, string> = {
  Meeting: "bg-sky-400",
  Visit:   "bg-violet-400",
  Event:   "bg-amber-400",
};

const DAYS   = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ── Avatar helper ─────────────────────────────────────────────────────────────

function Avatar({ user, size = 5 }: { user: User; size?: number }) {
  const cls = `w-${size} h-${size} rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-semibold bg-stone-200 text-stone-600 overflow-hidden`;
  if (user.image) return <img src={user.image} className={cls} alt={user.name ?? ""} />;
  return <span className={cls}>{(user.name ?? "?")[0].toUpperCase()}</span>;
}

// ── Multi-select goal dropdown ────────────────────────────────────────────────

function GoalPicker({
  goals,
  selected,
  onChange,
}: {
  goals: { id: string; title: string }[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  };

  const label = selected.size === 0 ? "All Goals" : selected.size === 1
    ? goals.find(g => selected.has(g.id))?.title ?? "1 goal"
    : `${selected.size} goals`;

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors ${selected.size > 0 ? "border-sky-400 bg-sky-50 text-sky-700" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}>
        {label}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 z-30 w-64 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden">
          <div className="max-h-56 overflow-y-auto p-1">
            {goals.map(g => (
              <button key={g.id} onClick={() => toggle(g.id)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left hover:bg-stone-50 transition-colors">
                <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selected.has(g.id) ? "bg-sky-500 border-sky-500" : "border-stone-300"}`}>
                  {selected.has(g.id) && <Check className="w-2.5 h-2.5 text-white" />}
                </span>
                <span className="truncate text-stone-700">{g.title}</span>
              </button>
            ))}
          </div>
          {selected.size > 0 && (
            <div className="border-t border-stone-100 p-1">
              <button onClick={() => onChange(new Set())} className="w-full text-xs text-stone-400 hover:text-stone-600 py-1.5 text-center">
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Create / Edit modal ───────────────────────────────────────────────────────

function EventModal({
  pitstops,
  users,
  initial,
  defaultDate,
  onClose,
  onSaved,
}: {
  pitstops: PitstopRef[];
  users: User[];
  initial?: PitstopEvent;
  defaultDate?: string;
  onClose: () => void;
  onSaved: (e: PitstopEvent) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState<"Meeting"|"Visit"|"Event">(initial?.type ?? "Meeting");
  const [date, setDate] = useState(initial ? initial.scheduledAt.slice(0,10) : (defaultDate ?? ""));
  const [time, setTime] = useState(initial ? initial.scheduledAt.slice(11,16) : "09:00");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [pitstopId, setPitstopId] = useState(initial?.pitstop?.id ?? "");
  // Attendee ids excluding the owner (owner is auto-added server-side)
  const initialExtraIds = initial
    ? initial.attendees.filter(a => a.userId !== initial.pitstop?.owner?.id).map(a => a.userId)
    : [];
  const [extraAttendeeIds, setExtraAttendeeIds] = useState<Set<string>>(new Set(initialExtraIds));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedPitstop = pitstops.find(p => p.id === pitstopId) ?? null;
  const ownerId = selectedPitstop?.owner?.id;

  // Users available to add as extra attendees (everyone except owner)
  const extraCandidates = users.filter(u => u.id !== ownerId);

  const toggleExtra = (uid: string) => {
    setExtraAttendeeIds(prev => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date || !pitstopId) { setError("Title, date, and pitstop are required."); return; }
    setLoading(true);
    setError("");
    const scheduledAt = `${date}T${time}:00`;
    const attendeeIds = Array.from(extraAttendeeIds);
    const body = { title: title.trim(), description: description.trim() || null, type, scheduledAt, location: location.trim() || null, pitstopId, attendeeIds };
    const url = initial ? `/api/pitstop-events/${initial.id}` : "/api/pitstop-events";
    const method = initial ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { setError((await res.json()).error ?? "Something went wrong."); setLoading(false); return; }
    onSaved(await res.json());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-stone-900">{initial ? "Edit Event" : "New Event"}</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-stone-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Title</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Pitstop <span className="text-red-400">*</span></label>
            <select value={pitstopId} onChange={e => { setPitstopId(e.target.value); setExtraAttendeeIds(new Set()); }} required
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
              <option value="">— select a pitstop —</option>
              {pitstops.map(p => (
                <option key={p.id} value={p.id}>{p.goal.title} › {p.title}</option>
              ))}
            </select>
            {selectedPitstop && (
              <div className="flex items-center gap-1.5 mt-1.5 px-1">
                <Avatar user={selectedPitstop.owner} size={4} />
                <span className="text-[11px] text-stone-500">
                  Owner: <span className="font-medium text-stone-700">{selectedPitstop.owner.name ?? "Unknown"}</span>
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-stone-600 mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value as "Meeting"|"Visit"|"Event")}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                <option>Meeting</option>
                <option>Visit</option>
                <option>Event</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-stone-600 mb-1">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-stone-600 mb-1">Time</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Location (optional)</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Village name, address…"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          {pitstopId && extraCandidates.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">Additional Attendees (optional)</label>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {extraCandidates.map(u => {
                  const checked = extraAttendeeIds.has(u.id);
                  return (
                    <button key={u.id} type="button" onClick={() => toggleExtra(u.id)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border transition-colors ${checked ? "bg-sky-50 border-sky-400 text-sky-700" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>
                      <Avatar user={u} size={4} />
                      {u.name ?? u.id}
                      {checked && <X className="w-2.5 h-2.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Notes (optional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Agenda, prep notes…"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none" />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">Cancel</button>
            <button type="submit" disabled={!title.trim() || !date || !pitstopId || loading}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {loading ? "Saving…" : initial ? "Save changes" : "Create Event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main calendar ─────────────────────────────────────────────────────────────

export default function EventsCalendar({
  events: initialEvents,
  pitstops,
  users,
  currentUserId,
}: {
  events: PitstopEvent[];
  pitstops: PitstopRef[];
  users: User[];
  currentUserId: string;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState(initialEvents);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editEvent, setEditEvent] = useState<PitstopEvent | null>(null);

  // Filters
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedGoals, setSelectedGoals] = useState<Set<string>>(new Set());

  // Unique goals from pitstops
  const allGoals = Array.from(
    new Map(pitstops.map(p => [p.goal.id, p.goal])).values()
  ).sort((a, b) => a.title.localeCompare(b.title));

  // Apply filters
  const filteredEvents = events.filter(ev => {
    if (selectedUsers.size > 0) {
      const attendeeUserIds = new Set(ev.attendees.map(a => a.userId));
      if (![...selectedUsers].some(uid => attendeeUserIds.has(uid))) return false;
    }
    if (selectedGoals.size > 0) {
      if (!ev.pitstop || !selectedGoals.has(ev.pitstop.goal.id)) return false;
    }
    return true;
  });

  const hasFilters = selectedUsers.size > 0 || selectedGoals.size > 0;

  // Build date → events map
  const eventMap = new Map<string, PitstopEvent[]>();
  for (const ev of filteredEvents) {
    const ymd = ev.scheduledAt.slice(0, 10);
    if (!eventMap.has(ymd)) eventMap.set(ymd, []);
    eventMap.get(ymd)!.push(ev);
  }

  // Calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalCells  = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const cells: (Date | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const d = i - startOffset + 1;
    return d < 1 || d > lastDay.getDate() ? null : new Date(year, month, d);
  });

  const prevMonth = () => { if (month === 0) { setYear(y=>y-1); setMonth(11); } else setMonth(m=>m-1); setSelectedDate(null); };
  const nextMonth = () => { if (month === 11) { setYear(y=>y+1); setMonth(0); } else setMonth(m=>m+1); setSelectedDate(null); };

  const todayYMD = toYMD(today);
  const selectedEvents = selectedDate ? (eventMap.get(selectedDate) ?? []) : [];

  const handleSaved = (ev: PitstopEvent) => {
    setEvents(prev => {
      const exists = prev.find(e => e.id === ev.id);
      return exists ? prev.map(e => e.id === ev.id ? ev : e) : [ev, ...prev];
    });
    setShowCreate(false);
    setEditEvent(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this event?")) return;
    await fetch(`/api/pitstop-events/${id}`, { method: "DELETE" });
    setEvents(prev => prev.filter(e => e.id !== id));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-stone-100">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-stone-900">Events</h1>
            <p className="text-sm text-stone-500">Meetings, visits, and scheduled events</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/calendar"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" /> Pitstop Calendar
            </Link>
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> New Event
            </button>
            <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDate(todayYMD); }}
              className="px-3 py-1 text-xs font-medium text-stone-600 border border-stone-200 rounded-md hover:bg-stone-50">
              Today
            </button>
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} className="p-1.5 rounded-md text-stone-400 hover:bg-stone-100"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-semibold text-stone-800 w-36 text-center">{MONTHS[month]} {year}</span>
              <button onClick={nextMonth} className="p-1.5 rounded-md text-stone-400 hover:bg-stone-100"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
        {/* Filter bar */}
        <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1 no-scrollbar">
          {/* User chips */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => setSelectedUsers(new Set())}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${selectedUsers.size === 0 ? "bg-stone-800 text-white border-stone-800" : "border-stone-200 text-stone-500 hover:border-stone-300"}`}>
              All People
            </button>
            {users.map(u => {
              const active = selectedUsers.has(u.id);
              return (
                <button key={u.id} onClick={() => {
                  const next = new Set(selectedUsers);
                  active ? next.delete(u.id) : next.add(u.id);
                  setSelectedUsers(next);
                }} className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-colors ${active ? "bg-sky-500 text-white border-sky-500" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>
                  <Avatar user={u} size={3} />
                  {u.name ?? "User"}
                </button>
              );
            })}
          </div>
          <div className="w-px h-4 bg-stone-200" />
          <GoalPicker goals={allGoals} selected={selectedGoals} onChange={setSelectedGoals} />
          {hasFilters && (
            <button onClick={() => { setSelectedUsers(new Set()); setSelectedGoals(new Set()); }}
              className="text-xs text-stone-400 hover:text-stone-600 underline">
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Grid */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[11px] font-semibold text-stone-400 uppercase tracking-wide py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-stone-200 rounded-xl overflow-hidden border border-stone-200">
            {cells.map((date, i) => {
              if (!date) return <div key={i} className="bg-stone-50 min-h-[96px]" />;
              const ymd = toYMD(date);
              const dayEvents = eventMap.get(ymd) ?? [];
              const isToday = ymd === todayYMD;
              const isSelected = ymd === selectedDate;
              return (
                <button key={i} onClick={() => setSelectedDate(p => p === ymd ? null : ymd)}
                  className={`min-h-[96px] bg-white p-1.5 text-left flex flex-col hover:bg-stone-50 transition-colors ${isSelected ? "bg-sky-50 hover:bg-sky-50" : ""} ${date.getMonth() !== month ? "opacity-40" : ""}`}>
                  <span className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0 ${isToday ? "bg-sky-500 text-white" : "text-stone-600"}`}>
                    {date.getDate()}
                  </span>
                  <div className="flex-1 space-y-0.5 overflow-hidden">
                    {dayEvents.slice(0, 3).map((ev, ei) => (
                      <div key={ei} className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] border truncate ${TYPE_COLORS[ev.type]}`}
                        title={ev.title}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${TYPE_DOT[ev.type]}`} />
                        <span className="truncate">{ev.title}</span>
                      </div>
                    ))}
                    {dayEvents.length > 3 && <p className="text-[10px] text-stone-400 px-1">+{dayEvents.length - 3} more</p>}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 text-xs text-stone-500">
            {(["Meeting","Visit","Event"] as const).map(t => (
              <div key={t} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${TYPE_DOT[t]}`} />
                {t}
              </div>
            ))}
          </div>
        </div>

        {/* Day panel — bottom sheet on mobile, side panel on desktop */}
        {selectedDate && (
          <div className="fixed inset-x-0 bottom-16 sm:bottom-auto sm:static z-30 sm:w-80 sm:flex-shrink-0 sm:border-l border-stone-200 bg-white flex flex-col overflow-hidden rounded-t-2xl sm:rounded-none shadow-xl sm:shadow-none max-h-[65vh] sm:max-h-none">
            <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-stone-800">
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })}
                </p>
                <p className="text-[11px] text-stone-400 mt-0.5">{selectedEvents.length} event{selectedEvents.length !== 1 ? "s" : ""}</p>
              </div>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-sky-600 hover:bg-sky-50 rounded-md transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {selectedEvents.length === 0 ? (
                <p className="text-xs text-stone-400 text-center py-8">No events. Click Add to schedule one.</p>
              ) : (
                selectedEvents
                  .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
                  .map((ev) => (
                    <div key={ev.id} className={`px-3 py-2.5 rounded-lg border ${TYPE_COLORS[ev.type]}`}>
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold leading-snug">{ev.title}</p>
                          <p className="text-[10px] opacity-70 mt-0.5">{fmtTime(ev.scheduledAt)} · {ev.type}</p>
                          {ev.location && (
                            <p className="flex items-center gap-0.5 text-[10px] opacity-70 mt-0.5">
                              <MapPin className="w-2.5 h-2.5" />{ev.location}
                            </p>
                          )}
                          {ev.description && <p className="text-[10px] opacity-60 mt-1 leading-relaxed line-clamp-2">{ev.description}</p>}
                          {ev.pitstop && (
                            <Link href={`/goals/${ev.pitstop.goal.id}/pitstops/${ev.pitstop.id}`}
                              className="flex items-center gap-0.5 text-[10px] mt-1 opacity-70 hover:opacity-100">
                              <ExternalLink className="w-2.5 h-2.5" />
                              {ev.pitstop.goal.title} › {ev.pitstop.title}
                            </Link>
                          )}
                          {ev.attendees.length > 0 && (
                            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                              {ev.attendees.slice(0, 5).map(a => (
                                <div key={a.id} className="flex items-center gap-1" title={a.user.name ?? ""}>
                                  <Avatar user={a.user} size={4} />
                                </div>
                              ))}
                              {ev.attendees.length > 5 && (
                                <span className="text-[10px] opacity-60">+{ev.attendees.length - 5}</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => setEditEvent(ev)} className="p-1 opacity-50 hover:opacity-100 transition-opacity">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleDelete(ev.id)} className="p-1 opacity-50 hover:opacity-100 hover:text-red-500 transition-all">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}
      </div>

      {(showCreate || editEvent) && (
        <EventModal
          pitstops={pitstops}
          users={users}
          initial={editEvent ?? undefined}
          defaultDate={selectedDate ?? undefined}
          onClose={() => { setShowCreate(false); setEditEvent(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
