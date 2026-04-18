"use client";

import { useState, useRef } from "react";
import { MessageSquare, Megaphone, ChevronDown, ChevronRight, Plus, Send, X, Bell, BellOff, Paperclip } from "lucide-react";
import Avatar from "@/components/Avatar";

// ── Types ─────────────────────────────────────────────────────────────────────

type User = { id: string; name: string | null; image: string | null };
type Attachment = { id: string; name: string; url: string; type: string };
type Message = {
  id: string; body: string; createdAt: string;
  author: User;
  attachments: Attachment[];
  mentions: { user: { id: string; name: string | null } }[];
};
type Thread = { id: string; name: string; createdAt: string; messages: Message[] };
type Broadcast = { id: string; title: string; body: string; createdAt: string; author: User };

function formatBody(body: string) { return body.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1"); }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }

// ── Mini composer ─────────────────────────────────────────────────────────────

function MiniComposer({ threadId, users, onSent }: { threadId: string; users: User[]; onSent: (m: Message) => void }) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionStart, setMentionStart] = useState(-1);
  const ref = useRef<HTMLTextAreaElement>(null);

  const filtered = users.filter(u => u.name?.toLowerCase().includes(mentionSearch.toLowerCase()));

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value; setBody(val);
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const atIdx = before.lastIndexOf("@");
    if (atIdx !== -1 && !before.slice(atIdx + 1).includes(" ")) {
      setMentionStart(atIdx); setMentionSearch(before.slice(atIdx + 1)); setShowMentions(true);
    } else { setShowMentions(false); setMentionStart(-1); }
  };

  const insertMention = (u: User) => {
    if (mentionStart === -1) return;
    setBody(`${body.slice(0, mentionStart)}@[${u.name}](${u.id}) ${body.slice(ref.current?.selectionStart ?? 0)}`);
    setShowMentions(false); setMentionStart(-1); ref.current?.focus();
  };

  const handleSend = async () => {
    if (!body.trim()) return;
    setSending(true);
    const res = await fetch(`/api/threads/${threadId}/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.trim(), attachmentIds: [] }),
    });
    setSending(false);
    if (res.ok) { onSent(await res.json()); setBody(""); }
  };

  return (
    <div className="relative p-3 border-t border-stone-100">
      {showMentions && filtered.length > 0 && (
        <div className="absolute bottom-full left-3 mb-1 w-48 bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden z-10">
          {filtered.map(u => (
            <button key={u.id} onMouseDown={e => { e.preventDefault(); insertMention(u); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-stone-50">
              <Avatar name={u.name} image={u.image} size="xs" />
              <span className="text-stone-700 truncate">{u.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea ref={ref} value={body} onChange={handleChange}
          onKeyDown={e => { if (e.key === "Escape") setShowMentions(false); if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSend(); } }}
          placeholder="Write a message… (⌘↵ to send)" rows={2}
          className="flex-1 px-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none placeholder:text-stone-400" />
        <button onClick={handleSend} disabled={sending || !body.trim()}
          className="p-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white rounded-lg transition-colors flex-shrink-0">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Threads tab ───────────────────────────────────────────────────────────────

function ThreadsTab({ goalId, currentUserId, users }: { goalId: string; currentUserId: string; users: User[] }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());

  const load = async () => {
    if (loaded) return;
    setLoading(true);
    const [threadRes, subRes] = await Promise.all([
      fetch(`/api/goals/${goalId}/threads`),
      fetch(`/api/threads/subscriptions`).catch(() => null),
    ]);
    const ts: Thread[] = threadRes.ok ? await threadRes.json() : [];
    setThreads(ts);
    if (ts.length > 0) setActiveThreadId(ts[0].id);
    if (subRes?.ok) { const s: { threadId: string }[] = await subRes.json(); setSubscribedIds(new Set(s.map(x => x.threadId))); }
    setLoaded(true);
    setLoading(false);
  };

  // Load on first render of this tab
  if (!loaded && !loading) load();

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch(`/api/goals/${goalId}/threads`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setCreating(false);
    if (res.ok) {
      const t: Thread = await res.json();
      setThreads(p => [...(p ?? []), t]);
      setActiveThreadId(t.id);
      setShowNew(false); setNewName("");
    }
  };

  const handleMsg = (threadId: string, msg: Message) => {
    setThreads(p => p?.map(t => t.id === threadId ? { ...t, messages: [...t.messages, msg] } : t) ?? null);
  };

  const toggleSub = async (threadId: string) => {
    const isSub = subscribedIds.has(threadId);
    const next = new Set(subscribedIds); isSub ? next.delete(threadId) : next.add(threadId);
    setSubscribedIds(next);
    await fetch(`/api/threads/${threadId}/subscribe`, { method: isSub ? "DELETE" : "POST" });
  };

  const activeThread = threads?.find(t => t.id === activeThreadId) ?? null;

  if (loading) return <p className="text-xs text-stone-400 p-4">Loading…</p>;

  return (
    <div className="flex flex-col sm:flex-row min-h-[280px]">
      {/* Thread list */}
      <div className="sm:w-44 border-b sm:border-b-0 sm:border-r border-stone-100 bg-stone-50 flex flex-col">
        <div className="flex-1 overflow-y-auto py-1.5">
          {(threads ?? []).length === 0 && !showNew && (
            <p className="text-xs text-stone-400 px-3 py-2">No threads yet.</p>
          )}
          {(threads ?? []).map(t => (
            <button key={t.id} onClick={() => setActiveThreadId(t.id)}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${t.id === activeThreadId ? "bg-white text-sky-700 font-medium border-r-2 border-sky-400" : "text-stone-600 hover:bg-white"}`}>
              <p className="truncate">{t.name}</p>
              <p className="text-[10px] text-stone-400 mt-0.5">{t.messages.length} msg</p>
            </button>
          ))}
        </div>
        <div className="p-2 border-t border-stone-100 flex-shrink-0">
          {showNew ? (
            <div className="space-y-1.5">
              <input value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") { setShowNew(false); setNewName(""); } }}
                placeholder="Thread name" autoFocus
                className="w-full px-2 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-400" />
              <div className="flex gap-1">
                <button onClick={handleCreate} disabled={creating || !newName.trim()}
                  className="flex-1 px-2 py-1 bg-sky-500 text-white text-xs rounded-md disabled:opacity-40">
                  {creating ? "…" : "Create"}
                </button>
                <button onClick={() => { setShowNew(false); setNewName(""); }} className="px-2 py-1 text-stone-400 hover:text-stone-600">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNew(true)}
              className="w-full flex items-center gap-1 px-2 py-1.5 text-xs text-stone-400 hover:text-stone-600 hover:bg-white rounded-md transition-colors">
              <Plus className="w-3 h-3" />New thread
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 flex flex-col min-h-[280px]">
        {!activeThread ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-stone-400">Select or create a thread</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-3 py-2 border-b border-stone-100 flex-shrink-0">
              <span className="text-xs font-semibold text-stone-700 truncate">{activeThread.name}</span>
              <button onClick={() => toggleSub(activeThread.id)} title={subscribedIds.has(activeThread.id) ? "Unsubscribe" : "Subscribe"}
                className="p-1 text-stone-300 hover:text-stone-600 transition-colors flex-shrink-0">
                {subscribedIds.has(activeThread.id) ? <Bell className="w-3.5 h-3.5 text-sky-500" /> : <BellOff className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {activeThread.messages.length === 0
                ? <p className="text-xs text-stone-400 text-center py-4">No messages. Start the conversation.</p>
                : activeThread.messages.map(msg => {
                    const isOwn = msg.author.id === currentUserId;
                    return (
                      <div key={msg.id} className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
                        <Avatar name={msg.author.name} image={msg.author.image} size="xs" />
                        <div className={`max-w-[70%] flex flex-col gap-0.5 ${isOwn ? "items-end" : "items-start"}`}>
                          <div className={`flex items-baseline gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
                            <span className="text-[10px] font-medium text-stone-600">{msg.author.name}</span>
                            <span className="text-[10px] text-stone-400">{fmtDate(msg.createdAt)} {fmtTime(msg.createdAt)}</span>
                          </div>
                          <div className={`px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap break-words ${isOwn ? "bg-sky-500 text-white rounded-tr-sm" : "bg-stone-100 text-stone-800 rounded-tl-sm"}`}>
                            {formatBody(msg.body)}
                          </div>
                          {msg.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {msg.attachments.map(a => (
                                <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
                                  className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-stone-100 hover:bg-stone-200 text-stone-500 rounded">
                                  <Paperclip className="w-2.5 h-2.5" />{a.name}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
            </div>
            <MiniComposer threadId={activeThread.id} users={users} onSent={msg => handleMsg(activeThread.id, msg as Message)} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Broadcasts tab ────────────────────────────────────────────────────────────

function BroadcastsTab({ goalId }: { goalId: string }) {
  const [broadcasts, setBroadcasts] = useState<Broadcast[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const load = async () => {
    if (loaded) return;
    setLoading(true);
    const res = await fetch(`/api/goals/${goalId}/broadcasts`);
    setBroadcasts(res.ok ? await res.json() : []);
    setLoaded(true); setLoading(false);
  };

  if (!loaded && !loading) load();

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/goals/${goalId}/broadcasts`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), body: body.trim() }),
    });
    if (res.ok) {
      setBroadcasts(p => [await res.json(), ...(p ?? [])]);
      setTitle(""); setBody(""); setShowForm(false); setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
    setSaving(false);
  };

  if (loading) return <p className="text-xs text-stone-400 p-4">Loading…</p>;

  return (
    <div className="divide-y divide-stone-100">
      <div className="px-4 py-3">
        {success && <p className="text-xs text-emerald-600 font-medium mb-2">Update sent to all followers!</p>}
        {!showForm ? (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-700">
            <Send className="w-3.5 h-3.5" />Send update to followers
          </button>
        ) : (
          <div className="space-y-2 bg-stone-50 rounded-lg p-3 border border-stone-200">
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Update title…"
              className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400" />
            <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="What's the update?" rows={3}
              className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400 resize-none" />
            <div className="flex gap-2">
              <button onClick={handleSend} disabled={!title.trim() || !body.trim() || saving}
                className="flex items-center gap-1 px-3 py-1 text-xs bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-md font-medium transition-colors">
                <Send className="w-3 h-3" />{saving ? "Sending…" : "Send"}
              </button>
              <button onClick={() => setShowForm(false)} className="px-2 py-1 text-xs text-stone-400 hover:text-stone-600">Cancel</button>
            </div>
          </div>
        )}
      </div>
      {broadcasts && broadcasts.length === 0 && !showForm && (
        <div className="px-4 py-3"><p className="text-xs text-stone-400">No broadcasts yet.</p></div>
      )}
      {broadcasts?.map(b => (
        <div key={b.id} className="px-4 py-3">
          <div className="flex items-start gap-2">
            <Avatar name={b.author.name} image={b.author.image} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-medium text-stone-800">{b.title}</span>
                <span className="text-[10px] text-stone-400">{fmtDate(b.createdAt)}</span>
              </div>
              <p className="text-xs text-stone-600 whitespace-pre-wrap">{b.body}</p>
              <p className="text-[10px] text-stone-400 mt-0.5">by {b.author.name}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export default function GoalDiscussionsSection({
  goalId, currentUserId, users,
}: { goalId: string; currentUserId: string; users: User[] }) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"threads" | "broadcasts">("threads");

  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-stone-50 transition-colors text-left">
        <MessageSquare className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
        <span className="text-xs font-bold uppercase tracking-wider text-stone-500 flex-1">Discussions</span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />}
      </button>

      {open && (
        <div className="border-t border-stone-100">
          {/* Sub-tabs */}
          <div className="flex border-b border-stone-100 bg-stone-50">
            {([
              { key: "threads",    icon: <MessageSquare className="w-3 h-3" />, label: "Threads" },
              { key: "broadcasts", icon: <Megaphone className="w-3 h-3" />,     label: "Broadcasts" },
            ] as const).map(({ key, icon, label }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === key
                    ? "border-sky-400 text-sky-700 bg-white"
                    : "border-transparent text-stone-500 hover:text-stone-700"
                }`}>
                {icon}{label}
              </button>
            ))}
          </div>

          {activeTab === "threads" && (
            <ThreadsTab goalId={goalId} currentUserId={currentUserId} users={users} />
          )}
          {activeTab === "broadcasts" && (
            <BroadcastsTab goalId={goalId} />
          )}
        </div>
      )}
    </div>
  );
}
