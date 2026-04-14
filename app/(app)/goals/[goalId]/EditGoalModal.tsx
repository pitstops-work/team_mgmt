"use client";

import { useState } from "react";
import { X, Lock, CheckCircle2 } from "lucide-react";
import { toDateInput } from "@/lib/timeline";

type Recurrence = "None" | "Weekly" | "Monthly" | "Quarterly" | "Yearly";

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: "Active" | "Paused" | "Complete";
  recurrence: Recurrence;
  targetDate?: string | null;
  needsDomain?: string | null;
  parameter?: number | null;
  outcomeCount?: number | null;
}

interface Props {
  goal: Goal;
  onClose: () => void;
  onUpdated: (data: Partial<Goal>) => void;
}

export default function EditGoalModal({ goal, onClose, onUpdated }: Props) {
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description ?? "");
  const [status, setStatus] = useState(goal.status);
  const [recurrence, setRecurrence] = useState<Recurrence>(goal.recurrence ?? "None");
  const [targetDate, setTargetDate] = useState(toDateInput(goal.targetDate));
  const [deadlineReason, setDeadlineReason] = useState("");
  const [outcomeCount, setOutcomeCount] = useState<string>(
    goal.outcomeCount != null ? String(goal.outcomeCount) : ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const originalDate = toDateInput(goal.targetDate);
  const deadlineChanged = !!originalDate && targetDate !== originalDate;

  // Show outcome field when: has a needsDomain with a parameter AND being set to Complete
  const isNeedsDomainGoal = !!goal.needsDomain && goal.parameter != null;
  const showOutcomeField = isNeedsDomainGoal && status === "Complete";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !targetDate) return;
    setLoading(true);
    setError("");

    const parsedOutcome = outcomeCount !== "" ? parseFloat(outcomeCount) : null;

    const res = await fetch(`/api/goals/${goal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || null,
        status,
        recurrence,
        targetDate,
        ...(deadlineChanged && { deadlineChangeReason: deadlineReason.trim() }),
        // Always send outcomeCount when it's a needs-domain goal being completed
        ...(isNeedsDomainGoal ? { outcomeCount: parsedOutcome } : {}),
      }),
    });

    setLoading(false);
    if (res.ok) {
      onUpdated({
        title: title.trim(),
        description: description.trim() || null,
        status,
        recurrence,
        targetDate,
        ...(isNeedsDomainGoal ? { outcomeCount: parsedOutcome } : {}),
      });
      onClose();
    } else {
      setError("Something went wrong.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-stone-900">Edit Goal</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Title</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-stone-600 mb-1 flex items-center gap-1">
                Deadline <span className="text-red-400">*</span>
                {originalDate && <Lock className="w-3 h-3 text-amber-500 ml-0.5" />}
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => { setTargetDate(e.target.value); setDeadlineReason(""); }}
                required
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 ${deadlineChanged ? "border-amber-400 bg-amber-50" : "border-stone-200"}`}
              />
            </div>

            <div className="flex-1">
              <label className="block text-xs font-medium text-stone-600 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Goal["status"])}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
              >
                <option value="Active">Active</option>
                <option value="Paused">Paused</option>
                <option value="Complete">Complete</option>
              </select>
            </div>
          </div>

          {/* Outcome count — shown when completing a needs-domain goal */}
          {showOutcomeField && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
              <p className="text-xs font-medium text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                How many {goal.needsDomain?.replace(/([A-Z])/g, ' $1').trim().toLowerCase()}s were actually established?
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={outcomeCount}
                  onChange={(e) => setOutcomeCount(e.target.value)}
                  placeholder={String(goal.parameter)}
                  className="w-24 px-3 py-1.5 text-sm border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                />
                <span className="text-xs text-emerald-700">
                  planned: <span className="font-semibold">{goal.parameter}</span>
                </span>
                {outcomeCount !== "" && parseFloat(outcomeCount) < (goal.parameter ?? 0) && (
                  <span className="text-xs text-amber-600 font-medium">
                    {(goal.parameter ?? 0) - parseFloat(outcomeCount)} short of target
                  </span>
                )}
              </div>
              <p className="text-[10px] text-emerald-600">Leave blank to use the planned number ({goal.parameter}).</p>
            </div>
          )}

          {deadlineChanged && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                Deadline is locked. All team members will be notified of this change.
              </p>
              <textarea
                value={deadlineReason}
                onChange={(e) => setDeadlineReason(e.target.value)}
                placeholder="Why is the deadline changing? (required)"
                rows={2}
                className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white resize-none"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Recurrence</label>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as Recurrence)}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
            >
              <option value="None">No recurrence</option>
              <option value="Weekly">Weekly</option>
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly</option>
              <option value="Yearly">Yearly</option>
            </select>
            {recurrence !== "None" && (
              <p className="text-[10px] text-stone-400 mt-1">
                When this goal is complete, you'll be offered to start the next {recurrence.toLowerCase()} cycle.
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">Cancel</button>
            <button
              type="submit"
              disabled={!title.trim() || !targetDate || loading || (deadlineChanged && !deadlineReason.trim())}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
