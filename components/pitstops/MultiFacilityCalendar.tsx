"use client";

/**
 * MultiFacilityCalendar — drag-to-assign month grid for multi-facility goal
 * creation. Each selected facility gets its own startDate via grid placement;
 * the parent submits N goals, each with its assigned startDate.
 *
 * Problem this solves: previously multi-select created N goals all sharing the
 * same startDate, so an RP covering many sites (e.g. Abdul's 21 creches) ended
 * up with every site's first-day activities piled on the same day. With per-
 * goal startDate, each site's visit lands on its own weekday.
 *
 * UX:
 *   - Sidebar: chips for unassigned facilities (with cluster context).
 *   - Calendar: month grid, prev/next month nav. Default month = today's.
 *   - Drag a chip onto a day cell to assign. Click a chip → click a day works
 *     too (mobile fallback). Click an assigned chip on the grid to remove it
 *     back to the sidebar.
 *
 * Returns a Map<facilityId, YMD> via onChange. Parent decides when to allow
 * submit (typically all selected facilities must be assigned).
 */

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, X as XIcon } from "lucide-react";

export type Facility = {
  id: string;
  name: string;
  cluster?: string | null;
};

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function ymdFromDate(d: Date): string { return toYMD(d); }
function dateFromYMD(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function MultiFacilityCalendar({
  facilities,
  value,
  onChange,
  startMonthYmd,
}: {
  facilities: Facility[];
  value: Map<string, string>;
  onChange: (next: Map<string, string>) => void;
  /** Default month/year shown. Defaults to today's month. */
  startMonthYmd?: string;
}) {
  const initial = startMonthYmd ? dateFromYMD(startMonthYmd) : new Date();
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());
  const [pickedChipId, setPickedChipId] = useState<string | null>(null);

  // Build the 6-row month grid (Mon-anchored). First col is Monday.
  const days = useMemo(() => {
    const first = new Date(year, month, 1);
    const firstDow = (first.getDay() + 6) % 7; // 0 = Monday
    const startOfGrid = new Date(year, month, 1 - firstDow);
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(startOfGrid);
      d.setDate(startOfGrid.getDate() + i);
      cells.push(d);
    }
    return cells;
  }, [year, month]);

  const unassigned = facilities.filter(f => !value.has(f.id));

  // Build the inverse: YMD → facility chips placed there
  const chipsByDay = useMemo(() => {
    const m = new Map<string, Facility[]>();
    for (const f of facilities) {
      const ymd = value.get(f.id);
      if (!ymd) continue;
      const arr = m.get(ymd) ?? [];
      arr.push(f);
      m.set(ymd, arr);
    }
    return m;
  }, [facilities, value]);

  function assign(facilityId: string, ymd: string) {
    const next = new Map(value);
    next.set(facilityId, ymd);
    onChange(next);
    setPickedChipId(null);
  }
  function unassign(facilityId: string) {
    const next = new Map(value);
    next.delete(facilityId);
    onChange(next);
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else { setMonth(m => m - 1); }
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else { setMonth(m => m + 1); }
  }

  // Drag-drop handlers
  function onCellDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
  function onCellDrop(e: React.DragEvent, ymd: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/facility-id");
    if (id) assign(id, ymd);
  }

  function chipClassName(): string {
    return "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-800 truncate max-w-full cursor-grab active:cursor-grabbing select-none";
  }

  return (
    <div className="border border-stone-200 rounded-lg overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b border-stone-100 bg-stone-50">
        <button type="button" onClick={prevMonth} className="p-1 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-sm font-semibold text-stone-800">{monthLabel(year, month)}</p>
        <button type="button" onClick={nextMonth} className="p-1 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-[180px_1fr] gap-0 max-h-[60vh] overflow-hidden">
        {/* Sidebar: unassigned chips */}
        <div className="border-r border-stone-100 p-2 overflow-y-auto">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 mb-2">
            Unassigned ({unassigned.length})
          </p>
          {unassigned.length === 0 ? (
            <p className="text-[11px] text-stone-400 italic px-1">All assigned ✓</p>
          ) : (
            <div className="space-y-1">
              {unassigned.map(f => (
                <button
                  key={f.id}
                  type="button"
                  draggable
                  onDragStart={e => { e.dataTransfer.setData("text/facility-id", f.id); e.dataTransfer.effectAllowed = "move"; }}
                  onClick={() => setPickedChipId(prev => prev === f.id ? null : f.id)}
                  className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors border ${
                    pickedChipId === f.id
                      ? "bg-sky-100 border-sky-300 text-sky-900"
                      : "bg-white border-stone-200 text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  <span className="block font-medium truncate">{f.name}</span>
                  {f.cluster && <span className="block text-[10px] text-stone-400 truncate">{f.cluster}</span>}
                </button>
              ))}
            </div>
          )}
          {pickedChipId && (
            <p className="text-[10px] text-sky-600 mt-2 px-1 leading-snug">
              Click a day below to place this facility.
            </p>
          )}
        </div>

        {/* Calendar grid */}
        <div className="overflow-y-auto">
          <div className="grid grid-cols-7 sticky top-0 bg-stone-50 border-b border-stone-100 text-[10px] font-semibold text-stone-500 uppercase">
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
              <div key={d} className="px-2 py-1.5 text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const ymd = ymdFromDate(d);
              const inMonth = d.getMonth() === month;
              const dow = d.getDay();
              const isWeekend = dow === 0 || dow === 6;
              const today = ymdFromDate(new Date());
              const isToday = ymd === today;
              const chips = chipsByDay.get(ymd) ?? [];

              return (
                <div
                  key={ymd}
                  onDragOver={onCellDragOver}
                  onDrop={e => onCellDrop(e, ymd)}
                  onClick={() => { if (pickedChipId) assign(pickedChipId, ymd); }}
                  className={`min-h-[78px] border-r border-b border-stone-100 p-1 ${
                    !inMonth ? "bg-stone-50/60" : isWeekend ? "bg-stone-50/40" : "bg-white"
                  } ${pickedChipId ? "cursor-pointer hover:bg-sky-50" : ""}`}
                >
                  <p className={`text-[10px] mb-1 ${
                    !inMonth ? "text-stone-300" :
                    isToday ? "text-sky-700 font-bold" :
                    isWeekend ? "text-stone-400" :
                    "text-stone-500"
                  }`}>
                    {d.getDate()}
                  </p>
                  <div className="space-y-0.5">
                    {chips.map(f => (
                      <div
                        key={f.id}
                        draggable
                        onDragStart={e => { e.dataTransfer.setData("text/facility-id", f.id); e.dataTransfer.effectAllowed = "move"; e.stopPropagation(); }}
                        onClick={e => { e.stopPropagation(); unassign(f.id); }}
                        className={chipClassName()}
                        title={`${f.name}${f.cluster ? ` · ${f.cluster}` : ""} — click to unassign`}
                      >
                        <span className="truncate">{f.name}</span>
                        <XIcon className="w-2.5 h-2.5 flex-shrink-0 opacity-50" />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
