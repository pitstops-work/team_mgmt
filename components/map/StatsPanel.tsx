"use client";

import type { GeoData } from "@/lib/useGeoData";
import { LAYERS } from "@/lib/layers";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

interface StatsPanelProps {
  geoData: GeoData | null;
  isOpen: boolean;
  onClose: () => void;
}

const PARTNER_LAYERS = LAYERS.filter((l) => l.type === "polygon");

const CENTRE_TYPES = [
  { key: "children" as const, label: "Children", color: "#f97316" },
  { key: "youth" as const,    label: "Youth",    color: "#8b5cf6" },
  { key: "creches" as const,  label: "Creches",  color: "#ec4899" },
];

const ZONES = ["North", "South", "Central", "West"];

const ZONE_COLORS: Record<string, string> = {
  North: "#6366f1", South: "#10b981", Central: "#f59e0b", West: "#ef4444",
};

export default function StatsPanel({ geoData, isOpen, onClose }: StatsPanelProps) {
  if (!geoData) return null;

  // 1. Settlements per partner
  const partnerCounts = PARTNER_LAYERS.map((l) => ({
    label: l.label,
    color: l.color,
    count: geoData.settlements[l.key]?.length ?? 0,
  })).sort((a, b) => b.count - a.count);
  const maxPartner = Math.max(...partnerCounts.map((p) => p.count), 1);

  // 2. Centres per zone
  const centresPerZone: Record<string, Record<string, number>> = {};
  ZONES.forEach((z) => {
    centresPerZone[z] = { children: 0, youth: 0, creches: 0 };
  });
  CENTRE_TYPES.forEach(({ key }) => {
    geoData.centres[key].forEach((f) => {
      const z = f.properties.zone ?? "";
      if (centresPerZone[z]) centresPerZone[z][key]++;
    });
  });

  // 3. Clusters with multi-programme overlap
  const clusterOverlap: Record<string, { types: Set<string>; count: number }> = {};
  CENTRE_TYPES.forEach(({ key, label }) => {
    geoData.centres[key].forEach((f) => {
      const c = (f.properties.cluster ?? "").replace(/_/g, " ");
      if (!c) return;
      if (!clusterOverlap[c]) clusterOverlap[c] = { types: new Set(), count: 0 };
      clusterOverlap[c].types.add(label);
      clusterOverlap[c].count++;
    });
  });
  const topClusters = Object.entries(clusterOverlap)
    .filter(([, v]) => v.types.size >= 2)
    .sort((a, b) => b[1].types.size - a[1].types.size || b[1].count - a[1].count)
    .slice(0, 8);

  // 4. Summary totals
  const totalSettlements = PARTNER_LAYERS.reduce(
    (s, l) => s + (geoData.settlements[l.key]?.length ?? 0), 0
  );
  const totalCentres =
    geoData.centres.children.length +
    geoData.centres.youth.length +
    geoData.centres.creches.length +
    geoData.centres.resource.length;

  return (
    <SurfaceProvider id="map.stats_panel">
    <div
      className={`absolute bottom-16 sm:bottom-0 left-0 right-0 z-20 bg-white border-t border-slate-200 shadow-2xl transition-transform duration-300 ${
        isOpen ? "translate-y-0" : "translate-y-full"
      }`}
      style={{ maxHeight: "60vh" }}
    >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2 pb-0">
        <div className="w-10 h-1 rounded-full bg-slate-300" />
      </div>

      {/* Handle bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold text-slate-800">Programme Statistics</span>
          <span className="text-xs text-slate-400">{totalSettlements} settlements · {totalCentres} centres</span>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: "calc(60vh - 48px)" }}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 sm:divide-x divide-slate-100">

          {/* Section 1: Settlements per partner */}
          <div className="px-5 py-4 border-b border-slate-100 sm:border-b-0">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
              Settlements by Partner
            </p>
            <div className="space-y-2">
              {partnerCounts.map(({ label, color, count }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-medium text-slate-700">{label}</span>
                    <span className="text-xs font-bold text-slate-500">{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${(count / maxPartner) * 100}%`, background: color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Centres per zone */}
          <div className="px-5 py-4 border-b border-slate-100 sm:border-b-0">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
              Centres by Zone
            </p>
            <div className="space-y-3">
              {ZONES.map((zone) => {
                const counts = centresPerZone[zone];
                const total = Object.values(counts).reduce((a, b) => a + b, 0);
                return (
                  <div key={zone}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: ZONE_COLORS[zone] }} />
                        <span className="text-xs font-semibold text-slate-700">{zone}</span>
                      </div>
                      <span className="text-xs text-slate-400">{total} total</span>
                    </div>
                    <div className="flex gap-2">
                      {CENTRE_TYPES.map(({ key, label, color }) => (
                        <div key={key} className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                          <span className="text-xs text-slate-500">{counts[key]}</span>
                          <span className="text-xs text-slate-300">{label.slice(0, 3)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Multi-programme clusters */}
          <div className="px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
              Programme Overlap by Cluster
            </p>
            {topClusters.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No clusters with multiple centre types</p>
            ) : (
              <div className="space-y-2">
                {topClusters.map(([cluster, data]) => (
                  <div key={cluster} className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700 truncate flex-1">{cluster}</span>
                    <div className="flex gap-1 flex-shrink-0 ml-2">
                      {CENTRE_TYPES.filter(({ key, label }) =>
                        data.types.has(label)
                      ).map(({ key, color }) => (
                        <span
                          key={key}
                          className="w-2 h-2 rounded-full"
                          style={{ background: color }}
                        />
                      ))}
                      <span className="text-xs font-bold text-slate-400 ml-1">{data.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Legend</p>
              <div className="flex gap-3 flex-wrap">
                {CENTRE_TYPES.map(({ key, label, color }) => (
                  <div key={key} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="text-xs text-slate-500">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
    </SurfaceProvider>
  );
}
