"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Cloud, User, ChevronRight, Clock, TrendingUp, TrendingDown, Minus } from "lucide-react";
import dynamic from "next/dynamic";

const IndicatorChart = dynamic(() => import("./IndicatorChart"), { ssr: false });

type StalenessStatus = "green" | "yellow" | "red" | "none";
type CaptureSource = "MIS_API" | "RP_ACTIVITY" | "MANUAL_ADMIN";

type IndicatorSummary = {
  id: string;
  key: string;
  label: string;
  color: string;
  unit: string | null;
  frequency: string;
  captureSource: CaptureSource;
  hasTarget: boolean;
  avgValue: number | null;
  totalTarget: number | null;
  avgPctOfTarget: number | null;
  settlementsWithData: number;
  totalSettlements: number;
  lastCapturedAt: string | null;
  stalenessStatus: StalenessStatus;
  timeSeries: { date: string; value: number; settlementCount: number }[];
};

type Breakdown = {
  id: string;
  name: string;
  currentValue: number | null;
  targetValue: number | null;
  pctOfTarget: number | null;
  lastCapturedAt: string | null;
  stalenessStatus: StalenessStatus;
};

type ApiResponse = {
  geography: { id: string; name: string; level: string };
  indicators: IndicatorSummary[];
  breakdown: Breakdown[];
  indicatorKey: string | null;
};

function SourceBadge({ source }: { source: CaptureSource }) {
  const cls = "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px]";
  if (source === "MIS_API") return <span className={`${cls} bg-sky-50 text-sky-700`}><Cloud className="w-2.5 h-2.5" /> MIS</span>;
  if (source === "RP_ACTIVITY") return <span className={`${cls} bg-emerald-50 text-emerald-700`}><Activity className="w-2.5 h-2.5" /> RP</span>;
  return <span className={`${cls} bg-amber-50 text-amber-700`}><User className="w-2.5 h-2.5" /> Manual</span>;
}

function StalenessChip({ status }: { status: StalenessStatus }) {
  const base = "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium";
  if (status === "none") return <span className={`${base} bg-stone-100 text-stone-400`}><span className="w-1.5 h-1.5 rounded-full bg-stone-300" />—</span>;
  if (status === "green") return <span className={`${base} bg-emerald-50 text-emerald-700`}><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Fresh</span>;
  if (status === "yellow") return <span className={`${base} bg-amber-50 text-amber-700`}><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Stale</span>;
  return <span className={`${base} bg-red-50 text-red-700`}><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Very stale</span>;
}

function fmtValue(v: number | null, unit: string | null): string {
  if (v == null) return "—";
  const rounded = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return unit ? `${rounded}${unit === "%" || unit === "₹" ? "" : " "}${unit === "%" ? "%" : unit === "₹" ? "" : unit}` : `${rounded}`;
}

type Props = {
  level: string;
  geoId: string;
  selectedIndicator: string | null;
  setSelectedIndicator: (key: string | null) => void;
  nextLevel: string | undefined;
  drillInto: (itemId: string) => void;
};

export default function IndicatorsView({
  level, geoId, selectedIndicator, setSelectedIndicator, nextLevel, drillInto,
}: Props) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!geoId) return;
    setLoading(true);
    const params = new URLSearchParams({ level, id: geoId });
    if (selectedIndicator) params.set("indicator", selectedIndicator);
    fetch(`/api/effects/indicators?${params}`)
      .then(r => r.json())
      .then((d: ApiResponse) => setData(d))
      .finally(() => setLoading(false));
  }, [level, geoId, selectedIndicator]);

  const indicators = data?.indicators ?? [];
  const selected = selectedIndicator ? indicators.find(i => i.key === selectedIndicator) : null;
  const breakdown = data?.breakdown ?? [];

  return (
    <div className="space-y-5">
      {/* Indicator pills */}
      {indicators.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedIndicator(null)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${!selectedIndicator ? "bg-stone-800 text-white border-stone-800" : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50"}`}
          >
            All indicators
          </button>
          {indicators.map(ind => (
            <button
              key={ind.key}
              onClick={() => setSelectedIndicator(selectedIndicator === ind.key ? null : ind.key)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${selectedIndicator === ind.key ? "text-white border-transparent" : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50"}`}
              style={selectedIndicator === ind.key ? { background: ind.color, borderColor: ind.color } : {}}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: selectedIndicator === ind.key ? "white" : ind.color }} />
              {ind.label}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-400 rounded-full animate-pulse" style={{ width: "60%" }} />
        </div>
      )}

      {/* Summary cards (one per indicator) */}
      {indicators.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {(selected ? [selected] : indicators).map(ind => (
            <button
              key={ind.key}
              onClick={() => setSelectedIndicator(selectedIndicator === ind.key ? null : ind.key)}
              className={`text-left rounded-xl border p-3 space-y-2 transition-all hover:shadow-sm ${selectedIndicator === ind.key ? "border-stone-300 shadow-sm bg-white" : "border-stone-100 hover:border-stone-200"}`}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ind.color }} />
                  <span className="text-xs font-semibold text-stone-700 truncate">{ind.label}</span>
                </div>
                <SourceBadge source={ind.captureSource} />
              </div>
              <div className="grid grid-cols-3 text-center gap-1">
                <div>
                  <p className="text-sm font-bold text-stone-700">{fmtValue(ind.avgValue, ind.unit)}</p>
                  <p className="text-[9px] text-stone-400">avg current</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-500">{ind.hasTarget ? fmtValue(ind.totalTarget, ind.unit) : "—"}</p>
                  <p className="text-[9px] text-stone-400">target</p>
                </div>
                <div>
                  <p className={`text-sm font-bold ${ind.avgPctOfTarget != null && ind.avgPctOfTarget >= 80 ? "text-emerald-600" : ind.avgPctOfTarget != null && ind.avgPctOfTarget >= 50 ? "text-amber-600" : "text-red-500"}`}>
                    {ind.avgPctOfTarget != null ? `${Math.round(ind.avgPctOfTarget)}%` : "—"}
                  </p>
                  <p className="text-[9px] text-stone-400">of target</p>
                </div>
              </div>
              {ind.hasTarget && ind.avgPctOfTarget != null && (
                <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, ind.avgPctOfTarget)}%`, background: ind.color }} />
                </div>
              )}
              <div className="flex justify-between items-center text-[9px] text-stone-400">
                <span>{ind.settlementsWithData}/{ind.totalSettlements} settlements</span>
                <StalenessChip status={ind.stalenessStatus} />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Time-series chart */}
      {indicators.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-100 p-4">
          <div className="flex items-center justify-between mb-3 gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-stone-800 truncate">
                {selected ? selected.label : "All indicators"} over time
              </p>
              <p className="text-[10px] text-stone-400">
                Monthly average across settlements with data
                {selected?.unit ? ` · unit: ${selected.unit}` : ""}
              </p>
            </div>
            {selected && selected.avgPctOfTarget != null && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {selected.avgPctOfTarget >= 80
                  ? <TrendingUp className="w-4 h-4 text-emerald-500" />
                  : selected.avgPctOfTarget >= 50
                  ? <Minus className="w-4 h-4 text-amber-400" />
                  : <TrendingDown className="w-4 h-4 text-red-500" />}
                <span className="text-xs font-semibold text-stone-700">
                  {Math.round(selected.avgPctOfTarget)}% of target
                </span>
              </div>
            )}
          </div>
          <IndicatorChart
            series={(selected ? [selected] : indicators).map(i => ({
              key: i.key,
              label: i.label,
              color: i.color,
              unit: i.unit,
              points: i.timeSeries,
            }))}
          />
          {!selected && indicators.length > 1 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-3 border-t border-stone-100">
              {indicators.map(i => (
                <button
                  key={i.key}
                  onClick={() => setSelectedIndicator(i.key)}
                  className="flex items-center gap-1.5 text-[10px] text-stone-600 hover:text-stone-900"
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: i.color }} />
                  <span className="font-medium">{i.label}</span>
                  <span className="text-stone-400">{fmtValue(i.avgValue, i.unit)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Per-settlement breakdown (only when an indicator is selected) */}
      {selected && breakdown.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-stone-800">By Settlement</p>
            <p className="text-xs text-stone-400">{breakdown.length} settlement{breakdown.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100">
                  <th className="text-left px-4 py-2 font-medium text-stone-500">Settlement</th>
                  <th className="text-right px-3 py-2 font-medium text-stone-500 hidden sm:table-cell">Current</th>
                  <th className="text-right px-3 py-2 font-medium text-stone-500 hidden sm:table-cell">Target</th>
                  <th className="text-right px-3 py-2 font-medium text-stone-500">%</th>
                  <th className="text-right px-4 py-2 font-medium text-stone-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {breakdown.map(b => (
                  <tr
                    key={b.id}
                    className="hover:bg-stone-50 cursor-pointer transition-colors"
                    onClick={() => nextLevel === "settlement" && drillInto(b.id)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-stone-700">{b.name}</span>
                        {b.lastCapturedAt && (
                          <span className="text-[10px] text-stone-400 flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(b.lastCapturedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-stone-700 hidden sm:table-cell">{fmtValue(b.currentValue, selected.unit)}</td>
                    <td className="px-3 py-2.5 text-right text-stone-400 hidden sm:table-cell">{fmtValue(b.targetValue, selected.unit)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`font-medium ${b.pctOfTarget != null && b.pctOfTarget >= 80 ? "text-emerald-600" : b.pctOfTarget != null && b.pctOfTarget >= 50 ? "text-amber-600" : b.pctOfTarget != null ? "text-red-500" : "text-stone-300"}`}>
                        {b.pctOfTarget != null ? `${Math.round(b.pctOfTarget)}%` : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <StalenessChip status={b.stalenessStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && indicators.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Activity className="w-8 h-8 text-stone-300 mb-3" />
          <p className="text-sm font-medium text-stone-500">No facility indicators configured yet</p>
          <p className="text-xs text-stone-400 mt-1">
            <Link href="/settings/facility-indicators" className="text-sky-600 hover:underline">
              Configure indicators in settings →
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
