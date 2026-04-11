"use client";

import { useState } from "react";
import { Tag, Plus, X } from "lucide-react";

type Theme = { id: string; name: string; color: string | null };

export default function ThemesSection({ pitstopId }: { pitstopId: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tagged, setTagged] = useState<Theme[]>([]);
  const [all, setAll] = useState<Theme[]>([]);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    if (loaded) return;
    const [taggedRes, allRes] = await Promise.all([
      fetch(`/api/pitstops/${pitstopId}/themes`),
      fetch("/api/themes"),
    ]);
    if (taggedRes.ok) setTagged(await taggedRes.json());
    if (allRes.ok) setAll(await allRes.json());
    setLoaded(true);
  };

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) load();
  };

  const handleTag = async (themeId: string) => {
    const res = await fetch(`/api/pitstops/${pitstopId}/themes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeId }),
    });
    if (res.ok) {
      const theme = all.find((t) => t.id === themeId)!;
      setTagged((prev) => [...prev, theme]);
    }
    setAdding(false);
  };

  const handleUntag = async (themeId: string) => {
    const res = await fetch(`/api/pitstops/${pitstopId}/themes`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeId }),
    });
    if (res.ok) setTagged((prev) => prev.filter((t) => t.id !== themeId));
  };

  const untagged = all.filter((t) => !tagged.some((tg) => tg.id === t.id));

  return (
    <div className="px-4 py-3 border-b border-stone-100">
      <button onClick={handleOpen} className="flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-700 w-full text-left">
        <Tag className="w-3.5 h-3.5" />
        Themes
        {tagged.length > 0 && <span className="ml-1 text-sky-600 font-semibold">({tagged.length})</span>}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {!loaded && <p className="text-xs text-stone-400">Loading…</p>}

          {loaded && tagged.length === 0 && !adding && (
            <p className="text-xs text-stone-400">No themes tagged.</p>
          )}

          {loaded && tagged.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tagged.map((t) => (
                <span
                  key={t.id}
                  className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border group"
                  style={t.color ? { backgroundColor: t.color + "20", borderColor: t.color + "60", color: t.color } : undefined}
                >
                  {!t.color && <span className="text-stone-600">{t.name}</span>}
                  {t.color && t.name}
                  <button onClick={() => handleUntag(t.id)} className="opacity-50 hover:opacity-100 transition-opacity">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {loaded && untagged.length > 0 && !adding && (
            <button onClick={() => setAdding(true)} className="text-xs text-sky-600 hover:text-sky-700 flex items-center gap-1">
              <Plus className="w-3 h-3" /> Tag theme
            </button>
          )}

          {adding && untagged.length > 0 && (
            <div className="border border-stone-200 rounded-lg bg-white shadow-sm max-h-40 overflow-y-auto">
              {untagged.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTag(t.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-stone-700 hover:bg-sky-50 hover:text-sky-700 transition-colors text-left"
                >
                  {t.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />}
                  {t.name}
                </button>
              ))}
              <button onClick={() => setAdding(false)} className="w-full px-3 py-1.5 text-xs text-stone-400 hover:text-stone-600 border-t border-stone-100">
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
