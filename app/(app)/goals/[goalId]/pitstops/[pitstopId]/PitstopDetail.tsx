"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, Plus, Paperclip, Upload, X, Bell, BellOff } from "lucide-react";
import Avatar from "@/components/Avatar";
import { PitstopStatusBadge } from "@/components/StatusBadge";
import PitstopTypeBadge from "@/components/PitstopTypeBadge";
import MessageComposer from "./MessageComposer";
import MessageBubble from "./MessageBubble";

type Attachment = { id: string; name: string; url: string; type: string; mimeType?: string | null };
type Mention = { user: { id: string; name: string | null } };
type Message = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null; image: string | null };
  attachments: Attachment[];
  mentions: Mention[];
};
type Thread = { id: string; name: string; messages: Message[] };
type User = { id: string; name: string | null; image: string | null };
type Pitstop = {
  id: string;
  title: string;
  type: string;
  notes: string | null;
  status: "Upcoming" | "InProgress" | "Done";
  goal: { id: string; title: string };
  attachments: Attachment[];
  threads: Thread[];
};

interface Props {
  pitstop: Pitstop;
  users: User[];
  currentUserId: string;
  currentUserName: string;
  subscribedThreadIds: string[];
}

export default function PitstopDetail({
  pitstop: initialPitstop,
  users,
  currentUserId,
  currentUserName,
  subscribedThreadIds: initialSubscribedThreadIds,
}: Props) {
  const [pitstop, setPitstop] = useState(initialPitstop);
  const [activeThread, setActiveThread] = useState<string | null>(
    initialPitstop.threads[0]?.id ?? null
  );
  const [showNewThread, setShowNewThread] = useState(false);
  const [newThreadName, setNewThreadName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(
    new Set(initialSubscribedThreadIds)
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentThread = pitstop.threads.find((t) => t.id === activeThread);

  const handleCreateThread = async () => {
    if (!newThreadName.trim()) return;
    const res = await fetch(`/api/pitstops/${pitstop.id}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newThreadName.trim() }),
    });
    if (res.ok) {
      const thread = await res.json();
      setPitstop((p) => ({ ...p, threads: [...p.threads, thread] }));
      setActiveThread(thread.id);
      setNewThreadName("");
      setShowNewThread(false);
    }
  };

  const handleMessageSent = (threadId: string, message: unknown) => {
    const msg = message as Message;
    setPitstop((p) => ({
      ...p,
      threads: p.threads.map((t) =>
        t.id === threadId ? { ...t, messages: [...t.messages, msg] } : t
      ),
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("pitstopId", pitstop.id);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (res.ok) {
      const att = await res.json();
      setPitstop((p) => ({ ...p, attachments: [...p.attachments, att] }));
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleToggleSubscribe = async (threadId: string) => {
    const isSubscribed = subscribedIds.has(threadId);
    const method = isSubscribed ? "DELETE" : "POST";
    const res = await fetch(`/api/threads/${threadId}/subscribe`, { method });
    if (res.ok) {
      setSubscribedIds((prev) => {
        const next = new Set(prev);
        isSubscribed ? next.delete(threadId) : next.add(threadId);
        return next;
      });
    }
  };

  return (
    <div className="flex h-full">
      {/* Left panel: pitstop info + thread list */}
      <div className="w-64 flex-shrink-0 border-r border-stone-200 bg-white flex flex-col h-full overflow-y-auto">
        {/* Breadcrumb */}
        <div className="px-4 pt-5 pb-3 border-b border-stone-100">
          <Link
            href={`/goals/${pitstop.goal.id}`}
            className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 mb-3"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            {pitstop.goal.title}
          </Link>
          <h1 className="text-sm font-semibold text-stone-900 leading-snug">{pitstop.title}</h1>
          <div className="flex items-center gap-2 mt-1.5">
            <PitstopStatusBadge status={pitstop.status} />
          </div>
          <div className="mt-1">
            <PitstopTypeBadge type={pitstop.type as Parameters<typeof PitstopTypeBadge>[0]["type"]} />
          </div>
        </div>

        {/* Notes */}
        {pitstop.notes && (
          <div className="px-4 py-3 border-b border-stone-100">
            <p className="text-xs text-stone-500 leading-relaxed">{pitstop.notes}</p>
          </div>
        )}

        {/* Attachments */}
        <div className="px-4 py-3 border-b border-stone-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-stone-500">Files</span>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs text-sky-600 hover:text-sky-700 flex items-center gap-1"
            >
              <Upload className="w-3 h-3" />
              {uploading ? "..." : "Upload"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
          {pitstop.attachments.length === 0 ? (
            <p className="text-xs text-stone-400">No files attached.</p>
          ) : (
            <div className="space-y-1">
              {pitstop.attachments.map((att) => (
                <a
                  key={att.id}
                  href={att.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-700 truncate"
                >
                  <Paperclip className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{att.name}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Threads list */}
        <div className="flex-1 px-3 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-stone-500">Threads</span>
            <button
              onClick={() => setShowNewThread(true)}
              className="text-xs text-sky-600 hover:text-sky-700 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              New
            </button>
          </div>

          {showNewThread && (
            <div className="mb-2 flex gap-1">
              <input
                autoFocus
                type="text"
                value={newThreadName}
                onChange={(e) => setNewThreadName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateThread();
                  if (e.key === "Escape") { setShowNewThread(false); setNewThreadName(""); }
                }}
                placeholder="Thread name..."
                className="flex-1 px-2 py-1 text-xs border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-sky-400"
              />
              <button onClick={handleCreateThread} className="p-1 text-sky-600 hover:text-sky-700">
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setShowNewThread(false); setNewThreadName(""); }} className="p-1 text-stone-400">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="space-y-0.5">
            {pitstop.threads.map((thread) => (
              <div key={thread.id} className="flex items-center gap-1">
                <button
                  onClick={() => setActiveThread(thread.id)}
                  className={`flex-1 text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    activeThread === thread.id
                      ? "bg-sky-50 text-sky-700 font-medium"
                      : "text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  <span className="text-stone-400 mr-1">#</span>
                  {thread.name}
                  <span className={`ml-1 ${activeThread === thread.id ? "text-sky-400" : "text-stone-300"}`}>
                    {thread.messages.length > 0 && `(${thread.messages.length})`}
                  </span>
                </button>
                <button
                  onClick={() => handleToggleSubscribe(thread.id)}
                  title={subscribedIds.has(thread.id) ? "Unsubscribe" : "Subscribe for notifications"}
                  className={`p-1 rounded transition-colors ${
                    subscribedIds.has(thread.id)
                      ? "text-sky-500 hover:text-stone-400"
                      : "text-stone-300 hover:text-sky-500"
                  }`}
                >
                  {subscribedIds.has(thread.id) ? (
                    <BellOff className="w-3 h-3" />
                  ) : (
                    <Bell className="w-3 h-3" />
                  )}
                </button>
              </div>
            ))}

            {pitstop.threads.length === 0 && !showNewThread && (
              <p className="text-xs text-stone-400 px-2">No threads yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Right panel: thread messages */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {currentThread ? (
          <>
            {/* Thread header */}
            <div className="px-6 py-4 border-b border-stone-200 bg-white flex-shrink-0 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-stone-900">
                  <span className="text-stone-400 mr-1">#</span>{currentThread.name}
                </h2>
                <p className="text-xs text-stone-400 mt-0.5">
                  {currentThread.messages.length} message{currentThread.messages.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={() => handleToggleSubscribe(currentThread.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors ${
                  subscribedIds.has(currentThread.id)
                    ? "bg-sky-50 text-sky-700 hover:bg-sky-100"
                    : "text-stone-400 hover:text-stone-600 hover:bg-stone-100"
                }`}
              >
                {subscribedIds.has(currentThread.id) ? (
                  <><BellOff className="w-3.5 h-3.5" /> Subscribed</>
                ) : (
                  <><Bell className="w-3.5 h-3.5" /> Subscribe</>
                )}
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {currentThread.messages.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-stone-400 text-sm">No messages yet. Start the conversation.</p>
                </div>
              ) : (
                currentThread.messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isOwn={msg.author.id === currentUserId}
                  />
                ))
              )}
            </div>

            {/* Composer */}
            <div className="flex-shrink-0 border-t border-stone-200 bg-white px-6 py-4">
              <MessageComposer
                threadId={currentThread.id}
                users={users}
                onSent={(msg) => handleMessageSent(currentThread.id, msg)}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-stone-400 text-sm">Select or create a thread to start discussing.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
