"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useMemo } from "react";

type Point = { date: string; value: number; settlementCount: number };

type IndicatorSeries = {
  key: string;
  label: string;
  color: string;
  unit: string | null;
  points: Point[];
};

type Props = { series: IndicatorSeries[] };

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

export default function IndicatorChart({ series }: Props) {
  const data = useMemo(() => {
    const buckets = new Map<string, Record<string, number | string>>();
    for (const s of series) {
      for (const p of s.points) {
        if (!buckets.has(p.date)) buckets.set(p.date, { date: p.date });
        buckets.get(p.date)![s.key] = p.value;
      }
    }
    return Array.from(buckets.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [series]);

  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-xs text-stone-400">
        No data points yet
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 10, fill: "#a8a29e" }}
            axisLine={{ stroke: "#e7e5e4" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#a8a29e" }}
            axisLine={{ stroke: "#e7e5e4" }}
            tickLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e7e5e4" }}
            labelFormatter={(label) => formatDate(String(label))}
            formatter={(value, _name, item) => {
              const s = series.find(x => x.key === item.dataKey);
              const v = typeof value === "number" ? (Math.round(value * 10) / 10) : value;
              const label = s?.label ?? String(item.dataKey ?? "");
              return [`${v}${s?.unit ? ` ${s.unit}` : ""}`, label] as [string, string];
            }}
          />
          {series.map(s => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 2, fill: s.color }}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
