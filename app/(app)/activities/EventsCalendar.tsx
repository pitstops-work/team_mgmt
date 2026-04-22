"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, X, MapPin, ExternalLink, Trash2, Pencil, ChevronDown, Check, CalendarClock, MessageSquare, Send, AlertCircle } from "lucide-react";
import Avatar from "@/components/Avatar";
import PitstopMultiPicker from "@/components/PitstopMultiPicker";

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
  status: "Scheduled" | "Done" | "Cancelled" | "Flagged";
  scheduledAt: string;
  endsAt: string | null;
  location: string | null;
  pitstops: { pitstop: PitstopRef }[];
  createdBy: User;
  attendees: Attendee[];
};
type ViewMode = "day" | "week" | "month";
type ExternalCalEvent = {
  uid: string;
  title: string;
  start: string;
  end: string;
  location: string | null;
  allDay: boolean;
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
function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function getWeekStart(d: Date) {
  const date = new Date(d);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  date.setHours(12, 0, 0, 0);
  return date;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function AvatarSmall({ user, size = 5 }: { user: User; size?: number }) {
  const cls = `w-${size} h-${size} rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-semibold bg-stone-200 text-stone-600 overflow-hidden`;
  if (user.image) return <img src={user.image} className={cls} alt={user.name ?? ""} />;
  return <span className={cls}>{(user.name ?? "?")[0].toUpperCase()}</span>;
}

function GoalPicker({ goals, selected, onChange }: {
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
    const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); onChange(next);
  };
  const label = selected.size === 0 ? "All Goals"
    : selected.size === 1 ? (goals.find(g => selected.has(g.id))?.title ?? "1 goal")
    : `${selected.size} goals`;
  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors ${selected.size > 0 ? "border-sky-400 bg-sky-50 text-sky-700" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}>
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown className="w-3 h-3 opacity-60 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-72 bg-white border border-stone-200 rounded-xl shadow-xl overflow-hidden">
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

// ── Create / Edit modal ───────────────────────────────────────────────────────

function EventModal({ pitstops, users, initial, defaultDate, onClose, onSaved }: {
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
  const [isMultiDay, setIsMultiDay] = useState(!!(initial?.endsAt));
  const [endDate, setEndDate] = useState(initial?.endsAt ? initial.endsAt.slice(0,10) : "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [selectedPitstopIds, setSelectedPitstopIds] = useState<Set<string>>(
    new Set(initial?.pitstops?.map(p => p.pitstop.id) ?? [])
  );

  const ownerIds = new Set(
    pitstops.filter(p => selectedPitstopIds.has(p.id)).map(p => p.owner.id)
  );
  const initialExtraIds = initial
    ? initial.attendees.filter(a => !ownerIds.has(a.userId)).map(a => a.userId)
    : [];
  const [extraAttendeeIds, setExtraAttendeeIds] = useState<Set<string>>(new Set(initialExtraIds));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const extraCandidates = users.filter(u => !ownerIds.has(u.id));

  const toggleExtra = (uid: string) => {
    setExtraAttendeeIds(prev => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) { setError("Title and date are required."); return; }
    if (selectedPitstopIds.size === 0) { setError("Select at least one pitstop."); return; }
    setLoading(true); setError("");
    const scheduledAt = `${date}T${time}:00`;
    const endsAt = isMultiDay && endDate && endDate > date ? `${endDate}T23:59:00` : null;
    const attendeeIds = Array.from(extraAttendeeIds);
    const body = { title: title.trim(), description: description.trim() || null, type, scheduledAt, endsAt, location: location.trim() || null, pitstopIds: Array.from(selectedPitstopIds), attendeeIds };
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
            <label className="block text-xs font-medium text-stone-600 mb-1">
              Pitstops <span className="text-red-400">*</span>
            </label>
            <PitstopMultiPicker
              pitstops={pitstops}
              users={users}
              selected={selectedPitstopIds}
              onChange={(s) => { setSelectedPitstopIds(s); setExtraAttendeeIds(new Set()); }}
              required
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-stone-600 mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value as "Meeting"|"Visit"|"Event")}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                <option>Meeting</option><option>Visit</option><option>Event</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-stone-600 mb-1">Start Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-stone-600 mb-1">Time</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
          </div>
          {/* Multi-day toggle */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setIsMultiDay(v => !v); setEndDate(""); }}
              className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${isMultiDay ? "bg-sky-500" : "bg-stone-200"}`}>
              <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${isMultiDay ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
            <span className="text-xs text-stone-600">Multi-day</span>
            {isMultiDay && (
              <div className="flex-1 ml-2">
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  min={date} placeholder="End date"
                  className="w-full px-3 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Location (optional)</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Village name, address…"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          {selectedPitstopIds.size > 0 && extraCandidates.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">Additional Attendees (optional)</label>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {extraCandidates.map(u => {
                  const checked = extraAttendeeIds.has(u.id);
                  return (
                    <button key={u.id} type="button" onClick={() => toggleExtra(u.id)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border transition-colors ${checked ? "bg-sky-50 border-sky-400 text-sky-700" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>
                      <AvatarSmall user={u} size={4} />
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
            <button type="submit" disabled={!title.trim() || !date || selectedPitstopIds.size === 0 || loading}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {loading ? "Saving…" : initial ? "Save changes" : "Create Event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Event card (shared across views) ─────────────────────────────────────────

type EventThread = {
  id: string; name: string;
  messages: { id: string; body: string; createdAt: string; author: User; attachments: { id: string; name: string; url: string }[] }[];
};

function EventThreadPanel({ eventId, currentUserId, users }: { eventId: string; currentUserId: string; users: User[] }) {
  const [threads, setThreads] = useState<EventThread[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    fetch(`/api/pitstop-events/${eventId}/threads`)
      .then(r => r.json())
      .then((ts: EventThread[]) => {
        setThreads(ts);
        if (ts.length > 0) setActiveId(ts[0].id);
      });
  }, [eventId]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch(`/api/pitstop-events/${eventId}/threads`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setCreating(false);
    if (res.ok) {
      const t: EventThread = await res.json();
      setThreads(prev => [...(prev ?? []), t]);
      setActiveId(t.id);
      setShowNew(false);
      setNewName("");
    }
  };

  const handleSend = async () => {
    if (!body.trim() || !activeId) return;
    setSending(true);
    const res = await fetch(`/api/threads/${activeId}/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.trim(), attachmentIds: [] }),
    });
    setSending(false);
    if (res.ok) {
      const msg = await res.json();
      setThreads(prev => prev?.map(t => t.id === activeId ? { ...t, messages: [...t.messages, msg] } : t) ?? null);
      setBody("");
    }
  };

  const activeThread = threads?.find(t => t.id === activeId) ?? null;

  if (threads === null) return <p className="text-xs text-stone-400 py-2 px-1">Loading…</p>;

  return (
    <div className="mt-2 border-t border-white/40 pt-2">
      {/* Thread tabs */}
      <div className="flex items-center gap-1 flex-wrap mb-2">
        {threads.map(t => (
          <button key={t.id} onClick={() => setActiveId(t.id)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${t.id === activeId ? "bg-white/60 text-stone-800" : "text-stone-600 hover:bg-white/40"}`}>
            {t.name} <span className="opacity-60">({t.messages.length})</span>
          </button>
        ))}
        {showNew ? (
          <div className="flex items-center gap-1">
            <input value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") { setShowNew(false); setNewName(""); } }}
              placeholder="Thread name" autoFocus
              className="px-2 py-0.5 text-[10px] rounded-full border border-white/60 bg-white/40 focus:outline-none w-28" />
            <button onClick={handleCreate} disabled={creating || !newName.trim()}
              className="text-[10px] px-2 py-0.5 bg-white/60 rounded-full disabled:opacity-40">OK</button>
            <button onClick={() => { setShowNew(false); setNewName(""); }} className="text-[10px] opacity-60 hover:opacity-100">✕</button>
          </div>
        ) : (
          <button onClick={() => setShowNew(true)}
            className="px-2 py-0.5 rounded-full text-[10px] text-stone-500 hover:bg-white/40 transition-colors">
            + Thread
          </button>
        )}
      </div>

      {/* Messages */}
      {activeThread && (
        <div className="space-y-2 mb-2 max-h-40 overflow-y-auto">
          {activeThread.messages.length === 0 ? (
            <p className="text-[10px] text-stone-500 opacity-70">No messages. Start the discussion.</p>
          ) : activeThread.messages.map(msg => {
            const isOwn = msg.author.id === currentUserId;
            return (
              <div key={msg.id} className={`flex gap-1.5 ${isOwn ? "flex-row-reverse" : ""}`}>
                <Avatar name={msg.author.name} image={msg.author.image} size="xs" />
                <div className={`max-w-[80%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                  <span className={`text-[10px] opacity-60 mb-0.5 ${isOwn ? "text-right" : ""}`}>{msg.author.name}</span>
                  <div className={`px-2.5 py-1.5 rounded-xl text-xs whitespace-pre-wrap break-words ${isOwn ? "bg-white/70 text-stone-800 rounded-tr-sm" : "bg-black/10 text-stone-800 rounded-tl-sm"}`}>
                    {msg.body}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Composer */}
      {activeThread && (
        <div className="flex items-center gap-1.5">
          <input value={body} onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Message… (↵ to send)"
            className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-white/50 bg-white/40 placeholder:opacity-50 focus:outline-none focus:bg-white/60" />
          <button onClick={handleSend} disabled={sending || !body.trim()}
            className="p-1.5 bg-white/60 hover:bg-white/80 rounded-lg disabled:opacity-40 transition-colors">
            <Send className="w-3 h-3 text-stone-700" />
          </button>
        </div>
      )}

      {threads.length === 0 && !showNew && (
        <p className="text-[10px] text-stone-500 opacity-70">No threads yet.</p>
      )}
    </div>
  );
}

function EventCard({ ev, onEdit, onDelete, currentUserId, users }: {
  ev: PitstopEvent; onEdit: () => void; onDelete: () => void;
  currentUserId: string; users: User[];
}) {
  const [showThreads, setShowThreads] = useState(false);
  const isCancelled = ev.status === "Cancelled";
  const isDone = ev.status === "Done";
  const isFlagged = ev.status === "Flagged";
  return (
    <div className={`px-3 py-2.5 rounded-xl border ${isCancelled ? "bg-stone-50 border-stone-200 opacity-60" : TYPE_COLORS[ev.type]}`}>
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className={`text-sm font-semibold leading-snug ${isCancelled ? "line-through text-stone-400" : ""}`}>{ev.title}</p>
            {isDone && <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">Done</span>}
            {isFlagged && <span className="text-[10px] font-medium text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">Flagged</span>}
            {isCancelled && <span className="text-[10px] font-medium text-stone-400 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded-full">Cancelled</span>}
          </div>
          <p className="text-xs opacity-70 mt-0.5">
            {ev.endsAt
              ? `${fmtDate(ev.scheduledAt)} – ${fmtDate(ev.endsAt)} · ${ev.type}`
              : `${fmtTime(ev.scheduledAt)} · ${ev.type}`}
          </p>
          {ev.location && (
            <p className="flex items-center gap-0.5 text-xs opacity-70 mt-0.5">
              <MapPin className="w-3 h-3" />{ev.location}
            </p>
          )}
          {ev.description && <p className="text-xs opacity-60 mt-1 leading-relaxed line-clamp-2">{ev.description}</p>}
          {ev.pitstops.length > 0 && (
            <div className="flex flex-col gap-0.5 mt-1">
              {ev.pitstops.map(({ pitstop }) => (
                <Link key={pitstop.id} href={`/goals/${pitstop.goal.id}/pitstops/${pitstop.id}`}
                  className="flex items-center gap-0.5 text-xs opacity-70 hover:opacity-100">
                  <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                  <span className="truncate">{pitstop.goal.title} › {pitstop.title}</span>
                </Link>
              ))}
            </div>
          )}
          {ev.attendees.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              {ev.attendees.slice(0, 5).map(a => (
                <AvatarSmall key={a.id} user={a.user} size={4} />
              ))}
              {ev.attendees.length > 5 && <span className="text-[10px] opacity-60">+{ev.attendees.length - 5}</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setShowThreads(v => !v)}
            title="Threads"
            className={`p-1 transition-opacity ${showThreads ? "opacity-100 text-stone-700" : "opacity-60"}`}>
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
          <button onClick={onEdit} className="p-1 opacity-40 hover:opacity-100 transition-opacity">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1 opacity-40 hover:opacity-100 hover:text-red-500 transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {showThreads && (
        <EventThreadPanel eventId={ev.id} currentUserId={currentUserId} users={users} />
      )}
    </div>
  );
}

// ── External event card (read-only, grey) ────────────────────────────────────

function ExternalEventCard({ ev }: { ev: ExternalCalEvent }) {
  const time = ev.allDay ? "All day" : fmtTime(ev.start);
  return (
    <div className="px-3 py-2.5 rounded-xl border bg-stone-50 border-stone-200 opacity-80">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide">My Calendar</span>
            <span className="text-[10px] text-stone-400">{time}</span>
          </div>
          <p className="text-sm font-semibold text-stone-500 leading-snug">{ev.title}</p>
          {ev.location && (
            <div className="flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3 text-stone-400 flex-shrink-0" />
              <span className="text-xs text-stone-400 truncate">{ev.location}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Needs Action panel ────────────────────────────────────────────────────────

type ActionType = "complete" | "reschedule" | "cancel" | null;

function NeedsActionPanel({ events, currentUserId, onUpdated }: {
  events: PitstopEvent[];
  currentUserId: string;
  onUpdated: (id: string, patch: Partial<PitstopEvent>) => void;
}) {
  const todayYMD = toYMD(new Date());
  const actionable = events.filter(ev =>
    ev.status === "Scheduled" &&
    ev.scheduledAt.slice(0, 10) <= todayYMD &&
    ev.attendees.some(a => a.userId === currentUserId)
  ).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  const [active, setActive] = useState<{ id: string; action: ActionType }>({ id: "", action: null });
  const [reason, setReason] = useState("");
  const [newDate, setNewDate] = useState("");
  const [busy, setBusy] = useState(false);

  if (actionable.length === 0) return null;

  const dismiss = () => { setActive({ id: "", action: null }); setReason(""); setNewDate(""); };

  const handleAction = async (eventId: string, action: Exclude<ActionType, null>) => {
    setBusy(true);
    const body: Record<string, unknown> = {};
    if (action === "complete") body.status = "Done";
    else if (action === "cancel") { body.status = "Cancelled"; body.cancellationReason = reason.trim() || null; }
    else if (action === "reschedule") { body.reschedule = true; body.scheduledAt = `${newDate}T09:00:00`; body.rescheduleReason = reason.trim() || null; }

    const res = await fetch(`/api/pitstop-events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) {
      const updated = await res.json();
      onUpdated(eventId, updated);
      dismiss();
    }
  };

  return (
    <div className="px-4 sm:px-6 py-3 border-b border-amber-100 bg-amber-50">
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
        <p className="text-xs font-semibold text-amber-800">Needs Action — {actionable.length} scheduled {actionable.length === 1 ? "activity" : "activities"} need logging</p>
      </div>
      <div className="space-y-2">
        {actionable.map(ev => {
          const isOverdue = ev.scheduledAt.slice(0, 10) < todayYMD;
          const isExpanded = active.id === ev.id;
          return (
            <div key={ev.id} className="bg-white rounded-lg border border-amber-200 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border flex-shrink-0 ${isOverdue ? "text-red-600 bg-red-50 border-red-200" : "text-amber-600 bg-amber-50 border-amber-200"}`}>
                      {isOverdue ? "Overdue" : "Today"}
                    </span>
                    <p className="text-xs font-semibold text-stone-800 truncate">{ev.title}</p>
                  </div>
                  {ev.pitstops.length > 0 && (
                    <p className="text-[10px] text-stone-400 mt-0.5 truncate">{ev.pitstops[0].pitstop.goal.title} › {ev.pitstops[0].pitstop.title}</p>
                  )}
                </div>
                {!isExpanded && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => { setActive({ id: ev.id, action: "complete" }); setReason(""); setNewDate(""); }}
                      className="px-2 py-1 text-[10px] font-medium bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-md transition-colors">
                      Done
                    </button>
                    <button onClick={() => { setActive({ id: ev.id, action: "reschedule" }); setReason(""); setNewDate(""); }}
                      className="px-2 py-1 text-[10px] font-medium bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 rounded-md transition-colors">
                      Reschedule
                    </button>
                    <button onClick={() => { setActive({ id: ev.id, action: "cancel" }); setReason(""); setNewDate(""); }}
                      className="px-2 py-1 text-[10px] font-medium bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-600 rounded-md transition-colors">
                      Cancel
                    </button>
                  </div>
                )}
                {isExpanded && (
                  <button onClick={dismiss} className="text-stone-400 hover:text-stone-600 flex-shrink-0 p-0.5">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {isExpanded && active.action && (
                <div className="border-t border-amber-100 bg-stone-50 px-3 py-2 space-y-2">
                  {active.action === "complete" && (
                    <p className="text-xs text-stone-600">Mark this activity as <span className="font-semibold text-emerald-700">Done</span>. This will also update the linked checklist item.</p>
                  )}
                  {active.action === "reschedule" && (
                    <div>
                      <label className="block text-[10px] font-medium text-stone-500 mb-1">New date <span className="text-red-400">*</span></label>
                      <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white" />
                    </div>
                  )}
                  {(active.action === "reschedule" || active.action === "cancel") && (
                    <div>
                      <label className="block text-[10px] font-medium text-stone-500 mb-1">
                        Reason {active.action === "cancel" ? "" : "(optional)"}
                      </label>
                      <input type="text" value={reason} onChange={e => setReason(e.target.value)}
                        placeholder={active.action === "cancel" ? "Why was this cancelled?" : "Why is this being rescheduled?"}
                        className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white" />
                    </div>
                  )}
                  <div className="flex justify-end gap-1.5">
                    <button type="button" onClick={dismiss} className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700 transition-colors">
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={busy || (active.action === "reschedule" && !newDate)}
                      onClick={() => handleAction(ev.id, active.action!)}
                      className={`px-3 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-50 transition-colors ${
                        active.action === "complete" ? "bg-emerald-500 hover:bg-emerald-600" :
                        active.action === "reschedule" ? "bg-sky-500 hover:bg-sky-600" :
                        "bg-stone-500 hover:bg-stone-600"
                      }`}
                    >
                      {busy ? "Saving…" : active.action === "complete" ? "Mark Done" : active.action === "reschedule" ? "Reschedule" : "Cancel Activity"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main calendar ─────────────────────────────────────────────────────────────

type ZoneGeo    = { id: string; name: string; goals: { goalId: string }[] };
type ClusterGeo = { id: string; name: string; zone: { name: string }; goals: { goalId: string }[] };

export default function EventsCalendar({ events: initialEvents, pitstops, users, currentUserId, zones = [], clusters = [], calendarToken = null }: {
  events: PitstopEvent[];
  pitstops: PitstopRef[];
  users: User[];
  currentUserId: string;
  zones?: ZoneGeo[];
  clusters?: ClusterGeo[];
  calendarToken?: string | null;
}) {
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [anchorDate, setAnchorDate] = useState(today);
  const [events, setEvents] = useState(initialEvents);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editEvent, setEditEvent] = useState<PitstopEvent | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedGoals, setSelectedGoals] = useState<Set<string>>(new Set());
  const [geoFilter, setGeoFilter] = useState<{ type: "zone" | "cluster"; id: string; name: string } | null>(null);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [copied, setCopied] = useState(false);
  const subscribeRef = useRef<HTMLDivElement>(null);
  const [externalEvents, setExternalEvents] = useState<ExternalCalEvent[]>([]);

  // Close subscribe panel on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (subscribeRef.current && !subscribeRef.current.contains(e.target as Node)) setShowSubscribe(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Fetch external calendar events (personal Outlook/Google iCal)
  useEffect(() => {
    fetch("/api/calendar/external")
      .then(r => r.json())
      .then(d => { if (d.events) setExternalEvents(d.events); })
      .catch(() => {});
  }, []);

  const feedUrl = calendarToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/calendar/feed.ics?token=${calendarToken}`
    : null;

  function copyFeedUrl() {
    if (!feedUrl) return;
    navigator.clipboard.writeText(feedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const allGoals = Array.from(new Map(pitstops.map(p => [p.goal.id, p.goal])).values())
    .sort((a, b) => a.title.localeCompare(b.title));

  // Build goalId → zone/cluster membership maps
  const goalZoneMap = new Map<string, Set<string>>();
  const goalClusterMap = new Map<string, Set<string>>();
  zones.forEach(z => z.goals.forEach(g => {
    if (!goalZoneMap.has(g.goalId)) goalZoneMap.set(g.goalId, new Set());
    goalZoneMap.get(g.goalId)!.add(z.id);
  }));
  clusters.forEach(c => c.goals.forEach(g => {
    if (!goalClusterMap.has(g.goalId)) goalClusterMap.set(g.goalId, new Set());
    goalClusterMap.get(g.goalId)!.add(c.id);
  }));

  const filteredEvents = events.filter(ev => {
    if (selectedUsers.size > 0) {
      const ids = new Set(ev.attendees.map(a => a.userId));
      if (![...selectedUsers].some(uid => ids.has(uid))) return false;
    }
    if (selectedGoals.size > 0 && !ev.pitstops.some(({ pitstop }) => selectedGoals.has(pitstop.goal.id))) return false;
    if (geoFilter) {
      const map = geoFilter.type === "zone" ? goalZoneMap : goalClusterMap;
      const matches = ev.pitstops.some(({ pitstop }) => map.get(pitstop.goal.id)?.has(geoFilter.id));
      if (!matches) return false;
    }
    return true;
  });

  const eventMap = new Map<string, PitstopEvent[]>();
  for (const ev of filteredEvents) {
    const ymd = ev.scheduledAt.slice(0, 10);
    if (!eventMap.has(ymd)) eventMap.set(ymd, []);
    eventMap.get(ymd)!.push(ev);
  }

  const extEventMap = new Map<string, ExternalCalEvent[]>();
  for (const ev of externalEvents) {
    const ymd = ev.start.slice(0, 10);
    if (!extEventMap.has(ymd)) extEventMap.set(ymd, []);
    extEventMap.get(ymd)!.push(ev);
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
  const goToday = () => { setAnchorDate(today); setSelectedDate(todayYMD); };

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
  const lastDay  = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalCells  = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const cells: (Date | null)[] = Array.from({ length: totalCells }, (_, i) => {
    const d = i - startOffset + 1;
    return d < 1 || d > lastDay.getDate() ? null : new Date(year, month, d);
  });

  const selectedDayEvents = selectedDate
    ? (eventMap.get(selectedDate) ?? []).sort((a,b) => a.scheduledAt.localeCompare(b.scheduledAt))
    : [];

  // Week view
  const weekStart = getWeekStart(anchorDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Day view
  const dayYMD = toYMD(anchorDate);
  const dayEvents = (eventMap.get(dayYMD) ?? []).sort((a,b) => a.scheduledAt.localeCompare(b.scheduledAt));

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

  const handleEventUpdate = (id: string, patch: Partial<PitstopEvent>) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  };

  const hasFilters = selectedUsers.size > 0 || selectedGoals.size > 0 || !!geoFilter;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-stone-100">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-stone-900">Activities</h1>
            <Link href="/timeline"
              className="hidden sm:flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition-colors">
              <CalendarClock className="w-3.5 h-3.5" /> Pitstop Timeline
            </Link>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <ViewSwitcher view={viewMode} onChange={v => { setViewMode(v); setSelectedDate(null); }} />
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" /> New
            </button>
            {/* Subscribe to calendar feed */}
            {feedUrl && (
              <div ref={subscribeRef} className="relative">
                <button
                  onClick={() => setShowSubscribe(o => !o)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-lg transition-colors ${showSubscribe ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50"}`}
                  title="Subscribe to calendar"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Subscribe</span>
                </button>
                {showSubscribe && (
                  <div className="absolute top-full right-0 mt-2 z-50 w-80 bg-white border border-stone-200 rounded-xl shadow-xl p-4 space-y-3">
                    <div>
                      <p className="text-xs font-bold text-stone-800 mb-0.5">Sync to your calendar</p>
                      <p className="text-[11px] text-stone-400">Auto-updates in any iCal app. Copy the URL and subscribe manually — the one-click links below lose auth after sign-in.</p>
                    </div>

                    {/* Feed URL + copy */}
                    <div className="flex items-center gap-1.5">
                      <input
                        readOnly
                        value={feedUrl}
                        className="flex-1 text-[10px] text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-2 py-1.5 font-mono truncate focus:outline-none"
                        onClick={e => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        onClick={copyFeedUrl}
                        className={`flex-shrink-0 px-2 py-1.5 text-[10px] font-semibold rounded-lg border transition-colors ${copied ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "border-stone-200 text-stone-600 hover:bg-stone-50"}`}
                      >
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    </div>

                    {/* Outlook instructions */}
                    <div className="rounded-lg bg-stone-50 border border-stone-100 p-3 space-y-1">
                      <p className="text-[11px] font-semibold text-stone-700 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                          <rect x="2" y="2" width="9" height="9" rx="1.5" fill="#f25022"/>
                          <rect x="13" y="2" width="9" height="9" rx="1.5" fill="#7fba00"/>
                          <rect x="2" y="13" width="9" height="9" rx="1.5" fill="#00a4ef"/>
                          <rect x="13" y="13" width="9" height="9" rx="1.5" fill="#ffb900"/>
                        </svg>
                        Outlook
                      </p>
                      <ol className="text-[10px] text-stone-500 space-y-0.5 list-none">
                        <li>1. Copy the URL above</li>
                        <li>2. Open Outlook → Calendar</li>
                        <li>3. <span className="font-medium">Add calendar → Subscribe from web</span></li>
                        <li>4. Paste the URL → Subscribe</li>
                      </ol>
                    </div>

                    {/* Google Calendar */}
                    <a
                      href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-stone-200 text-xs font-medium text-stone-700 hover:bg-stone-50 transition-colors"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                        <path d="M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#1a73e8"/>
                        <path d="M8 10h8M8 14h5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                      </svg>
                      Add to Google Calendar
                    </a>

                    <p className="text-[10px] text-stone-300">This URL is personal — don&apos;t share it.</p>
                  </div>
                )}
              </div>
            )}
            <button onClick={goToday} className="px-2.5 py-1 text-xs font-medium text-stone-600 border border-stone-200 rounded-md hover:bg-stone-50 transition-colors">
              Today
            </button>
            <div className="flex items-center gap-0.5">
              <button onClick={() => navigate(-1)} className="p-1.5 rounded-md text-stone-400 hover:bg-stone-100"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-xs font-semibold text-stone-800 min-w-[100px] sm:min-w-[140px] text-center whitespace-nowrap">{headerLabel}</span>
              <button onClick={() => navigate(1)} className="p-1.5 rounded-md text-stone-400 hover:bg-stone-100"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* User pills — scrollable on mobile */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-shrink-0 max-w-full">
            <button onClick={() => setSelectedUsers(new Set())}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors flex-shrink-0 ${selectedUsers.size === 0 ? "bg-stone-800 text-white border-stone-800" : "border-stone-200 text-stone-500 hover:border-stone-300"}`}>
              All
            </button>
            {users.map(u => {
              const active = selectedUsers.has(u.id);
              return (
                <button key={u.id} onClick={() => {
                  const next = new Set(selectedUsers);
                  active ? next.delete(u.id) : next.add(u.id);
                  setSelectedUsers(next);
                }} className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-colors flex-shrink-0 ${active ? "bg-sky-500 text-white border-sky-500" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>
                  <AvatarSmall user={u} size={3} />
                  {u.name ?? "User"}
                </button>
              );
            })}
          </div>
          <div className="w-px h-4 bg-stone-200 flex-shrink-0" />
          {/* GoalPicker is outside overflow container so its dropdown isn't clipped */}
          <GoalPicker goals={allGoals} selected={selectedGoals} onChange={setSelectedGoals} />
          {(zones.length > 0 || clusters.length > 0) && (
            <>
              <div className="w-px h-4 bg-stone-200 flex-shrink-0" />
              <select
                value={geoFilter ? `${geoFilter.type}:${geoFilter.id}` : ""}
                onChange={e => {
                  if (!e.target.value) { setGeoFilter(null); return; }
                  const [type, id] = e.target.value.split(":");
                  const name = type === "zone"
                    ? zones.find(z => z.id === id)?.name ?? id
                    : clusters.find(c => c.id === id)?.name ?? id;
                  setGeoFilter({ type: type as "zone" | "cluster", id, name });
                }}
                className={`flex-shrink-0 px-2.5 py-1 text-xs border rounded-lg transition-colors outline-none ${geoFilter ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}
              >
                <option value="">All Areas</option>
                {zones.length > 0 && (
                  <optgroup label="Zones">
                    {zones.map(z => <option key={z.id} value={`zone:${z.id}`}>{z.name} Zone</option>)}
                  </optgroup>
                )}
                {clusters.length > 0 && (
                  <optgroup label="Clusters">
                    {clusters.map(c => (
                      <option key={c.id} value={`cluster:${c.id}`}>
                        {c.name.replace(/_/g, " ")} ({c.zone.name})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </>
          )}
          {hasFilters && (
            <button onClick={() => { setSelectedUsers(new Set()); setSelectedGoals(new Set()); setGeoFilter(null); }}
              className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 flex-shrink-0">
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      <NeedsActionPanel events={events} currentUserId={currentUserId} onUpdated={handleEventUpdate} />

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
                if (!date) return <div key={i} className="bg-stone-50 min-h-[48px] sm:min-h-[96px]" />;
                const ymd = toYMD(date);
                const dayEvs = eventMap.get(ymd) ?? [];
                const extEvs = extEventMap.get(ymd) ?? [];
                const isToday = ymd === todayYMD;
                const isSelected = ymd === selectedDate;
                return (
                  <button key={i} onClick={() => setSelectedDate(p => p === ymd ? null : ymd)}
                    className={`min-h-[48px] sm:min-h-[96px] bg-white p-1 sm:p-1.5 text-left flex flex-col transition-colors hover:bg-stone-50 ${isSelected ? "bg-sky-50 hover:bg-sky-50" : ""} ${date.getMonth() !== month ? "opacity-40" : ""}`}>
                    <span className={`text-[10px] sm:text-xs font-medium mb-0.5 sm:mb-1 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full flex-shrink-0 ${isToday ? "bg-sky-500 text-white" : "text-stone-600"}`}>
                      {date.getDate()}
                    </span>
                    {/* Mobile: dots */}
                    <div className="flex flex-wrap gap-0.5 sm:hidden">
                      {dayEvs.slice(0, 3).map((ev, ei) => (
                        <span key={ei} className={`w-1.5 h-1.5 rounded-full ${TYPE_DOT[ev.type]}`} />
                      ))}
                      {extEvs.slice(0, 2).map((ev) => (
                        <span key={ev.uid} className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                      ))}
                    </div>
                    {/* Desktop: labels */}
                    <div className="hidden sm:flex flex-1 flex-col space-y-0.5 overflow-hidden">
                      {dayEvs.slice(0, 3).map((ev, ei) => (
                        <div key={ei} className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] border truncate ${ev.status === "Cancelled" ? "bg-stone-50 border-stone-200 opacity-50" : TYPE_COLORS[ev.type]}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ev.status === "Done" ? "bg-emerald-400" : ev.status === "Flagged" ? "bg-red-400" : ev.status === "Cancelled" ? "bg-stone-300" : TYPE_DOT[ev.type]}`} />
                          <span className={`truncate ${ev.status === "Cancelled" ? "line-through" : ""}`}>{ev.title}</span>
                        </div>
                      ))}
                      {extEvs.slice(0, dayEvs.length < 3 ? 3 - dayEvs.length : 0).map((ev) => (
                        <div key={ev.uid} className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] border truncate bg-stone-50 border-stone-200 text-stone-500 italic">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-stone-400" />
                          <span className="truncate">{ev.title}</span>
                        </div>
                      ))}
                      {(dayEvs.length + extEvs.length > 3) && <p className="text-[10px] text-stone-400 px-1">+{dayEvs.length + extEvs.length - 3}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-stone-500">
              {(["Meeting","Visit","Event"] as const).map(t => (
                <div key={t} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${TYPE_DOT[t]}`} />
                  <span className="hidden sm:inline">{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Day panel */}
          {selectedDate && (
            <div className="fixed inset-x-0 bottom-16 sm:bottom-auto sm:static z-30 sm:w-80 sm:flex-shrink-0 sm:border-l border-stone-200 bg-white flex flex-col overflow-hidden rounded-t-2xl sm:rounded-none shadow-xl sm:shadow-none max-h-[65vh] sm:max-h-none">
              <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-stone-800">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })}
                  </p>
                  <p className="text-[11px] text-stone-400 mt-0.5">{selectedDayEvents.length} event{selectedDayEvents.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setShowCreate(true)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs text-sky-600 hover:bg-sky-50 rounded-md">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                  <button onClick={() => setSelectedDate(null)} className="p-1.5 text-stone-400 hover:text-stone-600 rounded-md hover:bg-stone-100">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                {selectedDayEvents.length === 0 && (extEventMap.get(selectedDate) ?? []).length === 0 ? (
                  <p className="text-xs text-stone-400 text-center py-8">No activities. Tap Add to schedule one.</p>
                ) : null}
                {selectedDayEvents.map(ev => (
                  <EventCard key={ev.id} ev={ev} onEdit={() => setEditEvent(ev)} onDelete={() => handleDelete(ev.id)} currentUserId={currentUserId} users={users} />
                ))}
                {(extEventMap.get(selectedDate) ?? []).map(ev => (
                  <ExternalEventCard key={ev.uid} ev={ev} />
                ))}
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
              const dayEvs = (eventMap.get(ymd) ?? []).sort((a,b) => a.scheduledAt.localeCompare(b.scheduledAt));
              const extEvs = (extEventMap.get(ymd) ?? []).sort((a,b) => a.start.localeCompare(b.start));
              const isToday = ymd === todayYMD;
              return (
                <div key={ymd}>
                  <div className={`flex items-center gap-2 mb-2 pb-1.5 border-b ${isToday ? "border-sky-200" : "border-stone-100"}`}>
                    <span className={`text-xs font-semibold uppercase tracking-wider ${isToday ? "text-sky-600" : "text-stone-500"}`}>
                      {d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}
                    </span>
                    {isToday && <span className="text-[10px] bg-sky-100 text-sky-600 px-1.5 py-0.5 rounded-full font-medium">Today</span>}
                    <button onClick={() => { setSelectedDate(ymd); setShowCreate(true); }}
                      className="ml-auto text-[11px] text-stone-400 hover:text-sky-600 flex items-center gap-0.5 transition-colors">
                      <Plus className="w-3 h-3" /> Add
                    </button>
                    {dayEvs.length === 0 && extEvs.length === 0 && <span className="text-[11px] text-stone-300">nothing scheduled</span>}
                  </div>
                  {(dayEvs.length > 0 || extEvs.length > 0) && (
                    <div className="space-y-2">
                      {dayEvs.map(ev => (
                        <EventCard key={ev.id} ev={ev} onEdit={() => setEditEvent(ev)} onDelete={() => handleDelete(ev.id)} currentUserId={currentUserId} users={users} />
                      ))}
                      {extEvs.map(ev => (
                        <ExternalEventCard key={ev.uid} ev={ev} />
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
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-stone-400">{dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}</p>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium rounded-lg transition-colors">
                <Plus className="w-3.5 h-3.5" /> New Event
              </button>
            </div>
            {dayEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <CalendarClock className="w-12 h-12 text-stone-200 mb-3" />
                <p className="text-sm text-stone-400">No activities scheduled for this day.</p>
                <p className="text-xs text-stone-300 mt-1">Use ‹ › to navigate days.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {dayEvents.map(ev => (
                  <EventCard key={ev.id} ev={ev} onEdit={() => setEditEvent(ev)} onDelete={() => handleDelete(ev.id)} currentUserId={currentUserId} users={users} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {(showCreate || editEvent) && (
        <EventModal
          pitstops={pitstops}
          users={users}
          initial={editEvent ?? undefined}
          defaultDate={selectedDate ?? (viewMode === "day" ? dayYMD : undefined)}
          onClose={() => { setShowCreate(false); setEditEvent(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
