"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import LayerPanel from "./LayerPanel";
import SearchBox from "./SearchBox";
import StatsPanel from "./StatsPanel";
import SettlementSidebar from "./SettlementSidebar";
import ZoneClusterSidebar from "./ZoneClusterSidebar";
import { LAYERS, type LayerKey } from "@/lib/layers";
import { useGeoData } from "@/lib/useGeoData";
import type { SettlementFeature } from "./MapView";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

interface CustomFeature {
  id: string;
  name: string;
  description: string;
  type: string;
  lat: number;
  lng: number;
  createdAt: string;
}

interface ZoneClusterIndex {
  zones: Record<string, string[]>;
  clusters: Record<string, { zone: string; settlements: string[] }>;
}

async function loadCounts(): Promise<Partial<Record<LayerKey, number>>> {
  const counts: Partial<Record<LayerKey, number>> = {};
  await Promise.all(
    LAYERS.map(async (l) => {
      try {
        const r = await fetch(l.file);
        const data = await r.json();
        counts[l.key] = data.features?.length ?? 0;
      } catch {
        counts[l.key] = 0;
      }
    })
  );
  return counts;
}

export default function MapDashboard() {
  const [visibleLayers, setVisibleLayers] = useState<Set<LayerKey>>(
    new Set(LAYERS.map((l) => l.key))
  );
  const [featureCounts, setFeatureCounts] = useState<Partial<Record<LayerKey, number>>>({});
  const [customFeatures, setCustomFeatures] = useState<CustomFeature[]>([]);
  // Sidebar closed by default; opens on desktop via useEffect
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeZone, setActiveZone] = useState<string | null>(null);
  const [activeCluster, setActiveCluster] = useState<string | null>(null);
  const [zoneClusterIndex, setZoneClusterIndex] = useState<ZoneClusterIndex>({ zones: {}, clusters: {} });
  const [tab, setTab] = useState<"layers" | "zones" | "clusters">("layers");
  const [statsOpen, setStatsOpen] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<SettlementFeature | null>(null);

  const flyToRef = useRef<((latlng: [number, number], zoom?: number) => void) | null>(null);
  const openPopupRef = useRef<((layerKey: LayerKey, featureIdx: number) => void) | null>(null);

  const geoData = useGeoData();

  // Open sidebar on desktop by default
  useEffect(() => {
    if (window.innerWidth >= 640) setSidebarOpen(true);
  }, []);

  useEffect(() => {
    loadCounts().then(setFeatureCounts);
    fetchCustomFeatures();
    fetch("/data/zone_cluster_index.json")
      .then((r) => r.json())
      .then(setZoneClusterIndex)
      .catch(() => {});
  }, []);

  async function fetchCustomFeatures() {
    try {
      const r = await fetch("/api/map/features");
      if (r.ok) setCustomFeatures(await r.json());
    } catch {}
  }

  const toggleLayer = useCallback((key: LayerKey) => {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleZoneSelect = useCallback((zone: string | null) => {
    setActiveZone(zone);
    setActiveCluster(null);
    if (zone) { setTab("zones"); setSelectedSettlement(null); setStatsOpen(false); }
  }, []);

  const handleClusterSelect = useCallback((cluster: string | null) => {
    setActiveCluster(cluster);
    setActiveZone(null);
    if (cluster) { setTab("clusters"); setSelectedSettlement(null); setStatsOpen(false); }
  }, []);

  const handleSettlementClick = useCallback((f: SettlementFeature) => {
    setSelectedSettlement(f);
    setStatsOpen(false);
  }, []);

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-100">

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="sm:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left sidebar
          Mobile: fixed overlay that slides in from left
          Desktop: flex item that pushes the map */}
      <aside
        className={[
          "bg-white border-r border-slate-200 transition-all duration-300 overflow-hidden",
          // Mobile: fixed overlay
          "fixed inset-y-0 left-0 z-40 w-72 shadow-2xl",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: relative flex item, no transform
          "sm:relative sm:flex-shrink-0 sm:shadow-sm sm:z-0 sm:translate-x-0",
          sidebarOpen ? "sm:w-56" : "sm:w-0",
        ].join(" ")}
      >
        <LayerPanel
          visibleLayers={visibleLayers}
          onToggle={toggleLayer}
          featureCounts={featureCounts}
          customCount={customFeatures.length}
          activeZone={activeZone}
          activeCluster={activeCluster}
          onZoneSelect={handleZoneSelect}
          onClusterSelect={handleClusterSelect}
          zoneIndex={zoneClusterIndex.zones}
          clusterIndex={zoneClusterIndex.clusters}
          tab={tab}
          onTabChange={setTab}
        />
      </aside>

      {/* Map area */}
      <div className="flex-1 relative overflow-hidden">

        {/* Sidebar toggle — desktop only */}
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="hidden sm:flex absolute top-3 left-3 z-10 bg-white border border-slate-200 shadow rounded-lg w-8 h-8 items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors"
          title={sidebarOpen ? "Hide panel" : "Show panel"}
        >
          {sidebarOpen ? "◀" : "▶"}
        </button>

        {/* Stats toggle — desktop only; mobile uses the bottom control bar */}
        <button
          onClick={() => { setStatsOpen((o) => !o); setSelectedSettlement(null); }}
          className={`hidden sm:flex absolute top-3 right-3 z-10 border shadow rounded-lg px-3 h-8 items-center gap-1.5 text-xs font-semibold transition-colors ${
            statsOpen
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Stats
        </button>

        {/* Search — full-width on mobile, centred fixed-width on desktop */}
        <SearchBox geoData={geoData} flyToRef={flyToRef} openPopupRef={openPopupRef} />

        {/* Map */}
        <MapView
          visibleLayers={visibleLayers}
          onFeatureAdded={fetchCustomFeatures}
          customFeatures={customFeatures}
          activeZone={activeZone}
          activeCluster={activeCluster}
          onSettlementClick={handleSettlementClick}
          onZoneSelect={handleZoneSelect}
          onClusterSelect={handleClusterSelect}
          flyToRef={flyToRef}
          openPopupRef={openPopupRef}
        />

        {/* Settlement detail sidebar */}
        <SettlementSidebar
          feature={selectedSettlement}
          geoData={geoData}
          onClose={() => setSelectedSettlement(null)}
        />

        {/* Zone / Cluster sidebar — shown when a boundary is active and no settlement is selected */}
        <ZoneClusterSidebar
          type={!selectedSettlement ? (activeCluster ? "cluster" : activeZone ? "zone" : null) : null}
          name={!selectedSettlement ? (activeCluster ?? activeZone) : null}
          parentZone={activeCluster ? zoneClusterIndex.clusters[activeCluster]?.zone : undefined}
          geoData={geoData}
          clusterIndex={zoneClusterIndex.clusters}
          zoneIndex={zoneClusterIndex.zones}
          onClose={() => { setActiveZone(null); setActiveCluster(null); }}
        />

        {/* Stats panel */}
        <StatsPanel
          geoData={geoData}
          isOpen={statsOpen}
          onClose={() => setStatsOpen(false)}
        />

        {/* ── Mobile bottom control bar ────────────────────────────────
            Sits just above the app's bottom nav (bottom-16 = 64px).
            Contains the controls that are in the top bar on desktop. */}
        <div className="sm:hidden absolute bottom-16 left-0 right-0 z-10 flex items-stretch gap-0 bg-white/95 border-t border-slate-200 shadow-lg">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold text-slate-700 border-r border-slate-100 active:bg-slate-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Layers
          </button>
          <button
            onClick={() => { setStatsOpen((o) => !o); setSelectedSettlement(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold transition-colors active:bg-slate-50 ${
              statsOpen ? "text-indigo-600" : "text-slate-700"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Stats
          </button>
        </div>
      </div>
    </div>
  );
}
