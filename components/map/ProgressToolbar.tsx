"use client";

import type { ProgressHealth } from "./MapView";

export type ProgressPeriod = "month" | "quarter" | "year" | "all";
export type ProgressMode = "goals" | "checklist" | "nogaps";
export type ProgressLevel = "settlement" | "cluster" | "zone";

export interface ProgressToolbarProps {
  onClose: () => void;
  period: ProgressPeriod;
  onPeriodChange: (p: ProgressPeriod) => void;
  mode: ProgressMode;
  onModeChange: (m: ProgressMode) => void;
  level: ProgressLevel;
  onLevelChange: (l: ProgressLevel) => void;
  health: ProgressHealth;
  loading: boolean;
}

const PERIOD_OPTIONS: { value: ProgressPeriod; label: string }[] = [
  { value: "month",   label: "This Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "year",    label: "This Year" },
  { value: "all",     label: "All Time" },
];

const LEVEL_OPTIONS: { value: ProgressLevel; label: string }[] = [
  { value: "settlement", label: "Settlement" },
  { value: "cluster",    label: "Cluster" },
  { value: "zone",       label: "Zone" },
];

export default function ProgressToolbar({
  onClose,
  period,
  onPeriodChange,
  mode,
  onModeChange,
  level,
  onLevelChange,
  loading,
}: ProgressToolbarProps) {
  return (
    <div className="absolute bottom-28 sm:bottom-6 left-3 z-10 bg-white/97 backdrop-blur-sm rounded-xl border border-slate-200 shadow-xl w-64 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="3" />
            <path strokeLinecap="round" d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
          <span className="text-xs font-bold text-slate-700">Progress Overlay</span>
          {loading && (
            <svg className="w-3 h-3 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors text-sm leading-none"
          title="Close overlay"
        >
          ×
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Period selector */}
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Period</p>
          <div className="flex flex-wrap gap-1">
            {PERIOD_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => onPeriodChange(value)}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border transition-colors ${
                  period === value
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Mode selector */}
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Mode</p>
          <div className="space-y-1">
            <button
              onClick={() => onModeChange("goals")}
              className={`w-full text-left px-2.5 py-2 rounded-lg border text-[10px] transition-colors ${
                mode === "goals"
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              <div className="font-semibold">Goal Health</div>
              <div className="text-[9px] text-slate-400 mt-0.5">red=overdue · amber=at risk · green=on track</div>
            </button>
            <button
              onClick={() => onModeChange("checklist")}
              className={`w-full text-left px-2.5 py-2 rounded-lg border text-[10px] transition-colors ${
                mode === "checklist"
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              <div className="font-semibold">Checklist %</div>
              <div className="text-[9px] text-slate-400 mt-0.5">% pitstops done in period · grey=no data</div>
            </button>
            <button
              onClick={() => onModeChange("nogaps")}
              className={`w-full text-left px-2.5 py-2 rounded-lg border text-[10px] transition-colors ${
                mode === "nogaps"
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              <div className="font-semibold">No Goals</div>
              <div className="text-[9px] text-slate-400 mt-0.5">highlights areas with zero goals</div>
            </button>
          </div>
        </div>

        {/* Legend */}
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Legend</p>
          {mode === "goals" && (
            <div className="space-y-1">
              {[
                { color: "#ef4444", label: "Overdue goals" },
                { color: "#f59e0b", label: "At risk (due <30d)" },
                { color: "#10b981", label: "On track / done" },
                { color: "#e2e8f0", label: "No goals" },
              ].map(({ color, label }) => (
                <div key={color} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }} />
                  <span className="text-[10px] text-slate-600">{label}</span>
                </div>
              ))}
            </div>
          )}
          {mode === "checklist" && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div
                  className="w-28 h-3 rounded-sm flex-shrink-0"
                  style={{
                    background: "linear-gradient(to right, #fee2e2, #fef3c7, #d1fae5, #6ee7b7, #10b981)",
                  }}
                />
                <div className="flex justify-between text-[9px] text-slate-400 flex-1">
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: "#e2e8f0" }} />
                <span className="text-[10px] text-slate-600">No data</span>
              </div>
            </div>
          )}
          {mode === "nogaps" && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: "#ef4444", opacity: 0.7 }} />
                <span className="text-[10px] text-slate-600">No goals</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: "#e2e8f0" }} />
                <span className="text-[10px] text-slate-600">Has goals</span>
              </div>
            </div>
          )}
        </div>

        {/* Level toggle */}
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Level</p>
          <div className="flex gap-1">
            {LEVEL_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => onLevelChange(value)}
                className={`flex-1 py-1 text-[10px] font-semibold rounded-lg border transition-colors ${
                  level === value
                    ? "bg-slate-700 text-white border-slate-700"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
