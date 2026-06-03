"use client";

/**
 * VisitsPlanner — month grid of pitstop visits, drag-card-to-day to reschedule.
 *
 * Reads from GET /api/pitstops/planner?from&to&userIds, writes via PATCH
 * /api/pitstops/[id]/reschedule (same endpoint the pitstop-detail Reschedule
 * Visit button uses). Time-of-day is preserved per pitstop's activities.
 *
 * User picker (multi-select, designation-anchored):
 *   - RP                    → self only, picker hidden
 *   - ZL / PM               → self + direct reports
 *   - Leader / admin / super → self + recursive descendants
 *   - Other                 → self only, picker hidden
 *
 * Filter chips: domain, cluster, goal-name search.
 *
 * Designed for any RP doing site-visit work, especially the high-fan-out
 * pattern where one RP runs many sites and needs the month-at-a-glance.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, MapPin, ExternalLink, Loader2, Users, X as XIcon } from "lucide-react";
import Link from "next/link";
import { RescheduleVisitModal } from "@/components/pitstops/RescheduleVisitModal";
import Avatar from "@/components/Avatar";

type PickerUser = {
  id: string;
  name: string | null;
  image: string | null;
  designation: string;
};

type PitstopCard = {
  id: string;
  title: string;
  status: string;
  recurrence: string;
  startDate: string | null;
  targetDate: string | null;
  ownerId: string | null;
  goalId: string;
  goal: {
    id: string;
    title: string;
    needsDomain: string | null;
    needsCluster: { id: string; name: string } | null;
    needsSettlement: { id: string; name: string } | null;
  };
  owner: { id: string; name: string | null; image: string | null } | null;
};

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function ymdFromIso(iso: string): string { return toYMD(new Date(iso)); }
function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
function startOfMonth(year: number, month: number): Date { return new Date(year, month, 1); }
function endOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0, 23, 59, 59, 999);
}

export function VisitsPlanner({
  currentUserId,
  currentUserDesignation,
}: {
  currentUserId: string;
  currentUserDesignation: string;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  // User picker. RP/Other are locked to self (server enforces too — the picker
  // is hidden for them). ZL/PM/Leader/admin start with self selected; they can
  // pick teammates from the picker dropdown (populated by /planner/users which
  // returns the same designation-anchored allowed set the GET endpoint validates).
  const isPickerVisible = !(currentUserDesignation === "RP" || currentUserDesignation === "Other");
  const [allowedUsers, setAllowedUsers] = useState<PickerUser[] | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([currentUserId]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const [rows, setRows] = useState<PitstopCard[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [target, setTarget] = useState<PitstopCard | null>(null);
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("");
  const [clusterFilter, setClusterFilter] = useState<string>("");

  // Click-outside to dismiss the picker dropdown.
  useEffect(() => {
    if (!pickerOpen) return;
    const onClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [pickerOpen]);

  // Load the picker's allowed-user list once.
  useEffect(() => {
    if (!isPickerVisible) return;
    fetch("/api/pitstops/planner/users")
      .then(r => r.ok ? r.json() : [])
      .then(setAllowedUsers)
      .catch(() => setAllowedUsers([]));
  }, [isPickerVisible]);

  async function load() {
    setLoading(true);
    setErr(null);
    const from = toYMD(startOfMonth(year, month));
    const to = toYMD(endOfMonth(year, month));
    const userIds = selectedUserIds.length > 0 ? selectedUserIds.join(",") : currentUserId;
    const res = await fetch(`/api/pitstops/planner?from=${from}&to=${to}&userIds=${encodeURIComponent(userIds)}`);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({})))?.error ?? "Couldn't load visits");
      setRows([]);
    } else {
      setRows(await res.json());
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, [year, month, selectedUserIds]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleUser(uid: string) {
    setSelectedUserIds(prev => {
      if (prev.includes(uid)) {
        // Never let the user deselect themselves entirely → leaves picker empty
        // and confusing. Falls back to self if their click would empty the list.
        const next = prev.filter(x => x !== uid);
        return next.length === 0 ? [currentUserId] : next;
      }
      return [...prev, uid];
    });
  }
  function selectAll() {
    if (allowedUsers) setSelectedUserIds(allowedUsers.map(u => u.id));
  }
  function selectOnlySelf() {
    setSelectedUserIds([currentUserId]);
  }

  // Filter options derived from loaded data.
  const domains = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows ?? []) if (r.goal.needsDomain) s.add(r.goal.needsDomain);
    return [...s].sort();
  }, [rows]);
  const clusters = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows ?? []) if (r.goal.needsCluster) m.set(r.goal.needsCluster.id, r.goal.needsCluster.name);
    return [...m.entries()].sort(([, a], [, b]) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    return (rows ?? []).filter(r => {
      if (search && !r.goal.title.toLowerCase().includes(search.toLowerCase()) && !r.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (domainFilter && r.goal.needsDomain !== domainFilter) return false;
      if (clusterFilter && r.goal.needsCluster?.id !== clusterFilter) return false;
      return true;
    });
  }, [rows, search, domainFilter, clusterFilter]);

  // Group filtered pitstops by their visit YMD.
  const cardsByDay = useMemo(() => {
    const m = new Map<string, PitstopCard[]>();
    for (const r of filtered) {
      if (!r.startDate) continue;
      const ymd = ymdFromIso(r.startDate);
      const arr = m.get(ymd) ?? [];
      arr.push(r);
      m.set(ymd, arr);
    }
    return m;
  }, [filtered]);

  // 6-row Mon-anchored grid
  const days = useMemo(() => {
    const first = new Date(year, month, 1);
    const firstDow = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - firstDow);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [year, month]);

  function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11); } else { setMonth(m => m - 1); } }
  function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0); } else { setMonth(m => m + 1); } }

  // Drag → drop on a day cell triggers a rescheduling fetch using the same
  // endpoint as the pitstop-page Reschedule Visit button. Optimistic UI:
  // re-fetch after the request completes (cheap; one cell per month).
  async function rescheduleVia(id: string, newYmd: string) {
    const row = rows?.find(r => r.id === id);
    if (!row || !row.startDate) return;
    const currentYmd = ymdFromIso(row.startDate);
    if (currentYmd === newYmd) return;
    // Preserve time-of-day from the current scheduledAt — endpoint computes
    // delta in ms, so passing newYmd at original HH:MM is the cleanest contract.
    const current = new Date(row.startDate);
    const [y, m, d] = newYmd.split("-").map(Number);
    const newDate = new Date(y, m - 1, d, current.getHours(), current.getMinutes(), 0, 0);
    setLoading(true);
    const res = await fetch(`/api/pitstops/${id}/reschedule`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: newDate.toISOString() }),
    });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({})))?.error ?? "Couldn't reschedule");
      setLoading(false);
      return;
    }
    await load();
  }

  function onCellDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
  function onCellDrop(e: React.DragEvent, ymd: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/pitstop-id");
    if (id) rescheduleVia(id, ymd);
  }

  const visibleCount = filtered.length;
  const todayYmd = toYMD(now);

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-white">
      {/* Header */}
      <div className="px-5 sm:px-8 pt-6 pb-4 border-b border-stone-100">
        <h1 className="text-xl font-semibold text-stone-900">Monthly visits</h1>
        <p className="text-sm text-stone-400 mt-0.5 leading-snug">
          Drag a visit onto a different day to reschedule. The whole pitstop — all its activities — moves with it.
        </p>
      </div>

      {/* Toolbar */}
      <div className="px-5 sm:px-8 py-3 border-b border-stone-100 bg-stone-50 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <button onClick={prevMonth} className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="text-sm font-semibold text-stone-800 min-w-[10ch] text-center">{monthLabel(year, month)}</p>
          <button onClick={nextMonth} className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {isPickerVisible && allowedUsers !== null && (
          <div className="ml-2 relative" ref={pickerRef}>
            <button
              onClick={() => setPickerOpen(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-md transition-colors ${
                selectedUserIds.length > 1 || (selectedUserIds[0] && selectedUserIds[0] !== currentUserId)
                  ? "bg-sky-50 border-sky-200 text-sky-700"
                  : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              {selectedUserIds.length === 1 && selectedUserIds[0] === currentUserId
                ? "Just me"
                : `${selectedUserIds.length} ${selectedUserIds.length === 1 ? "person" : "people"}`}
            </button>
            {pickerOpen && (
              <div className="absolute left-0 top-full mt-1 z-20 min-w-[260px] bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden">
                <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-stone-100 bg-stone-50">
                  <button onClick={selectAll} className="text-[11px] text-sky-600 hover:underline">Select all</button>
                  <button onClick={selectOnlySelf} className="text-[11px] text-stone-500 hover:underline">Just me</button>
                </div>
                <div className="max-h-72 overflow-y-auto py-1">
                  {allowedUsers.length === 0 ? (
                    <p className="text-[11px] text-stone-400 px-3 py-2 italic">No teammates in scope.</p>
                  ) : (
                    allowedUsers.map(u => {
                      const checked = selectedUserIds.includes(u.id);
                      const isSelf = u.id === currentUserId;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => toggleUser(u.id)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-stone-50 transition-colors text-left"
                        >
                          <span className={`w-3.5 h-3.5 flex-shrink-0 rounded border flex items-center justify-center ${
                            checked ? "bg-sky-500 border-sky-500" : "border-stone-300 bg-white"
                          }`}>
                            {checked && (
                              <svg className="w-2 h-2 text-white" viewBox="0 0 10 8" fill="none">
                                <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          <Avatar name={u.name} image={u.image} size="xs" />
                          <span className="flex-1 min-w-0">
                            <span className="block truncate text-stone-700">{u.name ?? "—"}{isSelf && <span className="text-stone-400"> (you)</span>}</span>
                            {u.designation && u.designation !== "Other" && (
                              <span className="block text-[10px] text-stone-400">{u.designation}</span>
                            )}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search goal or pitstop…"
          className="ml-2 flex-1 min-w-[180px] px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
        />

        {domains.length > 0 && (
          <select value={domainFilter} onChange={e => setDomainFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
            <option value="">All domains</option>
            {domains.map(d => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
          </select>
        )}
        {clusters.length > 0 && (
          <select value={clusterFilter} onChange={e => setClusterFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
            <option value="">All clusters</option>
            {clusters.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}

        <button onClick={load} className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-stone-600 hover:bg-stone-100 rounded-md">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          {visibleCount} visit{visibleCount === 1 ? "" : "s"}
        </button>
      </div>

      {err && (
        <div className="mx-5 sm:mx-8 my-2 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded">{err}</div>
      )}

      {/* Calendar grid */}
      <div className="flex-1 px-5 sm:px-8 py-4">
        <div className="border border-stone-200 rounded-lg overflow-hidden bg-white">
          <div className="grid grid-cols-7 bg-stone-50 border-b border-stone-100 text-[10px] font-semibold text-stone-500 uppercase">
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
              <div key={d} className="px-2 py-1.5 text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map(d => {
              const ymd = toYMD(d);
              const inMonth = d.getMonth() === month;
              const dow = d.getDay();
              const isWeekend = dow === 0 || dow === 6;
              const isToday = ymd === todayYmd;
              const cards = cardsByDay.get(ymd) ?? [];

              return (
                <div
                  key={ymd}
                  onDragOver={onCellDragOver}
                  onDrop={e => onCellDrop(e, ymd)}
                  className={`min-h-[120px] border-r border-b border-stone-100 p-1.5 ${
                    !inMonth ? "bg-stone-50/60" : isWeekend ? "bg-stone-50/40" : "bg-white"
                  }`}
                >
                  <p className={`text-[10px] mb-1 ${
                    !inMonth ? "text-stone-300" :
                    isToday ? "text-sky-700 font-bold" :
                    isWeekend ? "text-stone-400" :
                    "text-stone-500"
                  }`}>
                    {d.getDate()}
                  </p>
                  <div className="space-y-1">
                    {cards.map(c => (
                      <VisitCard
                        key={c.id}
                        card={c}
                        onClickReschedule={() => setTarget(c)}
                        showOwner={selectedUserIds.length > 1}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {visibleCount === 0 && !loading && (
          <p className="text-center text-xs text-stone-400 mt-6">
            {rows && rows.length > 0
              ? "No visits match these filters."
              : "No visits scheduled this month."}
          </p>
        )}
        {loading && (
          <p className="text-center text-xs text-stone-400 mt-6 flex items-center justify-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading…
          </p>
        )}
      </div>

      {target && target.startDate && (
        <RescheduleVisitModal
          pitstopId={target.id}
          pitstopTitle={target.title}
          currentStartIso={target.startDate}
          currentTargetIso={target.targetDate ?? null}
          onClose={() => setTarget(null)}
          onRescheduled={() => { setTarget(null); load(); }}
        />
      )}
    </div>
  );
}

function VisitCard({
  card, onClickReschedule, showOwner,
}: {
  card: PitstopCard;
  onClickReschedule: () => void;
  /** Render owner avatar — useful when multiple users' visits share the grid. */
  showOwner: boolean;
}) {
  const cluster = card.goal.needsCluster?.name;
  const settlement = card.goal.needsSettlement?.name;
  // Three-line shape: pitstop title (what's happening) → goal title (which
  // creche / programme) → cluster (where, geographically). RP request: pitstop
  // title is the most useful at-a-glance signal because the goal name is often
  // long ("Creche Programme — Lumbini Slum") while the pitstop is short
  // ("Monthly Creche Round") and tells you what work you're walking into.
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData("text/pitstop-id", card.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={onClickReschedule}
      className="px-1.5 py-1 rounded border border-sky-200 bg-sky-50 text-[10px] text-sky-900 leading-snug cursor-grab active:cursor-grabbing hover:bg-sky-100 hover:border-sky-300 transition-colors"
      title={`${card.title}\n${card.goal.title}${card.owner?.name ? `\nOwner: ${card.owner.name}` : ""}\nClick to open reschedule modal, drag to another day for quick move.`}
    >
      <div className="flex items-start gap-1">
        {showOwner && card.owner && (
          <Avatar name={card.owner.name} image={card.owner.image} size="xs" />
        )}
        <p className="font-semibold truncate flex-1 min-w-0">{card.title}</p>
      </div>
      <p className="text-sky-700 truncate">{card.goal.title}</p>
      {(cluster || settlement) && (
        <p className="text-sky-600/80 truncate flex items-center gap-0.5">
          <MapPin className="w-2 h-2 flex-shrink-0" />
          {[settlement, cluster].filter(Boolean).join(", ")}
        </p>
      )}
      <Link
        href={`/goals/${card.goalId}/pitstops/${card.id}`}
        onClick={e => e.stopPropagation()}
        className="text-sky-600 hover:text-sky-800 hover:underline inline-flex items-center gap-0.5"
      >
        <ExternalLink className="w-2.5 h-2.5" /> Open
      </Link>
    </div>
  );
}
