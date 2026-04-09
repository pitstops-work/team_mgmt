"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Pencil, Trash2, Plus, X, Layers, CheckCircle2, Circle, Clock, ChevronDown } from "lucide-react";
import Avatar from "@/components/Avatar";
import { GoalStatusBadge } from "@/components/StatusBadge";

type User = { id: string; name: string | null; image: string | null };
type Pitstop = { id: string; title: string; status: string; targetDate: string | null; startDate: string | null; owner: User | null };
type Goal = { id: string; title: string; owner: User; pitstops: Pitstop[] };
type ProgramGoal = { id: string; goal: Goal };
type Program = { id: string; title: string; description: string | null; owner: User; goals: ProgramGoal[] };
type GoalOption = { id: string; title: string; owner: User };

const STATUS_COLOR: Record<string, string> = {
  Done: "text-emerald-500",
  InProgress: "text-sky-500",
  Upcoming: "text-stone-300",
};

function AddGoalPicker({ allGoals, existingIds, onAdd, onClose }: {
  allGoals: GoalOption[];
  existingIds: Set<string>;
  onAdd: (goalId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const available = allGoals.filter(g => !existingIds.has(g.id) && g.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
          <h3 className="text-sm font-semibold text-stone-900">Add Goal to Program</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-stone-400" /></button>
        </div>
        <div className="p-3 border-b border-stone-100">
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search goals…"
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
        </div>
        <div className="max-h-60 overflow-y-auto p-2">
          {available.length === 0 ? (
            <p className="text-xs text-stone-400 text-center py-6">No goals available</p>
          ) : (
            available.map(g => (
              <button key={g.id} onClick={() => onAdd(g.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left hover:bg-stone-50 transition-colors">
                <Avatar name={g.owner.name} image={g.owner.image} size="xs" />
                <span className="text-sm text-stone-700 truncate">{g.title}</span>
                <span className="text-xs text-stone-400 ml-auto flex-shrink-0">{g.owner.name}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function EditModal({ program, onClose, onSaved }: { program: Program; onClose: () => void; onSaved: (p: Program) => void }) {
  const [title, setTitle] = useState(program.title);
  const [description, setDescription] = useState(program.description ?? "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(`/api/programs/${program.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description }) });
    if (res.ok) onSaved(await res.json());
    else setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-stone-900">Edit Program</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-stone-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Title</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Description (optional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-stone-600">Cancel</button>
            <button type="submit" disabled={!title.trim() || loading}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProgramDetail({ program: initial, allGoals, currentUserId }: { program: Program; allGoals: GoalOption[]; currentUserId: string }) {
  const [program, setProgram] = useState(initial);
  const [showEdit, setShowEdit] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(initial.goals.map(g => g.goal.id)));
  const router = useRouter();

  const existingGoalIds = new Set(program.goals.map(g => g.goal.id));

  const allPitstops = program.goals.flatMap(g => g.goal.pitstops);
  const totalPitstops = allPitstops.length;
  const donePitstops = allPitstops.filter(p => p.status === "Done").length;
  const inProgressPitstops = allPitstops.filter(p => p.status === "InProgress").length;
  const pct = totalPitstops > 0 ? Math.round((donePitstops / totalPitstops) * 100) : 0;

  const handleAddGoal = async (goalId: string) => {
    await fetch(`/api/programs/${program.id}/goals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goalId }) });
    const res = await fetch(`/api/programs/${program.id}`);
    if (res.ok) setProgram(await res.json());
    setShowAddGoal(false);
  };

  const handleRemoveGoal = async (goalId: string) => {
    if (!confirm("Remove this goal from the program?")) return;
    await fetch(`/api/programs/${program.id}/goals`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goalId }) });
    setProgram(p => ({ ...p, goals: p.goals.filter(g => g.goal.id !== goalId) }));
  };

  const handleDelete = async () => {
    if (!confirm("Delete this program? Goals will not be affected.")) return;
    await fetch(`/api/programs/${program.id}`, { method: "DELETE" });
    router.push("/programs");
  };

  const toggleExpand = (goalId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(goalId) ? next.delete(goalId) : next.add(goalId);
      return next;
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <Link href="/programs" className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 mb-6 transition-colors">
        <ChevronLeft className="w-3.5 h-3.5" /> Programs
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-5 h-5 text-sky-500 flex-shrink-0" />
              <h1 className="text-xl font-semibold text-stone-900">{program.title}</h1>
            </div>
            {program.description && <p className="text-sm text-stone-500 mt-1">{program.description}</p>}
            <div className="flex items-center gap-2 mt-2">
              <Avatar name={program.owner.name} image={program.owner.image} size="xs" />
              <span className="text-xs text-stone-500">{program.owner.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setShowEdit(true)} className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-md transition-colors">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={handleDelete} className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: "Goals", value: program.goals.length },
            { label: "Pitstops done", value: `${donePitstops}/${totalPitstops}` },
            { label: "In progress", value: inProgressPitstops },
          ].map(s => (
            <div key={s.label} className="bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-center">
              <p className="text-xl font-bold text-stone-900">{s.value}</p>
              <p className="text-[11px] text-stone-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {totalPitstops > 0 && (
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-sky-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm font-medium text-stone-600 flex-shrink-0">{pct}% complete</span>
          </div>
        )}
      </div>

      {/* Goals */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-stone-700">Goals in this Program</h2>
        <button onClick={() => setShowAddGoal(true)}
          className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 hover:bg-sky-50 px-2.5 py-1.5 rounded-lg transition-colors border border-sky-200">
          <Plus className="w-3.5 h-3.5" /> Add Goal
        </button>
      </div>

      {program.goals.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-stone-200 rounded-xl">
          <p className="text-sm text-stone-400">No goals added yet.</p>
          <button onClick={() => setShowAddGoal(true)} className="mt-2 text-xs text-sky-500 hover:text-sky-700">Add a goal →</button>
        </div>
      ) : (
        <div className="space-y-3">
          {program.goals.map(({ goal }) => {
            const done = goal.pitstops.filter(p => p.status === "Done").length;
            const total = goal.pitstops.length;
            const goalPct = total > 0 ? Math.round((done / total) * 100) : 0;
            const isExpanded = expanded.has(goal.id);

            return (
              <div key={goal.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => toggleExpand(goal.id)} className="flex-1 flex items-center gap-2.5 text-left min-w-0">
                    <ChevronDown className={`w-4 h-4 text-stone-400 flex-shrink-0 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-stone-800 truncate">{goal.title}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Avatar name={goal.owner.name} image={goal.owner.image} size="xs" />
                        <span className="text-xs text-stone-400">{goal.owner.name}</span>
                        <span className="text-xs text-stone-400">·</span>
                        <span className="text-xs text-stone-400">{done}/{total} done</span>
                        {total > 0 && (
                          <div className="flex-1 max-w-[80px] h-1 bg-stone-100 rounded-full overflow-hidden">
                            <div className="h-full bg-sky-400 rounded-full" style={{ width: `${goalPct}%` }} />
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Link href={`/goals/${goal.id}`} className="p-1.5 text-xs text-stone-400 hover:text-sky-600 hover:bg-sky-50 rounded-md transition-colors text-[10px]">
                      Open
                    </Link>
                    <button onClick={() => handleRemoveGoal(goal.id)} className="p-1.5 text-stone-300 hover:text-red-400 hover:bg-red-50 rounded-md transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isExpanded && goal.pitstops.length > 0 && (
                  <div className="border-t border-stone-100 divide-y divide-stone-50">
                    {goal.pitstops.map(p => (
                      <div key={p.id} className="flex items-center gap-2.5 px-4 py-2 pl-10">
                        {p.status === "Done" ? <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ${STATUS_COLOR[p.status]}`} /> :
                         p.status === "InProgress" ? <Clock className={`w-3.5 h-3.5 flex-shrink-0 ${STATUS_COLOR[p.status]}`} /> :
                         <Circle className={`w-3.5 h-3.5 flex-shrink-0 ${STATUS_COLOR[p.status]}`} />}
                        <span className={`text-xs flex-1 truncate ${p.status === "Done" ? "text-stone-400 line-through" : "text-stone-700"}`}>{p.title}</span>
                        {p.owner && (
                          <div className="flex-shrink-0">
                            <Avatar name={p.owner.name} image={p.owner.image} size="xs" />
                          </div>
                        )}
                        {p.targetDate && (
                          <span className="text-[10px] text-stone-400 flex-shrink-0">
                            {new Date(p.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showEdit && <EditModal program={program} onClose={() => setShowEdit(false)} onSaved={p => { setProgram(p); setShowEdit(false); }} />}
      {showAddGoal && <AddGoalPicker allGoals={allGoals} existingIds={existingGoalIds} onAdd={handleAddGoal} onClose={() => setShowAddGoal(false)} />}
    </div>
  );
}
