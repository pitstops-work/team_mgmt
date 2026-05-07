"use client";

import { useState, useEffect, useRef } from "react";
import { MessageSquare, X, ArrowUpRight, Plus, ChevronRight, Target, CheckSquare, CalendarClock } from "lucide-react";
import Avatar from "@/components/Avatar";
import MessageBubble from "@/app/(app)/goals/[goalId]/pitstops/[pitstopId]/MessageBubble";
import MessageComposer from "@/app/(app)/goals/[goalId]/pitstops/[pitstopId]/MessageComposer";

// ── Types ─────────────────────────────────────────────────────────────────────

type User = { id: string; name: string | null; image: string | null };
type Goal = { id: string; title: string };
type Pitstop = { id: string; title: string; goalId: string };
type ChecklistItemOption = { id: string; text: string; pitstopId: string; status: string };
type EventOption = { id: string; title: string; pitstopId: string; checklistItemId: string | null };
type Thread = {
  id: string;
  name: string;
  updatedAt: string;
  pitstopId: string | null;
  goalId: string | null;
  eventId: string | null;
  checklistItemId: string | null;
  pitstop: { id: string; title: string; goal: Goal; owner: User | null } | null;
  goal: { id: string; title: string; owner: User | null } | null;
  event: { id: string; title: string; scheduledAt: string } | null;
  checklistItem: { id: string; text: string } | null;
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
  translating?: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatBody(body: string): string {
  return body.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1");
}

function getBreadcrumb(t: Thread): string {
  const parts: string[] = [];
  if (t.goal) parts.push(t.goal.title);
  else if (t.pitstop) { parts.push(t.pitstop.goal.title); parts.push(t.pitstop.title); }
  if (t.checklistItem) parts.push(t.checklistItem.text);
  if (t.event) parts.push(t.event.title);
  return parts.join(" › ");
}

function getOpenHref(t: Thread): string | null {
  if (t.pitstop) return `/goals/${t.pitstop.goal.id}/pitstops/${t.pitstop.id}?thread=${t.id}`;
  if (t.goal) return `/goals/${t.goal.id}`;
  return null;
}

const TAG_CFG: Record<string, { label: string; cls: string }> = {
  goal:     { label: "Goal",      cls: "bg-violet-50 text-violet-600 border-violet-200" },
  pitstop:  { label: "Pitstop",   cls: "bg-sky-50 text-sky-600 border-sky-200" },
  checklist: { label: "Checklist", cls: "bg-teal-50 text-teal-600 border-teal-200" },
  activity: { label: "Activity",  cls: "bg-amber-50 text-amber-600 border-amber-200" },
};

function getThreadTags(t: Thread): string[] {
  const tags: string[] = [];
  if (t.goalId) tags.push("goal");
  if (t.pitstopId) tags.push("pitstop");
  if (t.checklistItemId) tags.push("checklist");
  if (t.eventId) tags.push("activity");
  return tags;
}

// ── New Thread Wizard ─────────────────────────────────────────────────────────

function NewThreadWizard({
  goals, pitstops, checklistItems, events,
  onClose, onCreated,
}: {
  goals: Goal[];
  pitstops: Pitstop[];
  checklistItems: ChecklistItemOption[];
  events: EventOption[];
  onClose: () => void;
  onCreated: (thread: Thread) => void;
}) {
  const [goalId, setGoalId] = useState("");
  const [pitstopId, setPitstopId] = useState("");
  const [checklistItemId, setChecklistItemId] = useState("");
  const [eventId, setEventId] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const goalPitstops = pitstops.filter(p => p.goalId === goalId);
  const pitstopChecklist = checklistItems.filter(ci => ci.pitstopId === pitstopId);
  const pitstopEvents = events.filter(e => e.pitstopId === pitstopId);
  // Cascade: if a checklist item is selected, only show activities linked to it
  const filteredEvents = checklistItemId
    ? pitstopEvents.filter(e => e.checklistItemId === checklistItemId)
    : pitstopEvents;
  // Cascade: if an activity is selected, only show the checklist item linked to it
  const selectedEvent = eventId ? pitstopEvents.find(e => e.id === eventId) : null;
  const filteredChecklist = selectedEvent?.checklistItemId
    ? pitstopChecklist.filter(ci => ci.id === selectedEvent.checklistItemId)
    : pitstopChecklist;

  const isValid = !!goalId && !!name.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setLoading(true);
    setError("");
    try {
      let endpoint = "";
      let body: Record<string, string> = { name: name.trim() };

      if (pitstopId) {
        endpoint = `/api/pitstops/${pitstopId}/threads`;
        if (checklistItemId) body.checklistItemId = checklistItemId;
        if (eventId) body.eventId = eventId;
      } else {
        endpoint = `/api/goals/${goalId}/threads`;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      const thread = await res.json();
      onCreated(thread);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const sel = "w-full px-2.5 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h2 className="text-base font-semibold text-stone-900">New Thread</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Goal (required) */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-stone-600 mb-1">
              <Target className="w-3.5 h-3.5 text-violet-500" />
              Goal <span className="text-red-400">*</span>
            </label>
            <select
              value={goalId}
              onChange={e => { setGoalId(e.target.value); setPitstopId(""); setChecklistItemId(""); setEventId(""); }}
              className={sel}
              required
            >
              <option value="">— select a goal —</option>
              {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </div>

          {/* Pitstop (optional) */}
          {goalId && (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-stone-600 mb-1">
                <ChevronRight className="w-3.5 h-3.5 text-sky-500" />
                Pitstop <span className="text-stone-400 font-normal">(optional)</span>
              </label>
              <select
                value={pitstopId}
                onChange={e => { setPitstopId(e.target.value); setChecklistItemId(""); setEventId(""); }}
                className={sel}
              >
                <option value="">— none (goal-level thread) —</option>
                {goalPitstops.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
          )}

          {/* Checklist item (optional, only if pitstop selected) */}
          {pitstopId && filteredChecklist.length > 0 && (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-stone-600 mb-1">
                <CheckSquare className="w-3.5 h-3.5 text-teal-500" />
                Checklist Item <span className="text-stone-400 font-normal">(optional)</span>
              </label>
              <select
                value={checklistItemId}
                onChange={e => { setChecklistItemId(e.target.value); setEventId(""); }}
                className={sel}
              >
                <option value="">— none —</option>
                {filteredChecklist.map(ci => <option key={ci.id} value={ci.id}>{ci.text}</option>)}
              </select>
            </div>
          )}

          {/* Activity (optional, only if pitstop selected) */}
          {pitstopId && filteredEvents.length > 0 && (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-stone-600 mb-1">
                <CalendarClock className="w-3.5 h-3.5 text-amber-500" />
                Activity <span className="text-stone-400 font-normal">(optional)</span>
              </label>
              <select
                value={eventId}
                onChange={e => { setEventId(e.target.value); setChecklistItemId(""); }}
                className={sel}
              >
                <option value="">— none —</option>
                {filteredEvents.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
              </select>
            </div>
          )}

          {/* Thread name */}
          <div>
            <label className="text-xs font-medium text-stone-600 mb-1 block">Thread Name <span className="text-red-400">*</span></label>
            <input
              autoFocus={!goalId}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Baseline data collection"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
              required
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || loading}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? "Creating…" : "Create Thread"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  threads: Thread[];
  goals: Goal[];
  pitstops: Pitstop[];
  checklistItems: ChecklistItemOption[];
  events: EventOption[];
  users: User[];
  currentUserId: string;
  currentUserName: string;
  currentUserRole?: string;
  preferredLang: string;
  initialThreadId?: string | null;
}

export default function ThreadsList({
  threads: initialThreads,
  goals, pitstops, checklistItems, events,
  users, currentUserId, preferredLang,
  initialThreadId,
}: Props) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [query, setQuery] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    initialThreadId ?? initialThreads[0]?.id ?? null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showNewThread, setShowNewThread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeThread = threads.find(t => t.id === activeThreadId) ?? null;

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleMessageSent = (msg: unknown) => {
    setMessages(prev => [...prev, msg as Message]);
    // Bump updatedAt for this thread optimistically
    setThreads(prev => prev.map(t =>
      t.id === activeThreadId
        ? { ...t, updatedAt: new Date().toISOString(), messages: [{ body: (msg as Message).body, createdAt: new Date().toISOString(), author: { name: (msg as Message).author?.name ?? null } }] }
        : t
    ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
  };

  const handleMessageUpdated = (msg: unknown) => {
    const updated = msg as Message;
    setMessages(prev =>
      prev.map(m => m.id === updated.id ? { ...m, ...updated, translating: false } : m)
    );
  };

  const handleThreadCreated = (thread: Thread) => {
    setThreads(prev => [thread, ...prev]);
    setActiveThreadId(thread.id);
    setShowNewThread(false);
  };

  const filtered = threads.filter(t =>
    !query || (
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      (t.pitstop?.title ?? "").toLowerCase().includes(query.toLowerCase()) ||
      (t.pitstop?.goal.title ?? "").toLowerCase().includes(query.toLowerCase()) ||
      (t.goal?.title ?? "").toLowerCase().includes(query.toLowerCase()) ||
      (t.event?.title ?? "").toLowerCase().includes(query.toLowerCase()) ||
      (t.checklistItem?.text ?? "").toLowerCase().includes(query.toLowerCase())
    )
  );

  return (
    <div className="flex h-full overflow-hidden">
      {showNewThread && (
        <NewThreadWizard
          goals={goals}
          pitstops={pitstops}
          checklistItems={checklistItems}
          events={events}
          onClose={() => setShowNewThread(false)}
          onCreated={handleThreadCreated}
        />
      )}

      {/* ── Left panel: WhatsApp-style thread list ─────────────────────── */}
      <div className={`${activeThreadId ? "hidden sm:flex" : "flex"} w-full sm:w-80 flex-shrink-0 flex-col border-r border-stone-200 bg-white h-full`}>
        <div className="px-4 pt-5 pb-3 border-b border-stone-100">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-semibold text-stone-900">Threads</h1>
            <button
              onClick={() => setShowNewThread(true)}
              className="flex items-center gap-1 px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          </div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search threads…"
            className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <div className="text-center py-16 px-4">
              <MessageSquare className="w-8 h-8 text-stone-200 mx-auto mb-2" />
              <p className="text-sm text-stone-500 mb-2">No threads yet</p>
              <button
                onClick={() => setShowNewThread(true)}
                className="text-xs text-sky-500 hover:text-sky-700 underline"
              >
                Start a new thread
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-stone-400 text-xs py-12">No threads match.</p>
          ) : (
            <div className="divide-y divide-stone-100">
              {filtered.map(t => {
                const lastMsg = t.messages[0];
                const tags = getThreadTags(t);
                const isActive = t.id === activeThreadId;
                const breadcrumb = getBreadcrumb(t);
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveThreadId(t.id)}
                    className={`w-full text-left px-4 py-3 transition-colors ${isActive ? "bg-sky-50 border-l-2 border-sky-500" : "hover:bg-stone-50"}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <MessageSquare className="w-4 h-4 text-stone-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-xs font-semibold truncate ${isActive ? "text-sky-700" : "text-stone-800"}`}>
                            {t.name}
                          </span>
                          <span className="text-[10px] text-stone-400 flex-shrink-0 ml-1">{timeAgo(t.updatedAt)}</span>
                        </div>
                        {breadcrumb && (
                          <p className="text-[10px] text-stone-400 truncate mt-0.5">{breadcrumb}</p>
                        )}
                        <div className="flex items-center justify-between gap-1 mt-1">
                          <p className="text-[11px] text-stone-500 truncate flex-1">
                            {lastMsg
                              ? <><span className="font-medium">{lastMsg.author.name}:</span> {formatBody(lastMsg.body)}</>
                              : <span className="italic">No messages yet</span>
                            }
                          </p>
                          <div className="flex gap-0.5 flex-shrink-0">
                            {tags.map(tag => {
                              const cfg = TAG_CFG[tag];
                              return (
                                <span key={tag} className={`text-[9px] font-medium px-1 py-0.5 rounded border ${cfg.cls}`}>
                                  {cfg.label}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel: messages ───────────────────────────────────────── */}
      <div className={`${activeThreadId ? "flex" : "hidden sm:flex"} flex-1 flex-col h-full bg-stone-50 min-w-0`}>
        {!activeThread ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-10 h-10 text-stone-200 mx-auto mb-3" />
              <p className="text-sm text-stone-400 mb-3">Select a thread to read messages</p>
              <button
                onClick={() => setShowNewThread(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg transition-colors mx-auto"
              >
                <Plus className="w-4 h-4" />
                New Thread
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-stone-200 flex-shrink-0">
              <button
                className="sm:hidden text-stone-500 hover:text-stone-700"
                onClick={() => setActiveThreadId(null)}
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-900 truncate">{activeThread.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {getThreadTags(activeThread).map(tag => {
                    const cfg = TAG_CFG[tag];
                    return (
                      <span key={tag} className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                    );
                  })}
                  <p className="text-[10px] text-stone-400 truncate">{getBreadcrumb(activeThread)}</p>
                </div>
              </div>
              {getOpenHref(activeThread) && (
                <a
                  href={getOpenHref(activeThread)!}
                  className="flex items-center gap-1 text-xs text-stone-400 hover:text-sky-600 flex-shrink-0"
                >
                  Open <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
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
                onMessageUpdated={handleMessageUpdated}
                preferredLang={preferredLang}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
