"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import Avatar from "@/components/Avatar";

type Retro = {
  id: string;
  wentWell: string | null;
  couldImprove: string | null;
  keyLearning: string | null;
  createdAt: string;
  author: { id: string; name: string | null; image: string | null };
};

export default function RetrospectiveSection({
  entityType,
  entityId,
}: {
  entityType: "Goal" | "Pitstop";
  entityId: string;
}) {
  const [retros, setRetros] = useState<Retro[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [wentWell, setWentWell] = useState("");
  const [couldImprove, setCouldImprove] = useState("");
  const [keyLearning, setKeyLearning] = useState("");
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    if (!open && retros === null) {
      setLoading(true);
      const res = await fetch(`/api/retrospectives?entityType=${entityType}&entityId=${entityId}`);
      if (res.ok) setRetros(await res.json());
      setLoading(false);
    }
    setOpen((v) => !v);
  };

  const handleSave = async () => {
    if (!wentWell.trim() && !couldImprove.trim() && !keyLearning.trim()) return;
    setSaving(true);
    const res = await fetch("/api/retrospectives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType,
        entityId,
        wentWell: wentWell.trim() || null,
        couldImprove: couldImprove.trim() || null,
        keyLearning: keyLearning.trim() || null,
      }),
    });
    if (res.ok) {
      const r = await res.json();
      setRetros((prev) => [r, ...(prev ?? [])]);
      setWentWell(""); setCouldImprove(""); setKeyLearning("");
      setShowForm(false);
    }
    setSaving(false);
  };

  const hasRetros = retros && retros.length > 0;

  return (
    <div className="px-4 py-3 border-b border-stone-100">
      <button onClick={toggle} className="flex items-center justify-between w-full text-left">
        <span className="text-xs font-medium text-stone-500 flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" />
          Retrospective
          {hasRetros && <span className="text-stone-300">({retros.length})</span>}
        </span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-1.5 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50 rounded-md border border-dashed border-violet-200 transition-colors"
            >
              + Write retrospective
            </button>
          ) : (
            <div className="space-y-2 bg-stone-50 rounded-lg p-3 border border-stone-200">
              <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide">Retrospective</p>
              {[
                { label: "What went well?",      value: wentWell,     set: setWentWell,     color: "emerald" },
                { label: "What could improve?",  value: couldImprove, set: setCouldImprove, color: "amber" },
                { label: "Key learning",          value: keyLearning,  set: setKeyLearning,  color: "violet" },
              ].map(({ label, value, set }) => (
                <div key={label}>
                  <label className="block text-[10px] text-stone-400 mb-0.5">{label}</label>
                  <textarea
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    placeholder={label}
                    rows={2}
                    className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400 resize-none"
                  />
                </div>
              ))}
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || (!wentWell.trim() && !couldImprove.trim() && !keyLearning.trim())}
                  className="px-3 py-1 text-xs bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setShowForm(false)} className="px-3 py-1 text-xs text-stone-400 hover:text-stone-600">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading && <p className="text-xs text-stone-400">Loading…</p>}
          {retros && retros.length === 0 && !showForm && (
            <p className="text-xs text-stone-400">No retrospective yet.</p>
          )}
          {retros && retros.map((r) => (
            <div key={r.id} className="bg-stone-50 rounded-lg p-3 border border-stone-100 space-y-2">
              <div className="flex items-center gap-1.5">
                <Avatar user={r.author} size={14} />
                <span className="text-[10px] text-stone-400">
                  {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
              {r.wentWell && (
                <div>
                  <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-0.5">Went well</p>
                  <p className="text-xs text-stone-700">{r.wentWell}</p>
                </div>
              )}
              {r.couldImprove && (
                <div>
                  <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-0.5">Could improve</p>
                  <p className="text-xs text-stone-700">{r.couldImprove}</p>
                </div>
              )}
              {r.keyLearning && (
                <div>
                  <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide mb-0.5">Key learning</p>
                  <p className="text-xs text-stone-700">{r.keyLearning}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
