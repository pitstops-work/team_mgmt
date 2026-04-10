"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, CheckCircle } from "lucide-react";
import Avatar from "@/components/Avatar";

type User = { id: string; name: string | null; image: string | null };
type Escalation = {
  id: string;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
  escalatedBy: User;
  escalatedTo: User;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function EscalationSection({
  pitstopId,
  users,
}: {
  pitstopId: string;
  users: User[];
}) {
  const [escalations, setEscalations] = useState<Escalation[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [escalatedToId, setEscalatedToId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    if (!open && escalations === null) {
      setLoading(true);
      const res = await fetch(`/api/pitstops/${pitstopId}/escalate`);
      if (res.ok) setEscalations(await res.json());
      setLoading(false);
    }
    setOpen((v) => !v);
  };

  const handleEscalate = async () => {
    if (!escalatedToId) return;
    setSaving(true);
    const res = await fetch(`/api/pitstops/${pitstopId}/escalate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ escalatedToId, note: note.trim() || null }),
    });
    if (res.ok) {
      const e = await res.json();
      setEscalations((prev) => [e, ...(prev ?? [])]);
      setEscalatedToId("");
      setNote("");
      setShowForm(false);
    }
    setSaving(false);
  };

  const handleResolve = async (escalationId: string) => {
    const res = await fetch(`/api/pitstops/${pitstopId}/escalate/${escalationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: true }),
    });
    if (res.ok) {
      setEscalations((prev) => (prev ?? []).filter((e) => e.id !== escalationId));
    }
  };

  return (
    <div className="px-4 py-3 border-b border-stone-100">
      <button onClick={toggle} className="flex items-center justify-between w-full text-left">
        <span className="text-xs font-medium text-stone-500 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          Escalations
          {escalations && escalations.length > 0 && (
            <span className="text-stone-300">({escalations.length})</span>
          )}
        </span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-1.5 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-md border border-dashed border-amber-200 transition-colors"
            >
              + Escalate to someone
            </button>
          ) : (
            <div className="space-y-2 bg-stone-50 rounded-lg p-3 border border-stone-200">
              <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide">Escalate to</p>
              <select
                value={escalatedToId}
                onChange={(e) => setEscalatedToId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400 bg-white"
              >
                <option value="">Select person…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name ?? u.id}</option>
                ))}
              </select>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why are you escalating? (optional)"
                rows={2}
                className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleEscalate}
                  disabled={saving || !escalatedToId}
                  className="px-3 py-1 text-xs bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
                >
                  {saving ? "Escalating…" : "Escalate"}
                </button>
                <button onClick={() => setShowForm(false)} className="px-3 py-1 text-xs text-stone-400 hover:text-stone-600">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading && <p className="text-xs text-stone-400">Loading…</p>}
          {escalations && escalations.length === 0 && !showForm && (
            <p className="text-xs text-stone-400">No active escalations.</p>
          )}
          {escalations && escalations.map((e) => (
            <div key={e.id} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 bg-amber-400" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  <span className="text-[10px] font-medium text-amber-600">Escalated to</span>
                  <Avatar name={e.escalatedTo.name} image={e.escalatedTo.image} size="xs" />
                  <span className="text-[10px] text-stone-600">{e.escalatedTo.name}</span>
                  <span className="text-[10px] text-stone-400">by {e.escalatedBy.name}</span>
                  <span className="text-[10px] text-stone-300">{fmtDate(e.createdAt)}</span>
                </div>
                {e.note && <p className="text-xs text-stone-600">{e.note}</p>}
                <button
                  onClick={() => handleResolve(e.id)}
                  className="mt-1 flex items-center gap-1 text-[10px] text-emerald-600 hover:text-emerald-700"
                >
                  <CheckCircle className="w-3 h-3" />
                  Mark resolved
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
