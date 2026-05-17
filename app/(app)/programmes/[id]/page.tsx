"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, Pencil, Trash2, Activity, Target, Check, X, Layers, MapPin } from "lucide-react";

type Journey = {
  id: string; key: string; label: string; primaryDomain: string | null;
  settlementId: string; settlementName: string | null; clusterName: string | null;
  status: string; notes: string | null;
  parentId: string | null; parentLabel: string | null;
  closedAt: string | null; closedReason: string | null; closedByName: string | null;
  outcomeSnapshot: Record<string, number | null> | null;
  createdAt: string; updatedAt: string;
};
type Phase = {
  id: string; position: number; label: string;
  goalId: string | null; goalTitle: string | null; goalStatus: string | null; goalTargetDate: string | null;
  status: string; notes: string | null;
};
type Edge = { id: string; fromPhaseId: string; toPhaseId: string; label: string | null };
type Outcome = {
  id: string; key: string; label: string; description: string | null;
  unit: string | null; captureSource: string;
  bindingTemplateSlug: string | null; bindingChecklistKey: string | null;
  targetValue: number | null; targetCadence: string | null;
  sortOrder: number; isActive: boolean;
  latestValue: number | null; latestCapturedAt: string | null;
  pointCount: number;
};
type DetailResponse = { journey: Journey; phases: Phase[]; edges: Edge[]; outcomes: Outcome[] };

const PHASE_STATUS_CLS: Record<string, string> = {
  Planned:  "bg-stone-50 text-stone-500 border-stone-200",
  Active:   "bg-sky-50 text-sky-700 border-sky-200",
  Done:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  Skipped:  "bg-stone-100 text-stone-400 border-stone-200",
};

export default function ProgrammeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [outcomeFormOpen, setOutcomeFormOpen] = useState(false);
  const [editingOutcomeId, setEditingOutcomeId] = useState<string | null>(null);
  const [capturingOutcomeId, setCapturingOutcomeId] = useState<string | null>(null);
  const [phaseFormOpen, setPhaseFormOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/programmes/${id}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="max-w-5xl mx-auto px-4 py-10"><p className="text-sm text-stone-400 text-center">Loading…</p></div>;
  if (!data) return <div className="max-w-5xl mx-auto px-4 py-10"><p className="text-sm text-stone-400 text-center">Journey not found.</p></div>;

  const { journey, phases, edges, outcomes } = data;

  const handleDeleteJourney = async () => {
    if (!confirm(`Delete journey "${journey.label}"? Phases keep their goals; only the journey structure is removed.`)) return;
    await fetch(`/api/programmes/${id}`, { method: "DELETE" });
    router.push("/programmes");
  };

  const handleCloseJourney = async () => {
    const reason = prompt(`Close journey "${journey.label}"?\nReason (optional):`);
    if (reason === null) return;
    await fetch(`/api/programmes/${id}/close`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    });
    load();
  };

  const handlePauseJourney = async (next: "Active" | "Paused") => {
    await fetch(`/api/programmes/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }),
    });
    load();
  };

  const handleReopenJourney = async () => {
    if (!confirm("Reopen this closed journey? Snapshot will be cleared.")) return;
    await fetch(`/api/programmes/${id}/reopen`, { method: "POST" });
    load();
  };

  const isClosed = journey.status === "Closed";
  const isPaused = journey.status === "Paused";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <Link href="/programmes" className="text-stone-400 hover:text-stone-600 transition-colors mt-1">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Layers className="w-4 h-4 text-stone-400" />
            <h1 className="text-xl font-semibold text-stone-900">{journey.label}</h1>
            {journey.primaryDomain && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-50 text-stone-500">{journey.primaryDomain}</span>
            )}
            <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${PHASE_STATUS_CLS[journey.status] ?? "bg-stone-50 text-stone-500 border-stone-200"}`}>
              {journey.status}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-stone-500 flex-wrap">
            {journey.settlementName && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {journey.settlementName} {journey.clusterName ? `· ${journey.clusterName}` : ""}
              </span>
            )}
            {journey.parentLabel && (
              <Link href={`/programmes/${journey.parentId}`} className="text-sky-600 hover:underline">
                Part of: {journey.parentLabel}
              </Link>
            )}
            <span className="text-stone-400">Created {new Date(journey.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isClosed && !isPaused && (
            <button onClick={() => handlePauseJourney("Paused")} className="text-[11px] px-2 py-1 rounded text-stone-500 hover:bg-stone-100" title="Pause">Pause</button>
          )}
          {!isClosed && isPaused && (
            <button onClick={() => handlePauseJourney("Active")} className="text-[11px] px-2 py-1 rounded text-stone-500 hover:bg-stone-100" title="Resume">Resume</button>
          )}
          {!isClosed && (
            <button onClick={handleCloseJourney} className="text-[11px] px-2 py-1 rounded text-stone-500 hover:bg-stone-100" title="Close">Close</button>
          )}
          {isClosed && (
            <button onClick={handleReopenJourney} className="text-[11px] px-2 py-1 rounded text-emerald-600 hover:bg-emerald-50">Reopen</button>
          )}
          <button onClick={handleDeleteJourney} className="p-1.5 hover:bg-red-50 rounded text-stone-400 hover:text-red-500 transition-colors" title="Delete journey">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isClosed && (
        <div className="mb-5 bg-stone-50 border border-stone-200 rounded-lg p-3 text-xs text-stone-600">
          <p className="font-medium text-stone-700 mb-1">Journey closed{journey.closedAt ? ` on ${new Date(journey.closedAt).toLocaleDateString()}` : ""}{journey.closedByName ? ` by ${journey.closedByName}` : ""}.</p>
          {journey.closedReason && <p className="text-stone-500 mb-1">{journey.closedReason}</p>}
          {journey.outcomeSnapshot && Object.keys(journey.outcomeSnapshot).length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-wider text-stone-400 mb-1">Outcome snapshot</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-[11px]">
                {Object.entries(journey.outcomeSnapshot).map(([k, v]) => (
                  <span key={k} className="text-stone-600">
                    <code className="text-stone-400">{k}</code>: {v ?? "—"}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Outcomes section */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" /> Outcomes ({outcomes.length})
          </h2>
          <div className="flex items-center gap-3">
            <ApplyPackPicker journeyId={id} journeyDomain={journey.primaryDomain} onApplied={load} />
            <button onClick={() => { setEditingOutcomeId(null); setOutcomeFormOpen(true); }} className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add outcome
            </button>
          </div>
        </div>

        {outcomeFormOpen && (
          <OutcomeForm
            journeyId={id}
            outcome={editingOutcomeId ? outcomes.find(o => o.id === editingOutcomeId) ?? null : null}
            onSaved={() => { setOutcomeFormOpen(false); setEditingOutcomeId(null); load(); }}
            onCancel={() => { setOutcomeFormOpen(false); setEditingOutcomeId(null); }}
          />
        )}

        {!outcomeFormOpen && outcomes.length === 0 && (
          <p className="text-xs text-stone-400 italic text-center py-4">No outcomes defined yet. Outcomes are metrics that span phases (e.g. "children mainstreamed this year").</p>
        )}

        {outcomes.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-2">
            {outcomes.map(o => (
              <OutcomeCard
                key={o.id}
                journeyId={id}
                outcome={o}
                capturing={capturingOutcomeId === o.id}
                onCapture={() => setCapturingOutcomeId(o.id)}
                onCaptureClose={(refresh) => { setCapturingOutcomeId(null); if (refresh) load(); }}
                onEdit={() => { setEditingOutcomeId(o.id); setOutcomeFormOpen(true); }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Phases section */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Phases ({phases.length})
          </h2>
          <button onClick={() => setPhaseFormOpen(v => !v)} className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add phase
          </button>
        </div>

        {phaseFormOpen && (
          <PhaseForm
            journeyId={id}
            onSaved={() => { setPhaseFormOpen(false); load(); }}
            onCancel={() => setPhaseFormOpen(false)}
          />
        )}

        {phases.length === 0 ? (
          <p className="text-xs text-stone-400 italic text-center py-4">No phases yet.</p>
        ) : (
          <PhaseTable journeyId={id} phases={phases} edges={edges} onChanged={load} />
        )}
      </section>

      {journey.notes && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">Notes</h2>
          <p className="text-xs text-stone-600 whitespace-pre-wrap leading-relaxed bg-stone-50 border border-stone-100 rounded-lg p-3">{journey.notes}</p>
        </section>
      )}
    </div>
  );
}

// ── Outcome card with inline capture ─────────────────────────────────────────

function OutcomeCard({
  journeyId, outcome, capturing, onCapture, onCaptureClose, onEdit,
}: {
  journeyId: string; outcome: Outcome;
  capturing: boolean;
  onCapture: () => void;
  onCaptureClose: (refresh: boolean) => void;
  onEdit: () => void;
}) {
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const targetPct = outcome.targetValue && outcome.latestValue != null
    ? Math.min(100, Math.round((outcome.latestValue / outcome.targetValue) * 100))
    : null;

  const handleCapture = async () => {
    const v = parseFloat(value);
    if (isNaN(v)) return;
    setBusy(true);
    await fetch(`/api/programmes/${journeyId}/outcomes/${outcome.id}/points`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: v, note: note || undefined }),
    });
    setBusy(false);
    setValue("");
    setNote("");
    onCaptureClose(true);
  };

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-stone-800">{outcome.label}</span>
            {outcome.captureSource === "RP_ACTIVITY" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">RP-bound</span>
            )}
            {!outcome.isActive && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-400">Inactive</span>
            )}
          </div>
          {outcome.description && (
            <p className="text-[10px] text-stone-500 mt-0.5 leading-relaxed">{outcome.description}</p>
          )}
        </div>
        <button onClick={onEdit} className="p-1 hover:bg-stone-50 rounded text-stone-300 hover:text-stone-500 transition-colors shrink-0">
          <Pencil className="w-3 h-3" />
        </button>
      </div>

      <div className="flex items-end gap-3 mt-2 pt-2 border-t border-stone-100">
        <div className="flex-1">
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-semibold text-stone-800">
              {outcome.latestValue != null ? outcome.latestValue.toLocaleString() : "—"}
            </span>
            {outcome.unit && <span className="text-[10px] text-stone-400">{outcome.unit}</span>}
          </div>
          {outcome.targetValue != null && (
            <p className="text-[10px] text-stone-500">
              target {outcome.targetValue.toLocaleString()}{outcome.unit ? ` ${outcome.unit}` : ""}
              {outcome.targetCadence ? ` / ${outcome.targetCadence}` : ""}
              {targetPct != null && (
                <span className="ml-1 text-stone-400">({targetPct}%)</span>
              )}
            </p>
          )}
          {outcome.latestCapturedAt && (
            <p className="text-[9px] text-stone-400 mt-0.5">last: {new Date(outcome.latestCapturedAt).toLocaleDateString()}</p>
          )}
        </div>
        {outcome.captureSource === "MANUAL_ADMIN" && (
          capturing ? null : (
            <button onClick={onCapture} className="text-[11px] px-2 py-1 bg-stone-100 hover:bg-stone-200 rounded text-stone-700">
              + capture
            </button>
          )
        )}
      </div>

      {capturing && outcome.captureSource === "MANUAL_ADMIN" && (
        <div className="mt-2 pt-2 border-t border-stone-100 space-y-1.5">
          <div className="flex gap-1.5">
            <input
              type="number"
              step="any"
              autoFocus
              className="flex-1 px-2 py-1 text-xs border border-stone-200 rounded bg-white"
              placeholder={`value (${outcome.unit ?? "—"})`}
              value={value}
              onChange={e => setValue(e.target.value)}
            />
            <button onClick={handleCapture} disabled={busy || !value} className="px-2 py-1 bg-emerald-500 text-white rounded text-xs hover:bg-emerald-600 disabled:opacity-40">
              <Check className="w-3 h-3" />
            </button>
            <button onClick={() => onCaptureClose(false)} className="px-2 py-1 hover:bg-stone-100 text-stone-500 rounded text-xs">
              <X className="w-3 h-3" />
            </button>
          </div>
          <input
            className="w-full px-2 py-1 text-xs border border-stone-200 rounded bg-white"
            placeholder="note (optional)"
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

// ── Outcome form (create + edit) ─────────────────────────────────────────────

function OutcomeForm({
  journeyId, outcome, onSaved, onCancel,
}: {
  journeyId: string; outcome: Outcome | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(outcome?.label ?? "");
  const [key, setKey] = useState(outcome?.key ?? "");
  const [description, setDescription] = useState(outcome?.description ?? "");
  const [unit, setUnit] = useState(outcome?.unit ?? "");
  const [captureSource, setCaptureSource] = useState(outcome?.captureSource ?? "MANUAL_ADMIN");
  const [bindingTemplateSlug, setBindingTemplateSlug] = useState(outcome?.bindingTemplateSlug ?? "");
  const [bindingChecklistKey, setBindingChecklistKey] = useState(outcome?.bindingChecklistKey ?? "");
  const [targetValue, setTargetValue] = useState(outcome?.targetValue?.toString() ?? "");
  const [targetCadence, setTargetCadence] = useState(outcome?.targetCadence ?? "");
  const [isActive, setIsActive] = useState(outcome?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState<{ slug: string; name: string; items: { key: string; text: string; pitstopTitle: string }[] }[]>([]);

  useEffect(() => {
    if (captureSource === "RP_ACTIVITY") {
      fetch("/api/admin/template-checklist-keys").then(r => r.ok ? r.json() : []).then(setTemplates).catch(() => {});
    }
  }, [captureSource]);

  const handleDelete = async () => {
    if (!outcome) return;
    if (!confirm(`Delete outcome "${outcome.label}"? All captured points will be removed.`)) return;
    await fetch(`/api/programmes/${journeyId}/outcomes/${outcome.id}`, { method: "DELETE" });
    onSaved();
  };

  const handleSave = async () => {
    if (!label || !key) { setError("Label + key required"); return; }
    if (captureSource === "RP_ACTIVITY" && (!bindingTemplateSlug || !bindingChecklistKey)) {
      setError("Pick a template + checklist item for RP_ACTIVITY"); return;
    }
    setBusy(true);
    setError("");
    const body = {
      key, label,
      description: description || null,
      unit: unit || null,
      captureSource,
      bindingTemplateSlug: captureSource === "RP_ACTIVITY" ? bindingTemplateSlug : null,
      bindingChecklistKey: captureSource === "RP_ACTIVITY" ? bindingChecklistKey : null,
      targetValue: targetValue ? parseFloat(targetValue) : null,
      targetCadence: targetCadence || null,
      isActive,
    };
    const res = outcome
      ? await fetch(`/api/programmes/${journeyId}/outcomes/${outcome.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        })
      : await fetch(`/api/programmes/${journeyId}/outcomes`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
    setBusy(false);
    if (res.ok) {
      onSaved();
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to save");
    }
  };

  const selectedTpl = templates.find(t => t.slug === bindingTemplateSlug);

  return (
    <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 space-y-2 mb-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-stone-500 mb-0.5">Label *</label>
          <input className="w-full px-2 py-1 text-xs border border-stone-200 rounded bg-white" value={label}
            onChange={e => {
              setLabel(e.target.value);
              if (!outcome) setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, ""));
            }}
            placeholder="e.g. Children mainstreamed" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-500 mb-0.5">Key *</label>
          <input className="w-full px-2 py-1 text-xs font-mono border border-stone-200 rounded bg-white" value={key}
            onChange={e => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
            disabled={!!outcome}
            placeholder="children_mainstreamed" />
        </div>
      </div>
      <div>
        <label className="block text-[10px] text-stone-500 mb-0.5">Description</label>
        <input className="w-full px-2 py-1 text-xs border border-stone-200 rounded bg-white" value={description} onChange={e => setDescription(e.target.value)} placeholder="What this outcome captures and why it matters" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[10px] text-stone-500 mb-0.5">Unit</label>
          <input className="w-full px-2 py-1 text-xs border border-stone-200 rounded bg-white" value={unit} onChange={e => setUnit(e.target.value)} placeholder="children, %, etc." />
        </div>
        <div>
          <label className="block text-[10px] text-stone-500 mb-0.5">Target</label>
          <input type="number" step="any" className="w-full px-2 py-1 text-xs border border-stone-200 rounded bg-white" value={targetValue} onChange={e => setTargetValue(e.target.value)} placeholder="optional" />
        </div>
        <div>
          <label className="block text-[10px] text-stone-500 mb-0.5">Cadence</label>
          <select className="w-full px-2 py-1 text-xs border border-stone-200 rounded bg-white" value={targetCadence} onChange={e => setTargetCadence(e.target.value)}>
            <option value="">—</option>
            <option value="monthly">monthly</option>
            <option value="quarterly">quarterly</option>
            <option value="annual">annual</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-[10px] text-stone-500 mb-0.5">Capture source</label>
        <div className="flex gap-1.5">
          {(["MANUAL_ADMIN", "RP_ACTIVITY"] as const).map(s => (
            <button key={s} onClick={() => setCaptureSource(s)} className={`px-2 py-0.5 text-[11px] rounded-full border ${captureSource === s ? "bg-stone-800 text-white border-stone-800" : "border-stone-200 text-stone-600 hover:border-stone-300 bg-white"}`}>
              {s === "MANUAL_ADMIN" ? "Manual" : "RP activity"}
            </button>
          ))}
        </div>
      </div>
      {captureSource === "RP_ACTIVITY" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-stone-500 mb-0.5">Template</label>
            <select className="w-full px-2 py-1 text-xs border border-stone-200 rounded bg-white" value={bindingTemplateSlug}
              onChange={e => { setBindingTemplateSlug(e.target.value); setBindingChecklistKey(""); }}>
              <option value="">— Select —</option>
              {templates.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-stone-500 mb-0.5">Checklist item</label>
            <select className="w-full px-2 py-1 text-xs border border-stone-200 rounded bg-white" value={bindingChecklistKey}
              disabled={!bindingTemplateSlug}
              onChange={e => setBindingChecklistKey(e.target.value)}>
              <option value="">— Select —</option>
              {selectedTpl?.items.map(i => (
                <option key={i.key} value={i.key}>{i.pitstopTitle} · {i.text}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="flex justify-between items-center pt-1">
        <label className="flex items-center gap-1.5 text-[11px] text-stone-600">
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} /> Active
        </label>
        <div className="flex items-center gap-2">
          {error && <span className="text-[10px] text-red-500">{error}</span>}
          {outcome && (
            <button onClick={handleDelete} className="p-1 hover:bg-red-50 rounded text-stone-400 hover:text-red-500 transition-colors">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          <button onClick={onCancel} className="px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 rounded">Cancel</button>
          <button onClick={handleSave} disabled={busy} className="px-2 py-1 text-xs bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-40">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Phase form (create) ──────────────────────────────────────────────────────

function PhaseForm({ journeyId, onSaved, onCancel }: { journeyId: string; onSaved: () => void; onCancel: () => void }) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    if (!label) return;
    setBusy(true);
    await fetch(`/api/programmes/${journeyId}/phases`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }),
    });
    setBusy(false);
    setLabel("");
    onSaved();
  };

  return (
    <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 mb-2 flex items-center gap-2">
      <input autoFocus className="flex-1 px-2 py-1 text-xs border border-stone-200 rounded bg-white"
        placeholder="Phase label (e.g. Mainstreaming follow-up)"
        value={label} onChange={e => setLabel(e.target.value)} />
      <button onClick={handleSave} disabled={busy || !label} className="px-2 py-1 text-xs bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-40">Add</button>
      <button onClick={onCancel} className="px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 rounded">Cancel</button>
    </div>
  );
}

// ── Phase table with inline status / edge mgmt ───────────────────────────────

function PhaseTable({ journeyId, phases, edges, onChanged }: { journeyId: string; phases: Phase[]; edges: Edge[]; onChanged: () => void }) {
  const phaseById = new Map(phases.map(p => [p.id, p]));
  const incomingByPhase = new Map<string, Edge[]>();
  for (const e of edges) {
    if (!incomingByPhase.has(e.toPhaseId)) incomingByPhase.set(e.toPhaseId, []);
    incomingByPhase.get(e.toPhaseId)!.push(e);
  }

  const handleStatus = async (phaseId: string, status: string) => {
    await fetch(`/api/programmes/${journeyId}/phases/${phaseId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    onChanged();
  };

  const handleDeletePhase = async (phaseId: string) => {
    if (!confirm("Remove this phase from the journey? The underlying goal is not deleted.")) return;
    await fetch(`/api/programmes/${journeyId}/phases/${phaseId}`, { method: "DELETE" });
    onChanged();
  };

  const handleDeleteEdge = async (edgeId: string) => {
    await fetch(`/api/programmes/${journeyId}/edges/${edgeId}`, { method: "DELETE" });
    onChanged();
  };

  return (
    <div className="border border-stone-200 rounded-xl bg-white overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-stone-50 border-b border-stone-200">
          <tr className="text-stone-500 text-[10px] uppercase tracking-wider">
            <th className="text-left px-3 py-1.5 w-8">#</th>
            <th className="text-left px-3 py-1.5">Phase</th>
            <th className="text-left px-3 py-1.5">Goal</th>
            <th className="text-left px-3 py-1.5">After</th>
            <th className="text-left px-3 py-1.5">Status</th>
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody>
          {phases.map(p => (
            <tr key={p.id} className="border-b border-stone-100 last:border-0">
              <td className="px-3 py-2 text-stone-400">{p.position + 1}</td>
              <td className="px-3 py-2">{p.label}</td>
              <td className="px-3 py-2">
                {p.goalId && p.goalTitle ? (
                  <Link href={`/goals/${p.goalId}`} className="text-sky-600 hover:underline truncate inline-block max-w-[240px]">
                    {p.goalTitle}
                  </Link>
                ) : (
                  <span className="text-stone-400 italic">—</span>
                )}
                {p.goalStatus && <span className="ml-1 text-[10px] text-stone-400">[{p.goalStatus}]</span>}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {(incomingByPhase.get(p.id) ?? []).map(e => {
                    const from = phaseById.get(e.fromPhaseId);
                    return (
                      <span key={e.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-stone-50 border border-stone-200 rounded-full text-[10px]">
                        {from?.label ?? "?"}
                        <button onClick={() => handleDeleteEdge(e.id)} className="text-stone-300 hover:text-red-500">×</button>
                      </span>
                    );
                  })}
                  <AddEdgeButton journeyId={journeyId} phases={phases} thisPhaseId={p.id} existing={incomingByPhase.get(p.id) ?? []} onAdded={onChanged} />
                </div>
              </td>
              <td className="px-3 py-2">
                <select
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${PHASE_STATUS_CLS[p.status] ?? "border-stone-200"}`}
                  value={p.status}
                  onChange={e => handleStatus(p.id, e.target.value)}
                >
                  <option value="Planned">Planned</option>
                  <option value="Active">Active</option>
                  <option value="Done">Done</option>
                  <option value="Skipped">Skipped</option>
                </select>
              </td>
              <td className="px-3 py-2">
                <button onClick={() => handleDeletePhase(p.id)} className="p-1 hover:bg-red-50 rounded text-stone-300 hover:text-red-500 transition-colors">
                  <Trash2 className="w-3 h-3" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApplyPackPicker({ journeyId, journeyDomain, onApplied }: { journeyId: string; journeyDomain: string | null; onApplied: () => void }) {
  const [packs, setPacks] = useState<{ id: string; key: string; label: string; domain: string | null }[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) fetch("/api/admin/journey-outcome-packs").then(r => r.ok ? r.json() : []).then(setPacks).catch(() => {});
  }, [open]);

  const applicable = packs.filter(p => !p.domain || p.domain === journeyDomain);

  const apply = async (packId: string) => {
    setBusy(true);
    const res = await fetch(`/api/programmes/${journeyId}/apply-pack/${packId}`, { method: "POST" });
    setBusy(false);
    setOpen(false);
    if (res.ok) {
      const data = await res.json();
      if (data.created === 0) alert(`No new outcomes added (${data.skipped} skipped — already exist).`);
      onApplied();
    } else {
      alert("Failed to apply pack.");
    }
  };

  return open ? (
    <div className="flex items-center gap-1">
      <select autoFocus className="text-xs px-2 py-1 border border-stone-200 rounded bg-white" onChange={e => e.target.value && apply(e.target.value)}>
        <option value="">— Pick a pack —</option>
        {applicable.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <button onClick={() => setOpen(false)} disabled={busy} className="px-1 py-0.5 text-xs text-stone-400 hover:text-stone-600"><X className="w-3 h-3" /></button>
    </div>
  ) : (
    <button onClick={() => setOpen(true)} className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1">
      <Plus className="w-3 h-3" /> Apply pack
    </button>
  );
}

function AddEdgeButton({
  journeyId, phases, thisPhaseId, existing, onAdded,
}: {
  journeyId: string; phases: Phase[]; thisPhaseId: string; existing: Edge[]; onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const existingFroms = new Set(existing.map(e => e.fromPhaseId));
  const eligible = phases.filter(p => p.id !== thisPhaseId && !existingFroms.has(p.id));
  if (eligible.length === 0) return null;
  return open ? (
    <select
      autoFocus
      className="text-[10px] border border-stone-200 rounded bg-white px-1 py-0.5"
      onChange={async (e) => {
        if (!e.target.value) { setOpen(false); return; }
        await fetch(`/api/programmes/${journeyId}/edges`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromPhaseId: e.target.value, toPhaseId: thisPhaseId }),
        });
        setOpen(false);
        onAdded();
      }}
      onBlur={() => setOpen(false)}
    >
      <option value="">— after which phase? —</option>
      {eligible.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
  ) : (
    <button onClick={() => setOpen(true)} className="text-[10px] text-stone-400 hover:text-stone-600 px-1">+ link</button>
  );
}
