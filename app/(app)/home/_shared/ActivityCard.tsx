"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClock, CalendarPlus, Check, Loader2, MapPin, Mic, MoreHorizontal, Paperclip, RotateCcw, Square, X } from "lucide-react";
import type { Activity, ChecklistItem } from "../_lib/types";
import { daysAgo, fmtDomain, fmtTime, isToday } from "../_lib/helpers";
import { ACTIVITY_TYPE_STYLE } from "../_lib/constants";
import { RescheduleSheet } from "./RescheduleSheet";
import { CompleteActivityModal } from "@/components/action-points/CompleteActivityModal";
import { fetchJson, FetchJsonError } from "@/lib/fetchJson";

/**
 * The unified activity row used across the new RP/ZL Today cockpits.
 *
 * Variants:
 *  - `row`  (default) compact horizontal list item
 *  - `card` taller emphasized variant for overdue items at the top of the list
 *
 * Completion behavior is driven by the linked checklist's `completionType`.
 * The shared mechanics (markDone PATCH, voice MediaRecorder, file upload) match
 * the legacy `RPActivityRow` so server-side semantics are unchanged.
 */
type Props = {
  activity: Activity;
  linkedChecklist?: ChecklistItem | null;
  onCompleted: (eventId: string, checklistItemId?: string) => void;
  /** Called after a successful reschedule so the parent can refresh data. */
  onRescheduled?: () => void;
  variant?: "row" | "card";
  /** Overdue badge + amber tint at the front of the row. */
  isOverdue?: boolean;
  /** Renders a done badge instead of the action; row stays visible. */
  isDone?: boolean;
};

export function ActivityCard({
  activity, linkedChecklist, onCompleted, onRescheduled,
  variant = "row", isOverdue = false, isDone = false,
}: Props) {
  const [busy, setBusy] = useState<null | "done" | "voice-recording" | "voice-processing" | "upload">(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  // Close-out modal — replaces the legacy one-click Done. Lets the RP capture
  // indicator values + follow-up action points in the same submit.
  //   "complete" — Activity-type Done button. Modal owns the PATCH Done.
  //   "post-complete" — Voice / Upload paths. The server endpoint already
  //                     marked the activity Done; modal just captures
  //                     indicators + APs after the fact so the flow stays
  //                     consistent across all three completion types.
  const [completeOpen, setCompleteOpen] = useState<"complete" | "post-complete" | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click outside to dismiss the kebab menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const rescheduleCount = activity.rescheduleCount ?? 0;

  // displayDate-pulled-to-today logic. "Pulled" = the card is appearing on
  // today's list because of the displayDate override rather than its actual
  // scheduledAt. Drives the "Pulled to today" badge and the menu's Remove/Add
  // toggle. We only show the badge when the activity isn't natively scheduled
  // today, so a same-day double doesn't look weird.
  const scheduledToday = isToday(activity.scheduledAt);
  const pulledToToday = !!activity.displayDate && isToday(activity.displayDate) && !scheduledToday;
  const canAddToToday = !isDone && !scheduledToday && !pulledToToday && activity.status !== "Cancelled" && activity.status !== "Done";
  // Lifetime pull-in count (from auditLog). ≥2 means the RP has been
  // intending to do this on multiple days — surface the pattern.
  const addCount = activity.addedToTodayCount ?? 0;
  const showAddPatternChip = addCount >= 2;

  const completionType = linkedChecklist?.completionType ?? "Activity";
  const ps = activity.pitstops?.[0]?.pitstop;
  const goal = ps?.goal;
  const domain = goal?.needsDomain ? fmtDomain(goal.needsDomain) : null;
  // Fall back through the facility chain: most "existing" goals only set
  // linkedFacility (not needsCluster / needsSettlement), but the facility
  // itself carries its own cluster + name. Order: direct → via facility.
  const cluster = goal?.needsCluster?.name ?? goal?.linkedFacility?.cluster?.name ?? null;
  const settlement = goal?.needsSettlement?.name ?? goal?.linkedFacility?.name ?? null;

  // Activity-type completion goes through CompleteActivityModal (modal owns
  // the PATCH Done). Voice / Upload paths server-side mark the activity Done
  // via their own endpoints, then open the SAME modal in "post-complete"
  // mode so indicators + follow-ups can be captured. Outcome is consistent
  // across all three completion paths — no inconsistency.
  function openCompleteModal() {
    setCompleteOpen("complete");
  }

  async function startVoice() {
    if (!linkedChecklist) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setBusy("voice-processing");
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, "voice.webm");
        try {
          await fetchJson(`/api/checklist/${linkedChecklist.id}/voice`, { method: "POST", body: fd });
          // Activity is closed server-side; pop the modal to capture indicators + APs.
          setCompleteOpen("post-complete");
        } catch {
          // surface gate or transcription error
        }
        setBusy(null);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setBusy("voice-recording");
    } catch {
      setBusy(null);
    }
  }

  function stopVoice() { mediaRecorderRef.current?.stop(); }

  async function handleUpload(file: File) {
    if (!linkedChecklist) return;
    setBusy("upload");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("checklistItemId", linkedChecklist.id);
    try {
      await fetchJson("/api/upload", { method: "POST", body: fd });
      // Activity is closed server-side; pop the modal to capture indicators + APs.
      setCompleteOpen("post-complete");
    } catch {
      // surface gate or upload error
    }
    setBusy(null);
  }

  // Single in-flight guard for both directions of the toggle. Mirrors the
  // Activities-page fix (d9e8796): the prior version swallowed non-2xx, so a
  // 403 or 5xx looked identical to a successful click and the menu just
  // closed. Surface the server's error so the RP knows why nothing happened.
  const [todayBusy, setTodayBusy] = useState(false);
  async function toggleDisplayToday(method: "POST" | "DELETE") {
    if (todayBusy) return;
    setTodayBusy(true);
    try {
      await fetchJson(`/api/pitstop-events/${activity.id}/display-today`, { method });
      onRescheduled?.();
    } catch (err) {
      const msg = err instanceof FetchJsonError ? err.message : "Network error.";
      alert(msg || `Could not ${method === "POST" ? "add to" : "remove from"} today.`);
    } finally {
      setTodayBusy(false);
    }
  }
  const addToToday      = () => toggleDisplayToday("POST");
  const removeFromToday = () => toggleDisplayToday("DELETE");

  // ── Action button ─────────────────────────────────────────────────────────
  const isBusy = busy !== null;
  const action = isDone ? (
    <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium px-2">
      <Check className="w-3.5 h-3.5" />
      Done
    </span>
  ) : completionType === "Voice" ? (
    busy === "voice-recording" ? (
      <button onClick={stopVoice}
        className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1">
        <Square className="w-3 h-3" />Stop
      </button>
    ) : busy === "voice-processing" ? (
      <span className="px-3 py-1.5 text-xs text-stone-400 flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />Saving
      </span>
    ) : (
      <button onClick={startVoice} disabled={isBusy}
        className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 text-xs font-semibold rounded-lg flex items-center gap-1 disabled:opacity-50">
        <Mic className="w-3.5 h-3.5" />Voice
      </button>
    )
  ) : completionType === "Upload" ? (
    busy === "upload" ? (
      <span className="px-3 py-1.5 text-xs text-stone-400 flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />Uploading
      </span>
    ) : (
      <>
        <button onClick={() => fileInputRef.current?.click()} disabled={isBusy}
          className="px-3 py-1.5 bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-700 text-xs font-semibold rounded-lg flex items-center gap-1 disabled:opacity-50">
          <Paperclip className="w-3.5 h-3.5" />Photo
        </button>
        <input type="file" ref={fileInputRef} className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
      </>
    )
  ) : (
    <button onClick={openCompleteModal} disabled={isBusy}
      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg">
      {busy === "done" ? "…" : "Done"}
    </button>
  );

  // ── Card variant (used for emphasis at the top of overdue stacks) ─────────
  if (variant === "card") {
    return (
      <div className={`rounded-2xl p-4 flex flex-col gap-3 shadow-sm border ${
        isOverdue ? "bg-amber-50 border-amber-200" : "bg-white border-stone-200"
      }`}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-stone-800 leading-snug">{activity.title}</p>
            {goal?.title && <p className="text-[11px] text-stone-400 mt-0.5 truncate">{goal.title}</p>}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {activity.type && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ACTIVITY_TYPE_STYLE[activity.type] ?? "bg-stone-100 text-stone-600"}`}>
                  {activity.type}
                </span>
              )}
              {isOverdue
                ? <span className="text-xs font-semibold text-amber-700">{daysAgo(activity.scheduledAt)}d overdue</span>
                : <span className="text-xs text-stone-500">{fmtTime(activity.scheduledAt)}</span>
              }
              {(cluster || settlement) && (
                <span className="text-[10px] text-stone-500 flex items-center gap-0.5">
                  <MapPin className="w-2.5 h-2.5" />
                  {[settlement, cluster].filter(Boolean).join(", ")}
                </span>
              )}
              {domain && (
                <span className="text-[10px] text-violet-700 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded">
                  {domain}
                </span>
              )}
              {rescheduleCount >= 2 && (
                <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                  <RotateCcw className="w-2.5 h-2.5" />
                  Rescheduled {rescheduleCount}×
                </span>
              )}
              {pulledToToday && (
                <span className="text-[10px] text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                  <CalendarPlus className="w-2.5 h-2.5" />
                  Pulled to today
                </span>
              )}
              {showAddPatternChip && (
                <span className="text-[10px] text-sky-800 bg-sky-100 border border-sky-300 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                  <CalendarPlus className="w-2.5 h-2.5" />
                  Pulled {addCount}×
                </span>
              )}
            </div>
          </div>
          <KebabMenu
            innerRef={menuRef}
            open={menuOpen}
            setOpen={setMenuOpen}
            onReschedule={() => { setMenuOpen(false); setRescheduleOpen(true); }}
            onAddToToday={canAddToToday ? () => { setMenuOpen(false); addToToday(); } : undefined}
            onRemoveFromToday={pulledToToday ? () => { setMenuOpen(false); removeFromToday(); } : undefined}
          />
        </div>
        <div className="flex items-center justify-end gap-1.5">{action}</div>
        <RescheduleSheet
          open={rescheduleOpen}
          onClose={() => setRescheduleOpen(false)}
          activity={activity}
          onRescheduled={() => onRescheduled?.()}
        />
        {completeOpen && (
          <CompleteActivityModal
            eventId={activity.id}
            activityTitle={activity.title}
            pitstopTitle={ps?.title ?? null}
            goalTitle={goal?.title ?? null}
            mode={completeOpen}
            onClose={() => setCompleteOpen(null)}
            onCompleted={() => { setCompleteOpen(null); onCompleted(activity.id, linkedChecklist?.id); }}
          />
        )}
      </div>
    );
  }

  // ── Row variant ────────────────────────────────────────────────────────────
  return (
    <div className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
      isOverdue ? "border-amber-200 bg-amber-50/40 hover:bg-amber-50" :
      isDone ? "border-stone-100 bg-stone-50/40 hover:bg-stone-50" :
      "border-stone-200 bg-white hover:bg-stone-50"
    }`}>
      {/* Time column */}
      <div className="flex-shrink-0 w-12 text-right">
        {isOverdue ? (
          <span className="text-[10px] font-semibold text-amber-700">{daysAgo(activity.scheduledAt)}d</span>
        ) : (
          <span className="text-[11px] font-medium text-stone-500 tabular-nums">{fmtTime(activity.scheduledAt)}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {ps?.id ? (
            <Link href={`/pitstops/${ps.id}`} className={`text-sm font-medium truncate hover:text-sky-700 ${isDone ? "text-stone-500 line-through" : "text-stone-800"}`}>
              {activity.title}
            </Link>
          ) : (
            <span className={`text-sm font-medium truncate ${isDone ? "text-stone-500 line-through" : "text-stone-800"}`}>
              {activity.title}
            </span>
          )}
          {activity.type && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ACTIVITY_TYPE_STYLE[activity.type] ?? "bg-stone-100 text-stone-600"}`}>
              {activity.type}
            </span>
          )}
        </div>
        {goal?.title && (
          <p className={`text-[11px] mt-0.5 truncate ${isDone ? "text-stone-400" : "text-stone-600"}`}>
            {goal.title}
          </p>
        )}
        {(domain || cluster || settlement || rescheduleCount >= 2 || pulledToToday || showAddPatternChip) && (
          <p className="text-[11px] text-stone-400 mt-0.5 truncate flex items-center gap-1.5">
            <span className="truncate">{[settlement, cluster, domain].filter(Boolean).join(" · ")}</span>
            {rescheduleCount >= 2 && (
              <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1 py-px rounded font-medium flex items-center gap-0.5 flex-shrink-0">
                <RotateCcw className="w-2.5 h-2.5" />
                {rescheduleCount}×
              </span>
            )}
            {pulledToToday && (
              <span className="text-[10px] text-sky-700 bg-sky-50 border border-sky-200 px-1 py-px rounded font-medium flex items-center gap-0.5 flex-shrink-0">
                <CalendarPlus className="w-2.5 h-2.5" />
                Pulled
              </span>
            )}
            {showAddPatternChip && (
              <span className="text-[10px] text-sky-800 bg-sky-100 border border-sky-300 px-1 py-px rounded font-medium flex items-center gap-0.5 flex-shrink-0">
                <CalendarPlus className="w-2.5 h-2.5" />
                {addCount}×
              </span>
            )}
          </p>
        )}
      </div>

      {/* Action */}
      <div className="flex-shrink-0 flex items-center gap-1.5">
        {action}
        <KebabMenu
          innerRef={menuRef}
          open={menuOpen}
          setOpen={setMenuOpen}
          onReschedule={() => { setMenuOpen(false); setRescheduleOpen(true); }}
        />
      </div>

      <RescheduleSheet
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        activity={activity}
        onRescheduled={() => onRescheduled?.()}
      />
      {completeOpen && (
        <CompleteActivityModal
          eventId={activity.id}
          activityTitle={activity.title}
          pitstopTitle={ps?.title ?? null}
          goalTitle={goal?.title ?? null}
          mode={completeOpen}
          onClose={() => setCompleteOpen(null)}
          onCompleted={() => { setCompleteOpen(null); onCompleted(activity.id, linkedChecklist?.id); }}
        />
      )}
    </div>
  );
}

function KebabMenu({
  innerRef, open, setOpen, onReschedule, onAddToToday, onRemoveFromToday,
}: {
  innerRef: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  setOpen: (v: boolean) => void;
  onReschedule: () => void;
  onAddToToday?: () => void;
  onRemoveFromToday?: () => void;
}) {
  return (
    <div ref={innerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1 text-stone-400 hover:text-stone-600 rounded-md hover:bg-stone-100"
        aria-label="More actions"
        aria-expanded={open}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 min-w-[170px] bg-white rounded-lg shadow-lg border border-stone-200 py-1 text-sm">
          {onAddToToday && (
            <button
              onClick={onAddToToday}
              className="w-full px-3 py-2 text-left text-stone-700 hover:bg-stone-50 flex items-center gap-2"
            >
              <CalendarPlus className="w-3.5 h-3.5 text-stone-400" />
              Add to today
            </button>
          )}
          {onRemoveFromToday && (
            <button
              onClick={onRemoveFromToday}
              className="w-full px-3 py-2 text-left text-stone-700 hover:bg-stone-50 flex items-center gap-2"
            >
              <X className="w-3.5 h-3.5 text-stone-400" />
              Remove from today
            </button>
          )}
          <button
            onClick={onReschedule}
            className="w-full px-3 py-2 text-left text-stone-700 hover:bg-stone-50 flex items-center gap-2"
          >
            <CalendarClock className="w-3.5 h-3.5 text-stone-400" />
            Reschedule
          </button>
        </div>
      )}
    </div>
  );
}
