"use client";

/**
 * VisitsPlanner — month grid of pitstop visits, drag-card-to-day to reschedule.
 *
 * Reads from GET /api/pitstops/planner?from&to&scope, writes via PATCH
 * /api/pitstops/[id]/reschedule (same endpoint the pitstop-detail Reschedule
 * Visit button uses). Time-of-day is preserved per pitstop's activities.
 *
 * Filter chips: domain, cluster, goal-name search. Scope toggle: mine/team.
 *
 * Designed for any RP doing site-visit work, especially the high-fan-out
 * pattern where one RP runs many sites and needs the month-at-a-glance.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Filter, MapPin, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { RescheduleVisitModal } from "@/components/pitstops/RescheduleVisitModal";

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

  // RP starts on "mine"; everyone else defaults to "team" since their value is
  // in seeing the broader queue. They can toggle.
  const [scope, setScope] = useState<"mine" | "team">(currentUserDesignation === "RP" ? "mine" : "team");
  const [rows, setRows] = useState<PitstopCard[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [target, setTarget] = useState<PitstopCard | null>(null);
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("");
  const [clusterFilter, setClusterFilter] = useState<string>("");

  async function load() {
    setLoading(true);
    setErr(null);
    const from = toYMD(startOfMonth(year, month));
    const to = toYMD(endOfMonth(year, month));
    const res = await fetch(`/api/pitstops/planner?from=${from}&to=${to}&scope=${scope}`);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({})))?.error ?? "Couldn't load visits");
      setRows([]);
    } else {
      setRows(await res.json());
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, [year, month, scope]); // eslint-disable-line react-hooks/exhaustive-deps

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

        <div className="ml-2 inline-flex bg-white border border-stone-200 rounded-md p-0.5 text-xs">
          <button onClick={() => setScope("mine")}
            className={`px-2.5 py-1 rounded ${scope === "mine" ? "bg-sky-500 text-white shadow-sm" : "text-stone-600 hover:text-stone-800"}`}>
            Mine
          </button>
          <button onClick={() => setScope("team")}
            className={`px-2.5 py-1 rounded ${scope === "team" ? "bg-sky-500 text-white shadow-sm" : "text-stone-600 hover:text-stone-800"}`}>
            Team
          </button>
        </div>

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
                      <VisitCard key={c.id} card={c} onClickReschedule={() => setTarget(c)} />
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

function VisitCard({ card, onClickReschedule }: { card: PitstopCard; onClickReschedule: () => void }) {
  const cluster = card.goal.needsCluster?.name;
  const settlement = card.goal.needsSettlement?.name;
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData("text/pitstop-id", card.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={onClickReschedule}
      className="px-1.5 py-1 rounded border border-sky-200 bg-sky-50 text-[10px] text-sky-900 leading-snug cursor-grab active:cursor-grabbing hover:bg-sky-100 hover:border-sky-300 transition-colors"
      title={`${card.goal.title} — ${card.title}\nClick to open reschedule modal, drag to another day for quick move.`}
    >
      <p className="font-semibold truncate">{card.goal.title}</p>
      {(cluster || settlement) && (
        <p className="text-sky-700 text-[10px] truncate flex items-center gap-0.5">
          <MapPin className="w-2 h-2 flex-shrink-0" />
          {[settlement, cluster].filter(Boolean).join(", ")}
        </p>
      )}
      <Link
        href={`/goals/${card.goalId}/pitstops/${card.id}`}
        onClick={e => e.stopPropagation()}
        className="text-[10px] text-sky-600 hover:text-sky-800 hover:underline inline-flex items-center gap-0.5"
      >
        <ExternalLink className="w-2.5 h-2.5" /> Open
      </Link>
    </div>
  );
}
