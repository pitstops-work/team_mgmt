"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { useMemo } from "react";

type TSPoint = {
  date: string;
  cumulativeDone: number;
  remaining: number;
  goalTitle: string;
  settlementName: string | null;
};

type DomainSeries = {
  domain: string;
  label: string;
  color: string;
  baseline: number;
  timeSeries: TSPoint[];
};

type Props = {
  series: DomainSeries[];
  selectedDomain: string | null;
  timeRange: "3m" | "6m" | "1y" | "all";
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

function filterByRange(points: TSPoint[], range: "3m" | "6m" | "1y" | "all"): TSPoint[] {
  if (range === "all") return points;
  const now = Date.now();
  const ms = range === "3m" ? 90 : range === "6m" ? 180 : 365;
  const cutoff = now - ms * 86400000;
  return points.filter(p => new Date(p.date).getTime() >= cutoff);
}

// Build a step-chart dataset: for each domain, merge all events into a unified timeline
// Each entry: { date, [domain]: remaining }
function buildChartData(series: DomainSeries[], range: "3m" | "6m" | "1y" | "all") {
  if (series.length === 0) return [];

  // Collect all unique timestamps across all domains, filtered by range
  const allPoints: { date: string; domain: string; remaining: number; goalTitle: string; settlementName: string | null }[] = [];
  for (const s of series) {
    const filtered = filterByRange(s.timeSeries, range);
    for (const p of filtered) {
      allPoints.push({ date: p.date, domain: s.domain, remaining: p.remaining, goalTitle: p.goalTitle, settlementName: p.settlementName });
    }
  }

  if (allPoints.length === 0) return [];

  // Sort by date
  allPoints.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Track current remaining per domain (starts at baseline)
  const current: Record<string, number> = {};
  for (const s of series) current[s.domain] = s.baseline;

  const rows: Record<string, unknown>[] = [];
  for (const p of allPoints) {
    current[p.domain] = p.remaining;
    rows.push({
      date: p.date,
      label: formatDate(p.date),
      goalTitle: p.goalTitle,
      settlementName: p.settlementName,
      triggerDomain: p.domain,
      ...Object.fromEntries(Object.entries(current)),
    });
  }
  return rows;
}

type TooltipPayload = { dataKey: string; value: number; color: string; payload: Record<string, unknown> };

function CustomTooltip({ active, payload, label, series }: { active?: boolean; payload?: TooltipPayload[]; label?: string; series: DomainSeries[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload ?? {};
  return (
    <div className="bg-white border border-stone-200 rounded-xl shadow-lg p-3 text-xs max-w-[220px]">
      <p className="font-semibold text-stone-700 mb-1">{label}</p>
      {row.goalTitle ? <p className="text-stone-500 mb-2 truncate">&ldquo;{String(row.goalTitle)}&rdquo;</p> : null}
      {row.settlementName ? <p className="text-stone-400 mb-2">{String(row.settlementName)}</p> : null}
      {payload.map(p => {
        const s = series.find(s => s.domain === p.dataKey);
        return (
          <div key={p.dataKey} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              {s?.label ?? p.dataKey}
            </span>
            <span className="font-medium text-stone-700">{p.value} left</span>
          </div>
        );
      })}
    </div>
  );
}

export default function ImpactChart({ series, selectedDomain, timeRange }: Props) {
  const activeSeries = selectedDomain ? series.filter(s => s.domain === selectedDomain) : series;
  const data = useMemo(() => buildChartData(activeSeries, timeRange), [activeSeries, timeRange]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-stone-400 bg-stone-50 rounded-xl border border-stone-100">
        No delivery data yet for this selection
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#a8a29e" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#a8a29e" }}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <Tooltip content={<CustomTooltip series={activeSeries} />} />
        {activeSeries.map(s => (
          <Line
            key={s.domain}
            type="stepAfter"
            dataKey={s.domain}
            stroke={s.color}
            strokeWidth={selectedDomain ? 2.5 : 1.5}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            connectNulls
          />
        ))}
        {/* Zero line */}
        <ReferenceLine y={0} stroke="#d6d3d1" strokeDasharray="4 2" />
      </LineChart>
    </ResponsiveContainer>
  );
}
