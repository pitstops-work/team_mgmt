"use client";

import { useState } from "react";
import Link from "next/link";
import { Tag, Plus, X } from "lucide-react";

type GoalStub = { id: string; title: string; status: string };
type Theme = {
  id: string;
  name: string;
  color: string | null;
  _count: { goals: number };
  goals: { goal: GoalStub }[];
};

const DEFAULT_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

function ThemeTag({ name, color }: { name: string; color: string | null }) {
  const bg = color ? `${color}20` : "#f1f5f9";
  const text = color ?? "#64748b";
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{ backgroundColor: bg, color: text, borderColor: `${color ?? "#94a3b8"}40` }}
    >
      <Tag className="w-2.5 h-2.5" />
      {name}
    </span>
  );
}

export default function ThemesView({
  initialThemes,
}: {
  initialThemes: Theme[];
  currentUserId: string;
}) {
  const [themes, setThemes] = useState<Theme[]>(initialThemes);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/themes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), color }),
    });
    if (res.ok) {
      const t = await res.json();
      setThemes((prev) => [...prev, { ...t, goals: [] }]);
      setName(""); setColor(DEFAULT_COLORS[0]); setShowForm(false);
    }
    setSaving(false);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-stone-400" />
          <h1 className="text-lg font-semibold text-stone-900">Themes</h1>
          <span className="text-xs text-stone-400">({themes.length})</span>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New theme
        </button>
      </div>

      {showForm && (
        <div className="mb-6 bg-stone-50 rounded-xl p-4 border border-stone-200 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-stone-700">New Theme</p>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-stone-400" /></button>
          </div>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Theme name…"
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
          <div>
            <label className="block text-xs text-stone-500 mb-1">Color</label>
            <div className="flex gap-2 flex-wrap">
              {DEFAULT_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? "border-stone-900 scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-2 text-sm text-stone-600">Cancel</button>
            <button onClick={handleCreate} disabled={!name.trim() || saving}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {saving ? "Saving…" : "Create"}
            </button>
          </div>
        </div>
      )}

      {themes.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-stone-200 rounded-xl">
          <p className="text-stone-400 text-sm">No themes yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {themes.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-stone-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <ThemeTag name={t.name} color={t.color} />
                <span className="text-xs text-stone-400">{t._count.goals} goals</span>
              </div>
              {t.goals.length > 0 && (
                <div className="space-y-1">
                  {t.goals.map(({ goal }) => (
                    <Link key={goal.id} href={`/goals/${goal.id}`}
                      className="flex items-center gap-2 text-xs text-stone-600 hover:text-sky-600 transition-colors">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        goal.status === "Complete" ? "bg-emerald-400" : goal.status === "Active" ? "bg-sky-400" : "bg-amber-400"
                      }`} />
                      {goal.title}
                    </Link>
                  ))}
                </div>
              )}
              {t.goals.length === 0 && (
                <p className="text-xs text-stone-300">No goals tagged.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
