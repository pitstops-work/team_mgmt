"use client";

import { useState } from "react";
import { MapPin, Plus, X } from "lucide-react";

type GeoType = "city" | "zone" | "cluster" | "settlement";
type GeoItem = { id: string; name: string; type: GeoType };
type GeoState = Record<GeoType, GeoItem[]>;

const TYPE_LABELS: Record<GeoType, string> = {
  city: "City",
  zone: "Zone",
  cluster: "Cluster",
  settlement: "Settlement",
};

const EMPTY: GeoState = { city: [], zone: [], cluster: [], settlement: [] };

export default function GeographySection({ pitstopId }: { pitstopId: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tagged, setTagged] = useState<GeoState>(EMPTY);
  const [all, setAll] = useState<GeoState>(EMPTY);
  const [pickerType, setPickerType] = useState<GeoType | null>(null);

  const load = async () => {
    if (loaded) return;
    const [taggedRes, allRes] = await Promise.all([
      fetch(`/api/pitstops/${pitstopId}/geography`),
      fetch("/api/geography"),
    ]);

    if (taggedRes.ok) {
      const data = await taggedRes.json();
      setTagged({
        city:       (data.cities      ?? []).map((c: { id: string; name: string }) => ({ ...c, type: "city"       as const })),
        zone:       (data.zones       ?? []).map((z: { id: string; name: string }) => ({ ...z, type: "zone"       as const })),
        cluster:    (data.clusters    ?? []).map((cl: { id: string; name: string }) => ({ ...cl, type: "cluster"  as const })),
        settlement: (data.settlements ?? []).map((s: { id: string; name: string }) => ({ ...s, type: "settlement" as const })),
      });
    }

    if (allRes.ok) {
      const data = await allRes.json();
      setAll({
        city:       (data.cities      ?? []).map((c: { id: string; name: string }) => ({ ...c, type: "city"       as const })),
        zone:       (data.zones       ?? []).map((z: { id: string; name: string }) => ({ ...z, type: "zone"       as const })),
        cluster:    (data.clusters    ?? []).map((cl: { id: string; name: string }) => ({ ...cl, type: "cluster"  as const })),
        settlement: (data.settlements ?? []).map((s: { id: string; name: string }) => ({ ...s, type: "settlement" as const })),
      });
    }

    setLoaded(true);
  };

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) load();
  };

  const handleTag = async (type: GeoType, id: string) => {
    const res = await fetch(`/api/pitstops/${pitstopId}/geography`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id }),
    });
    if (res.ok) {
      const item = all[type].find((i) => i.id === id);
      if (item) setTagged((prev) => ({ ...prev, [type]: [...prev[type], item] }));
    }
    setPickerType(null);
  };

  const handleUntag = async (type: GeoType, id: string) => {
    const res = await fetch(`/api/pitstops/${pitstopId}/geography`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id }),
    });
    if (res.ok) setTagged((prev) => ({ ...prev, [type]: prev[type].filter((i) => i.id !== id) }));
  };

  const allTagged: GeoItem[] = [
    ...tagged.city,
    ...tagged.zone,
    ...tagged.cluster,
    ...tagged.settlement,
  ];

  const getUntagged = (type: GeoType) =>
    all[type].filter((i) => !tagged[type].some((t) => t.id === i.id));

  return (
    <div className="px-4 py-3 border-b border-stone-100">
      <button onClick={handleOpen} className="flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-700 w-full text-left">
        <MapPin className="w-3.5 h-3.5" />
        Geography
        {allTagged.length > 0 && <span className="ml-1 text-sky-600 font-semibold">({allTagged.length})</span>}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {!loaded && <p className="text-xs text-stone-400">Loading…</p>}

          {loaded && allTagged.length === 0 && !pickerType && (
            <p className="text-xs text-stone-400">No geography tagged.</p>
          )}

          {loaded && allTagged.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allTagged.map((item) => (
                <span
                  key={`${item.type}-${item.id}`}
                  className="flex items-center gap-1 px-2 py-0.5 bg-stone-100 border border-stone-200 text-xs text-stone-700 rounded-full group"
                >
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
