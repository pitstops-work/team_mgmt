"use client";

import { useState, useEffect } from "react";
import { X, Lock, CheckCircle2, MapPin } from "lucide-react";
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
  needsSettlementId?: string | null;
  needsClusterId?: string | null;
  needsZoneId?: string | null;
}

interface ScopeSettlement {
  id: string;
  name: string;
  clusterName?: string;
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

  // Settlement attribution state
  const [scopeSettlements, setScopeSettlements] = useState<ScopeSettlement[]>([]);
  const [attributions, setAttributions] = useState<Record<string, number>>({});
  const [loadingScope, setLoadingScope] = useState(false);

  const originalDate = toDateInput(goal.targetDate);
  const deadlineChanged = !!originalDate && targetDate !== originalDate;

  const isNeedsDomainGoal = !!goal.needsDomain;
  const completingNow = status === "Complete" && goal.status !== "Complete";
  const showOutcomeStep = isNeedsDomainGoal && status === "Complete";

  // Needs settlement attribution when: completing a domain goal that is NOT pinned to a single settlement
  const needsAttribution = completingNow && isNeedsDomainGoal && !goal.needsSettlementId && (!!goal.needsClusterId || !!goal.needsZoneId);

  // Fetch settlements in scope when the attribution step becomes relevant
  useEffect(() => {
    if (!needsAttribution) return;
    setLoadingScope(true);
    fetch(`/api/goals/${goal.id}/scope-settlements`)
      .then(r => r.json())
      .then((s: ScopeSettlement[]) => {
        setScopeSettlements(s);
        // Default: distribute outcomeCount equally if already set
        const count = parseFloat(outcomeCount) || 0;
        if (s.length > 0 && count > 0) {
          const perSettlement = Math.floor(count / s.length);
          const init: Record<string, number> = {};
          s.forEach((st, i) => {
            init[st.id] = i === 0 ? count - perSettlement * (s.length - 1) : perSettlement;
          });
          setAttributions(init);
        } else {
          setAttributions({});
        }
      })
      .finally(() => setLoadingScope(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsAttribution]);

  // When outcomeCount changes, redistribute attributions proportionally
  useEffect(() => {
    if (!needsAttribution || scopeSettlements.length === 0) return;
    const count = parseFloat(outcomeCount) || 0;
    if (count <= 0) { setAttributions({}); return; }
    const selected = scopeSettlements.filter(s => (attributions[s.id] ?? 0) > 0 || Object.keys(attributions).length === 0);
    if (selected.length === 0) return;
    const perSettlement = Math.floor(count / selected.length);
    const updated: Record<string, number> = {};
    selected.forEach((s, i) => {
      updated[s.id] = i === 0 ? count - perSettlement * (selected.length - 1) : perSettlement;
    });
    setAttributions(updated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcomeCount]);

  const totalAttributed = Object.values(attributions).reduce((a, b) => a + b, 0);
  const parsedOutcome = outcomeCount !== "" ? parseFloat(outcomeCount) : null;
  const attributionValid = !needsAttribution || (
    totalAttributed > 0 &&
    Math.abs(totalAttributed - (parsedOutcome ?? 0)) < 0.01 &&
    Object.values(attributions).every(c => c >= 0)
  );

  const canSubmit =
    !!title.trim() &&
    !!targetDate &&
    !loading &&
    !(deadlineChanged && !deadlineReason.trim()) &&
    !(showOutcomeStep && (parsedOutcome === null || parsedOutcome < 0)) &&
    attributionValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");

    const body: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || null,
      status,
      recurrence,
      targetDate,
      ...(deadlineChanged && { deadlineChangeReason: deadlineReason.trim() }),
      ...(isNeedsDomainGoal ? { outcomeCount: parsedOutcome } : {}),
    };

    // Attach settlement attributions for cluster/zone domain goals being completed
    if (needsAttribution && totalAttributed > 0) {
      body.attributions = Object.entries(attributions)
        .filter(([, count]) => count > 0)
        .map(([settlementId, count]) => ({ settlementId, count }));
    }

    // For settlement-pinned domain goals, auto-attribute the outcome to that settlement
    if (completingNow && isNeedsDomainGoal && goal.needsSettlementId && parsedOutcome != null) {
      body.attributions = [{ settlementId: goal.needsSettlementId, count: parsedOutcome }];
    }

    const res = await fetch(`/api/goals/${goal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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

          {/* ── Outcome count — required when completing a domain goal ── */}
          {showOutcomeStep && (
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
                  required
                  value={outcomeCount}
                  onChange={(e) => setOutcomeCount(e.target.value)}
                  placeholder={goal.parameter != null ? String(goal.parameter) : "0"}
                  className="w-24 px-3 py-1.5 text-sm border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                />
                {goal.parameter != null && (
                  <span className="text-xs text-emerald-700">
                    planned: <span className="font-semibold">{goal.parameter}</span>
                  </span>
                )}
                {outcomeCount !== "" && goal.parameter != null && parseFloat(outcomeCount) < goal.parameter && (
                  <span className="text-xs text-amber-600 font-medium">
                    {goal.parameter - parseFloat(outcomeCount)} short of target
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Settlement attribution — required for cluster/zone domain goals ── */}
          {needsAttribution && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-2">
              <p className="text-xs font-medium text-sky-800 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                Which settlement(s) did this outcome land in?
                <span className="text-sky-500 font-normal">(required)</span>
              </p>
              <p className="text-[10px] text-sky-600">
                Total must equal the actual count above ({parsedOutcome ?? 0}).
              </p>

              {loadingScope ? (
                <div className="flex gap-1 py-2">
                  {[0,150,300].map(d => <span key={d} className="w-1.5 h-1.5 bg-sky-300 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {scopeSettlements.map(s => (
                    <div key={s.id} className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={attributions[s.id] ?? 0}
                        onChange={e => {
                          const val = Math.max(0, parseInt(e.target.value) || 0);
                          setAttributions(prev => ({ ...prev, [s.id]: val }));
                        }}
                        className="w-16 px-2 py-1 text-xs border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white text-right"
                      />
                      <span className="text-xs text-stone-700 flex-1 truncate">{s.name}</span>
                      {s.clusterName && (
                        <span className="text-[10px] text-stone-400 flex-shrink-0">{s.clusterName}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Total indicator */}
              <div className={`text-xs font-medium flex items-center gap-1 ${
                Math.abs(totalAttributed - (parsedOutcome ?? 0)) < 0.01 ? "text-emerald-600" : "text-red-500"
              }`}>
                <span>Total: {totalAttributed}</span>
                {Math.abs(totalAttributed - (parsedOutcome ?? 0)) >= 0.01 && (
                  <span className="text-stone-400 font-normal">— must equal {parsedOutcome ?? 0}</span>
                )}
              </div>
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
              disabled={!canSubmit}
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
