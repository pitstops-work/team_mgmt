"use client";

/**
 * ActionPointInputRows — the "Add action points" block inside the activity
 * close-out flow. Maintains an array of in-progress AP drafts that the parent
 * submits as part of the mark-done request (parent calls onChange to keep its
 * state, and POSTs to /api/action-points itself).
 *
 * Pattern matches what an RP does after a visit: type a one-liner, set a due
 * date (defaults to +7d), optionally note the partner staff member it depends
 * on. Add more rows for additional follow-ups. Empty rows on submit are dropped
 * by the parent.
 */

import { Plus, Trash2, AlertTriangle } from "lucide-react";
import type { ActionPointDraft, APPriority } from "./types";

function todayPlusYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function newDraft(pitstopEventId: string): ActionPointDraft {
  // Random clientId so React keys stay stable across re-renders even if rows
  // are reordered or filtered. crypto.randomUUID is available in all modern
  // browsers we target (PWA on Android/iOS).
  return {
    clientId: crypto.randomUUID(),
    pitstopEventId,
    title: "",
    detail: "",
    dueDateYmd: todayPlusYmd(7),
    priority: "routine",
    partnerStaffLabel: "",
  };
}

/** Drop empty rows (no title) and turn ymd → ISO. Use before POSTing. */
export function draftsToPayload(drafts: ActionPointDraft[]): Array<{
  pitstopEventId: string;
  title: string;
  detail?: string;
  dueDate: string;
  priority: APPriority;
  partnerStaffLabel?: string;
}> {
  return drafts
    .filter(d => d.title.trim().length > 0)
    .map(d => ({
      pitstopEventId: d.pitstopEventId,
      title: d.title.trim(),
      detail: d.detail.trim() || undefined,
      // Local midnight; matches what the RP picked. The server stores it as-is
      // and the bucket logic re-applies IST day boundaries on read.
      dueDate: new Date(`${d.dueDateYmd}T00:00:00`).toISOString(),
      priority: d.priority,
      partnerStaffLabel: d.partnerStaffLabel.trim() || undefined,
    }));
}

export function ActionPointInputRows({
  drafts,
  onChange,
  pitstopEventId,
}: {
  drafts: ActionPointDraft[];
  onChange: (next: ActionPointDraft[]) => void;
  /** Used when adding a new row — every draft belongs to this activity. */
  pitstopEventId: string;
}) {
  function update(idx: number, patch: Partial<ActionPointDraft>) {
    onChange(drafts.map((d, i) => i === idx ? { ...d, ...patch } : d));
  }
  function remove(idx: number) {
    onChange(drafts.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...drafts, newDraft(pitstopEventId)]);
  }

  return (
    <div className="space-y-2">
      {drafts.length === 0 && (
        <button
          type="button"
          onClick={add}
          className="w-full py-2 text-xs font-medium text-stone-500 hover:text-stone-700 hover:bg-stone-50 border border-dashed border-stone-300 rounded-lg transition-colors flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Add action point
        </button>
      )}

      {drafts.map((d, idx) => (
        <div key={d.clientId} className={`p-3 rounded-lg border ${d.priority === "urgent" ? "border-red-200 bg-red-50/40" : "border-stone-200 bg-stone-50/60"}`}>
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-2 min-w-0">
              <input
                value={d.title}
                onChange={e => update(idx, { title: e.target.value })}
                placeholder="Action point — e.g. Arrange fire blanket for SGN creche"
                className="w-full px-2.5 py-1.5 text-sm border border-stone-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
              <input
                value={d.detail}
                onChange={e => update(idx, { detail: e.target.value })}
                placeholder="Detail (optional)"
                className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
              <div className="flex flex-wrap gap-2">
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-[10px] font-medium text-stone-500 uppercase tracking-wide mb-0.5">Due</label>
                  <input
                    type="date"
                    value={d.dueDateYmd}
                    onChange={e => update(idx, { dueDateYmd: e.target.value })}
                    className="w-full px-2 py-1 text-xs border border-stone-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-stone-500 uppercase tracking-wide mb-0.5">Priority</label>
                  <button
                    type="button"
                    onClick={() => update(idx, { priority: d.priority === "urgent" ? "routine" : "urgent" })}
                    className={`px-2 py-1 text-xs font-medium rounded-md border transition-colors flex items-center gap-1 ${
                      d.priority === "urgent"
                        ? "bg-red-100 text-red-700 border-red-200 hover:bg-red-200"
                        : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                    }`}
                  >
                    {d.priority === "urgent" && <AlertTriangle className="w-3 h-3" />}
                    {d.priority === "urgent" ? "Urgent" : "Routine"}
                  </button>
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-[10px] font-medium text-stone-500 uppercase tracking-wide mb-0.5">Delegated to (optional)</label>
                  <input
                    value={d.partnerStaffLabel}
                    onChange={e => update(idx, { partnerStaffLabel: e.target.value })}
                    placeholder="e.g. Creche supervisor"
                    className="w-full px-2 py-1 text-xs border border-stone-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors flex-shrink-0"
              aria-label="Remove action point"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}

      {drafts.length > 0 && (
        <button
          type="button"
          onClick={add}
          className="w-full py-1.5 text-xs font-medium text-stone-500 hover:text-stone-700 hover:bg-stone-50 border border-dashed border-stone-300 rounded-md transition-colors flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3 h-3" /> Add another
        </button>
      )}
    </div>
  );
}
