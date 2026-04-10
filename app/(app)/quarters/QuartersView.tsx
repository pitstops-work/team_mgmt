"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarRange, Plus, X, Check } from "lucide-react";

type PitstopHealth = { id: string; status: string };
type GoalStub = { id: string; title: string; status: string; pitstops: PitstopHealth[] };
type QuarterGoal = { goal: GoalStub };
type Quarter = {
  id: string;
  year: number;
  quarter: number;
  startDate: string;
  endDate: string;
  focus: string | null;
  goals: QuarterGoal[];
};

function currentQuarter(): { year: number; quarter: number } {
  const now = new Date();
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

function isCurrentQuarter(q: Quarter): boolean {
  const curr = currentQuarter();
  return q.year === curr.year && q.quarter === curr.quarter;
}

function pitstopHealth(goals: QuarterGoal[]) {
  let done = 0, overdue = 0;
  const now = new Date();
  goals.forEach(({ goal }) => {
    goal.pitstops.forEach((p) => {
      if (p.status === "Done") done++;
    });
  });
  return { done, total: goals.reduce((s, { goal }) => s + goal.pitstops.length, 0), overdue };
}

export default function QuartersView({
  initialQuarters,
  allGoals,
}: {
  initialQuarters: Quarter[];
  allGoals: GoalStub[];
  currentUserId: string;
}) {
  const [quarters, setQuarters] = useState<Quarter[]>(initialQuarters);
  const [showForm, setShowForm] = useState(false);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [qNum, setQNum] = useState("1");
  const [focus, setFocus] = useState("");
  const [saving, setSaving] = useState(false);
  const [taggingGoalId, setTaggingGoalId] = useState<{ quarterId: string; goalId: string } | null>(null);

  const handleCreate = async () => {
    setSaving(true);
    const res = await fetch("/api/quarters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: parseInt(year), quarter: parseInt(qNum), focus: focus.trim() || null }),
    });
    if (res.ok) {
      const q = await res.json();
      setQuarters((prev) => [{ ...q, goals: [] }, ...prev]);
      setYear(String(new Date().getFullYear())); setQNum("1"); setFocus(""); setShowForm(false);
    }
    setSaving(false);
  };

  const handleTagGoal = async (quarterId: string, goalId: string, tag: boolean) => {
    const method = tag ? "POST" : "DELETE";
    const res = await fetch(`/api/goals/${goalId}/quarters`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quarterId }),
    });
    if (res.ok) {
      const goal = allGoals.find((g) => g.id === goalId)!;
      setQuarters((prev) => prev.map((q) =>
        q.id === quarterId ? {
          ...q,
          goals: tag
            ? [...q.goals, { goal }]
            : q.goals.filter((qg) => qg.goal.id !== goalId),
        } : q
      ));
    }
    setTaggingGoalId(null);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <CalendarRange className="w-5 h-5 text-stone-400" />
          <h1 className="text-lg font-semibold text-stone-900">Quarterly Planning</h1>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" />
          New quarter
        </button>
      </div>

      {showForm && (
        <div className="mb-6 bg-stone-50 rounded-xl p-4 border border-stone-200 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-stone-700">New Quarter</p>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-stone-400" /></button>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-stone-500 mb-1">Year</label>
              <input type="number" value={year} onChange={(e) => setYear(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-stone-500 mb-1">Quarter</label>
              <select value={qNum} onChange={(e) => setQNum(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-400">
                <option value="1">Q1 (Jan–Mar)</option>
                <option value="2">Q2 (Apr–Jun)</option>
                <option value="3">Q3 (Jul–Sep)</option>
                <option value="4">Q4 (Oct–Dec)</option>
              </select>
            </div>
          </div>
          <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Focus theme (optional)"
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-2 text-sm text-stone-600">Cancel</button>
            <button onClick={handleCreate} disabled={saving}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}

      {quarters.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-stone-200 rounded-xl">
          <p className="text-stone-400 text-sm">No quarters yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {quarters.map((q) => {
            const isCurrent = isCurrentQuarter(q);
            const health = pitstopHealth(q.goals);
            const taggedGoalIds = new Set(q.goals.map((qg) => qg.goal.id));
            const untaggedGoals = allGoals.filter((g) => !taggedGoalIds.has(g.id));
            const isTagging = taggingGoalId?.quarterId === q.id;
            return (
              <div key={q.id} className={`rounded-xl border overflow-hidden ${isCurrent ? "border-sky-300 shadow-sm" : "border-stone-200"}`}>
                <div className={`px-4 py-3 flex items-start justify-between ${isCurrent ? "bg-sky-50" : "bg-stone-50"}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${isCurrent ? "text-sky-800" : "text-stone-800"}`}>
                        Q{q.quarter} {q.year}
                      </span>
                      {isCurrent && <span className="text-[10px] font-medium bg-sky-500 text-white px-1.5 py-0.5 rounded">Current</span>}
                    </div>
                    {q.focus && <p className="text-xs text-stone-500 mt-0.5">{q.focus}</p>}
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      {health.done}/{health.total} pitstops done · {q.goals.length} goals
                    </p>
                  </div>
                  <button
                    onClick={() => setTaggingGoalId(isTagging ? null : { quarterId: q.id, goalId: "" })}
                    className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tag goal
                  </button>
                </div>

                {isTagging && untaggedGoals.length > 0 && (
                  <div className="px-4 py-2 border-t border-stone-200 bg-white">
                    <p className="text-[10px] text-stone-400 mb-1">Select goal to tag:</p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {untaggedGoals.map((g) => (
                        <button
                          key={g.id}
                          onClick={() => handleTagGoal(q.id, g.id, true)}
                          className="w-full text-left px-2.5 py-1.5 text-xs text-stone-700 hover:bg-sky-50 hover:text-sky-700 rounded-md transition-colors"
                        >
                          {g.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {q.goals.length > 0 && (
                  <div className="divide-y divide-stone-100">
                    {q.goals.map(({ goal }) => {
                      const done = goal.pitstops.filter((p) => p.status === "Done").length;
                      const total = goal.pitstops.length;
                      return (
                        <div key={goal.id} className="px-4 py-2.5 flex items-center gap-3 group bg-white">
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            goal.status === "Complete" ? "bg-emerald-400" : goal.status === "Active" ? "bg-sky-400" : "bg-amber-400"
                          }`} />
                          <Link href={`/goals/${goal.id}`} className="flex-1 text-xs text-stone-700 hover:text-sky-600 transition-colors truncate">
                            {goal.title}
                          </Link>
                          {total > 0 && (
                            <span className="text-[10px] text-stone-400 flex-shrink-0">{done}/{total}</span>
                          )}
                          <button
                            onClick={() => handleTagGoal(q.id, goal.id, false)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-stone-300 hover:text-red-400 transition-all"
                            title="Untag from quarter"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {q.goals.length === 0 && (
                  <div className="px-4 py-3 bg-white">
                    <p className="text-xs text-stone-400">No goals tagged to this quarter yet.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
