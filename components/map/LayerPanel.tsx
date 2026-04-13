"use client";

import { LAYERS, type LayerKey } from "@/lib/layers";

interface LayerPanelProps {
  visibleLayers: Set<LayerKey>;
  onToggle: (key: LayerKey) => void;
  featureCounts: Partial<Record<LayerKey, number>>;
  customCount: number;
  activeZone: string | null;
  activeCluster: string | null;
  onZoneSelect: (zone: string | null) => void;
  onClusterSelect: (cluster: string | null) => void;
  zoneIndex: Record<string, string[]>;
  clusterIndex: Record<string, { zone: string; settlements: string[] }>;
  tab: "layers" | "zones" | "clusters";
  onTabChange: (t: "layers" | "zones" | "clusters") => void;
  selectedPartner: LayerKey | null;
  onPartnerFilter: (key: LayerKey | null) => void;
  partnerZones: Set<string> | null;
  partnerClusters: Set<string> | null;
}

const ZONE_COLORS: Record<string, string> = {
  North: "#6366f1",
  South: "#10b981",
  Central: "#f59e0b",
  West: "#ef4444",
};

const CLUSTER_ZONE_COLORS: Record<string, string> = {
  North: "#e0e7ff",
  South: "#d1fae5",
  Central: "#fef3c7",
  West: "#fee2e2",
};

const CLUSTER_ZONE_TEXT: Record<string, string> = {
  North: "#4338ca",
  South: "#065f46",
  Central: "#92400e",
  West: "#991b1b",
};

export default function LayerPanel({
  visibleLayers,
  onToggle,
  featureCounts,
  customCount,
  activeZone,
  activeCluster,
  onZoneSelect,
  onClusterSelect,
  zoneIndex,
  clusterIndex,
  tab,
  onTabChange,
  selectedPartner,
  onPartnerFilter,
  partnerZones,
  partnerClusters,
}: LayerPanelProps) {
  const polygonLayers = LAYERS.filter((l) => l.type === "polygon");
  const pointLayers = LAYERS.filter((l) => l.type === "point");

  const totalSettlements = polygonLayers.reduce(
    (sum, l) => sum + (featureCounts[l.key] ?? 0),
    0
  );
  const totalCentres =
    (featureCounts["children_centres"] ?? 0) +
    (featureCounts["youth_centres"] ?? 0) +
    (featureCounts["creches"] ?? 0) +
    (featureCounts["resource_centres"] ?? 0);

  // Group clusters by zone for display
  const clustersByZone: Record<string, string[]> = {};
  Object.entries(clusterIndex).forEach(([cluster, data]) => {
    const zone = data.zone;
    if (!clustersByZone[zone]) clustersByZone[zone] = [];
    clustersByZone[zone].push(cluster);
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
            <span className="text-white text-xs font-bold">J</span>
          </div>
          <span className="font-bold text-slate-800 text-sm">Janadhikara</span>
        </div>
        <p className="text-xs text-slate-400 pl-8">Bangalore Programme Map</p>
      </div>

      {/* Stats */}
      <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-100 grid grid-cols-2 gap-2 flex-shrink-0">
        <div className="text-center">
          <div className="text-base font-bold text-indigo-700">{totalSettlements}</div>
          <div className="text-xs text-indigo-400">Settlements</div>
        </div>
        <div className="text-center">
          <div className="text-base font-bold text-indigo-700">{totalCentres}</div>
          <div className="text-xs text-indigo-400">All Centres</div>
        </div>
      </div>
      {/* Centre breakdown */}
      <div className="px-3 py-2 border-b border-slate-100 grid grid-cols-3 gap-1 flex-shrink-0">
        <div className="text-center">
          <div className="text-sm font-bold text-orange-500">{featureCounts["children_centres"] ?? 0}</div>
          <div className="text-xs text-slate-400 leading-tight">Children</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-purple-500">{featureCounts["youth_centres"] ?? 0}</div>
          <div className="text-xs text-slate-400 leading-tight">Youth</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-pink-500">{featureCounts["creches"] ?? 0}</div>
          <div className="text-xs text-slate-400 leading-tight">Creches</div>
        </div>
      </div>

      {/* Partner filter banner */}
      {selectedPartner && (
        <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-200 flex items-center justify-between flex-shrink-0">
          <div className="text-xs font-semibold text-indigo-800">
            Filtered: {LAYERS.find(l => l.key === selectedPartner)?.label}
          </div>
          <button
            onClick={() => onPartnerFilter(null)}
            className="text-xs text-indigo-600 hover:text-indigo-900 font-bold"
          >
            ✕ Clear
          </button>
        </div>
      )}

      {/* Active zone/cluster banner */}
      {(activeZone || activeCluster) && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between flex-shrink-0">
          <div className="text-xs font-semibold text-amber-800">
            {activeCluster
              ? `Cluster: ${activeCluster.replace(/_/g, " ")}`
              : `Zone: ${activeZone}`}
          </div>
          <button
            onClick={() => {
              onZoneSelect(null);
              onClusterSelect(null);
            }}
            className="text-xs text-amber-600 hover:text-amber-900 font-bold"
          >
            ✕ Clear
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-100 flex-shrink-0">
        {(["layers", "zones", "clusters"] as const).map((t) => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            className={`flex-1 text-xs font-semibold py-2 capitalize transition-colors ${
              tab === t
                ? "text-indigo-600 border-b-2 border-indigo-500"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* --- LAYERS TAB --- */}
        {tab === "layers" && (
          <div className="px-3 py-3 space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                Partners
              </p>
              <div className="space-y-0.5">
                {polygonLayers.map((layer) => {
                  const active = visibleLayers.has(layer.key);
                  const isFiltered = selectedPartner === layer.key;
                  const dimmed = selectedPartner && !isFiltered;
                  return (
                    <div key={layer.key} className="flex items-center gap-1">
                      {/* Partner name — click to cross-filter */}
                      <button
                        onClick={() => onPartnerFilter(isFiltered ? null : layer.key)}
                        title={isFiltered ? "Clear partner filter" : `Filter all layers to ${layer.label}`}
                        className={`flex-1 flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                          isFiltered
                            ? "bg-indigo-50 ring-1 ring-indigo-400 text-indigo-900"
                            : dimmed
                            ? "opacity-40 hover:opacity-70 text-slate-600 hover:bg-slate-50"
                            : active ? "bg-slate-100 text-slate-800" : "text-slate-400 hover:bg-slate-50"
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                          style={{ background: layer.color, opacity: active ? 1 : 0.3 }}
                        />
                        <span className="flex-1 text-xs font-medium">{layer.label}</span>
                        {isFiltered && <span className="text-[10px] text-indigo-500 font-bold">✦</span>}
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${active ? "bg-slate-200 text-slate-600" : "bg-slate-100 text-slate-300"}`}>
                          {featureCounts[layer.key] ?? 0}
                        </span>
                      </button>
                      {/* Eye toggle — separate from filter */}
                      <button
                        onClick={() => onToggle(layer.key)}
                        title={active ? "Hide layer" : "Show layer"}
                        className="p-1 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                      >
                        {active ? (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                Points
              </p>
              <div className="space-y-0.5">
                {pointLayers.map((layer) => {
                  const active = visibleLayers.has(layer.key);
                  return (
                    <button
                      key={layer.key}
                      onClick={() => onToggle(layer.key)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                        active ? "bg-slate-100 text-slate-800" : "text-slate-400 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: layer.color, opacity: active ? 1 : 0.3 }}
                      />
                      <span className="flex-1 text-xs font-medium">{layer.label}</span>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${active ? "bg-slate-200 text-slate-600" : "bg-slate-100 text-slate-300"}`}>
                        {featureCounts[layer.key] ?? 0}
                      </span>
                    </button>
                  );
                })}
                {customCount > 0 && (
                  <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-amber-50">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />
                    <span className="flex-1 text-xs font-medium text-amber-700">Custom Added</span>
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-700">
                      {customCount}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Show/Hide all */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => LAYERS.forEach((l) => !visibleLayers.has(l.key) && onToggle(l.key))}
                className="flex-1 text-xs font-semibold text-indigo-600 py-1.5 border border-indigo-200 rounded-lg hover:bg-indigo-50"
              >
                Show All
              </button>
              <button
                onClick={() => LAYERS.forEach((l) => visibleLayers.has(l.key) && onToggle(l.key))}
                className="flex-1 text-xs font-semibold text-slate-500 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Hide All
              </button>
            </div>
          </div>
        )}

        {/* --- ZONES TAB --- */}
        {tab === "zones" && (
          <div className="px-3 py-3">
            <p className="text-xs text-slate-400 mb-3">
              {partnerZones ? `Showing zones for ${LAYERS.find(l => l.key === selectedPartner)?.label}.` : "Click a zone to highlight its settlements on the map."}
            </p>
            <div className="space-y-2">
              {Object.entries(zoneIndex).sort()
                .filter(([zone]) => !partnerZones || partnerZones.has(zone))
                .map(([zone, settlements]) => {
                const isActive = activeZone === zone && !activeCluster;
                const color = ZONE_COLORS[zone] ?? "#64748b";
                return (
                  <button
                    key={zone}
                    onClick={() => {
                      onClusterSelect(null);
                      onZoneSelect(isActive ? null : zone);
                    }}
                    className={`w-full text-left rounded-xl p-3 border-2 transition-all ${
                      isActive
                        ? "border-current shadow-md"
                        : "border-transparent hover:border-slate-200"
                    }`}
                    style={{
                      background: isActive ? color + "18" : "#f8fafc",
                      borderColor: isActive ? color : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ background: color }}
                        />
                        <span
                          className="text-sm font-bold"
                          style={{ color: isActive ? color : "#1e293b" }}
                        >
                          {zone}
                        </span>
                      </div>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: isActive ? color + "30" : "#e2e8f0",
                          color: isActive ? color : "#64748b",
                        }}
                      >
                        {settlements.length}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* --- CLUSTERS TAB --- */}
        {tab === "clusters" && (
          <div className="px-3 py-3">
            <p className="text-xs text-slate-400 mb-3">
              {partnerClusters ? `Showing clusters for ${LAYERS.find(l => l.key === selectedPartner)?.label}.` : "Click a cluster to focus on it."}
            </p>
            {Object.entries(clustersByZone)
              .sort(([a], [b]) => a.localeCompare(b))
              .filter(([zone]) => !partnerZones || partnerZones.has(zone))
              .map(([zone, clusters]) => (
                <div key={zone} className="mb-4">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: ZONE_COLORS[zone] ?? "#64748b" }}
                    />
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      {zone} Zone
                    </p>
                  </div>
                  <div className="space-y-1">
                    {clusters.sort()
                      .filter(c => !partnerClusters || partnerClusters.has(c))
                      .map((cluster) => {
                      const data = clusterIndex[cluster];
                      const isActive = activeCluster === cluster;
                      const bgColor = CLUSTER_ZONE_COLORS[zone] ?? "#f1f5f9";
                      const textColor = CLUSTER_ZONE_TEXT[zone] ?? "#334155";
                      return (
                        <button
                          key={cluster}
                          onClick={() => {
                            onZoneSelect(null);
                            onClusterSelect(isActive ? null : cluster);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors ${
                            isActive ? "shadow-sm" : "hover:bg-slate-50"
                          }`}
                          style={
                            isActive
                              ? { background: bgColor, color: textColor }
                              : {}
                          }
                        >
                          <span
                            className={`text-xs font-semibold ${isActive ? "" : "text-slate-700"}`}
                          >
                            {cluster.replace(/_/g, " ")}
                          </span>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                              isActive ? "" : "bg-slate-100 text-slate-500"
                            }`}
                            style={isActive ? { background: bgColor, color: textColor } : {}}
                          >
                            {data?.settlements?.length ?? 0}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
