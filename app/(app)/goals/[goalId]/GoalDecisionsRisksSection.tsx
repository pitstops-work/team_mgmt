"use client";

import { useState } from "react";
import { Scale, ShieldAlert, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────
type DecisionStatus = "Open" | "Made" | "Reversed";
type Decision = {
  id: string;
  title: string;
  description: string | null;
  rationale: string | null;
  status: DecisionStatus;
  decidedAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string | null };
};

type RiskLikelihood = "Low" | "Medium" | "High";
type RiskImpact = "Low" | "Medium" | "High";
type RiskStatus = "Open" | "Mitigated" | "Closed";
type Risk = {
  id: string;
  title: string;
  description: string | null;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  mitigation: string | null;
  status: RiskStatus;
  createdAt: string;
  createdBy: { id: string; name: string | null };
};

// ── Config ─────────────────────────────────────────────────────────────
const DECISION_STATUS: Record<DecisionStatus, { label: string; cls: string }> = {
  Open:     { label: "Open",     cls: "bg-sky-50 text-sky-700 border-sky-200" },
  Made:     { label: "Made",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  Reversed: { label: "Reversed", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

function riskColor(likelihood: RiskLikelihood, impact: RiskImpact): string {
  const score =
    (["Low", "Medium", "High"].indexOf(likelihood) + 1) *
    (["Low", "Medium", "High"].indexOf(impact) + 1);
  if (score >= 9) return "bg-red-50 border-red-200 text-red-700";
  if (score >= 4) return "bg-amber-50 border-amber-200 text-amber-700";
  return "bg-emerald-50 border-emerald-200 text-emerald-700";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Decisions sub-tab ──────────────────────────────────────────────────
function DecisionsTab({ goalId }: { goalId: string }) {
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rationale, setRationale] = useState("");
  const [status, setStatus] = useState<DecisionStatus>("Open");
  const [saving, setSaving] = useState(false);

  // Lazy-load on first render of this tab
  if (!loaded) {
    setLoaded(true);
    setLoading(true);
    fetch(`/api/decisions?goalId=${goalId}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: Decision[]) => { setDecisions(data); setLoading(false); })
      .catch(() => { setDecisions([]); setLoading(false); });
  }

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), description: description.trim() || null, rationale: rationale.trim() || null, goalId, status }),
    });
    if (res.ok) {
      const d = await res.json();
      setDecisions(prev => [d, ...(prev ?? [])]);
      setTitle(""); setDescription(""); setRationale(""); setStatus("Open"); setShowForm(false);
    }
    setSaving(false);
  };

  const handleStatusChange = async (id: string, newStatus: DecisionStatus) => {
    setDecisions(prev => (prev ?? []).map(d => d.id === id ? { ...d, status: newStatus } : d));
    await fetch(`/api/decisions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  };

  const handleDelete = async (id: string) => {
    setDecisions(prev => (prev ?? []).filter(d => d.id !== id));
    await fetch(`/api/decisions/${id}`, { method: "DELETE" });
  };

  return (
    <div className="divide-y divide-stone-100">
      <div className="px-4 py-3">
        {!showForm ? (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700">
            <Plus className="w-3.5 h-3.5" /> Add decision
          </button>
        ) : (
          <div className="space-y-2 bg-stone-50 rounded-lg p-3 border border-stone-200">
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Decision title…"
              className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400" />
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" rows={2}
              className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400 resize-none" />
            <textarea value={rationale} onChange={e => setRationale(e.target.value)} placeholder="Rationale (optional)" rows={2}
              className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400 resize-none" />
            <div className="flex items-center gap-2">
              <select value={status} onChange={e => setStatus(e.target.value as DecisionStatus)}
                className="px-2 py-1 text-xs border border-stone-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-sky-400">
                <option value="Open">Open</option>
                <option value="Made">Made</option>
                <option value="Reversed">Reversed</option>
              </select>
              <button onClick={handleCreate} disabled={!title.trim() || saving}
                className="px-3 py-1 text-xs bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-md font-medium transition-colors">
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setShowForm(false)} className="px-2 py-1 text-xs text-stone-400 hover:text-stone-600">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {loading && <div className="px-4 py-3"><p className="text-xs text-stone-400">Loading…</p></div>}
      {decisions && decisions.length === 0 && !showForm && (
        <div className="px-4 py-3"><p className="text-xs text-stone-400">No decisions yet.</p></div>
      )}
      {decisions && decisions.map(d => {
        const cfg = DECISION_STATUS[d.status];
        return (
          <div key={d.id} className="px-4 py-3 group">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs font-medium text-stone-800">{d.title}</span>
                  <select value={d.status} onChange={e => handleStatusChange(d.id, e.target.value as DecisionStatus)}
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cfg.cls} bg-transparent cursor-pointer`}>
                    <option value="Open">Open</option>
                    <option value="Made">Made</option>
                    <option value="Reversed">Reversed</option>
                  </select>
                </div>
                {d.description && <p className="text-xs text-stone-500 mb-0.5">{d.description}</p>}
                {d.rationale && <p className="text-xs text-stone-400 italic">Rationale: {d.rationale}</p>}
                <p className="text-[10px] text-stone-300 mt-0.5">{d.createdBy.name} · {fmtDate(d.createdAt)}</p>
              </div>
              <button onClick={() => handleDelete(d.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-stone-300 hover:text-red-400 transition-all flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Risks sub-tab ──────────────────────────────────────────────────────
function RisksTab({ goalId }: { goalId: string }) {
  const [risks, setRisks] = useState<Risk[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [likelihood, setLikelihood] = useState<RiskLikelihood>("Medium");
  const [impact, setImpact] = useState<RiskImpact>("Medium");
  const [mitigation, setMitigation] = useState("");
  const [saving, setSaving] = useState(false);

  if (!loaded) {
    setLoaded(true);
    setLoading(true);
    fetch(`/api/risks?goalId=${goalId}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: Risk[]) => { setRisks(data); setLoading(false); })
      .catch(() => { setRisks([]); setLoading(false); });
  }

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/risks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), description: description.trim() || null, likelihood, impact, mitigation: mitigation.trim() || null, goalId }),
    });
    if (res.ok) {
      const r = await res.json();
      setRisks(prev => [r, ...(prev ?? [])]);
      setTitle(""); setDescription(""); setLikelihood("Medium"); setImpact("Medium"); setMitigation(""); setShowForm(false);
    }
    setSaving(false);
  };

  const handleStatusChange = async (id: string, status: RiskStatus) => {
    setRisks(prev => (prev ?? []).map(r => r.id === id ? { ...r, status } : r));
    await fetch(`/api/risks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  };

  const handleDelete = async (id: string) => {
    setRisks(prev => (prev ?? []).filter(r => r.id !== id));
    await fetch(`/api/risks/${id}`, { method: "DELETE" });
  };

  return (
    <div className="divide-y divide-stone-100">
      <div className="px-4 py-3">
        {!showForm ? (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700">
            <Plus className="w-3.5 h-3.5" /> Log risk
          </button>
        ) : (
          <div className="space-y-2 bg-stone-50 rounded-lg p-3 border border-stone-200">
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Risk title…"
              className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400" />
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" rows={2}
              className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400 resize-none" />
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] text-stone-400 mb-0.5">Likelihood</label>
                <select value={likelihood} onChange={e => setLikelihood(e.target.value as RiskLikelihood)}
                  className="w-full px-2 py-1 text-xs border border-stone-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-sky-400">
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-[10px] text-stone-400 mb-0.5">Impact</label>
                <select value={impact} onChange={e => setImpact(e.target.value as RiskImpact)}
                  className="w-full px-2 py-1 text-xs border border-stone-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-sky-400">
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
            </div>
            <textarea value={mitigation} onChange={e => setMitigation(e.target.value)} placeholder="Mitigation plan (optional)" rows={2}
              className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400 resize-none" />
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={!title.trim() || saving}
                className="px-3 py-1 text-xs bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-md font-medium transition-colors">
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setShowForm(false)} className="px-2 py-1 text-xs text-stone-400 hover:text-stone-600">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {loading && <div className="px-4 py-3"><p className="text-xs text-stone-400">Loading…</p></div>}
      {risks && risks.length === 0 && !showForm && (
        <div className="px-4 py-3"><p className="text-xs text-stone-400">No risks logged.</p></div>
      )}
      {risks && risks.map(r => {
        const colorCls = riskColor(r.likelihood, r.impact);
        return (
          <div key={r.id} className="px-4 py-3 group">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs font-medium text-stone-800">{r.title}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${colorCls}`}>
                    {r.likelihood} × {r.impact}
                  </span>
                  <select value={r.status} onChange={e => handleStatusChange(r.id, e.target.value as RiskStatus)}
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-stone-200 bg-white cursor-pointer">
                    <option value="Open">Open</option>
                    <option value="Mitigated">Mitigated</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
                {r.description && <p className="text-xs text-stone-500 mb-0.5">{r.description}</p>}
                {r.mitigation && <p className="text-xs text-stone-400 italic">Mitigation: {r.mitigation}</p>}
              </div>
              <button onClick={() => handleDelete(r.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-stone-300 hover:text-red-400 transition-all flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Combined section ───────────────────────────────────────────────────
export default function GoalDecisionsRisksSection({ goalId }: { goalId: string }) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"decisions" | "risks">("decisions");

  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full px-4 py-3 bg-white hover:bg-stone-50 transition-colors">
        <span className="text-sm font-medium text-stone-700 flex items-center gap-2">
          <Scale className="w-4 h-4 text-stone-400" />
          Decisions &amp; Risks
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
      </button>

      {open && (
        <div className="border-t border-stone-200">
          {/* Sub-tabs */}
          <div className="flex border-b border-stone-100 bg-stone-50">
            <button onClick={() => setActiveTab("decisions")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
                activeTab === "decisions"
                  ? "border-sky-500 text-sky-700 bg-white"
                  : "border-transparent text-stone-500 hover:text-stone-700"
              }`}>
              <Scale className="w-3 h-3" /> Decisions
            </button>
            <button onClick={() => setActiveTab("risks")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
                activeTab === "risks"
                  ? "border-sky-500 text-sky-700 bg-white"
                  : "border-transparent text-stone-500 hover:text-stone-700"
              }`}>
              <ShieldAlert className="w-3 h-3" /> Risks
            </button>
          </div>

          {activeTab === "decisions" && <DecisionsTab goalId={goalId} />}
          {activeTab === "risks" && <RisksTab goalId={goalId} />}
        </div>
      )}
    </div>
  );
}
