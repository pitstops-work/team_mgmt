"use client";

import { useState } from "react";
import { ClipboardCheck, ChevronDown, ChevronRight } from "lucide-react";
import Avatar from "@/components/Avatar";

type CheckinStatus = "OnTrack" | "AtRisk" | "Blocked" | "Done";
type Checkin = {
  id: string;
  date: string;
  status: CheckinStatus;
  note: string | null;
  nextSteps: string | null;
  user: { id: string; name: string | null; image: string | null };
};

const STATUS_CONFIG: Record<CheckinStatus, { label: string; cls: string; dot: string }> = {
  OnTrack: { label: "On Track",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-400" },
  AtRisk:  { label: "At Risk",    cls: "bg-amber-50  text-amber-700  border-amber-200",  dot: "bg-amber-400"  },
  Blocked: { label: "Blocked",    cls: "bg-red-50    text-red-700    border-red-200",    dot: "bg-red-400"    },
  Done:    { label: "Done",       cls: "bg-sky-50    text-sky-700    border-sky-200",    dot: "bg-sky-400"    },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function CheckinSection({ pitstopId }: { pitstopId: string }) {
  const [checkins, setCheckins] = useState<Checkin[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [status, setStatus] = useState<CheckinStatus>("OnTrack");
  const [note, setNote] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    if (!open && checkins === null) {
      setLoading(true);
      const res = await fetch(`/api/pitstops/${pitstopId}/checkins`);
      if (res.ok) setCheckins(await res.json());
      setLoading(false);
    }
    setOpen((v) => !v);
  };

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch(`/api/pitstops/${pitstopId}/checkins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note: note.trim() || null, nextSteps: nextSteps.trim() || null }),
    });
    if (res.ok) {
      const c = await res.json();
      setCheckins((prev) => [c, ...(prev ?? [])]);
      setNote(""); setNextSteps(""); setStatus("OnTrack"); setShowForm(false);
    }
    setSaving(false);
  };

  return (
    <div className="px-4 py-3 border-b border-stone-100">
      <button onClick={toggle} className="flex items-center justify-between w-full text-left">
        <span className="text-xs font-medium text-stone-500 flex items-center gap-1.5">
          <ClipboardCheck className="w-3.5 h-3.5" />
          Check-ins
          {checkins && checkins.length > 0 && (
            <span className="text-stone-300">({checkins.length})</span>
          )}
        </span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Log check-in form */}
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-1.5 text-xs text-sky-600 hover:text-sky-700 hover:bg-sky-50 rounded-md border border-dashed border-sky-200 transition-colors"
            >
              + Log check-in
            </button>
          ) : (
            <div className="space-y-2 bg-stone-50 rounded-lg p-3 border border-stone-200">
              <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide">How is it going?</p>
              <div className="flex gap-1.5 flex-wrap">
                {(["OnTrack", "AtRisk", "Blocked"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-colors ${
                      status === s ? STATUS_CONFIG[s].cls : "bg-white text-stone-500 border-stone-200"
                    }`}
                  >
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What happened this week?"
                rows={2}
                className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400 resize-none"
              />
              <textarea
                value={nextSteps}
                onChange={(e) => setNextSteps(e.target.value)}
                placeholder="Next steps…"
                rows={1}
                className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1 text-xs bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setShowForm(false)} className="px-3 py-1 text-xs text-stone-400 hover:text-stone-600">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* History */}
          {loading && <p className="text-xs text-stone-400">Loading…</p>}
          {checkins && checkins.length === 0 && !showForm && (
            <p className="text-xs text-stone-400">No check-ins yet.</p>
          )}
          {checkins && checkins.map((c) => {
            const cfg = STATUS_CONFIG[c.status];
            return (
              <div key={c.id} className="flex items-start gap-2">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cfg.cls}`}>{cfg.label}</span>
                    <Avatar user={c.user} size={14} />
                    <span className="text-[10px] text-stone-400">{fmtDate(c.date)}</span>
                  </div>
                  {c.note && <p className="text-xs text-stone-600">{c.note}</p>}
                  {c.nextSteps && <p className="text-xs text-stone-400 mt-0.5">Next: {c.nextSteps}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
