"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckSquare, X } from "lucide-react";
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

export default function PitstopsList({ pitstops, goals, users, initialStatus = "", initialNoDate = false }: { pitstops: Pitstop[]; goals: Goal[]; users: User[]; initialStatus?: string; initialNoDate?: boolean }) {
  const [selectedGoal, setSelectedGoal] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedStatus, setSelectedStatus] = useState(initialStatus);
  const [noDateOnly, setNoDateOnly] = useState(initialNoDate);

  const filtered = pitstops
    .filter(p => !selectedGoal || p.goal.id === selectedGoal)
    .filter(p => !selectedUser || p.owner?.id === selectedUser)
    .filter(p => !selectedStatus || p.status === selectedStatus)
    .filter(p => !noDateOnly || !p.targetDate)
    .sort((a, b) => (STATUS_ORDER[a.status as keyof typeof STATUS_ORDER] ?? 3) - (STATUS_ORDER[b.status as keyof typeof STATUS_ORDER] ?? 3));

  const hasFilters = selectedGoal || selectedUser || selectedStatus || noDateOnly;

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
          <button key={s} onClick={() => { setSelectedStatus(s); setNoDateOnly(false); }}
            className={`flex-shrink-0 px-3 py-1.5 text-xs rounded-full border transition-colors ${selectedStatus === s && !noDateOnly ? "bg-stone-800 text-white border-stone-800" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>
            {s === "" ? "All" : s === "InProgress" ? "In Progress" : s}
          </button>
        ))}
        <button onClick={() => { setSelectedStatus(""); setNoDateOnly(v => !v); }}
          className={`flex-shrink-0 px-3 py-1.5 text-xs rounded-full border transition-colors ${noDateOnly ? "bg-amber-600 text-white border-amber-600" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>
          No date
        </button>
        <div className="w-px h-4 bg-stone-200 flex-shrink-0" />
        {/* Goal picker */}
        <select value={selectedGoal} onChange={e => setSelectedGoal(e.target.value)}
          className={`flex-shrink-0 px-3 py-1.5 text-xs border rounded-lg bg-white transition-colors ${selectedGoal ? "border-sky-400 text-sky-700" : "border-stone-200 text-stone-600"}`}>
          <option value="">All Goals</option>
          {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
        {/* User picker */}
        <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}
          className={`flex-shrink-0 px-3 py-1.5 text-xs border rounded-lg bg-white transition-colors ${selectedUser ? "border-sky-400 text-sky-700" : "border-stone-200 text-stone-600"}`}>
          <option value="">All People</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {hasFilters && (
          <button onClick={() => { setSelectedGoal(""); setSelectedUser(""); setSelectedStatus(""); setNoDateOnly(false); }}
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
