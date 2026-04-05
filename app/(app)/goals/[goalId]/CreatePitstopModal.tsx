"use client";

import { useState } from "react";
import { X } from "lucide-react";

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
  onClose: () => void;
  onCreated: (pitstop: unknown) => void;
}

export default function CreatePitstopModal({ goalId, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Discussion");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("Upcoming");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/goals/${goalId}/pitstops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), type, notes: notes.trim() || null, status }),
      });
      if (!res.ok) throw new Error();
      const pitstop = await res.json();
      onCreated(pitstop);
    } catch {
      setError("Something went wrong. Please try again.");
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

          <div>
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

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Context, agenda, or details..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
            />
          </div>

          <div>
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
