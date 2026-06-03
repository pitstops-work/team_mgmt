"use client";

import { useEffect, useState, use, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, Target, Activity } from "lucide-react";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

type Outcome = { id: string; label: string; unit: string | null; targetValue: number | null; targetCadence: string | null };
type Point = { capturedAt: string; value: number };
type PhaseSpan = { id: string; label: string; status: string; startedAt: string | null; endedAt: string | null; goalId: string | null; goalTitle: string | null };
type Contribution = {
  phaseId: string; phaseLabel: string; pointsCount: number;
  startValue: number | null; endValue: number | null; deltaFirst: number | null;
};

const PHASE_COLORS = ["#38bdf8", "#a78bfa", "#34d399", "#f472b6", "#fbbf24", "#94a3b8"];

export default function OutcomeAttributionPage({ params }: { params: Promise<{ id: string; outcomeId: string }> }) {
  const { id, outcomeId } = use(params);
  const [data, setData] = useState<{ outcome: Outcome; points: Point[]; phaseSpans: PhaseSpan[]; contributions: Contribution[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/programmes/${id}/outcomes/${outcomeId}/attribution`)
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .finally(() => setLoading(false));
  }, [id, outcomeId]);

  const chart = useMemo(() => {
    if (!data) return null;
    const W = 720, H = 220, PAD = 30;
    const points = data.points.map(p => ({ ...p, t: new Date(p.capturedAt).getTime() }));

    // Determine time range from phase starts + point times
    const allTimes: number[] = [];
    for (const p of points) allTimes.push(p.t);
    for (const ps of data.phaseSpans) {
      if (ps.startedAt) allTimes.push(new Date(ps.startedAt).getTime());
      if (ps.endedAt) allTimes.push(new Date(ps.endedAt).getTime());
    }
    if (allTimes.length === 0) return null;
    const minT = Math.min(...allTimes);
    const maxT = Math.max(...allTimes, Date.now());
    const tRange = Math.max(1, maxT - minT);

    const allVals = [...points.map(p => p.value), data.outcome.targetValue].filter((v): v is number => v != null);
    const minV = Math.min(0, ...allVals);
    const maxV = Math.max(1, ...allVals);
    const vRange = Math.max(1, maxV - minV);

    const tx = (t: number) => PAD + ((t - minT) / tRange) * (W - 2 * PAD);
    const vy = (v: number) => H - PAD - ((v - minV) / vRange) * (H - 2 * PAD);

    return { W, H, PAD, points, tx, vy, minT, maxT, minV, maxV };
  }, [data]);

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-10"><p className="text-sm text-stone-400 text-center">Loading…</p></div>;
  if (!data) return <div className="max-w-4xl mx-auto px-4 py-10"><p className="text-sm text-stone-400 text-center">Outcome not found.</p></div>;

  const { outcome, points, phaseSpans, contributions } = data;

  return (
    <SurfaceProvider id="programmes.outcome">
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-start gap-3 mb-4">
        <Link href={`/programmes/${id}`} className="text-stone-400 hover:text-stone-600 transition-colors mt-1">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Target className="w-4 h-4 text-stone-400" />
            <h1 className="text-xl font-semibold text-stone-900">{outcome.label}</h1>
            {outcome.unit && <span className="text-xs text-stone-400">{outcome.unit}</span>}
            {outcome.targetValue != null && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-50 text-stone-500">
                target {outcome.targetValue.toLocaleString()}{outcome.targetCadence ? ` / ${outcome.targetCadence}` : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-stone-500 mt-1">Outcome time-series with phase activity overlaid. Hover the legend to see when each phase was active.</p>
        </div>
      </div>

      {/* Chart */}
      {chart && points.length > 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-3 overflow-x-auto mb-5">
          <svg width={chart.W} height={chart.H} className="block">
            {/* Phase bands (semi-transparent rectangles per phase active span) */}
            {phaseSpans.map((ps, i) => {
              if (!ps.startedAt) return null;
              const x1 = chart.tx(new Date(ps.startedAt).getTime());
              const x2 = chart.tx(ps.endedAt ? new Date(ps.endedAt).getTime() : chart.maxT);
              const color = PHASE_COLORS[i % PHASE_COLORS.length];
              return (
                <rect key={ps.id} x={x1} y={chart.PAD} width={Math.max(2, x2 - x1)} height={chart.H - 2 * chart.PAD} fill={color} fillOpacity="0.08" />
              );
            })}
            {/* Target line */}
            {outcome.targetValue != null && (
              <g>
                <line x1={chart.PAD} x2={chart.W - chart.PAD} y1={chart.vy(outcome.targetValue)} y2={chart.vy(outcome.targetValue)} stroke="#a3a3a3" strokeDasharray="3 3" strokeWidth="1" />
                <text x={chart.W - chart.PAD - 4} y={chart.vy(outcome.targetValue) - 4} fill="#a3a3a3" fontSize="10" textAnchor="end">target {outcome.targetValue}</text>
              </g>
            )}
            {/* Axes */}
            <line x1={chart.PAD} x2={chart.W - chart.PAD} y1={chart.H - chart.PAD} y2={chart.H - chart.PAD} stroke="#e7e5e4" />
            <line x1={chart.PAD} x2={chart.PAD} y1={chart.PAD} y2={chart.H - chart.PAD} stroke="#e7e5e4" />
            {/* Value labels */}
            <text x={chart.PAD - 4} y={chart.vy(chart.maxV)} fill="#78716c" fontSize="10" textAnchor="end">{chart.maxV.toLocaleString()}</text>
            <text x={chart.PAD - 4} y={chart.H - chart.PAD + 4} fill="#78716c" fontSize="10" textAnchor="end">{chart.minV.toLocaleString()}</text>
            <text x={chart.PAD} y={chart.H - chart.PAD + 16} fill="#78716c" fontSize="10">{new Date(chart.minT).toLocaleDateString()}</text>
            <text x={chart.W - chart.PAD} y={chart.H - chart.PAD + 16} fill="#78716c" fontSize="10" textAnchor="end">{new Date(chart.maxT).toLocaleDateString()}</text>
            {/* Series line + dots */}
            <polyline
              fill="none"
              stroke="#0f172a"
              strokeWidth="1.5"
              points={chart.points.map(p => `${chart.tx(p.t)},${chart.vy(p.value)}`).join(" ")}
            />
            {chart.points.map((p, i) => (
              <circle key={i} cx={chart.tx(p.t)} cy={chart.vy(p.value)} r="3" fill="#0f172a">
                <title>{new Date(p.capturedAt).toLocaleDateString()} · {p.value}</title>
              </circle>
            ))}
          </svg>
          {/* Phase legend */}
          <div className="flex flex-wrap gap-2 mt-2 text-[10px]">
            {phaseSpans.map((ps, i) => (
              <span key={ps.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full" style={{ background: PHASE_COLORS[i % PHASE_COLORS.length] + "22" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: PHASE_COLORS[i % PHASE_COLORS.length] }} />
                <span className="text-stone-700">{ps.label}</span>
                <span className="text-stone-400">
                  {ps.startedAt ? new Date(ps.startedAt).toLocaleDateString() : "—"}
                  {" → "}
                  {ps.endedAt ? new Date(ps.endedAt).toLocaleDateString() : "now"}
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-stone-400 italic text-center py-10 bg-stone-50 rounded-xl mb-5">
          No data points yet — capture a value to start the timeline.
        </p>
      )}

      {/* Attribution table */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" /> Phase contribution
        </h2>
        <p className="text-[11px] text-stone-500 mb-2 leading-relaxed">
          For each phase, how the outcome moved during its active period. Multiple phases overlapping inflates joint contribution; treat as a visual aid, not a causal estimate.
        </p>
        <div className="border border-stone-200 rounded-xl bg-white overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr className="text-stone-500 text-[10px] uppercase tracking-wider">
                <th className="text-left px-3 py-1.5">Phase</th>
                <th className="text-right px-3 py-1.5">Points captured</th>
                <th className="text-right px-3 py-1.5">Start value</th>
                <th className="text-right px-3 py-1.5">End value</th>
                <th className="text-right px-3 py-1.5">Δ during phase</th>
              </tr>
            </thead>
            <tbody>
              {contributions.map((c, i) => (
                <tr key={c.phaseId} className="border-b border-stone-100 last:border-0">
                  <td className="px-3 py-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: PHASE_COLORS[i % PHASE_COLORS.length] }} />
                    {c.phaseLabel}
                  </td>
                  <td className="px-3 py-2 text-right text-stone-700">{c.pointsCount}</td>
                  <td className="px-3 py-2 text-right text-stone-700">{c.startValue?.toLocaleString() ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-stone-700">{c.endValue?.toLocaleString() ?? "—"}</td>
                  <td className={`px-3 py-2 text-right font-medium ${c.deltaFirst == null ? "text-stone-400" : c.deltaFirst > 0 ? "text-emerald-600" : c.deltaFirst < 0 ? "text-red-500" : "text-stone-500"}`}>
                    {c.deltaFirst == null ? "—" : (c.deltaFirst > 0 ? "+" : "") + c.deltaFirst.toLocaleString()}
                  </td>
                </tr>
              ))}
              {contributions.length === 0 && (
                <tr><td colSpan={5} className="text-center text-stone-400 italic py-3">No phases to attribute to.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
    </SurfaceProvider>
  );
}
