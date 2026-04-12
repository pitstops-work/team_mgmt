"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Target, ChevronRight, Layers, LayoutDashboard, ListChecks } from "lucide-react";
import Avatar from "@/components/Avatar";
import { GoalStatusBadge } from "@/components/StatusBadge";
import CreateGoalModal from "./CreateGoalModal";
import TemplatePickerModal from "@/components/TemplatePickerModal";
import { qk } from "@/lib/query-keys";
import { fetchGoal, fetchGoals } from "@/lib/api-client";
import OrgOverview, { type OverviewData } from "./OrgOverview";

type Goal = {
  id: string;
  title: string;
  description: string | null;
  status: "Active" | "Paused" | "Complete";
  owner: { id: string; name: string | null; image: string | null };
  pitstops: { id: string; status: string }[];
  programs: { program: { id: string; title: string } }[];
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
  users: { id: string; name: string | null; image: string | null }[];
  programs: { id: string; title: string }[];
  overviewData: OverviewData;
  initialTab: "overview" | "goals";
}

export default function GoalsDashboard({ initialGoals, currentUserId, searchResults, users, programs, overviewData, initialTab }: Props) {
  const [activeTab, setActiveTab] = useState<"overview" | "goals">(initialTab);
  const [showCreate, setShowCreate] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [filter, setFilter] = useState<"All" | "Mine" | "Active" | "Paused" | "Complete">("All");
  const [programFilter, setProgramFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const queryClient = useQueryClient();
  const router = useRouter();

  // React Query — initialData from server, stays fresh for 60s, re-fetches silently after
  const { data: goals = initialGoals } = useQuery<Goal[]>({
    queryKey: qk.goals(),
    queryFn: fetchGoals,
    initialData: initialGoals,
    initialDataUpdatedAt: Date.now(),
  });

  const filtered = goals.filter((g) => {
    if (filter === "Mine" && g.owner.id !== currentUserId) return false;
    if (filter === "Active" && g.status !== "Active") return false;
    if (filter === "Paused" && g.status !== "Paused") return false;
    if (filter === "Complete" && g.status !== "Complete") return false;
    if (programFilter && !g.programs.some((pg) => pg.program.id === programFilter)) return false;
    if (userFilter && g.owner.id !== userFilter) return false;
    return true;
  });

  const myGoals = filtered.filter((g) => g.owner.id === currentUserId);
  const teamGoals = filtered.filter((g) => g.owner.id !== currentUserId);

  // Prefetch goal data + route on hover/touch so navigation feels instant
  const prefetchGoal = (goalId: string) => {
    queryClient.prefetchQuery({
      queryKey: qk.goal(goalId),
      queryFn: () => fetchGoal(goalId),
      staleTime: 30 * 1000,
    });
    router.prefetch(`/goals/${goalId}`);
  };

  if (searchResults) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="mb-8">
          <p className="text-sm text-stone-500 mb-1">Search results for</p>
          <h1 className="text-xl font-semibold text-stone-900">"{searchResults.query}"</h1>
        </div>

        {searchResults.goals.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Goals</h2>
            <div className="space-y-2">
              {searchResults.goals.map((g) => (
                <GoalCard key={g.id} goal={g} onHover={prefetchGoal} />
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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Page header + tabs */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Dashboard</h1>
          <p className="text-sm text-stone-500 mt-0.5">Goals and programme overview</p>
        </div>
        {activeTab === "goals" && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTemplate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium rounded-lg transition-colors"
            >
              <Layers className="w-4 h-4" />
              From Template
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Goal
            </button>
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-0.5 mb-6 bg-stone-100 rounded-lg p-0.5 w-fit">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === "overview" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          Overview
        </button>
        <button
          onClick={() => setActiveTab("goals")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === "goals" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
          }`}
        >
          <ListChecks className="w-3.5 h-3.5" />
          Goals
        </button>
      </div>

      {/* Overview tab */}
      {activeTab === "overview" && (
        <OrgOverview overviewData={overviewData} goals={goals} users={users} />
      )}

      {/* Goals tab */}
      {activeTab === "goals" && (<div>

      <div className="flex flex-wrap gap-1 mb-4">
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

      {(programs.length > 0 || users.length > 0) && (
        <div className="flex flex-wrap gap-2 mb-6">
          {programs.length > 0 && (
            <select
              value={programFilter}
              onChange={(e) => setProgramFilter(e.target.value)}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors outline-none ${
                programFilter
                  ? "border-sky-400 bg-sky-50 text-sky-700"
                  : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
              }`}
            >
              <option value="">All Programs</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          )}
          {users.length > 0 && (
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors outline-none ${
                userFilter
                  ? "border-sky-400 bg-sky-50 text-sky-700"
                  : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
              }`}
            >
              <option value="">All Members</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name ?? u.id}</option>
              ))}
            </select>
          )}
          {(programFilter || userFilter) && (
            <button
              onClick={() => { setProgramFilter(""); setUserFilter(""); }}
              className="px-2.5 py-1 text-xs text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-md transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Target className="w-6 h-6 text-stone-400" />
          </div>
          <p className="text-stone-500 text-sm">No goals yet.</p>
          <button onClick={() => setShowCreate(true)} className="mt-2 text-sm text-sky-600 hover:text-sky-700">
            Create the first one
          </button>
        </div>
      ) : (
        <>
          {myGoals.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">My Goals</h2>
              <div className="space-y-2">
                {myGoals.map((g) => <GoalCard key={g.id} goal={g} onHover={prefetchGoal} />)}
              </div>
            </section>
          )}
          {teamGoals.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Team Goals</h2>
              <div className="space-y-2">
                {teamGoals.map((g) => <GoalCard key={g.id} goal={g} onHover={prefetchGoal} />)}
              </div>
            </section>
          )}
        </>
      )}
      </div>)}

      {showCreate && (
        <CreateGoalModal
          onClose={() => setShowCreate(false)}
          onCreated={(goal) => {
            queryClient.setQueryData<Goal[]>(qk.goals(), (old = []) => [goal as Goal, ...old]);
            setShowCreate(false);
          }}
        />
      )}

      {showTemplate && (
        <TemplatePickerModal
          onClose={() => setShowTemplate(false)}
          onCreated={(goal) => {
            queryClient.setQueryData<Goal[]>(qk.goals(), (old = []) => [goal as Goal, ...old]);
            setShowTemplate(false);
          }}
        />
      )}
    </div>
  );
}

function GoalCard({ goal, onHover }: { goal: Goal; onHover: (id: string) => void }) {
  const total = goal.pitstops.length;
  const done = goal.pitstops.filter((p) => p.status === "Done").length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Link
      href={`/goals/${goal.id}`}
      onMouseEnter={() => onHover(goal.id)}
      onTouchStart={() => onHover(goal.id)}
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
              <div className="h-full bg-sky-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
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
