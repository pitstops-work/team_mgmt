"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Target, ChevronRight } from "lucide-react";
import Avatar from "@/components/Avatar";
import { GoalStatusBadge } from "@/components/StatusBadge";
import CreateGoalModal from "./CreateGoalModal";

type Goal = {
  id: string;
  title: string;
  description: string | null;
  status: "Active" | "Paused" | "Complete";
  owner: { id: string; name: string | null; image: string | null };
  pitstops: { id: string; status: string }[];
};

interface SearchResults {
  query: string;
  goals: Goal[];
  pitstops: { id: string; title: string; goal: { id: string; title: string } }[];
}

interface Props {
  initialGoals: Goal[];
  currentUserId: string;
  searchResults: SearchResults | null;
}

export default function GoalsDashboard({ initialGoals, currentUserId, searchResults }: Props) {
  const [goals, setGoals] = useState<Goal[]>(initialGoals);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<"All" | "Mine" | "Active" | "Paused" | "Complete">("All");

  const filtered = goals.filter((g) => {
    if (filter === "Mine") return g.owner.id === currentUserId;
    if (filter === "Active") return g.status === "Active";
    if (filter === "Paused") return g.status === "Paused";
    if (filter === "Complete") return g.status === "Complete";
    return true;
  });

  const myGoals = filtered.filter((g) => g.owner.id === currentUserId);
  const teamGoals = filtered.filter((g) => g.owner.id !== currentUserId);

  if (searchResults) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-sm text-stone-500 mb-1">Search results for</p>
          <h1 className="text-xl font-semibold text-stone-900">"{searchResults.query}"</h1>
        </div>

        {searchResults.goals.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Goals</h2>
            <div className="space-y-2">
              {searchResults.goals.map((g) => (
                <GoalCard key={g.id} goal={g} />
              ))}
            </div>
          </section>
        )}

        {searchResults.pitstops.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Pitstops</h2>
            <div className="space-y-2">
              {searchResults.pitstops.map((p) => (
                <Link
                  key={p.id}
                  href={`/goals/${p.goal.id}/pitstops/${p.id}`}
                  className="flex items-center justify-between px-4 py-3 bg-white rounded-lg border border-stone-200 hover:border-stone-300 hover:shadow-sm transition-all group"
                >
                  <div>
                    <p className="text-sm font-medium text-stone-900">{p.title}</p>
                    <p className="text-xs text-stone-500 mt-0.5">in {p.goal.title}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-600" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {searchResults.goals.length === 0 && searchResults.pitstops.length === 0 && (
          <p className="text-stone-500 text-sm">No results found.</p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Goals</h1>
          <p className="text-sm text-stone-500 mt-0.5">Track progress across the team</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Goal
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6">
        {(["All", "Mine", "Active", "Paused", "Complete"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              filter === f
                ? "bg-stone-900 text-white"
                : "text-stone-500 hover:text-stone-700 hover:bg-stone-100"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Target className="w-6 h-6 text-stone-400" />
          </div>
          <p className="text-stone-500 text-sm">No goals yet.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-2 text-sm text-sky-600 hover:text-sky-700"
          >
            Create the first one
          </button>
        </div>
      ) : (
        <>
          {myGoals.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">My Goals</h2>
              <div className="space-y-2">
                {myGoals.map((g) => (
                  <GoalCard key={g.id} goal={g} />
                ))}
              </div>
            </section>
          )}

          {teamGoals.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Team Goals</h2>
              <div className="space-y-2">
                {teamGoals.map((g) => (
                  <GoalCard key={g.id} goal={g} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {showCreate && (
        <CreateGoalModal
          onClose={() => setShowCreate(false)}
          onCreated={(goal) => {
            setGoals((prev) => [goal as Goal, ...prev]);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function GoalCard({ goal }: { goal: Goal }) {
  const total = goal.pitstops.length;
  const done = goal.pitstops.filter((p) => p.status === "Done").length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Link
      href={`/goals/${goal.id}`}
      className="flex items-center gap-4 px-4 py-3.5 bg-white rounded-lg border border-stone-200 hover:border-stone-300 hover:shadow-sm transition-all group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-medium text-stone-900 truncate">{goal.title}</p>
          <GoalStatusBadge status={goal.status} />
        </div>
        {goal.description && (
          <p className="text-xs text-stone-500 truncate">{goal.description}</p>
        )}
        {total > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1 bg-stone-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-400 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-stone-400">{done}/{total}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Avatar name={goal.owner.name} image={goal.owner.image} size="sm" />
        <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-600" />
      </div>
    </Link>
  );
}
