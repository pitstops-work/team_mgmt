"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Plus, X, Pencil, Trash2, ChevronDown, ChevronRight, MapPin, ExternalLink } from "lucide-react";
import Avatar from "@/components/Avatar";

// ── Types ─────────────────────────────────────────────────────────────────────

type User = { id: string; name: string | null; image: string | null; email: string | null };
type GoalRef = { id: string; title: string };
type PitstopRef = { id: string; title: string; goal: GoalRef; owner?: { id: string; name: string | null } | null };

type Pitstop = {
  id: string; title: string; status: string; type: string;
  startDate: string | null; targetDate: string | null;
  goal: GoalRef;
  owner: { id: string; name: string | null; image: string | null } | null;
};

type Activity = {
  id: string; title: string; type: string; scheduledAt: string; location: string | null;
  pitstop: { id: string; title: string; goal: GoalRef } | null;
  attendees: { userId: string; user: { id: string; name: string | null; image: string | null } }[];
};

type PlanItem = {
  id: string; title: string; description: string | null;
  date: string; type: string;
  pitstop: { id: string; title: string; goal: GoalRef } | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PLAN_ITEM_TYPES = ["Meeting", "Visit", "Review", "Internal", "Data Work", "Proposal", "Note"];

const PLAN_TYPE_COLOR: Record<string, string> = {
  Meeting:  "bg-sky-50 border-sky-200 text-sky-800",
  Visit:    "bg-violet-50 border-violet-200 text-violet-800",
  Review:   "bg-amber-50 border-amber-200 text-amber-800",
  Internal: "bg-stone-50 border-stone-300 text-stone-700",
  "Data Work": "bg-emerald-50 border-emerald-200 text-emerald-800",
  Proposal: "bg-pink-50 border-pink-200 text-pink-800",
  Note:     "bg-white border-stone-200 text-stone-600",
};

const PLAN_TYPE_DOT: Record<string, string> = {
  Meeting:  "bg-sky-400",
  Visit:    "bg-violet-400",
  Review:   "bg-amber-400",
  Internal: "bg-stone-400",
  "Data Work": "bg-emerald-400",
  Proposal: "bg-pink-400",
  Note:     "bg-stone-300",
};

const ACT_TYPE_DOT: Record<string, string> = {
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
  Upcoming: "bg-stone-50 border-stone-200 text-stone-600",
};

const QUARTERS = ["Q1 (Jan–Mar)", "Q2 (Apr–Jun)", "Q3 (Jul–Sep)", "Q4 (Oct–Dec)"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function getQuarterWeeks(year: number, quarter: number): { start: Date; end: Date; label: string; weekNum: number }[] {
  const qMonthStart = (quarter - 1) * 3;
  const qStart = new Date(year, qMonthStart, 1);
  qStart.setHours(12, 0, 0, 0);

  // Start from Monday of the week containing qStart
  const offset = (qStart.getDay() + 6) % 7;
  const firstMonday = new Date(qStart);
  firstMonday.setDate(firstMonday.getDate() - offset);

  const qEnd = new Date(year, qMonthStart + 3, 1);

  const weeks: { start: Date; end: Date; label: string; weekNum: number }[] = [];
  let cur = new Date(firstMonday);
  let weekNum = 1;

  while (cur < qEnd) {
    const start = new Date(cur);
    const end = new Date(cur);
    end.setDate(end.getDate() + 6);

    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    weeks.push({
      start, end,
      label: `${fmt(start)} – ${fmt(end)}`,
      weekNum,
    });

    cur.setDate(cur.getDate() + 7);
    weekNum++;
  }

  return weeks;
}

function inWeek(dateStr: string, weekStart: Date, weekEnd: Date) {
  const d = new Date(dateStr);
  return d >= weekStart && d <= weekEnd;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ── Add / Edit plan item modal ────────────────────────────────────────────────

function PlanItemModal({
  initial,
  defaultDate,
  pitstops,
  targetUserId,
  onClose,
  onSaved,
}: {
  initial?: PlanItem;
  defaultDate: string;
  pitstops: PitstopRef[];
  targetUserId: string;
  onClose: () => void;
  onSaved: (item: PlanItem) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [date, setDate] = useState(initial?.date?.slice(0, 10) ?? defaultDate);
  const [type, setType] = useState(initial?.type ?? "Note");
  const [pitstopId, setPitstopId] = useState(initial?.pitstop?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError("");
    const body = { title: title.trim(), description: description.trim() || null, date, type, pitstopId: pitstopId || null, userId: targetUserId };
    const url = initial ? `/api/plan-items/${initial.id}` : "/api/plan-items";
    const method = initial ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { setError("Something went wrong."); setLoading(false); return; }
    onSaved(await res.json());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-stone-900">{initial ? "Edit plan item" : "Add to plan"}</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-stone-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Title</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Partner review meeting"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-stone-600 mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                {PLAN_ITEM_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-stone-600 mb-1">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Link to pitstop (optional)</label>
            <select value={pitstopId} onChange={e => setPitstopId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
              <option value="">— none —</option>
              {pitstops.map(p => <option key={p.id} value={p.id}>{p.goal.title} › {p.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Notes (optional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="Context, agenda, prep needed…"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none" />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">Cancel</button>
            <button type="submit" disabled={!title.trim() || loading}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {loading ? "Saving…" : initial ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Week row ──────────────────────────────────────────────────────────────────

function WeekRow({
  weekNum,
  label,
  weekStart,
  weekEnd,
  pitstops,
  activities,
  planItems,
  defaultDate,
  pitstopOptions,
  targetUserId,
  onAddItem,
  onEditItem,
  onDeleteItem,
}: {
  weekNum: number;
  label: string;
  weekStart: Date;
  weekEnd: Date;
  pitstops: Pitstop[];
  activities: Activity[];
  planItems: PlanItem[];
  defaultDate: string;
  pitstopOptions: PitstopRef[];
  targetUserId: string;
  onAddItem: (item: PlanItem) => void;
  onEditItem: (item: PlanItem) => void;
  onDeleteItem: (id: string) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<PlanItem | null>(null);
  const [expanded, setExpanded] = useState(true);

  const isToday = (d: Date) => toYMD(d) === toYMD(new Date());
  const todayInWeek = (() => {
    const t = new Date(); t.setHours(12, 0, 0, 0);
    return t >= weekStart && t <= weekEnd;
  })();

  const total = pitstops.length + activities.length + planItems.length;

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${todayInWeek ? "border-sky-200 shadow-sm" : "border-stone-200"}`}>
      {/* Week header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${todayInWeek ? "bg-sky-50 hover:bg-sky-100" : "bg-stone-50 hover:bg-stone-100"}`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${todayInWeek ? "bg-sky-500 text-white" : "bg-stone-200 text-stone-600"}`}>
            {weekNum}
          </span>
          <div className="min-w-0">
            <span className={`text-xs font-semibold ${todayInWeek ? "text-sky-800" : "text-stone-700"}`}>
              {label}
            </span>
            {todayInWeek && <span className="ml-2 text-[10px] bg-sky-500 text-white px-1.5 py-0.5 rounded-full">This week</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {total > 0 && (
            <span className="text-[11px] text-stone-400">{total} item{total !== 1 ? "s" : ""}</span>
          )}
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />}
        </div>
      </button>

      {/* Week body */}
      {expanded && (
        <div className="px-4 py-3 space-y-4 bg-white">

          {/* Pitstop milestones */}
          {pitstops.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5">Pitstop Milestones</p>
              <div className="flex flex-wrap gap-1.5">
                {pitstops.map(p => {
                  const isStart  = p.startDate  && inWeek(p.startDate,  weekStart, weekEnd);
                  const isTarget = p.targetDate && inWeek(p.targetDate, weekStart, weekEnd);
                  return (
                    <Link key={`${p.id}-${isStart ? "s" : "t"}`}
                      href={`/goals/${p.goal.id}/pitstops/${p.id}`}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs hover:shadow-sm transition-all ${STATUS_BG[p.status]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[p.status]}`} />
                      <span className="font-medium truncate max-w-[160px]">{p.title}</span>
                      <span className={`flex-shrink-0 text-[9px] px-1 py-0.5 rounded-full border ${isTarget ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-white/70 border-current opacity-60"}`}>
                        {isTarget && isStart ? "Starts & Due" : isTarget ? "Due" : "Starts"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scheduled activities */}
          {activities.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5">Scheduled Activities</p>
              <div className="space-y-1.5">
                {activities.map(a => (
                  <Link key={a.id} href="/activities"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 transition-colors">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ACT_TYPE_DOT[a.type] ?? "bg-stone-400"}`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-stone-800 truncate block">{a.title}</span>
                      <span className="text-[10px] text-stone-400">
                        {fmtTime(a.scheduledAt)} · {a.type}
                        {a.location ? ` · ${a.location}` : ""}
                      </span>
                    </div>
                    {a.pitstop && (
                      <span className="text-[10px] text-stone-400 truncate max-w-[120px] flex-shrink-0">
                        {a.pitstop.goal.title}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Plan items */}
          <div>
            {planItems.length > 0 && (
              <>
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5">My Plan</p>
                <div className="space-y-1.5 mb-2">
                  {planItems.map(item => (
                    <div key={item.id} className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${PLAN_TYPE_COLOR[item.type] ?? "bg-white border-stone-200 text-stone-700"}`}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${PLAN_TYPE_DOT[item.type] ?? "bg-stone-300"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{item.title}</p>
                        <p className="text-[10px] opacity-70 mt-0.5">
                          {new Date(item.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                          {" · "}{item.type}
                        </p>
                        {item.description && (
                          <p className="text-[10px] opacity-60 mt-0.5 line-clamp-2">{item.description}</p>
                        )}
                        {item.pitstop && (
                          <p className="flex items-center gap-0.5 text-[10px] opacity-60 mt-0.5 truncate">
                            <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                            {item.pitstop.goal.title} › {item.pitstop.title}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button onClick={() => setEditItem(item)} className="p-1 opacity-40 hover:opacity-100 transition-opacity">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button onClick={() => onDeleteItem(item.id)} className="p-1 opacity-40 hover:opacity-100 hover:text-red-500 transition-all">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-stone-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg border border-dashed border-stone-200 hover:border-sky-300 transition-all w-full">
              <Plus className="w-3.5 h-3.5" />
              Add to this week's plan
            </button>
          </div>

          {total === 0 && (
            <p className="text-xs text-stone-300 text-center py-2">Nothing planned — add something above.</p>
          )}
        </div>
      )}

      {(showAdd || editItem) && (
        <PlanItemModal
          initial={editItem ?? undefined}
          defaultDate={defaultDate}
          pitstops={pitstopOptions}
          targetUserId={targetUserId}
          onClose={() => { setShowAdd(false); setEditItem(null); }}
          onSaved={item => {
            if (editItem) { onEditItem(item); setEditItem(null); }
            else { onAddItem(item); setShowAdd(false); }
          }}
        />
      )}
    </div>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ pitstops, activities, planItems }: { pitstops: Pitstop[]; activities: Activity[]; planItems: PlanItem[] }) {
  const done = pitstops.filter(p => p.status === "Done").length;
  const inProgress = pitstops.filter(p => p.status === "InProgress").length;
  return (
    <div className="flex items-center gap-4 sm:gap-6 px-4 sm:px-6 py-3 bg-stone-50 border-b border-stone-100 overflow-x-auto no-scrollbar">
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="w-2 h-2 rounded-full bg-sky-400" />
        <span className="text-xs text-stone-600"><span className="font-semibold">{pitstops.length}</span> pitstop{pitstops.length !== 1 ? "s" : ""}</span>
        {(done > 0 || inProgress > 0) && (
          <span className="text-[10px] text-stone-400">({inProgress} active, {done} done)</span>
        )}
      </div>
      <div className="w-px h-4 bg-stone-200 flex-shrink-0" />
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="w-2 h-2 rounded-full bg-violet-400" />
        <span className="text-xs text-stone-600"><span className="font-semibold">{activities.length}</span> activit{activities.length !== 1 ? "ies" : "y"} scheduled</span>
      </div>
      <div className="w-px h-4 bg-stone-200 flex-shrink-0" />
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="w-2 h-2 rounded-full bg-amber-400" />
        <span className="text-xs text-stone-600"><span className="font-semibold">{planItems.length}</span> plan item{planItems.length !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PlannerView({
  currentUserId,
  initialYear,
  initialQuarter,
  users,
  initialPitstops,
  initialActivities,
  initialPlanItems,
  allPitstops,
}: {
  currentUserId: string;
  initialYear: number;
  initialQuarter: number;
  users: User[];
  initialPitstops: Pitstop[];
  initialActivities: Activity[];
  initialPlanItems: PlanItem[];
  allPitstops: PitstopRef[];
}) {
  const [year, setYear]       = useState(initialYear);
  const [quarter, setQuarter] = useState(initialQuarter);
  const [viewUserId, setViewUserId] = useState(currentUserId);
  const [pitstops, setPitstops]     = useState(initialPitstops);
  const [activities, setActivities] = useState(initialActivities);
  const [planItems, setPlanItems]   = useState(initialPlanItems);
  const [loading, setLoading]       = useState(false);

  const isManager = currentUserId === viewUserId ? false : true;
  const viewUser = users.find(u => u.id === viewUserId);

  // ── Load data when quarter/user changes ───────────────────────────────────

  const load = useCallback(async (y: number, q: number, uid: string) => {
    setLoading(true);
    const res = await fetch(`/api/planner-data?userId=${uid}&year=${y}&quarter=${q}`);
    if (res.ok) {
      const { pitstops: ps, activities: acts, planItems: items } = await res.json();
      setPitstops(ps);
      setActivities(acts);
      setPlanItems(items);
    }
    setLoading(false);
  }, []);

  const handleQuarterChange = (y: number, q: number) => {
    setYear(y); setQuarter(q);
    load(y, q, viewUserId);
  };

  const handleUserChange = (uid: string) => {
    setViewUserId(uid);
    load(year, quarter, uid);
  };

  // ── Plan item CRUD ────────────────────────────────────────────────────────

  const handleAddItem   = (item: PlanItem) => setPlanItems(prev => [...prev, item]);
  const handleEditItem  = (item: PlanItem) => setPlanItems(prev => prev.map(i => i.id === item.id ? item : i));
  const handleDeleteItem = async (id: string) => {
    await fetch(`/api/plan-items/${id}`, { method: "DELETE" });
    setPlanItems(prev => prev.filter(i => i.id !== id));
  };

  // ── Build weeks ───────────────────────────────────────────────────────────

  const weeks = getQuarterWeeks(year, quarter);

  // ── Year picker ───────────────────────────────────────────────────────────

  const years = [initialYear - 1, initialYear, initialYear + 1];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-stone-100">
        <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-stone-900">Quarterly Planner</h1>
            <p className="text-sm text-stone-500 mt-0.5">
              {viewUser?.name ?? "My"} plan · {QUARTERS[quarter - 1]} {year}
            </p>
          </div>

          {/* Person picker (visible to all, defaults to self) */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={viewUserId}
              onChange={e => handleUserChange(e.target.value)}
              className="px-3 py-1.5 text-xs border border-stone-200 rounded-lg bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.id === currentUserId ? `${u.name ?? u.email} (me)` : u.name ?? u.email ?? u.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quarter + Year selectors */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-stone-100 rounded-lg p-0.5">
            {[1, 2, 3, 4].map(q => (
              <button key={q} onClick={() => handleQuarterChange(year, q)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${quarter === q ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
                Q{q}
              </button>
            ))}
          </div>
          <div className="flex bg-stone-100 rounded-lg p-0.5">
            {years.map(y => (
              <button key={y} onClick={() => handleQuarterChange(y, quarter)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${year === y ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
                {y}
              </button>
            ))}
          </div>
          {loading && <span className="text-xs text-stone-400 animate-pulse">Loading…</span>}
        </div>
      </div>

      {/* Summary bar */}
      <SummaryBar pitstops={pitstops} activities={activities} planItems={planItems} />

      {/* Week rows */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <div className="max-w-3xl mx-auto space-y-3">
          {weeks.map(({ start, end, label, weekNum }) => {
            // Filter data to this week
            const weekPitstops = pitstops.filter(p =>
              (p.startDate  && inWeek(p.startDate,  start, end)) ||
              (p.targetDate && inWeek(p.targetDate, start, end))
            );
            // Deduplicate pitstops that have both start and target in same week
            const uniquePitstops = weekPitstops.filter((p, idx) =>
              weekPitstops.findIndex(x => x.id === p.id) === idx
            );

            const weekActivities = activities.filter(a => inWeek(a.scheduledAt, start, end));
            const weekPlanItems  = planItems.filter(i => inWeek(i.date, start, end));

            return (
              <WeekRow
                key={weekNum}
                weekNum={weekNum}
                label={label}
                weekStart={start}
                weekEnd={end}
                pitstops={uniquePitstops}
                activities={weekActivities}
                planItems={weekPlanItems}
                defaultDate={toYMD(start)}
                pitstopOptions={allPitstops}
                targetUserId={viewUserId}
                onAddItem={handleAddItem}
                onEditItem={handleEditItem}
                onDeleteItem={handleDeleteItem}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
