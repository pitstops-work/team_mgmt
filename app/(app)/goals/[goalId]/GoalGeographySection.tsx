"use client";

import { useState } from "react";
import { MapPin, Plus, X } from "lucide-react";

type GeoItem = { id: string; name: string; type: "city" | "zone" | "cluster" | "settlement" };
type AllGeo = {
  cities: GeoItem[];
  zones: GeoItem[];
  clusters: GeoItem[];
  settlements: GeoItem[];
};
type Tagged = {
  cities: GeoItem[];
  zones: GeoItem[];
  clusters: GeoItem[];
  settlements: GeoItem[];
};

const TYPE_LABELS: Record<string, string> = {
  city: "City",
  zone: "Zone",
  cluster: "Cluster",
  settlement: "Settlement",
};

export default function GoalGeographySection({ goalId }: { goalId: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tagged, setTagged] = useState<Tagged>({ cities: [], zones: [], clusters: [], settlements: [] });
  const [all, setAll] = useState<AllGeo>({ cities: [], zones: [], clusters: [], settlements: [] });
  const [pickerType, setPickerType] = useState<string | null>(null);

  const load = async () => {
    if (loaded) return;
    const [taggedRes, allRes] = await Promise.all([
      fetch(`/api/goals/${goalId}/geography`),
      fetch("/api/geography"),
    ]);
    if (taggedRes.ok) setTagged(await taggedRes.json());
    if (allRes.ok) {
      const data = await allRes.json();
      setAll({
        cities: (data.cities ?? []).map((c: { id: string; name: string }) => ({ ...c, type: "city" as const })),
        zones: (data.zones ?? []).map((z: { id: string; name: string }) => ({ ...z, type: "zone" as const })),
        clusters: (data.clusters ?? []).map((cl: { id: string; name: string }) => ({ ...cl, type: "cluster" as const })),
        settlements: (data.settlements ?? []).map((s: { id: string; name: string }) => ({ ...s, type: "settlement" as const })),
      });
    }
    setLoaded(true);
  };

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) load();
  };

  const handleTag = async (type: string, id: string) => {
    const res = await fetch(`/api/goals/${goalId}/geography`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id }),
    });
    if (res.ok) {
      const item = all[`${type}s` as keyof AllGeo].find((i) => i.id === id)!;
      setTagged((prev) => ({ ...prev, [`${type}s`]: [...prev[`${type}s` as keyof Tagged], item] }));
    }
    setPickerType(null);
  };

  const handleUntag = async (type: string, id: string) => {
    const res = await fetch(`/api/goals/${goalId}/geography`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id }),
    });
    if (res.ok) {
      setTagged((prev) => ({ ...prev, [`${type}s`]: prev[`${type}s` as keyof Tagged].filter((i) => i.id !== id) }));
    }
  };

  const allTagged = [...tagged.cities, ...tagged.zones, ...tagged.clusters, ...tagged.settlements];
  const totalCount = allTagged.length;

  const getUntagged = (type: string) => {
    const key = `${type}s` as keyof AllGeo;
    return all[key].filter((i) => !tagged[key as keyof Tagged].some((t) => t.id === i.id));
  };

  return (
    <div className="pt-4 border-t border-stone-100">
      <button onClick={handleOpen} className="flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-700 mb-2">
        <MapPin className="w-3.5 h-3.5" />
        Geography
        {totalCount > 0 && <span className="ml-1 text-sky-600 font-semibold">{totalCount}</span>}
      </button>

      {open && (
        <div className="space-y-2">
          {!loaded && <p className="text-xs text-stone-400">Loading…</p>}

          {loaded && totalCount === 0 && !pickerType && (
            <p className="text-xs text-stone-400">No geography tagged.</p>
          )}

          {loaded && allTagged.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allTagged.map((item) => (
                <span key={`${item.type}-${item.id}`} className="flex items-center gap-1 px-2 py-0.5 bg-stone-100 border border-stone-200 text-xs text-stone-700 rounded-full group">
                  <span className="text-[10px] text-stone-400">{TYPE_LABELS[item.type]}</span>
                  {item.name}
                  <button
                    onClick={() => handleUntag(item.type, item.id)}
                    className="opacity-0 group-hover:opacity-100 text-stone-300 hover:text-red-400 transition-all"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {loaded && !pickerType && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {(["city", "zone", "cluster", "settlement"] as const).map((type) => {
                const untagged = getUntagged(type);
                if (untagged.length === 0) return null;
                return (
                  <button
                    key={type}
                    onClick={() => setPickerType(type)}
                    className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 hover:bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200 transition-colors"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    {TYPE_LABELS[type]}
                  </button>
                );
              })}
            </div>
          )}

          {pickerType && (
            <div className="border border-stone-200 rounded-lg bg-white shadow-sm">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-stone-100">
                <span className="text-[10px] font-medium text-stone-500 uppercase tracking-wide">
                  Select {TYPE_LABELS[pickerType]}
                </span>
                <button onClick={() => setPickerType(null)} className="text-stone-300 hover:text-stone-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {getUntagged(pickerType).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleTag(pickerType, item.id)}
                    className="w-full text-left px-3 py-2 text-xs text-stone-700 hover:bg-sky-50 hover:text-sky-700 transition-colors"
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
