"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import LayerPanel from "./LayerPanel";
import SearchBox from "./SearchBox";
import StatsPanel from "./StatsPanel";
import SettlementSidebar from "./SettlementSidebar";
import ZoneClusterSidebar from "./ZoneClusterSidebar";
import { LAYERS, type LayerKey, type MapCity } from "@/lib/layers";
import { useGeoData } from "@/lib/useGeoData";
import { centroidOf } from "@/lib/useGeoData";
import { type MapFilter, computeMapFilter } from "@/lib/mapFilter";

import CentreSidebar from "./CentreSidebar";
import type { SettlementFeature, CentreFeature, CustomPolygonFeature } from "./MapView";

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
  clusters: Record<string, { zone: string; display?: string; settlements: string[] }>;
}

async function loadCounts(): Promise<Partial<Record<LayerKey, number>>> {
  const counts: Partial<Record<LayerKey, number>> = {};
  await Promise.all(
    LAYERS.filter((l) => l.file).map(async (l) => {
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

const CITY_CENTERS: Record<MapCity, { latlng: [number, number]; zoom: number }> = {
  bangalore: { latlng: [12.9716, 77.5946], zoom: 11 },
  chennai:   { latlng: [13.0827, 80.2707], zoom: 12 },
};

export default function MapDashboard() {
  const [activeCity, setActiveCity] = useState<MapCity>("bangalore");
  const [visibleLayers, setVisibleLayers] = useState<Set<LayerKey>>(
    new Set(LAYERS.filter(l => l.city === "bangalore" && l.key !== "schools").map((l) => l.key))
  );
  const [featureCounts, setFeatureCounts] = useState<Partial<Record<LayerKey, number>>>({});
  const [customFeatures, setCustomFeatures] = useState<CustomFeature[]>([]);
  const [customPolygons, setCustomPolygons] = useState<CustomPolygonFeature[]>([]);
  const [dbPartners, setDbPartners] = useState<{ key: string; label: string; color: string }[]>([]);
  const [geoDb, setGeoDb] = useState<{ zones: { id: string; name: string }[]; clusters: { id: string; name: string }[] }>({ zones: [], clusters: [] });
  // Sidebar closed by default; opens on desktop via useEffect
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeZone, setActiveZone] = useState<string | null>(null);
  const [activeCluster, setActiveCluster] = useState<string | null>(null);
  const [zoneClusterIndex, setZoneClusterIndex] = useState<ZoneClusterIndex>({ zones: {}, clusters: {} });
  const [tab, setTab] = useState<"layers" | "zones" | "clusters">("layers");
  const [statsOpen, setStatsOpen] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<SettlementFeature | null>(null);
  const [selectedCentre, setSelectedCentre] = useState<CentreFeature | null>(null);
  const [mapFilter, setMapFilter] = useState<MapFilter | null>(null);
  const [progressMode, setProgressMode] = useState(false);
  const [progressHealth, setProgressHealth] = useState<{
    settlements: Record<string, string>;
    clusters: Record<string, string>;
    zones: Record<string, string>;
  } | null>(null);
  const [schoolMaxKm, setSchoolMaxKm] = useState(4);
  const [schoolTypes, setSchoolTypes] = useState<Set<string>>(new Set(["Government", "BBMP", "Karnataka Public School"]));
  const [schoolFeatures, setSchoolFeatures] = useState<{ type: string; features: unknown[] }>({ type: "FeatureCollection", features: [] });

  const flyToRef = useRef<((latlng: [number, number], zoom?: number) => void) | null>(null);
  const openPopupRef = useRef<((layerKey: LayerKey, featureIdx: number) => void) | null>(null);
  const flyToCityRef = useRef<((city: MapCity) => void) | null>(null);

  const geoData = useGeoData();

  const searchParams = useSearchParams();
  const settlementParam = searchParams.get("settlement");

  // Ref so the deep-link effect can call handleSettlementClick without it
  // needing to be in the dependency array (handleSettlementClick depends on geoData
  // which is already listed, avoiding an extra render cycle).
  const handleSettlementClickRef = useRef<((f: SettlementFeature) => void) | null>(null);

  // Deep-link: when geoData loads and a settlement name param exists, select it
  useEffect(() => {
    if (!geoData || !settlementParam) return;
    const nameLower = settlementParam.toLowerCase();
    for (const [k, features] of Object.entries(geoData.settlements)) {
      if (!features) continue;
      for (const f of features) {
        if ((f.properties.name ?? "").toLowerCase() === nameLower) {
          const layerKey = k as LayerKey;
          const l = LAYERS.find((layer) => layer.key === layerKey);
          const layerColor = l?.color ?? "#6366f1";
          const layerLabel = l?.label ?? "";
          const centroid = centroidOf(f);
          handleSettlementClickRef.current?.({
            name: f.properties.name as string,
            layerKey,
            layerColor,
            layerLabel,
            zone: (f.properties.zone as string) ?? "",
            cluster: (f.properties.cluster as string) ?? "",
            description: (f.properties.description as string) ?? "",
            centroid,
          });
          flyToRef.current?.(centroid, 15);
          return;
        }
      }
    }
  }, [geoData, settlementParam]);

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
    fetch("/api/geo")
      .then(r => r.json())
      .then(d => setGeoDb({ zones: d.zones ?? [], clusters: d.clusters ?? [] }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/map/schools?maxKm=${schoolMaxKm}`)
      .then(r => r.json())
      .then(data => {
        setSchoolFeatures(data);
        setFeatureCounts(prev => ({ ...prev, schools: data.features?.length ?? 0 }));
      })
      .catch(() => {});
  }, [schoolMaxKm]);

  async function toggleProgress() {
    const next = !progressMode;
    setProgressMode(next);
    if (next && !progressHealth) {
      try {
        const r = await fetch("/api/map/progress-health");
        if (r.ok) setProgressHealth(await r.json());
      } catch {}
    }
    if (!next) setProgressHealth(null);
  }

  async function fetchCustomFeatures() {
    try {
      const r = await fetch("/api/map/features");
      if (r.ok) setCustomFeatures(await r.json());
    } catch {}
    try {
      const r = await fetch("/api/map/polygons");
      if (r.ok) {
        const fc = await r.json();
        setCustomPolygons(fc.features ?? []);
      }
    } catch {}
    try {
      const r = await fetch("/api/map/partners");
      if (r.ok) setDbPartners(await r.json());
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
    if (zone) {
      setTab("zones"); setSelectedSettlement(null); setSelectedCentre(null); setStatsOpen(false);
      setMapFilter(geoData ? computeMapFilter("zone", geoData, { zone }) : null);
    } else {
      setMapFilter(null);
    }
  }, [geoData]);

  const handleClusterSelect = useCallback((cluster: string | null) => {
    setActiveCluster(cluster);
    setActiveZone(null);
    if (cluster) {
      setTab("clusters"); setSelectedSettlement(null); setSelectedCentre(null); setStatsOpen(false);
      setMapFilter(geoData ? computeMapFilter("cluster", geoData, { cluster }) : null);
    } else {
      setMapFilter(null);
    }
  }, [geoData]);

  const handleSettlementClick = useCallback((f: SettlementFeature) => {
    setSelectedSettlement(f);
    setSelectedCentre(null);
    setStatsOpen(false);
    setActiveZone(null);
    setActiveCluster(null);
    setMapFilter(geoData ? computeMapFilter("settlement", geoData, { settlementName: f.name }) : null);
  }, [geoData]);

  // Keep ref in sync so the deep-link effect (which runs on geoData load) can
  // call the latest version of handleSettlementClick without extra re-runs.
  useEffect(() => { handleSettlementClickRef.current = handleSettlementClick; }, [handleSettlementClick]);

  const handlePartnerFilter = useCallback((key: LayerKey | null) => {
    if (key) {
      setActiveZone(null);
      setActiveCluster(null);
      setMapFilter(geoData ? computeMapFilter("partner", geoData, { partnerKey: key }) : null);
    } else {
      setMapFilter(null);
    }
  }, [geoData]);

  const handleCentreClick = useCallback((centrePartner: string, centreZone: string, centreCluster: string, centreFeature?: CentreFeature) => {
    setSelectedSettlement(null);
    setStatsOpen(false);
    setActiveZone(null);
    setActiveCluster(null);
    if (centreFeature) {
      setSelectedCentre(centreFeature);
    }
    setMapFilter(geoData ? computeMapFilter("centre", geoData, { centrePartner, centreZone, centreCluster }) : null);
  }, [geoData]);

  const handleClearFilter = useCallback(() => {
    setMapFilter(null);
    setActiveZone(null);
    setActiveCluster(null);
  }, []);

  const switchCity = useCallback((city: MapCity) => {
    setActiveCity(city);
    setActiveZone(null);
    setActiveCluster(null);
    setSelectedSettlement(null);
    setMapFilter(null);
    // Show only layers for this city (schools off by default)
    setVisibleLayers(new Set(LAYERS.filter(l => l.city === city && l.key !== "schools").map(l => l.key)));
    flyToCityRef.current?.(city);
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
          mapFilter={mapFilter}
          onPartnerFilter={handlePartnerFilter}
          onClearFilter={handleClearFilter}
          activeCity={activeCity}
          onCityChange={switchCity}
          schoolMaxKm={schoolMaxKm}
          onSchoolMaxKmChange={setSchoolMaxKm}
          schoolTypes={schoolTypes}
          onSchoolTypesChange={setSchoolTypes}
          schoolCount={(schoolFeatures.features ?? []).length}
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

        {/* Progress mode toggle — desktop only */}
        <button
          onClick={toggleProgress}
          className={`hidden sm:flex absolute top-3 right-28 z-10 border shadow rounded-lg px-3 h-8 items-center gap-1.5 text-xs font-semibold transition-colors ${
            progressMode
              ? "bg-emerald-600 text-white border-emerald-600"
              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
          }`}
          title="Colour polygons by goal health"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="3" />
            <path strokeLinecap="round" d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
          Progress
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
          customPolygons={customPolygons}
          activeZone={activeZone}
          activeCluster={activeCluster}
          onSettlementClick={handleSettlementClick}
          onZoneSelect={handleZoneSelect}
          onClusterSelect={handleClusterSelect}
          onCentreClick={handleCentreClick}
          flyToRef={flyToRef}
          flyToCityRef={flyToCityRef}
          openPopupRef={openPopupRef}
          mapFilter={mapFilter}
          dbPartners={dbPartners}
          progressMode={progressMode}
          progressHealth={progressHealth}
          activeCity={activeCity}
          schoolFeatures={schoolFeatures}
          schoolTypes={schoolTypes}
        />

        {/* Settlement detail sidebar */}
        <SettlementSidebar
          feature={selectedSettlement}
          geoData={geoData}
          onClose={() => setSelectedSettlement(null)}
        />

        {/* Centre detail sidebar (children centre / youth centre / creche) */}
        <CentreSidebar
          feature={!selectedSettlement ? selectedCentre : null}
          onClose={() => setSelectedCentre(null)}
        />

        {/* Zone / Cluster sidebar — shown when a boundary is active and no settlement is selected */}
        <ZoneClusterSidebar
          type={!selectedSettlement ? (activeCluster ? "cluster" : activeZone ? "zone" : null) : null}
          name={!selectedSettlement ? (activeCluster ?? activeZone) : null}
          parentZone={activeCluster ? zoneClusterIndex.clusters[activeCluster]?.zone : undefined}
          dbId={
            activeCluster
              ? (geoDb.clusters.find(c => c.name === activeCluster)?.id ?? null)
              : activeZone
              ? (geoDb.zones.find(z => z.name === activeZone)?.id ?? null)
              : null
          }
          geoData={geoData}
          clusterIndex={zoneClusterIndex.clusters}
          zoneIndex={zoneClusterIndex.zones}
          onClose={() => { setActiveZone(null); setActiveCluster(null); setMapFilter(null); }}
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
            onClick={toggleProgress}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold transition-colors active:bg-slate-50 border-r border-slate-100 ${
              progressMode ? "text-emerald-600" : "text-slate-700"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="3" />
              <path strokeLinecap="round" d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
            Progress
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
