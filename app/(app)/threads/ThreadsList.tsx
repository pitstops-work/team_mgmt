"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare, X } from "lucide-react";
import Avatar from "@/components/Avatar";
import MultiSelect from "@/components/MultiSelect";

type User = { id: string; name: string | null; image: string | null };
type Goal = { id: string; title: string };
type Thread = {
  id: string;
  name: string;
  updatedAt: string;
  pitstopId: string | null;
  goalId: string | null;
  eventId: string | null;
  pitstop: { id: string; title: string; goal: Goal; owner: User | null } | null;
  goal: { id: string; title: string; owner: User | null } | null;
  event: { id: string; title: string; scheduledAt: string } | null;
  _count: { messages: number };
  messages: { body: string; createdAt: string; author: { name: string | null } }[];
};

type Level = "all" | "goal" | "pitstop" | "activity";

const LEVEL_BADGE: Record<string, { label: string; cls: string }> = {
  goal:     { label: "Goal",     cls: "bg-violet-50 text-violet-600 border-violet-200" },
  pitstop:  { label: "Pitstop",  cls: "bg-sky-50 text-sky-600 border-sky-200" },
  activity: { label: "Activity", cls: "bg-amber-50 text-amber-600 border-amber-200" },
};

function getLevel(t: Thread): "goal" | "pitstop" | "activity" {
  if (t.goalId) return "goal";
  if (t.eventId) return "activity";
  return "pitstop";
}

function getHref(t: Thread): string {
  if (t.goal) return `/goals/${t.goal.id}#thread-${t.id}`;
  if (t.pitstop) return `/goals/${t.pitstop.goal.id}/pitstops/${t.pitstop.id}#thread-${t.id}`;
  if (t.event) return `/activities`;
  return "/threads";
}

function getBreadcrumb(t: Thread): string {
  if (t.goal) return t.goal.title;
  if (t.pitstop) return `${t.pitstop.goal.title} › ${t.pitstop.title}`;
  if (t.event) return t.event.title;
  return "";
}

function getOwner(t: Thread): User | null {
  return t.goal?.owner ?? t.pitstop?.owner ?? null;
}

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
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<Level>("all");

  const filtered = threads
    .filter(t => level === "all" || getLevel(t) === level)
    .filter(t => selectedGoals.length === 0 || (
      t.pitstop ? selectedGoals.includes(t.pitstop.goal.id) :
      t.goal    ? selectedGoals.includes(t.goal.id) : false
    ))
    .filter(t => !query || (
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      (t.pitstop?.title ?? "").toLowerCase().includes(query.toLowerCase()) ||
      (t.pitstop?.goal.title ?? "").toLowerCase().includes(query.toLowerCase()) ||
      (t.goal?.title ?? "").toLowerCase().includes(query.toLowerCase()) ||
      (t.event?.title ?? "").toLowerCase().includes(query.toLowerCase())
    ));

  const hasFilters = selectedGoals.length > 0 || query || level !== "all";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-stone-900">All Threads</h1>
        <p className="text-sm text-stone-500 mt-0.5">{filtered.length} of {threads.length} threads</p>
      </div>

      {/* Level tabs */}
      <div className="flex gap-1 mb-4">
        {(["all", "goal", "pitstop", "activity"] as const).map(l => (
          <button key={l} onClick={() => setLevel(l)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              level === l
                ? "bg-stone-900 text-white"
                : "text-stone-500 hover:text-stone-700 hover:bg-stone-100"
            }`}>
            {l === "all" ? "All" : l.charAt(0).toUpperCase() + l.slice(1)}
            <span className="ml-1 opacity-60">
              ({l === "all" ? threads.length : threads.filter(t => getLevel(t) === l).length})
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search threads…"
          className="flex-1 px-3 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 min-w-0" />
        <MultiSelect
          options={goals.map(g => ({ value: g.id, label: g.title }))}
          value={selectedGoals}
          onChange={setSelectedGoals}
          placeholder="All Goals"
        />
        {hasFilters && (
          <button onClick={() => { setSelectedGoals([]); setQuery(""); setLevel("all"); }} className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* List */}
      {threads.length === 0 ? (
        <div className="text-center py-20">
          <MessageSquare className="w-10 h-10 text-stone-200 mx-auto mb-3" />
          <p className="text-stone-500 font-medium">No threads yet</p>
          <p className="text-xs text-stone-400 mt-1">Start discussions inside goals, pitstops, or activities.</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-stone-400 text-sm py-16">No threads match your filters.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => {
            const lastMsg = t.messages[0];
            const lvl = getLevel(t);
            const badge = LEVEL_BADGE[lvl];
            const owner = getOwner(t);
            return (
              <Link key={t.id} href={getHref(t)}
                className="block bg-white border border-stone-200 rounded-xl px-4 py-3 hover:border-sky-200 hover:shadow-sm transition-all group">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MessageSquare className="w-4 h-4 text-stone-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-stone-800 group-hover:text-sky-700 truncate">{t.name}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border flex-shrink-0 ${badge.cls}`}>{badge.label}</span>
                      </div>
                      <span className="text-[11px] text-stone-400 flex-shrink-0">{timeAgo(t.updatedAt)}</span>
                    </div>
                    <p className="text-xs text-stone-400 mt-0.5 truncate">{getBreadcrumb(t)}</p>
                    {lastMsg && (
                      <p className="text-xs text-stone-500 mt-1.5 line-clamp-1">
                        <span className="font-medium">{lastMsg.author.name}:</span> {lastMsg.body}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[11px] text-stone-400 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />{t._count.messages}
                      </span>
                      {owner && (
                        <div className="flex items-center gap-1">
                          <Avatar name={owner.name} image={owner.image} size="xs" />
                          <span className="text-[11px] text-stone-400">{owner.name}</span>
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
