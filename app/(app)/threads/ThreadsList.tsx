"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { MessageSquare, X, ArrowUpRight, Mic, Paperclip } from "lucide-react";
import Avatar from "@/components/Avatar";
import MultiSelect from "@/components/MultiSelect";
import MessageBubble from "@/app/(app)/goals/[goalId]/pitstops/[pitstopId]/MessageBubble";
import MessageComposer from "@/app/(app)/goals/[goalId]/pitstops/[pitstopId]/MessageComposer";

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
type Message = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null; image: string | null };
  attachments: { id: string; name: string; url: string; type: string; mimeType?: string | null }[];
  mentions: { user: { id: string; name: string | null } }[];
  msgType?: string;
  audioUrl?: string | null;
  originalLang?: string;
  translations?: Record<string, string> | null;
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

function getPitstopHref(t: Thread): string | null {
  if (t.pitstop) return `/goals/${t.pitstop.goal.id}/pitstops/${t.pitstop.id}?thread=${t.id}`;
  if (t.goal) return `/goals/${t.goal.id}`;
  return null;
}

function getBreadcrumb(t: Thread): string {
  if (t.goal) return t.goal.title;
  if (t.pitstop) return `${t.pitstop.goal.title} › ${t.pitstop.title}`;
  if (t.event) return t.event.title;
  return "";
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

function formatBody(body: string): string {
  return body.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1");
}

interface Props {
  threads: Thread[];
  goals: Goal[];
  users: User[];
  currentUserId: string;
  currentUserName: string;
  preferredLang: string;
}

export default function ThreadsList({ threads, goals, users, currentUserId, preferredLang }: Props) {
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<Level>("all");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(threads[0]?.id ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeThread = threads.find(t => t.id === activeThreadId) ?? null;

  // Load messages when thread changes
  useEffect(() => {
    if (!activeThreadId) return;
    setLoadingMessages(true);
    setMessages([]);
    fetch(`/api/threads/${activeThreadId}/messages`)
      .then(r => r.json())
      .then(data => { setMessages(Array.isArray(data) ? data : []); })
      .catch(() => {})
      .finally(() => setLoadingMessages(false));
  }, [activeThreadId]);

  // Scroll to bottom when messages load
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleMessageSent = (msg: unknown) => {
    setMessages(prev => [...prev, msg as Message]);
  };

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
    <div className="flex h-full overflow-hidden">
      {/* ── Left panel: thread list ─────────────────────────────────────── */}
      <div className={`${activeThreadId ? "hidden sm:flex" : "flex"} w-full sm:w-80 flex-shrink-0 flex-col border-r border-stone-200 bg-white h-full`}>
        <div className="px-4 pt-5 pb-3 border-b border-stone-100">
          <h1 className="text-base font-semibold text-stone-900 mb-3">Threads</h1>

          {/* Level tabs */}
          <div className="flex gap-1 mb-2.5 flex-wrap">
            {(["all", "goal", "pitstop", "activity"] as const).map(l => (
              <button key={l} onClick={() => setLevel(l)}
                className={`px-2.5 py-0.5 text-xs font-medium rounded-full transition-colors ${
                  level === l ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-700 hover:bg-stone-100"
                }`}>
                {l === "all" ? "All" : l.charAt(0).toUpperCase() + l.slice(1)}
                <span className="ml-1 opacity-50">
                  ({l === "all" ? threads.length : threads.filter(t => getLevel(t) === l).length})
                </span>
              </button>
            ))}
          </div>

          {/* Search + Goal filter */}
          <div className="flex items-center gap-1.5">
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…"
              className="flex-1 px-2.5 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 min-w-0" />
            <MultiSelect
              options={goals.map(g => ({ value: g.id, label: g.title }))}
              value={selectedGoals}
              onChange={setSelectedGoals}
              placeholder="Goals"
            />
            {hasFilters && (
              <button onClick={() => { setSelectedGoals([]); setQuery(""); setLevel("all"); }}
                className="text-stone-400 hover:text-stone-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <div className="text-center py-16 px-4">
              <MessageSquare className="w-8 h-8 text-stone-200 mx-auto mb-2" />
              <p className="text-sm text-stone-500">No threads yet</p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-stone-400 text-xs py-12">No threads match.</p>
          ) : (
            <div className="divide-y divide-stone-100">
              {filtered.map(t => {
                const lastMsg = t.messages[0];
                const lvl = getLevel(t);
                const badge = LEVEL_BADGE[lvl];
                const isActive = t.id === activeThreadId;
                return (
                  <button key={t.id} onClick={() => setActiveThreadId(t.id)}
                    className={`w-full text-left px-4 py-3 transition-colors ${isActive ? "bg-sky-50" : "hover:bg-stone-50"}`}>
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <MessageSquare className="w-3.5 h-3.5 text-stone-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-xs font-medium truncate ${isActive ? "text-sky-700" : "text-stone-800"}`}>{t.name}</span>
                          <span className="text-[10px] text-stone-400 flex-shrink-0">{timeAgo(t.updatedAt)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[10px] font-medium px-1 py-0.5 rounded border flex-shrink-0 ${badge.cls}`}>{badge.label}</span>
                          <p className="text-[11px] text-stone-400 truncate">{getBreadcrumb(t)}</p>
                        </div>
                        {lastMsg && (
                          <p className="text-[11px] text-stone-500 mt-1 line-clamp-1">
                            <span className="font-medium">{lastMsg.author.name}:</span>{" "}
                            {lastMsg.body.startsWith("[voice]") ? "🎤 Voice message" : formatBody(lastMsg.body)}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel: thread messages ────────────────────────────────── */}
      <div className={`${activeThreadId ? "flex" : "hidden sm:flex"} flex-1 flex-col h-full bg-stone-50 min-w-0`}>
        {!activeThread ? (
          <div className="flex-1 flex items-center justify-center text-stone-400">
            <div className="text-center">
              <MessageSquare className="w-10 h-10 text-stone-200 mx-auto mb-3" />
              <p className="text-sm">Select a thread to read messages</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-stone-200 flex-shrink-0">
              <button className="sm:hidden text-stone-500 hover:text-stone-700"
                onClick={() => setActiveThreadId(null)}>
                <X className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-900 truncate">{activeThread.name}</p>
                <p className="text-xs text-stone-400 truncate">{getBreadcrumb(activeThread)}</p>
              </div>
              {getPitstopHref(activeThread) && (
                <Link href={getPitstopHref(activeThread)!}
                  className="flex items-center gap-1 text-xs text-stone-400 hover:text-sky-600 flex-shrink-0">
                  Open <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {loadingMessages ? (
                <div className="flex justify-center pt-10">
                  <div className="w-5 h-5 border-2 border-stone-300 border-t-sky-500 rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-16">
                  <MessageSquare className="w-8 h-8 text-stone-200 mx-auto mb-2" />
                  <p className="text-sm text-stone-400">No messages yet — start the conversation.</p>
                </div>
              ) : (
                messages.map(msg => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isOwn={msg.author.id === currentUserId}
                    preferredLang={preferredLang}
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="px-4 py-3 bg-white border-t border-stone-200 flex-shrink-0">
              <MessageComposer
                threadId={activeThread.id}
                users={users}
                onSent={handleMessageSent}
                preferredLang={preferredLang}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
