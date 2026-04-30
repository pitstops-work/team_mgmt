"use client";

export type NeedsMetric = "demand" | "addressable" | "existing" | "gap" | "done_pct" | "planned" | "deficit";
export type NeedsLevel = "settlement" | "cluster" | "zone";

export interface NeedsHeatmapData {
  values: Record<string, number>;
  max: number;
  domain: { domain: string; label: string; color: string } | null;
  metric: NeedsMetric;
  level: NeedsLevel;
  allDomains: { domain: string; label: string; color: string }[];
  hasData: boolean;
}

interface NeedsToolbarProps {
  onClose: () => void;
  heatmap: NeedsHeatmapData | null;
  domain: string;
  metric: NeedsMetric;
  level: NeedsLevel;
  threshold: number;
  loading: boolean;
  onDomainChange: (domain: string) => void;
  onMetricChange: (metric: NeedsMetric) => void;
  onLevelChange: (level: NeedsLevel) => void;
  onThresholdChange: (threshold: number) => void;
}

const METRIC_OPTIONS: { value: NeedsMetric; label: string; desc: string }[] = [
  { value: "demand",      label: "Demand",      desc: "Formula-based target from population" },
  { value: "addressable", label: "Addressable", desc: "Field-verified feasible need" },
  { value: "existing",    label: "Existing",    desc: "Currently in place" },
  { value: "gap",         label: "Gap",         desc: "Demand − existing" },
  { value: "done_pct",    label: "Done %",      desc: "Achieved vs demand" },
  { value: "planned",     label: "Planned",     desc: "Active goal targets" },
  { value: "deficit",     label: "Deficit",     desc: "Gap − planned (unfunded gap)" },
];

const LEVEL_OPTIONS: { value: NeedsLevel; label: string }[] = [
  { value: "settlement", label: "Settlement" },
  { value: "cluster",    label: "Cluster" },
  { value: "zone",       label: "Zone" },
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function valueToColor(value: number, max: number, hex: string): string {
  if (max <= 0 || value <= 0) return "#f1f5f9";
  const t = Math.pow(Math.min(value / max, 1), 0.65);
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(255 + (r - 255) * t)},${Math.round(255 + (g - 255) * t)},${Math.round(255 + (b - 255) * t)})`;
}

export default function NeedsToolbar({
  onClose, heatmap, domain, metric, level, threshold,
  loading, onDomainChange, onMetricChange, onLevelChange, onThresholdChange,
}: NeedsToolbarProps) {
  const allDomains = heatmap?.allDomains ?? [];
  const domainInfo = heatmap?.domain ?? allDomains.find(d => d.domain === domain) ?? null;
  const values = heatmap?.values ?? {};
  const max = heatmap?.max ?? 0;
  const isDoneMetric = metric === "done_pct";
  const effectiveMax = isDoneMetric ? 100 : max;

  const entries = Object.entries(values)
    .filter(([, v]) => v >= threshold)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div
      className="absolute top-14 right-3 z-10 bg-white/97 backdrop-blur-sm rounded-xl border border-slate-200 shadow-xl w-64 sm:w-72 overflow-hidden"
      style={{ maxHeight: "min(420px,calc(100vh - 8rem))" }}
    >
      <div className="overflow-y-auto" style={{ maxHeight: "min(420px,calc(100vh - 8rem))" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 bg-slate-50 sticky top-0 z-10">
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-xs font-bold text-slate-700">Needs Lens</span>
            {loading && (
              <svg className="w-3 h-3 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Domain pills */}
        <div className="px-3 pt-3 pb-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Domain</div>
          <div className="flex flex-wrap gap-1">
            {allDomains.map(d => (
              <button
                key={d.domain}
                onClick={() => onDomainChange(d.domain)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                  domain === d.domain
                    ? "text-white border-transparent"
                    : "text-slate-600 border-slate-200 bg-white hover:bg-slate-50"
                }`}
                style={domain === d.domain ? { background: d.color, borderColor: d.color } : {}}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Metric pills */}
        <div className="px-3 pb-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Metric</div>
          <div className="flex flex-wrap gap-1">
            {METRIC_OPTIONS.map(m => (
              <button
                key={m.value}
                onClick={() => onMetricChange(m.value)}
                title={m.desc}
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                  metric === m.value
                    ? "bg-slate-700 text-white border-slate-700"
                    : "text-slate-600 border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Level pills */}
        <div className="px-3 pb-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Level</div>
          <div className="flex gap-1">
            {LEVEL_OPTIONS.map(l => (
              <button
                key={l.value}
                onClick={() => onLevelChange(l.value)}
                className={`flex-1 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                  level === l.value
                    ? "bg-teal-600 text-white border-teal-600"
                    : "text-slate-600 border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* Threshold slider */}
        {effectiveMax > 1 && (
          <div className="px-3 pb-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Min threshold</span>
              <span className="font-bold text-slate-700">{threshold}{isDoneMetric ? "%" : ""}</span>
            </div>
            <input
              type="range"
              min={0}
              max={effectiveMax}
              step={isDoneMetric ? 5 : 1}
              value={threshold}
              onChange={e => onThresholdChange(Number(e.target.value))}
              className="w-full h-1.5 accent-teal-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
              <span>0</span>
              <span>{Math.round(effectiveMax / 2)}</span>
              <span>{effectiveMax}{isDoneMetric ? "%" : ""}</span>
            </div>
          </div>
        )}

        {/* Legend */}
        {domainInfo && max > 0 && (
          <div className="px-3 pb-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Intensity</div>
            <div className="rounded h-3 w-full" style={{ background: `linear-gradient(to right, #f1f5f9, ${domainInfo.color})` }} />
            <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
              <span>0</span>
              <span>{isDoneMetric ? "100%" : max}</span>
            </div>
          </div>
        )}

        {/* Top 10 rank list */}
        {entries.length > 0 && (
          <div className="px-3 pb-3">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Top {entries.length}{" "}
              {level === "settlement" ? "settlements" : level === "cluster" ? "clusters" : "zones"}
              {threshold > 0 ? ` (≥ ${threshold}${isDoneMetric ? "%" : ""})` : ""}
            </div>
            <div className="flex flex-col gap-1">
              {entries.map(([name, value], i) => (
                <div key={name} className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 w-4 text-right shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <div
                      className="h-2 rounded-full shrink-0"
                      style={{
                        width: `${Math.max(6, Math.round((value / Math.max(effectiveMax, 1)) * 72))}px`,
                        background: domainInfo ? valueToColor(value, effectiveMax, domainInfo.color) : "#e2e8f0",
                        border: `1px solid ${domainInfo?.color ?? "#e2e8f0"}44`,
                      }}
                    />
                    <span className="text-[11px] text-slate-700 font-medium truncate capitalize">{name}</span>
                  </div>
                  <span className="text-[11px] font-bold text-slate-600 shrink-0 tabular-nums">
                    {value}{isDoneMetric ? "%" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && heatmap && !heatmap.hasData && (
          <div className="px-3 pb-3 text-xs text-slate-400 text-center italic">No data for this selection</div>
        )}
      </div>
    </div>
  );
}
