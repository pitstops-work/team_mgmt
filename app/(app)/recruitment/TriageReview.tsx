"use client";

import { useState } from "react";
import { AlertTriangle, Check, Loader2, MapPin, X } from "lucide-react";

export type TriageCity = { id: string; city: string; state: string | null };
export type TriageAssignment = {
  cvIndex: number;
  name: string;
  locationId: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
};

const UNSORTED = "__unsorted__";

const confidenceDot: Record<TriageAssignment["confidence"], string> = {
  high: "bg-emerald-500",
  medium: "bg-amber-500",
  low: "bg-stone-300",
};

/**
 * Review and correct the CV → city split before any scouting runs.
 *
 * Reassignment is a dropdown per CV rather than drag-and-drop: the columns are
 * scrollable and a pool can run to 30+ CVs, so dragging across a scrolling
 * container is the fiddlier interaction, and a select is reachable by keyboard
 * and works on a touchscreen.
 *
 * Unsorted is NOT a blocker — it becomes its own desk. Those candidates are
 * scouted on the role alone, with the prompt explicitly told the location is
 * unknown, and each one is allocated to a city from the desk itself once a
 * human has read the CV. The alternative, forcing a guess here, is what the
 * whole single-city design exists to avoid: a candidate judged against a
 * city's language and reference orgs that were never theirs.
 */
export default function TriageReview({
  cities,
  assignments,
  busy,
  progress,
  error,
  onCancel,
  onConfirm,
}: {
  cities: TriageCity[];
  assignments: TriageAssignment[];
  busy: boolean;
  progress: string;
  error: string | null;
  onCancel: () => void;
  onConfirm: (groups: { city: TriageCity | null; cvIndexes: number[] }[]) => void;
}) {
  const [rows, setRows] = useState<TriageAssignment[]>(assignments);
  const [dropped, setDropped] = useState<Set<number>>(new Set());

  const move = (cvIndex: number, to: string) =>
    setRows((prev) => prev.map((r) => (r.cvIndex === cvIndex ? { ...r, locationId: to === UNSORTED ? null : to } : r)));

  const toggleDrop = (cvIndex: number) =>
    setDropped((prev) => {
      const next = new Set(prev);
      if (next.has(cvIndex)) next.delete(cvIndex);
      else next.add(cvIndex);
      return next;
    });

  const live = rows.filter((r) => !dropped.has(r.cvIndex));
  const unsortedRows = live.filter((r) => !r.locationId);

  // Unsorted is a desk in its own right, not a blocker. Its candidates are
  // scouted on the role alone — no city context is assumed — and each is
  // allocated to a city from the desk itself once their CV is read properly.
  const groups: { city: TriageCity | null; cvIndexes: number[] }[] = [
    ...cities.map((city) => ({
      city: city as TriageCity | null,
      cvIndexes: live.filter((r) => r.locationId === city.id).map((r) => r.cvIndex),
    })),
    { city: null, cvIndexes: unsortedRows.map((r) => r.cvIndex) },
  ].filter((g) => g.cvIndexes.length > 0);

  const blocked = groups.length === 0;

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="text-sm font-medium text-stone-800">Check the split before scouting</p>
          <p className="text-[11px] text-stone-500 mt-0.5 leading-relaxed">
            Each city gets its own desk, judged against that city&apos;s language, reference orgs and red flags.
            Move anything that landed in the wrong place — the dot shows how sure the sorter was.
          </p>
        </div>
        {!busy && (
          <button onClick={onCancel} className="text-stone-400 hover:text-stone-600 shrink-0" title="Back">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {unsortedRows.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-800 leading-relaxed">
            {unsortedRows.length} CV{unsortedRows.length === 1 ? "" : "s"} couldn&apos;t be placed from the CV alone.
            Give {unsortedRows.length === 1 ? "it" : "them"} a city here if you know it — otherwise they get their own
            desk, scouted on the role with no city assumed, and you allocate each one from the desk.
          </p>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {[...cities.map((c) => ({ key: c.id, label: c.city, sub: c.state })), { key: UNSORTED, label: "Unsorted — gets its own desk", sub: null }].map(
          (col) => {
            const items = live.filter((r) => (col.key === UNSORTED ? !r.locationId : r.locationId === col.key));
            const isUnsorted = col.key === UNSORTED;
            if (isUnsorted && items.length === 0) return null;
            return (
              <div
                key={col.key}
                className={`rounded-lg border bg-white ${isUnsorted ? "border-amber-300" : "border-stone-200"}`}
              >
                <div
                  className={`px-3 py-1.5 border-b text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1 ${
                    isUnsorted ? "border-amber-100 bg-amber-50 text-amber-700" : "border-stone-100 bg-stone-50 text-stone-500"
                  }`}
                >
                  {!isUnsorted && <MapPin className="w-2.5 h-2.5" />}
                  {col.label}
                  <span className="ml-auto tabular-nums font-normal">{items.length}</span>
                </div>
                <div className="divide-y divide-stone-100 max-h-56 overflow-auto">
                  {items.length === 0 && <p className="px-3 py-3 text-[11px] text-stone-400 italic">No CVs.</p>}
                  {items.map((r) => (
                    <div key={r.cvIndex} className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${confidenceDot[r.confidence]}`} title={`${r.confidence} confidence`} />
                        <span className="text-xs font-medium text-stone-800 truncate flex-1">{r.name}</span>
                        <button
                          onClick={() => toggleDrop(r.cvIndex)}
                          disabled={busy}
                          className="text-[10px] text-stone-400 hover:text-rose-600 disabled:opacity-40 shrink-0"
                          title="Leave this CV out of the run"
                        >
                          skip
                        </button>
                      </div>
                      <p className="text-[10px] text-stone-400 mt-0.5 leading-snug">{r.reason}</p>
                      <select
                        value={r.locationId ?? UNSORTED}
                        disabled={busy}
                        onChange={(e) => move(r.cvIndex, e.target.value)}
                        className="mt-1 w-full rounded border border-stone-200 px-1.5 py-1 text-[11px] text-stone-700 disabled:bg-stone-50"
                      >
                        <option value={UNSORTED}>— unsorted —</option>
                        {cities.map((c) => (
                          <option key={c.id} value={c.id}>{c.city}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            );
          },
        )}
      </div>

      {dropped.size > 0 && (
        <p className="text-[11px] text-stone-500">
          {dropped.size} CV{dropped.size === 1 ? "" : "s"} skipped —{" "}
          <button onClick={() => setDropped(new Set())} disabled={busy} className="text-sky-600 hover:underline disabled:opacity-40">
            bring {dropped.size === 1 ? "it" : "them"} back
          </button>
        </p>
      )}

      {error && <p className="text-xs text-rose-600">{error}</p>}
      {busy && progress && (
        <p className="text-[11px] text-stone-600 inline-flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> {progress}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <p className="text-[11px] text-stone-500 mr-auto">
          {groups.length} desk{groups.length === 1 ? "" : "s"} · {live.length} CV{live.length === 1 ? "" : "s"}
        </p>
        <button
          onClick={() => onConfirm(groups)}
          disabled={busy || blocked}
          className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {busy ? "Scouting…" : `Scout ${groups.length} desk${groups.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
