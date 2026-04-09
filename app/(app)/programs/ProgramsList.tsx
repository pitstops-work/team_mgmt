"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, X, Layers, ChevronRight } from "lucide-react";
import Avatar from "@/components/Avatar";

type User = { id: string; name: string | null; image: string | null };
type Pitstop = { id: string; status: string };
type Goal = { id: string; title: string; owner: User; pitstops: Pitstop[] };
type ProgramGoal = { id: string; goal: Goal };
type Program = { id: string; title: string; description: string | null; owner: User; goals: ProgramGoal[] };
type GoalOption = { id: string; title: string; owner: User };

function progress(goals: ProgramGoal[]) {
  const pitstops = goals.flatMap(g => g.goal.pitstops);
  const done = pitstops.filter(p => p.status === "Done").length;
  return { done, total: pitstops.length, goals: goals.length };
}

function CreateModal({ goals, onClose, onCreated }: { goals: GoalOption[]; onClose: () => void; onCreated: (p: Program) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    const res = await fetch("/api/programs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description }) });
    if (res.ok) onCreated(await res.json());
    else setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-stone-900">New Program</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-stone-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Title</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Urban Program – Bangalore"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Description (optional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">Cancel</button>
            <button type="submit" disabled={!title.trim() || loading}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {loading ? "Creating…" : "Create Program"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProgramsList({ programs: initial, goals, currentUserId }: { programs: Program[]; goals: GoalOption[]; currentUserId: string }) {
  const [programs, setPrograms] = useState(initial);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Programs</h1>
          <p className="text-sm text-stone-500 mt-0.5">Group goals across team members into programs</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> New Program
        </button>
      </div>

      {programs.length === 0 ? (
        <div className="text-center py-20">
          <Layers className="w-10 h-10 text-stone-200 mx-auto mb-3" />
          <p className="text-stone-500 text-sm">No programs yet.</p>
          <p className="text-stone-400 text-xs mt-1">Create a program to group goals across your team.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {programs.map(p => {
            const { done, total, goals: goalCount } = progress(p.goals);
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <Link key={p.id} href={`/programs/${p.id}`}
                className="block bg-white border border-stone-200 rounded-xl px-4 py-4 hover:border-sky-200 hover:shadow-sm transition-all group">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Layers className="w-4 h-4 text-sky-500 flex-shrink-0" />
                      <h3 className="text-sm font-semibold text-stone-900 truncate group-hover:text-sky-700">{p.title}</h3>
                    </div>
                    {p.description && <p className="text-xs text-stone-500 mb-2 line-clamp-1">{p.description}</p>}
                    <div className="flex items-center gap-3 text-xs text-stone-500">
                      <span>{goalCount} goal{goalCount !== 1 ? "s" : ""}</span>
                      <span>{done}/{total} pitstops done</span>
                      <div className="flex items-center gap-1">
                        <Avatar name={p.owner.name} image={p.owner.image} size="xs" />
                        <span>{p.owner.name}</span>
                      </div>
                    </div>
                    {total > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                          <div className="h-full bg-sky-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] text-stone-400 flex-shrink-0">{pct}%</span>
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-sky-400 flex-shrink-0 mt-1 transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateModal
          goals={goals}
          onClose={() => setShowCreate(false)}
          onCreated={p => { setPrograms(prev => [p, ...prev]); setShowCreate(false); }}
        />
      )}
    </div>
  );
}
