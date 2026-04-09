"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare, X } from "lucide-react";
import Avatar from "@/components/Avatar";

type User = { id: string; name: string | null; image: string | null };
type Goal = { id: string; title: string };
type Thread = {
  id: string;
  name: string;
  updatedAt: string;
  pitstop: { id: string; title: string; goal: Goal; owner: User | null };
  _count: { messages: number };
  messages: { body: string; createdAt: string; author: { name: string | null } }[];
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ThreadsList({ threads, goals }: { threads: Thread[]; goals: Goal[] }) {
  const [selectedGoal, setSelectedGoal] = useState("");
  const [query, setQuery] = useState("");

  const filtered = threads
    .filter(t => !selectedGoal || t.pitstop.goal.id === selectedGoal)
    .filter(t => !query || t.name.toLowerCase().includes(query.toLowerCase()) || t.pitstop.title.toLowerCase().includes(query.toLowerCase()) || t.pitstop.goal.title.toLowerCase().includes(query.toLowerCase()));

  const hasFilters = selectedGoal || query;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-stone-900">All Threads</h1>
        <p className="text-sm text-stone-500 mt-0.5">{filtered.length} of {threads.length} threads</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search threads…"
          className="flex-1 px-3 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 min-w-0" />
        <select value={selectedGoal} onChange={e => setSelectedGoal(e.target.value)}
          className={`flex-shrink-0 px-3 py-1.5 text-xs border rounded-lg bg-white transition-colors ${selectedGoal ? "border-sky-400 text-sky-700" : "border-stone-200 text-stone-600"}`}>
          <option value="">All Goals</option>
          {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
        {hasFilters && (
          <button onClick={() => { setSelectedGoal(""); setQuery(""); }} className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-center text-stone-400 text-sm py-16">No threads match your filters.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => {
            const lastMsg = t.messages[0];
            return (
              <Link key={t.id} href={`/goals/${t.pitstop.goal.id}/pitstops/${t.pitstop.id}#thread-${t.id}`}
                className="block bg-white border border-stone-200 rounded-xl px-4 py-3 hover:border-sky-200 hover:shadow-sm transition-all group">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MessageSquare className="w-4 h-4 text-stone-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-stone-800 group-hover:text-sky-700 truncate">{t.name}</span>
                      <span className="text-[11px] text-stone-400 flex-shrink-0">{timeAgo(t.updatedAt)}</span>
                    </div>
                    <p className="text-xs text-stone-400 mt-0.5 truncate">
                      {t.pitstop.goal.title} › {t.pitstop.title}
                    </p>
                    {lastMsg && (
                      <p className="text-xs text-stone-500 mt-1.5 line-clamp-1">
                        <span className="font-medium">{lastMsg.author.name}:</span> {lastMsg.body}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[11px] text-stone-400 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />{t._count.messages}
                      </span>
                      {t.pitstop.owner && (
                        <div className="flex items-center gap-1">
                          <Avatar name={t.pitstop.owner.name} image={t.pitstop.owner.image} size="xs" />
                          <span className="text-[11px] text-stone-400">{t.pitstop.owner.name}</span>
                        </div>
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
