"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X, ChevronRight, Plus, Pencil, Minus, AlertTriangle, CheckCircle, Loader2, Send,
} from "lucide-react";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

type SyncChange = {
  kind: "add" | "edit" | "remove";
  entity: "pitstop" | "checklistItem" | "activity" | "goal";
  templateKey: string;
  description: string;
  blocked?: boolean;
  blockedReason?: string;
};

type GoalSyncPlan = {
  goalId: string;
  goalTitle: string;
  goalStatus: string;
  pitstopInstanceCount: number;
  skipped: null | "complete" | "deleted";
  changes: SyncChange[];
};

type SyncPreview = {
  templateId: string;
  templateSlug: string;
  templateName: string;
  totalGoals: number;
  goalsWithChanges: number;
  totalChanges: number;
  goals: GoalSyncPlan[];
};

type ApplyResult = {
  goalsTouched: number;
  changesApplied: number;
  changesBlocked: number;
  errors: string[];
};

interface Props {
  templateId: string;
  templateName: string;
  onClose: () => void;
}

export default function TemplateSyncModal({ templateId, templateName, onClose }: Props) {
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [excludedGoals, setExcludedGoals] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);

  useEffect(() => {
    fetch(`/api/admin/templates/${templateId}/sync-preview`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((p: SyncPreview) => setPreview(p))
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, [templateId]);

  const goalsWithChanges = useMemo(
    () => (preview?.goals ?? []).filter((g) => g.changes.length > 0),
    [preview],
  );

  const includedGoalIds = useMemo(
    () => goalsWithChanges.filter((g) => !excludedGoals.has(g.goalId)).map((g) => g.goalId),
    [goalsWithChanges, excludedGoals],
  );

  const includedChangeCount = useMemo(() => {
    let n = 0;
    for (const g of goalsWithChanges) {
      if (excludedGoals.has(g.goalId)) continue;
      n += g.changes.filter((c) => !c.blocked).length;
    }
    return n;
  }, [goalsWithChanges, excludedGoals]);

  const blockedCount = useMemo(() => {
    let n = 0;
    for (const g of goalsWithChanges) n += g.changes.filter((c) => c.blocked).length;
    return n;
  }, [goalsWithChanges]);

  const toggleGoal = (goalId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(goalId) ? next.delete(goalId) : next.add(goalId);
      return next;
    });
  };

  const toggleInclude = (goalId: string) => {
    setExcludedGoals((prev) => {
      const next = new Set(prev);
      next.has(goalId) ? next.delete(goalId) : next.add(goalId);
      return next;
    });
  };

  const handleApply = async () => {
    if (includedGoalIds.length === 0) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/admin/templates/${templateId}/sync-apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlyGoalIds: includedGoalIds }),
      });
      const data: ApplyResult = await res.json();
      setResult(data);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setApplying(false);
    }
  };

  return (
    <SurfaceProvider id="settings.template_sync_modal">
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-stone-200">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-stone-900">Sync template to existing goals</h2>
            <p className="text-xs text-stone-500 truncate mt-0.5">{templateName}</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-stone-500 py-6 justify-center">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Computing diff against existing goals…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="px-3 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium">
                <CheckCircle className="w-3.5 h-3.5" />
                Applied {result.changesApplied} change{result.changesApplied === 1 ? "" : "s"} to {result.goalsTouched} goal{result.goalsTouched === 1 ? "" : "s"}
              </div>
              {result.changesBlocked > 0 && (
                <p className="text-emerald-700">{result.changesBlocked} change{result.changesBlocked === 1 ? "" : "s"} blocked (rows already completed).</p>
              )}
              {result.errors.length > 0 && (
                <p className="text-amber-700">{result.errors.length} error{result.errors.length === 1 ? "" : "s"} — check the server log.</p>
              )}
              <p className="text-emerald-600 text-[10px] mt-1">Goal owners have been notified.</p>
            </div>
          )}

          {preview && !result && (
            <>
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Goals" value={preview.totalGoals} />
                <Stat label="With changes" value={preview.goalsWithChanges} highlight={preview.goalsWithChanges > 0} />
                <Stat label="Total changes" value={preview.totalChanges} highlight={preview.totalChanges > 0} />
              </div>

              {preview.totalChanges === 0 && (
                <p className="text-center text-xs text-stone-400 py-6">
                  No changes — existing goals already match this template.
                </p>
              )}

              {goalsWithChanges.length > 0 && (
                <>
                  <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                    <p className="text-[10px] uppercase tracking-wide text-stone-500 font-medium">Changes per goal</p>
                    <p className="text-[10px] text-stone-400">
                      {includedGoalIds.length} of {goalsWithChanges.length} included
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    {goalsWithChanges.map((g) => {
                      const isOpen = expanded.has(g.goalId);
                      const included = !excludedGoals.has(g.goalId);
                      const adds    = g.changes.filter((c) => c.kind === "add" && !c.blocked).length;
                      const edits   = g.changes.filter((c) => c.kind === "edit" && !c.blocked).length;
                      const removes = g.changes.filter((c) => c.kind === "remove" && !c.blocked).length;
                      const blocked = g.changes.filter((c) => c.blocked).length;

                      return (
                        <div key={g.goalId} className={`rounded-lg border ${included ? "border-stone-200 bg-white" : "border-stone-100 bg-stone-50"}`}>
                          <div className="flex items-center gap-2 p-2.5">
                            <input
                              type="checkbox"
                              checked={included}
                              onChange={() => toggleInclude(g.goalId)}
                              className="w-3.5 h-3.5 rounded border-stone-300 text-sky-500 focus:ring-sky-400 cursor-pointer"
                            />
                            <button onClick={() => toggleGoal(g.goalId)} className="flex-1 text-left flex items-center gap-2 min-w-0">
                              <ChevronRight className={`w-3 h-3 text-stone-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                              <span className={`text-xs font-medium truncate ${included ? "text-stone-800" : "text-stone-400 line-through"}`}>
                                {g.goalTitle}
                              </span>
                            </button>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {adds > 0 && <Badge color="emerald" icon={<Plus className="w-2.5 h-2.5" />} n={adds} />}
                              {edits > 0 && <Badge color="sky" icon={<Pencil className="w-2.5 h-2.5" />} n={edits} />}
                              {removes > 0 && <Badge color="rose" icon={<Minus className="w-2.5 h-2.5" />} n={removes} />}
                              {blocked > 0 && <Badge color="amber" icon={<AlertTriangle className="w-2.5 h-2.5" />} n={blocked} />}
                            </div>
                          </div>

                          {isOpen && (
                            <div className="border-t border-stone-100 px-3 py-2 space-y-1">
                              {g.changes.map((c, i) => (
                                <ChangeRow key={i} change={c} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {blockedCount > 0 && (
                <p className="text-[10px] text-amber-600 flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {blockedCount} change{blockedCount === 1 ? "" : "s"} blocked because the target row is already Done or Cancelled. These will be skipped during apply.
                </p>
              )}
            </>
          )}
        </div>

        {preview && !result && preview.totalChanges > 0 && (
          <div className="flex items-center justify-between gap-3 p-4 border-t border-stone-200 bg-stone-50 rounded-b-2xl">
            <p className="text-xs text-stone-600">
              Will apply <span className="font-semibold">{includedChangeCount}</span> change{includedChangeCount === 1 ? "" : "s"} across <span className="font-semibold">{includedGoalIds.length}</span> goal{includedGoalIds.length === 1 ? "" : "s"}.
            </p>
            <button
              onClick={handleApply}
              disabled={applying || includedChangeCount === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {applying ? "Applying…" : `Apply ${includedChangeCount} change${includedChangeCount === 1 ? "" : "s"}`}
            </button>
          </div>
        )}

        {result && (
          <div className="flex items-center justify-end gap-2 p-4 border-t border-stone-200 bg-stone-50 rounded-b-2xl">
            <button onClick={onClose} className="px-4 py-2 text-xs font-medium bg-stone-800 hover:bg-stone-900 text-white rounded-lg">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
    </SurfaceProvider>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${highlight ? "border-sky-200 bg-sky-50" : "border-stone-200 bg-white"}`}>
      <p className={`text-lg font-semibold ${highlight ? "text-sky-700" : "text-stone-700"}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-stone-500">{label}</p>
    </div>
  );
}

function Badge({ color, icon, n }: { color: "emerald" | "sky" | "rose" | "amber"; icon: React.ReactNode; n: number }) {
  const cls = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    sky:     "bg-sky-50 text-sky-700 border-sky-200",
    rose:    "bg-rose-50 text-rose-700 border-rose-200",
    amber:   "bg-amber-50 text-amber-700 border-amber-200",
  }[color];
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border ${cls}`}>
      {icon}{n}
    </span>
  );
}

function ChangeRow({ change }: { change: SyncChange }) {
  const kindIcon =
    change.kind === "add" ? <Plus className="w-3 h-3 text-emerald-600 flex-shrink-0" /> :
    change.kind === "edit" ? <Pencil className="w-3 h-3 text-sky-600 flex-shrink-0" /> :
    <Minus className="w-3 h-3 text-rose-600 flex-shrink-0" />;
  return (
    <div className="flex items-start gap-1.5">
      {kindIcon}
      <div className="flex-1 min-w-0">
        <p className={`text-[11px] leading-snug ${change.blocked ? "text-stone-400 line-through" : "text-stone-700"}`}>
          {change.description}
        </p>
        {change.blocked && change.blockedReason && (
          <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5" /> {change.blockedReason}
          </p>
        )}
      </div>
    </div>
  );
}
