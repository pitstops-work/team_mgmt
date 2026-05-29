"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { Activity } from "../_lib/types";
import { fmtDate, fmtTime } from "../_lib/helpers";

/**
 * Reschedule sheet — opens from the ActivityCard kebab. Mirrors `FilterSheet`'s
 * mobile-bottom / desktop-centred layout.
 *
 * Inputs: new date/time picker (defaults to the existing schedule +1 day,
 * same time-of-day) and a reason chip set. The free-text field is required
 * when the user picks "Other".
 *
 * On submit it PATCHes /api/pitstop-events/[id] with
 *   { reschedule: true, scheduledAt, rescheduleReason, rescheduleReasonCode }
 * and lets the API decide whether to notify the RP's manager based on the
 * pattern-alert policy.
 */
export type RescheduleReasonCode = "desk_work" | "double_booked" | "weather" | "team_meeting" | "other";

const REASON_CHIPS: { code: RescheduleReasonCode; label: string; hint?: string }[] = [
  { code: "desk_work",     label: "Desk work pending" },
  { code: "double_booked", label: "Double booked" },
  { code: "weather",       label: "Weather" },
  { code: "team_meeting",  label: "Team meeting" },
  { code: "other",         label: "Other", hint: "Please describe" },
];

export function RescheduleSheet({
  open, onClose, activity, onRescheduled,
}: {
  open: boolean;
  onClose: () => void;
  activity: Activity;
  onRescheduled: () => void;
}) {
  const defaultDate = computeDefault(activity.scheduledAt);
  const [scheduledAt, setScheduledAt] = useState(defaultDate);
  const [reasonCode, setReasonCode] = useState<RescheduleReasonCode | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the sheet re-opens for a different activity.
  useEffect(() => {
    if (open) {
      setScheduledAt(computeDefault(activity.scheduledAt));
      setReasonCode(null);
      setReasonText("");
      setError(null);
    }
  }, [open, activity.id, activity.scheduledAt]);

  // Close on Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const requiresFreeText = reasonCode === "other";
  const canSubmit =
    !!reasonCode &&
    (!requiresFreeText || reasonText.trim().length > 0) &&
    !submitting &&
    scheduledAt !== "" &&
    new Date(scheduledAt).getTime() !== new Date(activity.scheduledAt).getTime();

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/pitstop-events/${activity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reschedule: true,
          scheduledAt: new Date(scheduledAt).toISOString(),
          rescheduleReasonCode: reasonCode,
          rescheduleReason: requiresFreeText ? reasonText.trim() : null,
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
            <h2 className="text-sm font-semibold text-stone-800">Reschedule</h2>
            <p className="text-xs text-stone-500 mt-0.5 truncate">{activity.title}</p>
            <p className="text-[11px] text-stone-400 mt-0.5">
              was {fmtDate(activity.scheduledAt)} · {fmtTime(activity.scheduledAt)}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-600" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Date + time */}
          <div>
            <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-1.5">
              New date & time
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
          </div>

          {/* Reason chips */}
          <div>
            <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-1.5">
              Reason
            </label>
            <div className="flex flex-wrap gap-1.5">
              {REASON_CHIPS.map(c => {
                const on = reasonCode === c.code;
                return (
                  <button
                    key={c.code}
                    onClick={() => setReasonCode(c.code)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      on ? "bg-sky-500 text-white border-sky-500"
                         : "bg-white text-stone-600 border-stone-200 hover:border-sky-300"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            {requiresFreeText && (
              <textarea
                value={reasonText}
                onChange={e => setReasonText(e.target.value)}
                placeholder="Please describe…"
                rows={3}
                className="w-full mt-2 text-sm border border-stone-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            )}
          </div>

          {/* Manager note */}
          <p className="text-[11px] text-stone-400 leading-relaxed">
            Your zone leader may receive a notification depending on the reason and how often this activity has been rescheduled.
          </p>

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
            Reschedule
          </button>
        </div>
      </div>
    </div>
  );
}

// Default new date: existing schedule + 1 day, same hour/minute. Encoded as
// the local "YYYY-MM-DDTHH:mm" string the datetime-local input wants.
function computeDefault(scheduledAt: string): string {
  const d = new Date(scheduledAt);
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
