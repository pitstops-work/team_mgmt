"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { fmtTime } from "../_lib/helpers";

export type ClusterBatchTarget = {
  id: string;
  title: string;
  scheduledAt: string;
};

/**
 * Confirm sheet for moving one cluster's worth of activities to a new date in
 * a single action. Companion to the cluster-split banner — opens when the RP
 * (or their lead) taps a cluster pill.
 *
 * Date-only picker on purpose: per-event time-of-day is preserved server-side
 * so a 9:30 visit stays a 9:30 visit on the new day. The events list under
 * the picker makes the "this will move these specific things" obvious before
 * confirmation — the user explicitly asked for a confirm step.
 *
 * Posts to /api/pitstop-events/batch-reschedule. That endpoint stamps each
 * event with reasonCode "cluster_consolidation" so this proactive flow doesn't
 * feed into the slippage pattern-alert policy.
 */
export function ClusterBatchRescheduleSheet({
  open, onClose, clusterName, events, onRescheduled,
}: {
  open: boolean;
  onClose: () => void;
  clusterName: string;
  events: ClusterBatchTarget[];
  onRescheduled: () => void;
}) {
  const defaultYmd = computeDefaultYmd(events[0]?.scheduledAt);
  const [targetDate, setTargetDate] = useState(defaultYmd);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when sheet re-opens with a different set.
  useEffect(() => {
    if (open) {
      setTargetDate(computeDefaultYmd(events[0]?.scheduledAt));
      setError(null);
    }
  }, [open, events]);

  // Close on Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const originalYmd = events[0]?.scheduledAt.slice(0, 10) ?? "";
  const canSubmit = !submitting && targetDate !== "" && targetDate !== originalYmd && events.length > 0;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/pitstop-events/batch-reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventIds: events.map(e => e.id),
          targetDate,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Reschedule failed");
      }
      onRescheduled();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reschedule failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        onClick={e => e.stopPropagation()}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-md sm:w-full sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-stone-100 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-stone-800">
              Move {events.length} {events.length === 1 ? "activity" : "activities"}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5 truncate">Cluster {clusterName}</p>
          </div>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-600" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-1.5">
              New date
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={e => setTargetDate(e.target.value)}
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
            <p className="text-[11px] text-stone-400 mt-1.5">
              Each activity keeps its current time of day.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-1.5">
              Activities being moved
            </label>
            <ul className="space-y-1.5 max-h-48 overflow-y-auto rounded-lg border border-stone-100 bg-stone-50/60 px-3 py-2">
              {events.map(ev => (
                <li key={ev.id} className="text-xs text-stone-700 flex items-baseline gap-2">
                  <span className="text-[11px] text-stone-400 tabular-nums flex-shrink-0">{fmtTime(ev.scheduledAt)}</span>
                  <span className="truncate">{ev.title}</span>
                </li>
              ))}
            </ul>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-stone-100 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-sm text-stone-600 hover:text-stone-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-4 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg flex items-center gap-1.5"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Move {events.length} {events.length === 1 ? "activity" : "activities"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Default the picker to tomorrow's date in the activities' local timezone.
// Reads off the first event's scheduledAt so the date input shows a sensible
// next-day suggestion rather than today (which would be a no-op).
function computeDefaultYmd(scheduledAt: string | undefined): string {
  const base = scheduledAt ? new Date(scheduledAt) : new Date();
  base.setDate(base.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
}
