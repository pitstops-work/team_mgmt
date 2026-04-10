"use client";

import { useState } from "react";
import { Scale, Plus, Trash2, X } from "lucide-react";

type DecisionStatus = "Open" | "Made" | "Reversed";
type Decision = {
  id: string;
  title: string;
  description: string | null;
  rationale: string | null;
  status: DecisionStatus;
  decidedAt: string | null;
  goalId: string | null;
  createdAt: string;
  createdBy: { id: string; name: string | null; image: string | null };
};
type Goal = { id: string; title: string };

const STATUS_CONFIG: Record<DecisionStatus, { label: string; cls: string }> = {
  Open:     { label: "Open",     cls: "bg-sky-50 text-sky-700 border-sky-200" },
  Made:     { label: "Made",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  Reversed: { label: "Reversed", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function DecisionsView({
  initialDecisions,
  goals,
}: {
  initialDecisions: Decision[];
  goals: Goal[];
  currentUserId: string;
}) {
  const [decisions, setDecisions] = useState<Decision[]>(initialDecisions);
  const [filterGoalId, setFilterGoalId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rationale, setRationale] = useState("");
  const [goalId, setGoalId] = useState("");
  const [status, setStatus] = useState<DecisionStatus>("Open");
  const [saving, setSaving] = useState(false);

  const filtered = filterGoalId ? decisions.filter((d) => d.goalId === filterGoalId) : decisions;

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), description: description.trim() || null, rationale: rationale.trim() || null, goalId: goalId || null, status }),
    });
    if (res.ok) {
      const d = await res.json();
      setDecisions((prev) => [d, ...prev]);
      setTitle(""); setDescription(""); setRationale(""); setGoalId(""); setStatus("Open"); setShowForm(false);
    }
    setSaving(false);
  };

  const handleStatusChange = async (id: string, newStatus: DecisionStatus) => {
    setDecisions((prev) => prev.map((d) => d.id === id ? { ...d, status: newStatus } : d));
    await fetch(`/api/decisions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this decision?")) return;
    setDecisions((prev) => prev.filter((d) => d.id !== id));
    await fetch(`/api/decisions/${id}`, { method: "DELETE" });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-stone-400" />
          <h1 className="text-lg font-semibold text-stone-900">Decisions</h1>
          <span className="text-xs text-stone-400">({filtered.length})</span>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New decision
        </button>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <select
          value={filterGoalId}
          onChange={(e) => setFilterGoalId(e.target.value)}
          className="px-3 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
        >
          <option value="">All goals</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>{g.title}</option>
          ))}
        </select>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-6 bg-stone-50 rounded-xl p-4 border border-stone-200 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-stone-700">New Decision</p>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-stone-400" /></button>
          </div>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Decision title…"
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
          />
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Rationale (optional)"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
          />
          <div className="flex gap-2">
            <select value={goalId} onChange={(e) => setGoalId(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-400">
              <option value="">No goal</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as DecisionStatus)}
              className="px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-400">
              <option value="Open">Open</option>
              <option value="Made">Made</option>
              <option value="Reversed">Reversed</option>
            </select>
          </div>
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
          <p className="text-stone-400 text-sm">No decisions yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => {
            const cfg = STATUS_CONFIG[d.status];
            const goal = goals.find((g) => g.id === d.goalId);
            return (
              <div key={d.id} className="bg-white rounded-xl border border-stone-200 p-4 group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-medium text-stone-900">{d.title}</span>
                      <select
                        value={d.status}
                        onChange={(e) => handleStatusChange(d.id, e.target.value as DecisionStatus)}
                        className={`text-xs font-medium px-2 py-0.5 rounded border ${cfg.cls} bg-transparent cursor-pointer`}
                      >
                        <option value="Open">Open</option>
                        <option value="Made">Made</option>
                        <option value="Reversed">Reversed</option>
                      </select>
                      {goal && <span className="text-xs text-stone-400 bg-stone-50 border border-stone-200 px-2 py-0.5 rounded">{goal.title}</span>}
                    </div>
                    {d.description && <p className="text-sm text-stone-600 mb-1">{d.description}</p>}
                    {d.rationale && <p className="text-xs text-stone-400 italic mb-1">Rationale: {d.rationale}</p>}
                    <p className="text-xs text-stone-300">{d.createdBy.name} · {fmtDate(d.createdAt)}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-stone-300 hover:text-red-400 transition-all"
                  >
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
