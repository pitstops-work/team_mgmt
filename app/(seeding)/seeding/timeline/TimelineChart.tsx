"use client";

import { useMemo, useState } from "react";
import type { SeedingTaskStatus } from "@/app/generated/prisma/client";
import { STATUS_HEX, STATUS_META, STATUS_ORDER } from "../_lib/status";
import { weekToDate } from "@/lib/seeding/weeks";

export type TimelineRow = {
  id: string;
  parentId: string | null;
  level: 0 | 1 | 2 | 3; // workstream | phase | task | sub-task
  code: string | null;
  label: string;
  status: SeedingTaskStatus;
  start: number | null;
  due: number | null;
  done: number;
  total: number; // leaf sub-task counts beneath this row (1/0 on a sub-task)
  color: string; // owning workstream colour
  href: string;
};

const PX = 30; // px per week
const LABEL_W = 320;
const ROW_H = [30, 26, 24, 22] as const;
const INDENT = [0, 14, 28, 42] as const;

export default function TimelineChart({
  rows, week0ISO, launchWeek, currentWeek,
}: { rows: TimelineRow[]; week0ISO: string; launchWeek: number; currentWeek: number }) {
  const week0 = new Date(week0ISO);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [only, setOnly] = useState<SeedingTaskStatus | "all">("all");
  const [depth, setDepth] = useState<0 | 1 | 2 | 3>(2);

  const hasKids = useMemo(() => new Set(rows.map((r) => r.parentId).filter((v): v is string => !!v)), [rows]);

  // A row shows if: within the chosen depth, no ancestor collapsed, and it or a
  // descendant matches the status filter.
  const visible = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const matched = new Map<string, boolean>();
    for (let i = rows.length - 1; i >= 0; i--) { // children precede parents in reverse
      const r = rows[i];
      const m = (only === "all" || r.status === only) || matched.get(r.id) === true;
      matched.set(r.id, m);
      if (m && r.parentId) matched.set(r.parentId, true);
    }
    return rows.filter((r) => {
      if (r.level > depth) return false;
      if (!matched.get(r.id)) return false;
      for (let p = r.parentId; p; p = byId.get(p)?.parentId ?? null) if (collapsed.has(p)) return false;
      return true;
    });
  }, [rows, collapsed, only, depth]);

  const maxWeek = Math.max(launchWeek, currentWeek, ...rows.flatMap((r) => [r.start ?? 0, r.due ?? 0]), 1) + 1;
  const trackW = (maxWeek + 1) * PX;
  const ticks = Array.from({ length: maxWeek + 1 }, (_, i) => i);

  const toggle = (id: string) =>
    setCollapsed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-stone-400 mr-1">Show</span>
          {([["Workstreams", 0], ["Phases", 1], ["Tasks", 2], ["Sub-tasks", 3]] as const).map(([l, d]) => (
            <button key={d} onClick={() => setDepth(d)}
              className={`px-2 py-1 rounded-full border ${depth === d ? "bg-stone-800 text-white border-stone-800" : "border-stone-200 text-stone-500 hover:bg-stone-50"}`}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-stone-400 mr-1">Status</span>
          <button onClick={() => setOnly("all")}
            className={`px-2 py-1 rounded-full border ${only === "all" ? "bg-stone-800 text-white border-stone-800" : "border-stone-200 text-stone-500 hover:bg-stone-50"}`}>All</button>
          {STATUS_ORDER.map((s) => (
            <button key={s} onClick={() => setOnly(s)}
              className={`px-2 py-1 rounded-full border inline-flex items-center gap-1.5 ${only === s ? "bg-stone-800 text-white border-stone-800" : "border-stone-200 text-stone-500 hover:bg-stone-50"}`}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_HEX[s] }} />{STATUS_META[s].label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white overflow-x-auto">
        <div style={{ width: LABEL_W + trackW }}>
          {/* Week axis */}
          <div className="flex sticky top-0 bg-white border-b border-stone-100 z-10">
            <div style={{ width: LABEL_W }} className="shrink-0 px-3 py-2 text-[10px] uppercase tracking-wide text-stone-400">Work · status · progress</div>
            <div className="relative" style={{ width: trackW, height: 40 }}>
              {ticks.filter((w) => w % 2 === 0).map((w) => (
                <div key={w} className="absolute top-1 leading-tight" style={{ left: w * PX }}>
                  <div className="text-[10px] text-stone-400">W{w}</div>
                  <div className="text-[9px] text-stone-300 whitespace-nowrap">{weekToDate(week0, w).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })}</div>
                </div>
              ))}
              <div className="absolute top-0 bottom-0 border-l-2 border-sky-400" style={{ left: launchWeek * PX }} />
              {currentWeek >= 0 && currentWeek <= maxWeek && (
                <div className="absolute top-0 bottom-0 border-l border-dashed border-amber-500" style={{ left: currentWeek * PX }} />
              )}
            </div>
          </div>

          {visible.map((r) => (
            <Row key={r.id} r={r} week0={week0} trackW={trackW} currentWeek={currentWeek}
              collapsible={hasKids.has(r.id) && r.level < depth}
              collapsed={collapsed.has(r.id)} onToggle={() => toggle(r.id)} />
          ))}
          {visible.length === 0 && <div className="px-4 py-6 text-sm text-stone-400">Nothing at this status.</div>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[11px] text-stone-500">
        {STATUS_ORDER.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2.5 rounded-sm" style={{ backgroundColor: STATUS_HEX[s] }} />{STATUS_META[s].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm bg-stone-200" /><span className="w-2.5 h-2.5 rounded-sm -ml-1" style={{ backgroundColor: STATUS_HEX.done }} />Fill = sub-tasks done</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-0 h-3 border-l-2 border-sky-400" />Launch</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-0 h-3 border-l border-dashed border-amber-500" />This week</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full ring-2 ring-rose-400" />Overdue</span>
      </div>
    </div>
  );
}

function Row({ r, week0, trackW, currentWeek, collapsible, collapsed, onToggle }: {
  r: TimelineRow; week0: Date; trackW: number; currentWeek: number;
  collapsible: boolean; collapsed: boolean; onToggle: () => void;
}) {
  const h = ROW_H[r.level];
  const hex = STATUS_HEX[r.status];
  const leaf = r.level === 3;
  const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
  const dated = r.start != null || r.due != null;
  const s = r.start ?? r.due ?? 0;
  const e = r.due ?? r.start ?? s;
  const left = Math.min(s, e) * PX;
  const width = Math.max(PX * 0.7, (Math.abs(e - s) + 1) * PX);
  const overdue = r.due != null && r.due < currentWeek && r.status !== "done";
  const barH = r.level === 0 ? 14 : r.level === 1 ? 12 : 10;

  return (
    <div className={`flex items-center border-b ${r.level === 0 ? "border-stone-200 bg-stone-50" : "border-stone-50 hover:bg-stone-50/60"}`}>
      <div style={{ width: LABEL_W, height: h, paddingLeft: 10 + INDENT[r.level] }} className="shrink-0 flex items-center gap-1.5 pr-3">
        {collapsible
          ? <button onClick={onToggle} className="w-3.5 text-[9px] text-stone-400 hover:text-stone-700 shrink-0">{collapsed ? "▶" : "▼"}</button>
          : <span className="w-3.5 shrink-0" />}
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hex }} title={STATUS_META[r.status].label} />
        <a href={r.href} title={`${r.code ? r.code + " · " : ""}${r.label}`}
          className={`truncate ${r.level === 0 ? "text-[12px] font-medium text-stone-700" : r.level === 1 ? "text-[11px] font-medium text-stone-600" : "text-[11px] text-stone-600"} hover:text-sky-700`}>
          {r.code && <span className="text-stone-400 mr-1 tabular-nums">{r.code}</span>}{r.label}
        </a>
        {!leaf && r.total > 0 && (
          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-stone-400">{r.done}/{r.total}</span>
        )}
      </div>

      <div className="relative" style={{ width: trackW, height: h }}>
        {dated ? (
          <div className="absolute top-1/2 -translate-y-1/2 rounded-full overflow-hidden"
            style={{
              left, width, height: barH,
              backgroundColor: leaf ? hex : `${hex}33`,
              boxShadow: overdue ? "0 0 0 1.5px #fb7185" : undefined,
              backgroundImage: r.status === "blocked"
                ? "repeating-linear-gradient(45deg, rgba(255,255,255,.55) 0 3px, transparent 3px 6px)" : undefined,
            }}
            title={`${r.label} · W${s}–W${e} · ${STATUS_META[r.status].label}${r.total && !leaf ? ` · ${r.done}/${r.total} sub-tasks (${pct}%)` : ""}${overdue ? " · OVERDUE" : ""}`}>
            {!leaf && pct > 0 && <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: hex }} />}
          </div>
        ) : (
          <div className="absolute top-1/2 -translate-y-1/2 text-[9px] text-stone-300" style={{ left: 6 }}>undated</div>
        )}
      </div>
    </div>
  );
}
