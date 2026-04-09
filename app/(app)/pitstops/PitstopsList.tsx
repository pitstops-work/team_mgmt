"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckSquare, ChevronDown, X } from "lucide-react";
import Avatar from "@/components/Avatar";
import { PitstopStatusBadge } from "@/components/StatusBadge";

type User = { id: string; name: string | null; image: string | null };
type Goal = { id: string; title: string };
type Pitstop = {
  id: string; title: string; type: string; status: string;
  startDate: string | null; targetDate: string | null;
  goal: Goal; owner: User | null;
  checklistItems: { id: string; checked: boolean }[];
};

const STATUS_ORDER = { InProgress: 0, Upcoming: 1, Done: 2 };

export default function PitstopsList({ pitstops, goals, users }: { pitstops: Pitstop[]; goals: Goal[]; users: User[] }) {
  const [selectedGoal, setSelectedGoal] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [goalOpen, setGoalOpen] = useState(false);

  const filtered = pitstops
    .filter(p => !selectedGoal || p.goal.id === selectedGoal)
    .filter(p => !selectedUser || p.owner?.id === selectedUser)
    .filter(p => !selectedStatus || p.status === selectedStatus)
    .sort((a, b) => (STATUS_ORDER[a.status as keyof typeof STATUS_ORDER] ?? 3) - (STATUS_ORDER[b.status as keyof typeof STATUS_ORDER] ?? 3));

  const hasFilters = selectedGoal || selectedUser || selectedStatus;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-stone-900">All Pitstops</h1>
        <p className="text-sm text-stone-500 mt-0.5">{filtered.length} of {pitstops.length} pitstops</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1 no-scrollbar">
        {/* Status */}
        {(["", "InProgress", "Upcoming", "Done"] as const).map(s => (
          <button key={s} onClick={() => setSelectedStatus(s)}
            className={`flex-shrink-0 px-3 py-1.5 text-xs rounded-full border transition-colors ${selectedStatus === s ? "bg-stone-800 text-white border-stone-800" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>
            {s === "" ? "All" : s === "InProgress" ? "In Progress" : s}
          </button>
        ))}
        <div className="w-px h-4 bg-stone-200 flex-shrink-0" />
        {/* Goal picker */}
        <div className="relative flex-shrink-0">
          <button onClick={() => setGoalOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors ${selectedGoal ? "border-sky-400 bg-sky-50 text-sky-700" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>
            {selectedGoal ? goals.find(g => g.id === selectedGoal)?.title ?? "Goal" : "All Goals"}
            <ChevronDown className="w-3 h-3" />
          </button>
          {goalOpen && (
            <div className="absolute top-full mt-1 left-0 z-20 w-56 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden">
              <div className="max-h-48 overflow-y-auto p-1">
                <button onClick={() => { setSelectedGoal(""); setGoalOpen(false); }} className="w-full text-left px-3 py-2 text-xs text-stone-500 hover:bg-stone-50 rounded-lg">All Goals</button>
                {goals.map(g => (
                  <button key={g.id} onClick={() => { setSelectedGoal(g.id); setGoalOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-stone-50 rounded-lg truncate ${selectedGoal === g.id ? "text-sky-600 font-medium" : "text-stone-700"}`}>
                    {g.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* User picker */}
        <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}
          className={`flex-shrink-0 px-3 py-1.5 text-xs border rounded-lg bg-white transition-colors ${selectedUser ? "border-sky-400 text-sky-700" : "border-stone-200 text-stone-600"}`}>
          <option value="">All People</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {hasFilters && (
          <button onClick={() => { setSelectedGoal(""); setSelectedUser(""); setSelectedStatus(""); }}
            className="flex-shrink-0 flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-center text-stone-400 text-sm py-16">No pitstops match your filters.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => {
            const total = p.checklistItems.length;
            const done = p.checklistItems.filter(c => c.checked).length;
            return (
              <Link key={p.id} href={`/goals/${p.goal.id}/pitstops/${p.id}`}
                className="block bg-white border border-stone-200 rounded-xl px-4 py-3 hover:border-sky-200 hover:shadow-sm transition-all group">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-stone-800 group-hover:text-sky-700 truncate">{p.title}</span>
                      <PitstopStatusBadge status={p.status as any} />
                    </div>
                    <p className="text-xs text-stone-400 mt-0.5 truncate">{p.goal.title}</p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {p.owner && (
                        <div className="flex items-center gap-1">
                          <Avatar name={p.owner.name} image={p.owner.image} size="xs" />
                          <span className="text-xs text-stone-500">{p.owner.name}</span>
                        </div>
                      )}
                      {p.targetDate && (
                        <span className="text-xs text-stone-400">
                          Due {new Date(p.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                      {total > 0 && (
                        <span className="flex items-center gap-1 text-xs text-stone-400">
                          <CheckSquare className="w-3 h-3" />{done}/{total}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
