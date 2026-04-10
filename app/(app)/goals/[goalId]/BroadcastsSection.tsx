"use client";

import { useState } from "react";
import { Megaphone, ChevronDown, ChevronRight, Send } from "lucide-react";
import Avatar from "@/components/Avatar";

type Broadcast = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null; image: string | null };
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function BroadcastsSection({ goalId }: { goalId: string }) {
  const [broadcasts, setBroadcasts] = useState<Broadcast[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const toggle = async () => {
    if (!open && broadcasts === null) {
      setLoading(true);
      const res = await fetch(`/api/goals/${goalId}/broadcasts`);
      if (res.ok) setBroadcasts(await res.json());
      else setBroadcasts([]);
      setLoading(false);
    }
    setOpen((v) => !v);
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/goals/${goalId}/broadcasts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), body: body.trim() }),
    });
    if (res.ok) {
      const b = await res.json();
      setBroadcasts((prev) => [b, ...(prev ?? [])]);
      setTitle(""); setBody(""); setShowForm(false); setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
    setSaving(false);
  };

  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden">
      <button onClick={toggle} className="flex items-center justify-between w-full px-4 py-3 bg-white hover:bg-stone-50 transition-colors">
        <span className="text-sm font-medium text-stone-700 flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-stone-400" />
          Broadcasts
          {broadcasts && broadcasts.length > 0 && (
            <span className="text-xs text-stone-400">({broadcasts.length})</span>
          )}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
      </button>

      {open && (
        <div className="border-t border-stone-200 divide-y divide-stone-100">
          <div className="px-4 py-3">
            {success && (
              <p className="text-xs text-emerald-600 font-medium mb-2">Update sent to all followers!</p>
            )}
            {!showForm ? (
              <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-700">
                <Send className="w-3.5 h-3.5" />
                Send update to followers
              </button>
            ) : (
              <div className="space-y-2 bg-stone-50 rounded-lg p-3 border border-stone-200">
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Update title…"
                  className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400"
                />
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="What's the update?"
                  rows={3}
                  className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSend}
                    disabled={!title.trim() || !body.trim() || saving}
                    className="flex items-center gap-1 px-3 py-1 text-xs bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
                  >
                    <Send className="w-3 h-3" />
                    {saving ? "Sending…" : "Send"}
                  </button>
                  <button onClick={() => setShowForm(false)} className="px-2 py-1 text-xs text-stone-400 hover:text-stone-600">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {loading && <div className="px-4 py-3"><p className="text-xs text-stone-400">Loading…</p></div>}
          {broadcasts && broadcasts.length === 0 && !showForm && (
            <div className="px-4 py-3"><p className="text-xs text-stone-400">No broadcasts yet.</p></div>
          )}
          {broadcasts && broadcasts.map((b) => (
            <div key={b.id} className="px-4 py-3">
              <div className="flex items-start gap-2">
                <Avatar user={b.author} size={20} />
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
      )}
    </div>
  );
}
