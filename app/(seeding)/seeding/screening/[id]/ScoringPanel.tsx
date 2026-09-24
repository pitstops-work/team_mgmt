"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ProfileChart, { type ChartSeries } from "../_components/ProfileChart";
import { submitReview } from "../actions";
import type { Decision, Level } from "@/lib/seeding/screening/decide";

type Dim = { key: string; label: string; description: string; anchors: { "1": string; "3": string; "5": string }; weight: number };

const DECISIONS: Record<Level, { key: Decision; label: string; tone: string }[]> = {
  l2: [
    { key: "shortlist", label: "Shortlist", tone: "bg-emerald-700 hover:bg-emerald-800 text-white" },
    { key: "hold", label: "Put on hold", tone: "bg-amber-500 hover:bg-amber-600 text-white" },
    { key: "reject", label: "Reject", tone: "bg-rose-700 hover:bg-rose-800 text-white" },
  ],
  l3: [
    { key: "approve", label: "Approve", tone: "bg-emerald-700 hover:bg-emerald-800 text-white" },
    { key: "hold", label: "Put on hold", tone: "bg-amber-500 hover:bg-amber-600 text-white" },
    { key: "reject", label: "Reject", tone: "bg-rose-700 hover:bg-rose-800 text-white" },
  ],
};

export default function ScoringPanel({
  applicationId,
  dims,
  ai,
  priorReviews,
  level,
  canAct,
  whyNot,
  bands,
  isSecondRead,
}: {
  applicationId: string;
  dims: Dim[];
  ai: Record<string, { score: number; evidence: string }> | null;
  priorReviews: { name: string; scores: Record<string, number> }[];
  level: Level | null;
  canAct: boolean;
  whyNot: string | null;
  bands: { advanceMin: number; holdMin: number };
  isSecondRead: boolean;
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, number>>({});
  const [justification, setJustification] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);

  const total = useMemo(() => {
    const sumW = dims.reduce((n, d) => n + d.weight, 0);
    if (!sumW || dims.some((d) => !scores[d.key])) return null;
    return Math.round((dims.reduce((n, d) => n + (scores[d.key] / 5) * d.weight, 0) / sumW) * 1000) / 10;
  }, [dims, scores]);
  const band = total === null ? null : total >= bands.advanceMin ? "advance" : total >= bands.holdMin ? "hold" : "reject";
  const scoredAll = dims.every((d) => scores[d.key]);
  // The lead may decide on the screeners' scores; screeners must score everything.
  const ready = justification.trim().length >= 10 && (level === "l3" ? Object.keys(scores).length === 0 || scoredAll : scoredAll);

  const series: ChartSeries[] = [];
  if (ai) series.push({ label: "First read", values: dims.map((d) => ai[d.key]?.score ?? null), color: "#a8a29e", dashed: true });
  priorReviews.forEach((r, i) =>
    series.push({ label: r.name, values: dims.map((d) => r.scores[d.key] ?? null), color: i === 0 ? "#7c3aed" : "#c026d3" }),
  );
  if (canAct) series.push({ label: "Your scores", values: dims.map((d) => scores[d.key] ?? null), color: "#0369a1" });

  function decide(decision: Decision) {
    setError(null);
    start(async () => {
      try {
        await submitReview({ applicationId, scores, justification, decision });
        setScores({});
        setJustification("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not record the decision");
      }
    });
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white">
      <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 flex items-center">
        <h2 className="text-sm font-medium text-stone-700">
          {level === "l3" ? "Lead decision (L3)" : level === "l2" ? (isSecondRead ? "Second read (L2)" : "Screening (L2)") : "Scores"}
        </h2>
        {total !== null && (
          <span className="ml-auto text-sm tabular-nums font-semibold text-stone-900">
            {total.toFixed(1)}
            <span className="text-stone-400 font-normal">/100</span>
          </span>
        )}
      </div>

      <div className="px-2 pt-2">
        <ProfileChart axes={dims.map((d) => d.label)} series={series} size={220} />
      </div>

      {canAct && (
        <div className="divide-y divide-stone-100 border-t border-stone-100">
          {ai && Object.keys(scores).length === 0 && (
            <div className="px-4 py-2">
              <button
                onClick={() => setScores(Object.fromEntries(dims.map((d) => [d.key, ai[d.key]?.score]).filter(([, v]) => v)))}
                className="text-xs text-sky-700 hover:underline"
              >
                Start from the first-read scores
              </button>
            </div>
          )}
          {dims.map((d) => (
            <div key={d.key} className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <button onClick={() => setOpen(open === d.key ? null : d.key)} className="text-left text-sm text-stone-800 flex-1 min-w-0">
                  {d.label} <span className="text-[11px] text-stone-400">· weight {d.weight}</span>
                </button>
                <div className="flex gap-1" role="radiogroup" aria-label={d.label}>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button
                      key={v}
                      role="radio"
                      aria-checked={scores[d.key] === v}
                      onClick={() => setScores((s) => ({ ...s, [d.key]: v }))}
                      className={`w-7 h-7 rounded text-xs tabular-nums border ${
                        scores[d.key] === v
                          ? "bg-sky-700 border-sky-700 text-white"
                          : ai?.[d.key]?.score === v
                            ? "border-stone-400 border-dashed text-stone-700"
                            : "border-stone-200 text-stone-600 hover:border-stone-400"
                      }`}
                      title={ai?.[d.key]?.score === v ? "First-read score" : undefined}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              {ai?.[d.key] && <p className="mt-1 text-[11px] text-stone-500 leading-relaxed">First read: {ai[d.key].evidence}</p>}
              {open === d.key && (
                <div className="mt-1.5 text-[11px] text-stone-600 space-y-0.5 leading-relaxed">
                  <p>{d.description}</p>
                  <p>
                    <b>1</b> {d.anchors["1"]}
                  </p>
                  <p>
                    <b>3</b> {d.anchors["3"]}
                  </p>
                  <p>
                    <b>5</b> {d.anchors["5"]}
                  </p>
                </div>
              )}
            </div>
          ))}
          <div className="px-4 py-3 space-y-2">
            {band && (
              <p className="text-xs text-stone-600">
                The rubric suggests:{" "}
                <b>{band === "advance" ? "advance" : band === "hold" ? "hold for a second read" : "reject"}</b>
                {level === "l3" ? "" : ` (${bands.advanceMin}+ advance, ${bands.holdMin}–${bands.advanceMin - 1} hold, below ${bands.holdMin} reject)`}
              </p>
            )}
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              placeholder="Justification (required) — one or two lines on what decided it"
              className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
            />
            {level && (
              <div className="flex flex-wrap gap-2">
                {DECISIONS[level].map((b) => (
                  <button
                    key={b.key}
                    disabled={!ready || pending}
                    onClick={() => decide(b.key)}
                    className={`rounded px-3 py-1.5 text-xs font-medium disabled:bg-stone-200 disabled:text-stone-400 ${b.tone}`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            )}
            {!ready && (
              <p className="text-[11px] text-stone-400">
                {level === "l2" && !scoredAll ? "Score every dimension and " : ""}write a justification to decide.
              </p>
            )}
            {error && <p className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{error}</p>}
          </div>
        </div>
      )}
      {!canAct && whyNot && <p className="px-4 py-3 text-xs text-stone-500 border-t border-stone-100">{whyNot}</p>}
    </div>
  );
}
