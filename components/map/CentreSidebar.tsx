"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ClipboardList, ExternalLink } from "lucide-react";
import type { CentreFeature } from "./MapView";

const CENTRE_COLORS: Record<string, string> = {
  children_centres: "#f97316",
  youth_centres:    "#8b5cf6",
  creches:          "#ec4899",
};

const CENTRE_EMOJIS: Record<string, string> = {
  children_centres: "🧒",
  youth_centres:    "👥",
  creches:          "👶",
};

interface Props {
  feature: CentreFeature | null;
  onClose: () => void;
}

export default function CentreSidebar({ feature, onClose }: Props) {
  const [settlementDbId, setSettlementDbId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const prevName = useRef<string | null>(null);

  useEffect(() => {
    if (!feature || feature.name === prevName.current) return;
    prevName.current = feature.name;
    setSettlementDbId(null);

    if (!feature.matchedSettlement) return;
    setLoading(true);
    const clusterParam = feature.cluster ? `&cluster=${encodeURIComponent(feature.cluster)}` : "";
    fetch(`/api/map/settlement-needs?settlement=${encodeURIComponent(feature.matchedSettlement)}${clusterParam}`)
      .then(r => r.json())
      .then(d => setSettlementDbId(d?.settlement?.id ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [feature]);

  const isOpen = !!feature;
  const color = feature ? (CENTRE_COLORS[feature.layerKey] ?? feature.layerColor) : "#6366f1";
  const emoji = feature ? (CENTRE_EMOJIS[feature.layerKey] ?? "🏠") : "🏠";

  const mobileClass = isOpen ? "translate-y-0" : "translate-y-full";
  const desktopClass = isOpen ? "sm:translate-x-0" : "sm:translate-x-full";

  return (
    <div
      className={[
        "bg-white shadow-2xl z-40 flex flex-col transition-transform duration-300",
        "fixed inset-x-0 bottom-16 rounded-t-2xl border-t border-slate-200 sm:border-t-0",
        "sm:absolute sm:inset-x-auto sm:top-0 sm:right-0 sm:bottom-0 sm:rounded-none sm:border-l sm:border-slate-200",
        "sm:w-80 max-h-[72vh] sm:max-h-none",
        mobileClass, desktopClass,
      ].join(" ")}
    >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex-shrink-0 flex justify-center pt-2 pb-1">
        <div className="w-10 h-1 rounded-full bg-slate-300" />
      </div>

      {feature && (
        <>
          {/* Header */}
          <div className="flex-shrink-0 p-4 border-b border-slate-100">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full text-white mb-2"
                  style={{ background: color }}
                >
                  <span>{emoji}</span>
                  <span>{feature.centreType}</span>
                </div>
                <h2 className="text-sm font-bold text-slate-800 leading-tight">{feature.name}</h2>
              </div>
              <button
                onClick={onClose}
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition-colors text-lg"
              >
                ×
              </button>
            </div>

            {/* Location tags */}
            <div className="flex gap-2 flex-wrap mt-2">
              {feature.zone && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  {feature.zone} Zone
                </span>
              )}
              {feature.cluster && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {feature.cluster.replace(/_/g, " ")}
                </span>
              )}
              {feature.partner && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {feature.partner}
                </span>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Matched settlement */}
            {feature.matchedSettlement && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">Settlement</p>
                <p className="text-sm font-medium text-slate-700">{feature.matchedSettlement}</p>
              </div>
            )}

            {/* Edit assessment CTA */}
            <div className="rounded-xl border border-slate-100 p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Assessment</p>
              <p className="text-xs text-slate-500">
                This centre is recorded on the settlement assessment form. Edit there to update counts, notes, or add data.
              </p>
              {loading ? (
                <div className="flex gap-1">
                  {[0,150,300].map(d => (
                    <span key={d} className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              ) : settlementDbId ? (
                <Link
                  href={`/needs/settlement/${settlementDbId}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-sky-600 border border-sky-200 hover:bg-sky-50 transition-colors w-full justify-center"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  Edit Assessment
                </Link>
              ) : feature.matchedSettlement ? (
                <p className="text-xs text-slate-400 italic">Settlement not yet in database</p>
              ) : (
                <p className="text-xs text-slate-400 italic">No matched settlement recorded</p>
              )}
            </div>

            {/* Directions */}
            {feature.latlng[0] !== 0 && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${feature.latlng[0]},${feature.latlng[1]}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition-colors w-full justify-center"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Directions in Google Maps
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
