"use client";

/**
 * RescheduleVisitModal — single date picker that shifts a pitstop's whole
 * "visit" (startDate + targetDate + every non-Done activity) by the day delta
 * between current start and the new date. Time-of-day on activities is
 * preserved per row.
 *
 * Used from:
 *   - the pitstop detail page header (inline button)
 *   - /planner drag-card → drop-on-day (programmatic open)
 *
 * Single source of truth = POST /api/pitstops/[id]/reschedule.
 */

import { useState } from "react";
import { X, Calendar, ArrowRight, Loader2 } from "lucide-react";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmt(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function RescheduleVisitModal({
  pitstopId,
  pitstopTitle,
  currentStartIso,
  currentTargetIso,
  onClose,
  onRescheduled,
}: {
  pitstopId: string;
  pitstopTitle: string;
  currentStartIso: string;
  currentTargetIso?: string | null;
  onClose: () => void;
  onRescheduled: (result: { newStartDate: string; newTargetDate: string | null; activitiesShifted: number }) => void;
}) {
  const current = new Date(currentStartIso);
  const [ymd, setYmd] = useState(toYMD(current));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Preview the new target date as a sanity check (window length preserved)
  const newStart = new Date(`${ymd}T${String(current.getHours()).padStart(2, "0")}:${String(current.getMinutes()).padStart(2, "0")}:00`);
  const deltaDays = Math.round((newStart.getTime() - current.getTime()) / 86_400_000);
  const previewTarget = currentTargetIso
    ? new Date(new Date(currentTargetIso).getTime() + deltaDays * 86_400_000)
    : null;
  const isNoop = ymd === toYMD(current);

  async function submit() {
    if (isNoop) { onClose(); return; }
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/pitstops/${pitstopId}/reschedule`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: newStart.toISOString() }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErr(body?.error ?? "Couldn't reschedule");
      return;
    }
    const result = await res.json();
    onRescheduled({
      newStartDate: result.newStartDate,
      newTargetDate: result.newTargetDate,
      activitiesShifted: result.activitiesShifted ?? 0,
    });
  }

  return (
    <SurfaceProvider id="pitstop.reschedule_modal">
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-stone-900 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-stone-500" />
            Reschedule visit
          </h2>
          <button onClick={onClose} aria-label="Close"><X className="w-4 h-4 text-stone-400" /></button>
        </div>

        <p className="text-sm text-stone-700 leading-snug mb-1">{pitstopTitle}</p>
        <p className="text-[11px] text-stone-400 mb-4">
          Current: {fmt(current)}{currentTargetIso ? ` → ${fmt(new Date(currentTargetIso))}` : ""}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">New visit date</label>
            <input
              autoFocus
              type="date"
              value={ymd}
              onChange={e => setYmd(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>

          {!isNoop && (
            <div className="px-3 py-2 rounded-lg bg-sky-50 border border-sky-100 text-[11px] text-sky-800 leading-snug">
              <p className="flex items-center gap-1.5">
                <ArrowRight className="w-3 h-3 flex-shrink-0" />
                Shifts pitstop {deltaDays >= 0 ? "+" : ""}{deltaDays} day{Math.abs(deltaDays) === 1 ? "" : "s"}
                {previewTarget && ` to ${fmt(newStart)} → ${fmt(previewTarget)}`}
                {!previewTarget && ` to ${fmt(newStart)}`}
              </p>
              <p className="mt-1 text-sky-600">
                All non-Done activities on this pitstop will shift by the same amount (time-of-day preserved).
              </p>
            </div>
          )}

          {err && <p className="text-xs text-red-600">{err}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-lg">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || isNoop}
              className="px-3 py-2 text-xs font-semibold text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 rounded-lg flex items-center gap-1.5"
            >
              {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : "Reschedule"}
            </button>
          </div>
        </div>
      </div>
    </div>
    </SurfaceProvider>
  );
}
