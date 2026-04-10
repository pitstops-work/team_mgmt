"use client";

import { useState } from "react";
import { ShieldAlert, Plus, Trash2, X } from "lucide-react";

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
  goalId: string | null;
  createdAt: string;
  createdBy: { id: string; name: string | null };
};
type Goal = { id: string; title: string };

function riskColor(likelihood: RiskLikelihood, impact: RiskImpact): string {
  const score = (["Low", "Medium", "High"].indexOf(likelihood) + 1) * (["Low", "Medium", "High"].indexOf(impact) + 1);
  if (score >= 9) return "bg-red-50 border-red-200 text-red-700";
  if (score >= 4) return "bg-amber-50 border-amber-200 text-amber-700";
  return "bg-emerald-50 border-emerald-200 text-emerald-700";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function RisksView({
  initialRisks,
  goals,
}: {
  initialRisks: Risk[];
  goals: Goal[];
  currentUserId: string;
}) {
  const [risks, setRisks] = useState<Risk[]>(initialRisks);
  const [filterGoalId, setFilterGoalId] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | RiskStatus>("");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [likelihood, setLikelihood] = useState<RiskLikelihood>("Medium");
  const [impact, setImpact] = useState<RiskImpact>("Medium");
  const [mitigation, setMitigation] = useState("");
  const [goalId, setGoalId] = useState("");
  const [saving, setSaving] = useState(false);

  let filtered = risks;
  if (filterGoalId) filtered = filtered.filter((r) => r.goalId === filterGoalId);
  if (filterStatus) filtered = filtered.filter((r) => r.status === filterStatus);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/risks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), description: description.trim() || null, likelihood, impact, mitigation: mitigation.trim() || null, goalId: goalId || null }),
    });
    if (res.ok) {
      const r = await res.json();
      setRisks((prev) => [r, ...prev]);
      setTitle(""); setDescription(""); setLikelihood("Medium"); setImpact("Medium"); setMitigation(""); setGoalId(""); setShowForm(false);
    }
    setSaving(false);
  };

  const handleStatusChange = async (id: string, status: RiskStatus) => {
    setRisks((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
    await fetch(`/api/risks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this risk?")) return;
    setRisks((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/risks/${id}`, { method: "DELETE" });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-stone-400" />
          <h1 className="text-lg font-semibold text-stone-900">Risk Registry</h1>
          <span className="text-xs text-stone-400">({filtered.length})</span>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Log risk
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <select value={filterGoalId} onChange={(e) => setFilterGoalId(e.target.value)}
          className="px-3 py-1.5 text-sm border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-400">
          <option value="">All goals</option>
          {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as "" | RiskStatus)}
          className="px-3 py-1.5 text-sm border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-400">
          <option value="">All statuses</option>
          <option value="Open">Open</option>
          <option value="Mitigated">Mitigated</option>
          <option value="Closed">Closed</option>
        </select>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-6 bg-stone-50 rounded-xl p-4 border border-stone-200 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-stone-700">Log Risk</p>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-stone-400" /></button>
          </div>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Risk title…"
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" rows={2}
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none" />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-stone-500 mb-1">Likelihood</label>
              <select value={likelihood} onChange={(e) => setLikelihood(e.target.value as RiskLikelihood)}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-400">
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-stone-500 mb-1">Impact</label>
              <select value={impact} onChange={(e) => setImpact(e.target.value as RiskImpact)}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-400">
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>
          <textarea value={mitigation} onChange={(e) => setMitigation(e.target.value)} placeholder="Mitigation plan (optional)" rows={2}
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none" />
          <select value={goalId} onChange={(e) => setGoalId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-400">
            <option value="">No goal</option>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-2 text-sm text-stone-600">Cancel</button>
            <button onClick={handleCreate} disabled={!title.trim() || saving}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-stone-200 rounded-xl">
          <p className="text-stone-400 text-sm">No risks logged.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const colorCls = riskColor(r.likelihood, r.impact);
            const goal = goals.find((g) => g.id === r.goalId);
            return (
              <div key={r.id} className="bg-white rounded-xl border border-stone-200 p-4 group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-medium text-stone-900">{r.title}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded border ${colorCls}`}>
                        {r.likelihood} × {r.impact}
                      </span>
                      <select value={r.status} onChange={(e) => handleStatusChange(r.id, e.target.value as RiskStatus)}
                        className="text-xs font-medium px-2 py-0.5 rounded border border-stone-200 bg-white cursor-pointer">
                        <option value="Open">Open</option>
                        <option value="Mitigated">Mitigated</option>
                        <option value="Closed">Closed</option>
                      </select>
                      {goal && <span className="text-xs text-stone-400 bg-stone-50 border border-stone-200 px-2 py-0.5 rounded">{goal.title}</span>}
                    </div>
                    {r.description && <p className="text-sm text-stone-600 mb-1">{r.description}</p>}
                    {r.mitigation && <p className="text-xs text-stone-400 italic mb-1">Mitigation: {r.mitigation}</p>}
                    <p className="text-xs text-stone-300">{r.createdBy.name} · {fmtDate(r.createdAt)}</p>
                  </div>
                  <button onClick={() => handleDelete(r.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-stone-300 hover:text-red-400 transition-all">
                    <Trash2 className="w-4 h-4" />
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
