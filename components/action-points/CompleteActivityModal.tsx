"use client";

/**
 * CompleteActivityModal — replaces the one-click "Done" path on Activity-type
 * checklist completions. Lets the RP capture any follow-up action points that
 * emerged from the visit, in the same submit. The AP block is collapsed by
 * default so routine activities still close in 2 clicks.
 *
 * Submit order:
 *   1. POST /api/action-points (batch) — must succeed before we close the activity
 *   2. PATCH /api/pitstop-events/[id] status=Done
 *
 * If step 1 fails we surface the error and don't proceed to step 2. If step 1
 * succeeds but step 2 fails, the APs are still saved (acceptable — the activity
 * close can be retried).
 *
 * Voice/Upload completion paths are unchanged (faster, with their own UI). APs
 * can be added to those activities later from the pitstop detail page.
 */

import { useState } from "react";
import { X, Plus, Check } from "lucide-react";
import { ActionPointInputRows, draftsToPayload } from "./ActionPointInputRows";
import type { ActionPointDraft } from "./types";

export function CompleteActivityModal({
  eventId,
  activityTitle,
  pitstopTitle,
  goalTitle,
  onClose,
  onCompleted,
}: {
  eventId: string;
  activityTitle: string;
  pitstopTitle?: string | null;
  goalTitle?: string | null;
  onClose: () => void;
  /** Called after both POST APs + PATCH Done succeed. The parent should refresh. */
  onCompleted: () => void;
}) {
  const [drafts, setDrafts] = useState<ActionPointDraft[]>([]);
  const [showAPs, setShowAPs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setErr(null);

    const payload = draftsToPayload(drafts);
    // Step 1: save APs if any. Empty payload → skip.
    if (payload.length > 0) {
      const apRes = await fetch("/api/action-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload.map(p => ({ ...p, pitstopEventId: eventId })) }),
      });
      if (!apRes.ok) {
        setErr((await apRes.json().catch(() => ({})))?.error ?? "Couldn't save action points");
        setSubmitting(false);
        return;
      }
    }

    // Step 2: close the activity. Same PATCH as the legacy one-click path.
    const doneRes = await fetch(`/api/pitstop-events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Done" }),
    });
    if (!doneRes.ok) {
      // APs (if any) are already saved; surface the activity error but don't
      // try to roll them back — they belong to the visit either way.
      setErr((await doneRes.json().catch(() => ({})))?.error ?? "Couldn't close activity (action points were saved).");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onCompleted();
  }

  const apCount = drafts.filter(d => d.title.trim().length > 0).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-stone-900">Complete activity</h2>
          <button onClick={onClose} aria-label="Close"><X className="w-4 h-4 text-stone-400" /></button>
        </div>

        <p className="text-sm text-stone-700 leading-snug">{activityTitle}</p>
        {(pitstopTitle || goalTitle) && (
          <p className="text-[11px] text-stone-400 mt-0.5 truncate">
            {[goalTitle, pitstopTitle].filter(Boolean).join(" › ")}
          </p>
        )}

        <div className="mt-4 mb-3 border-t border-stone-100" />

        {/* AP capture — collapsed by default */}
        {!showAPs && drafts.length === 0 ? (
          <button
            type="button"
            onClick={() => { setShowAPs(true); setDrafts([{
              clientId: crypto.randomUUID(),
              pitstopEventId: eventId,
              title: "", detail: "", dueDateYmd: defaultDueYmd(),
              priority: "routine", partnerStaffLabel: "",
            }]); }}
            className="w-full py-2 text-xs font-medium text-stone-500 hover:text-stone-700 hover:bg-stone-50 border border-dashed border-stone-300 rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Add follow-up action point
          </button>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                Follow-up action points {apCount > 0 && <span className="text-stone-700">({apCount})</span>}
              </h3>
              <p className="text-[11px] text-stone-400">For your follow-up after this visit</p>
            </div>
            <ActionPointInputRows
              drafts={drafts}
              onChange={setDrafts}
              pitstopEventId={eventId}
            />
          </div>
        )}

        {err && <p className="text-xs text-red-600 mt-3">{err}</p>}

        <div className="flex justify-between items-center gap-2 mt-5 pt-3 border-t border-stone-100">
          <p className="text-[11px] text-stone-400">
            {apCount > 0 ? `${apCount} follow-up${apCount === 1 ? "" : "s"} will be created.` : "No follow-ups."}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="px-3 py-2 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 rounded-lg flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              {submitting ? "Saving…" : "Mark done"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function defaultDueYmd(): string {
  const d = new Date(); d.setDate(d.getDate() + 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
