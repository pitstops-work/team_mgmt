"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildSearchIndex, type GeoData, type SearchResult } from "@/lib/useGeoData";
import { LAYERS, type LayerKey } from "@/lib/layers";

interface SearchBoxProps {
  geoData: GeoData | null;
  flyToRef: React.MutableRefObject<((latlng: [number, number], zoom?: number) => void) | null>;
  openPopupRef: React.MutableRefObject<((layerKey: LayerKey, featureIdx: number) => void) | null>;
}

const LAYER_COLORS = Object.fromEntries(LAYERS.map((l) => [l.key, l.color]));
const TYPE_ICONS: Record<string, string> = {
  children_centres: "🧒",
  youth_centres: "👥",
  creches: "👶",
  resource_centres: "🏠",
};

export default function SearchBox({ geoData, flyToRef, openPopupRef }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const indexRef = useRef<SearchResult[]>([]);

  useEffect(() => {
    if (geoData) indexRef.current = buildSearchIndex(geoData);
  }, [geoData]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return indexRef.current
      .filter(
        (r) =>
          r.label.toLowerCase().includes(q) ||
          r.sublabel.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query]);

  function select(result: SearchResult) {
    flyToRef.current?.(result.centroid, result.type === "polygon" ? 15 : 17);
    const layerFeatures = indexRef.current.filter((r) => r.layerKey === result.layerKey);
    const idx = layerFeatures.findIndex((r) => r.label === result.label && r.sublabel === result.sublabel);
    if (idx >= 0) openPopupRef.current?.(result.layerKey, idx);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    // Mobile: full width with small margins (left-3 right-3, no centering)
    // Desktop: fixed 320px wide, horizontally centred
    <div className="absolute top-3 z-20 left-3 right-3 sm:left-1/2 sm:right-auto sm:w-80 sm:-translate-x-1/2">
      <div className="relative">
        <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-lg px-3 gap-2">
          <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            ref={inputRef}
            className="flex-1 py-2.5 text-sm bg-transparent outline-none text-slate-800 placeholder:text-slate-400"
            placeholder="Search settlements, centres…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
          {query && (
            <button onClick={() => { setQuery(""); setOpen(false); }} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
          )}
        </div>

        {open && results.length > 0 && (
          <div className="absolute top-full mt-1.5 w-full bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            {results.map((r, i) => {
              const color = LAYER_COLORS[r.layerKey] ?? "#6366f1";
              const icon = TYPE_ICONS[r.layerKey];
              return (
                <button
                  key={i}
                  onMouseDown={() => select(r)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors"
                >
                  {icon ? (
                    <span className="text-base w-5 text-center">{icon}</span>
                  ) : (
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{r.label}</div>
                    <div className="text-xs text-slate-400 truncate">{r.sublabel}</div>
                  </div>
                  <svg className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              );
            })}
          </div>
        )}

        {open && query.length >= 2 && results.length === 0 && (
          <div className="absolute top-full mt-1.5 w-full bg-white rounded-xl shadow-lg border border-slate-200 px-4 py-3 text-sm text-slate-400">
            No results for &ldquo;{query}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}
