"use client";

import { useState } from "react";
import { ShieldAlert, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";

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

function riskColor(likelihood: RiskLikelihood, impact: RiskImpact): string {
  const score = (["Low", "Medium", "High"].indexOf(likelihood) + 1) * (["Low", "Medium", "High"].indexOf(impact) + 1);
  if (score >= 9) return "bg-red-50 border-red-200 text-red-700";
  if (score >= 4) return "bg-amber-50 border-amber-200 text-amber-700";
  return "bg-emerald-50 border-emerald-200 text-emerald-700";
}

export default function RisksSection({ goalId }: { goalId: string }) {
  const [risks, setRisks] = useState<Risk[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [likelihood, setLikelihood] = useState<RiskLikelihood>("Medium");
  const [impact, setImpact] = useState<RiskImpact>("Medium");
  const [mitigation, setMitigation] = useState("");
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    if (!open && risks === null) {
      setLoading(true);
      const res = await fetch(`/api/risks?goalId=${goalId}`);
      if (res.ok) setRisks(await res.json());
      else setRisks([]);
      setLoading(false);
    }
    setOpen((v) => !v);
  };

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
      setRisks((prev) => [r, ...(prev ?? [])]);
      setTitle(""); setDescription(""); setLikelihood("Medium"); setImpact("Medium"); setMitigation(""); setShowForm(false);
    }
    setSaving(false);
  };

  const handleStatusChange = async (id: string, status: RiskStatus) => {
    setRisks((prev) => (prev ?? []).map((r) => r.id === id ? { ...r, status } : r));
    await fetch(`/api/risks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  };

  const handleDelete = async (id: string) => {
    setRisks((prev) => (prev ?? []).filter((r) => r.id !== id));
    await fetch(`/api/risks/${id}`, { method: "DELETE" });
  };

  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden">
      <button onClick={toggle} className="flex items-center justify-between w-full px-4 py-3 bg-white hover:bg-stone-50 transition-colors">
        <span className="text-sm font-medium text-stone-700 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-stone-400" />
          Risks
          {risks && risks.filter((r) => r.status === "Open").length > 0 && (
            <span className="text-xs text-red-500">({risks.filter((r) => r.status === "Open").length} open)</span>
          )}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
      </button>

      {open && (
        <div className="border-t border-stone-200 divide-y divide-stone-100">
          <div className="px-4 py-3">
            {!showForm ? (
              <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700">
                <Plus className="w-3.5 h-3.5" />
                Log risk
              </button>
            ) : (
              <div className="space-y-2 bg-stone-50 rounded-lg p-3 border border-stone-200">
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Risk title…"
                  className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400 resize-none"
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] text-stone-400 mb-0.5">Likelihood</label>
                    <select value={likelihood} onChange={(e) => setLikelihood(e.target.value as RiskLikelihood)}
                      className="w-full px-2 py-1 text-xs border border-stone-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-sky-400">
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-stone-400 mb-0.5">Impact</label>
                    <select value={impact} onChange={(e) => setImpact(e.target.value as RiskImpact)}
                      className="w-full px-2 py-1 text-xs border border-stone-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-sky-400">
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                </div>
                <textarea
                  value={mitigation}
                  onChange={(e) => setMitigation(e.target.value)}
                  placeholder="Mitigation plan (optional)"
                  rows={2}
                  className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400 resize-none"
                />
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
          {risks && risks.map((r) => {
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
                      <select
                        value={r.status}
                        onChange={(e) => handleStatusChange(r.id, e.target.value as RiskStatus)}
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-stone-200 bg-white cursor-pointer"
                      >
                        <option value="Open">Open</option>
                        <option value="Mitigated">Mitigated</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </div>
                    {r.description && <p className="text-xs text-stone-500 mb-0.5">{r.description}</p>}
                    {r.mitigation && <p className="text-xs text-stone-400 italic">Mitigation: {r.mitigation}</p>}
                  </div>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-stone-300 hover:text-red-400 transition-all flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
