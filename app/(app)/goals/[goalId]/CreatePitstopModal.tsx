"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toDateInput, fmtDate } from "@/lib/timeline";

const PITSTOP_TYPES = [
  { value: "Meeting", label: "Meeting" },
  { value: "Training", label: "Training" },
  { value: "SiteVisit", label: "Site Visit" },
  { value: "Discussion", label: "Discussion" },
  { value: "AppDevelopment", label: "App Development" },
  { value: "Budgeting", label: "Budgeting" },
  { value: "Proposal", label: "Proposal" },
  { value: "Research", label: "Research" },
  { value: "Review", label: "Review" },
  { value: "Custom", label: "Custom" },
];

interface Props {
  goalId: string;
  goalTargetDate?: string | null;
  onClose: () => void;
  onCreated: (pitstop: unknown) => void;
}

export default function CreatePitstopModal({ goalId, goalTargetDate, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Discussion");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("Upcoming");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const goalMax = toDateInput(goalTargetDate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (targetDate && goalMax && targetDate > goalMax) {
      setError(`Target date must be on or before the goal deadline (${fmtDate(goalTargetDate)})`);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/goals/${goalId}/pitstops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), type, notes: notes.trim() || null, status,
          startDate: startDate || null,
          targetDate: targetDate || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create pitstop");
      }
      const pitstop = await res.json();
      onCreated(pitstop);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-stone-900">New Pitstop</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Title</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's this pitstop about?"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-stone-600 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
              >
                {PITSTOP_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="flex-1">
              <label className="block text-xs font-medium text-stone-600 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
              >
                <option value="Upcoming">Upcoming</option>
                <option value="InProgress">In Progress</option>
                <option value="Done">Done</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Context, agenda, or details..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-stone-600 mb-1">Start date</label>
              <input
                type="date"
                value={startDate}
                max={goalMax || undefined}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </div>

            <div className="flex-1">
              <label className="block text-xs font-medium text-stone-600 mb-1">
                Target date
                {goalTargetDate && (
                  <span className="text-stone-400 font-normal ml-1">≤ {fmtDate(goalTargetDate)}</span>
                )}
              </label>
              <input
                type="date"
                value={targetDate}
                max={goalMax || undefined}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">Cancel</button>
            <button
              type="submit"
              disabled={!title.trim() || loading}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? "Creating..." : "Create Pitstop"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
