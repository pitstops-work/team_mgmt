"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, ChevronDown, ChevronRight, Plus, Paperclip, X, Bell, BellOff, Trash2 } from "lucide-react";
import Avatar from "@/components/Avatar";
import MessageComposer from "@/app/(app)/goals/[goalId]/pitstops/[pitstopId]/MessageComposer";

type User = { id: string; name: string | null; image: string | null };
type Attachment = { id: string; name: string; url: string; type: string };
type Message = {
  id: string; body: string; createdAt: string;
  author: User;
  attachments: Attachment[];
  mentions: { user: { id: string; name: string | null } }[];
  msgType?: string;
  audioUrl?: string | null;
};
type Thread = {
  id: string; name: string; createdAt: string;
  messages: Message[];
};

function formatBody(body: string) {
  return body.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1");
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── Main section ──────────────────────────────────────────────────────────────

export default function GoalThreadsSection({
  goalId, currentUserId, users,
}: {
  goalId: string;
  currentUserId: string;
  users: User[];
}) {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showNewThread, setShowNewThread] = useState(false);
  const [newThreadName, setNewThreadName] = useState("");
  const [creating, setCreating] = useState(false);
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threads, activeThreadId]);

  const toggle = async () => {
    if (!open && threads === null) {
      setLoading(true);
      const [threadRes, subRes] = await Promise.all([
        fetch(`/api/goals/${goalId}/threads`),
        fetch(`/api/threads/subscriptions`).catch(() => null),
      ]);
      const loaded: Thread[] = threadRes.ok ? await threadRes.json() : [];
      setThreads(loaded);
      if (loaded.length > 0) setActiveThreadId(loaded[0].id);
      if (subRes?.ok) {
        const subs: { threadId: string }[] = await subRes.json();
        setSubscribedIds(new Set(subs.map(s => s.threadId)));
      }
      setLoading(false);
    }
    setOpen(v => !v);
  };

  const handleCreate = async () => {
    if (!newThreadName.trim()) return;
    setCreating(true);
    const res = await fetch(`/api/goals/${goalId}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newThreadName.trim() }),
    });
    setCreating(false);
    if (res.ok) {
      const t: Thread = await res.json();
      setThreads(prev => [...(prev ?? []), t]);
      setActiveThreadId(t.id);
      setShowNewThread(false);
      setNewThreadName("");
    }
  };

  const handleDelete = async (threadId: string) => {
    await fetch(`/api/threads/${threadId}`, { method: "DELETE" });
    setThreads(prev => {
      const next = (prev ?? []).filter(t => t.id !== threadId);
      if (activeThreadId === threadId) setActiveThreadId(next[0]?.id ?? null);
      return next;
    });
    setConfirmDeleteId(null);
  };

  const handleMessageSent = (threadId: string, msg: unknown) => {
    setThreads(prev => prev?.map(t =>
      t.id === threadId ? { ...t, messages: [...t.messages, msg as Message] } : t
    ) ?? null);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const toggleSubscribe = async (threadId: string) => {
    const isSub = subscribedIds.has(threadId);
    const next = new Set(subscribedIds);
    isSub ? next.delete(threadId) : next.add(threadId);
    setSubscribedIds(next);
    await fetch(`/api/threads/${threadId}/subscribe`, { method: isSub ? "DELETE" : "POST" });
  };

  const activeThread = threads?.find(t => t.id === activeThreadId) ?? null;
  const totalMessages = threads?.reduce((s, t) => s + t.messages.length, 0) ?? 0;

  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
      {/* Header */}
      <button
        onClick={toggle}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-stone-50 transition-colors text-left"
      >
        <MessageSquare className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
        <span className="text-xs font-bold uppercase tracking-wider text-stone-500 flex-1">
          Goal Threads
        </span>
        {threads !== null && (
          <span className="text-[10px] font-bold bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full">
            {threads.length} · {totalMessages} msg
          </span>
        )}
        {open ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />}
      </button>

      {/* Body */}
      {open && (
        <div className="border-t border-stone-100">
          {loading ? (
            <p className="text-xs text-stone-400 px-4 py-3">Loading…</p>
          ) : (
            <div className="flex flex-col sm:flex-row min-h-[300px]">
              {/* Thread list */}
              <div className="sm:w-48 border-b sm:border-b-0 sm:border-r border-stone-100 bg-stone-50 flex flex-col">
                <div className="flex-1 overflow-y-auto py-2">
                  {(threads ?? []).length === 0 && !showNewThread && (
                    <p className="text-xs text-stone-400 px-3 py-2">No threads yet.</p>
                  )}
                  {(threads ?? []).map(t => (
                    <button
                      key={t.id}
                      onClick={() => setActiveThreadId(t.id)}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                        t.id === activeThreadId
                          ? "bg-white text-sky-700 font-medium border-r-2 border-sky-400"
                          : "text-stone-600 hover:bg-white hover:text-stone-900"
                      }`}
                    >
                      <p className="truncate">{t.name}</p>
                      <p className="text-[10px] text-stone-400 mt-0.5">{t.messages.length} msg</p>
                    </button>
                  ))}
                </div>
                <div className="p-2 border-t border-stone-100">
                  {showNewThread ? (
                    <div className="space-y-1.5">
                      <input
                        value={newThreadName}
                        onChange={e => setNewThreadName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") { setShowNewThread(false); setNewThreadName(""); } }}
                        placeholder="Thread name"
                        autoFocus
                        className="w-full px-2 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-400"
                      />
                      <div className="flex gap-1">
                        <button onClick={handleCreate} disabled={creating || !newThreadName.trim()}
                          className="flex-1 px-2 py-1 bg-sky-500 text-white text-xs rounded-md disabled:opacity-40">
                          {creating ? "…" : "Create"}
                        </button>
                        <button onClick={() => { setShowNewThread(false); setNewThreadName(""); }}
                          className="px-2 py-1 text-stone-400 hover:text-stone-600">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowNewThread(true)}
                      className="w-full flex items-center gap-1 px-2 py-1.5 text-xs text-stone-400 hover:text-stone-600 hover:bg-white rounded-md transition-colors">
                      <Plus className="w-3 h-3" />
                      New thread
                    </button>
                  )}
                </div>
              </div>

              {/* Messages pane */}
              <div className="flex-1 flex flex-col min-h-[300px]">
                {!activeThread ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-xs text-stone-400">Select or create a thread</p>
                  </div>
                ) : (
                  <>
                    {/* Thread header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-stone-100">
                      <span className="text-xs font-semibold text-stone-700 truncate">{activeThread.name}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => toggleSubscribe(activeThread.id)}
                          title={subscribedIds.has(activeThread.id) ? "Unsubscribe" : "Subscribe"}
                          className="p-1 text-stone-300 hover:text-stone-600 transition-colors"
                        >
                          {subscribedIds.has(activeThread.id)
                            ? <Bell className="w-3.5 h-3.5 text-sky-500" />
                            : <BellOff className="w-3.5 h-3.5" />}
                        </button>
                        {confirmDeleteId === activeThread.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(activeThread.id)}
                              className="px-2 py-0.5 text-[11px] bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-0.5 text-[11px] text-stone-500 hover:text-stone-700"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(activeThread.id)}
                            title="Delete thread"
                            className="p-1 text-stone-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                      {activeThread.messages.length === 0 ? (
                        <p className="text-xs text-stone-400 text-center py-4">No messages yet. Start the conversation.</p>
                      ) : (
                        activeThread.messages.map(msg => {
                          const isOwn = msg.author.id === currentUserId;
                          return (
                            <div key={msg.id} className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
                              <Avatar name={msg.author.name} image={msg.author.image} size="xs" />
                              <div className={`max-w-[70%] flex flex-col gap-0.5 ${isOwn ? "items-end" : "items-start"}`}>
                                <div className={`flex items-baseline gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
                                  <span className="text-[10px] font-medium text-stone-600">{msg.author.name}</span>
                                  <span className="text-[10px] text-stone-400">{fmtDate(msg.createdAt)} {fmtTime(msg.createdAt)}</span>
                                </div>
                                {msg.msgType === "voice" ? (
                                  <div className={`px-3 py-2 rounded-xl text-xs ${isOwn ? "bg-sky-500 text-white rounded-tr-sm" : "bg-stone-100 text-stone-800 rounded-tl-sm"}`}>
                                    🎙 {formatBody(msg.body)}
                                  </div>
                                ) : (
                                  <div className={`px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap break-words ${
                                    isOwn ? "bg-sky-500 text-white rounded-tr-sm" : "bg-stone-100 text-stone-800 rounded-tl-sm"
                                  }`}>
                                    {formatBody(msg.body)}
                                  </div>
                                )}
                                {msg.attachments.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {msg.attachments.map(a => (
                                      <a key={a.id} href={`/api/attachment/${a.id}`} target="_blank" rel="noreferrer"
                                        className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-stone-100 hover:bg-stone-200 text-stone-500 rounded">
                                        <Paperclip className="w-2.5 h-2.5" />{a.name}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Composer */}
                    <div className="px-3 py-3 border-t border-stone-100">
                      <MessageComposer
                        threadId={activeThread.id}
                        users={users}
                        onSent={msg => handleMessageSent(activeThread.id, msg)}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
