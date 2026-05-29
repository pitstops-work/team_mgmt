"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { TodayFilters } from "./useTodayFilters";

type Option = { value: string; label: string };

/**
 * Bottom-sheet (mobile) / centred sheet (desktop) filter editor for the
 * RP/ZL Today cockpit. Stays minimal — apply is implicit (changes commit to
 * parent state immediately), so the explicit "Apply" button just dismisses.
 *
 * Cascading is handled upstream by `useTodayFilters` — the option lists
 * passed in here are already narrowed by the other selected filters.
 */
export function FilterSheet({
  open, onClose,
  filters, setFilter, clearFilters,
  options,
  activeCount,
}: {
  open: boolean;
  onClose: () => void;
  filters: TodayFilters;
  setFilter: <K extends keyof TodayFilters>(key: K, value: TodayFilters[K]) => void;
  clearFilters: () => void;
  options: {
    zones: Option[];
    clusters: Option[];
    settlements: Option[];
    goals: Option[];
    types: Option[];
  };
  activeCount: number;
}) {
  // Close on Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function toggleMulti(key: "goalIds" | "types", value: string) {
    const cur = filters[key];
    const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value];
    setFilter(key, next);
  }

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        onClick={e => e.stopPropagation()}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-md sm:w-full sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-stone-100 flex-shrink-0">
          <h2 className="text-sm font-semibold text-stone-800">
            Filter{activeCount > 0 ? ` · ${activeCount} active` : ""}
          </h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-600" aria-label="Close filters">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Zone */}
          <SheetField label="Zone">
            <select
              value={filters.zoneId}
              onChange={e => setFilter("zoneId", e.target.value)}
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
            >
              <option value="">All zones</option>
              {options.zones.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </SheetField>

          {/* Cluster */}
          <SheetField label="Cluster">
            <select
              value={filters.clusterId}
              onChange={e => setFilter("clusterId", e.target.value)}
              disabled={options.clusters.length === 0}
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-50"
            >
              <option value="">All clusters</option>
              {options.clusters.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </SheetField>

          {/* Settlement */}
          <SheetField label="Settlement">
            <select
              value={filters.settlementId}
              onChange={e => setFilter("settlementId", e.target.value)}
              disabled={options.settlements.length === 0}
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-50"
            >
              <option value="">All settlements</option>
              {options.settlements.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </SheetField>

          {/* Goal — multi as chips */}
          {options.goals.length > 0 && (
            <SheetField label={`Goal${filters.goalIds.length > 0 ? ` · ${filters.goalIds.length}` : ""}`}>
              <div className="flex flex-wrap gap-1.5">
                {options.goals.map(o => {
                  const on = filters.goalIds.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      onClick={() => toggleMulti("goalIds", o.value)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        on ? "bg-sky-500 text-white border-sky-500"
                           : "bg-white text-stone-600 border-stone-200 hover:border-sky-300"
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </SheetField>
          )}

          {/* Type — multi as chips */}
          {options.types.length > 0 && (
            <SheetField label={`Type${filters.types.length > 0 ? ` · ${filters.types.length}` : ""}`}>
              <div className="flex flex-wrap gap-1.5">
                {options.types.map(o => {
                  const on = filters.types.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      onClick={() => toggleMulti("types", o.value)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        on ? "bg-sky-500 text-white border-sky-500"
                           : "bg-white text-stone-600 border-stone-200 hover:border-sky-300"
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </SheetField>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-stone-100 flex-shrink-0">
          <button
            onClick={() => { clearFilters(); }}
            disabled={activeCount === 0}
            className="text-xs text-stone-500 hover:text-stone-700 underline disabled:opacity-30 disabled:no-underline"
          >
            Clear all
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function SheetField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
