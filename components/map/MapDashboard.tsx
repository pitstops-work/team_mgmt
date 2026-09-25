"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import LayerPanel from "./LayerPanel";
import SearchBox from "./SearchBox";
import SettlementSidebar from "./SettlementSidebar";
import ZoneClusterSidebar from "./ZoneClusterSidebar";
import { LAYERS, type LayerKey, type MapCity } from "@/lib/layers";
import { useGeoData } from "@/lib/useGeoData";
import { centroidOf } from "@/lib/useGeoData";
import { type MapFilter, computeMapFilter } from "@/lib/mapFilter";
import {
  EMPTY_QUERY, type ClusterQuery, type ClusterFacet, type ClusterRow, type ColorBy,
  clusterMatches, hasHealthWork, isQueryActive, normName,
} from "@/lib/clusterQuery";

import CentreSidebar from "./CentreSidebar";
import type { SettlementFeature, CentreFeature } from "./MapView";
import ProgressToolbar, { type ProgressPeriod, type ProgressMode, type ProgressLevel } from "./ProgressToolbar";
import NeedsToolbar, { type NeedsMetric, type NeedsLevel, type NeedsHeatmapData } from "./NeedsToolbar";

type FeatureCollection = { type: string; features: unknown[] };
const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };
// Point layers that start hidden: external facilities are shown on demand.
const HIDDEN_BY_DEFAULT = new Set<LayerKey>(["schools", "canteens", "bbmp_schools", "health_centres"]);
const defaultLayers = (city: MapCity) =>
  new Set(LAYERS.filter((l) => l.city === city && !HIDDEN_BY_DEFAULT.has(l.key)).map((l) => l.key));

/** Keep only facility points that sit within `km` of a settlement in one of `clusters`. */
function nearClusters(fc: FeatureCollection, clusters: Set<string> | null, km = Infinity): FeatureCollection {
  if (!clusters) return fc;
  return {
    ...fc,
    features: fc.features.filter((f) => {
      const near = ((f as { properties?: { settlements?: { cluster: string; distanceKm: number }[] } }).properties?.settlements ?? []);
      return near.some((s) => s.distanceKm <= km && clusters.has(normName(s.cluster)));
    }),
  };
}

const MapAdminPanel = dynamic(() => import("./MapAdminPanel"), { ssr: false });

const MapView = dynamic(() => import("./MapView"), { ssr: false });

interface ZoneClusterIndex {
  zones: Record<string, string[]>;
  clusters: Record<string, { zone: string; display?: string; settlements: string[] }>;
}

export interface FacilityLayer {
  id: string;
  layerKey: string;
  label: string;
  color: string;
  needsDomain: string | null;
  sortOrder: number;
}

async function loadCounts(facilityLayers: FacilityLayer[] = []): Promise<Partial<Record<LayerKey, number>>> {
  const counts: Partial<Record<LayerKey, number>> = {};
  const staticLayers = LAYERS.filter((l) => l.file).map(l => ({ key: l.key, file: l.file }));
  const dynamicLayers = facilityLayers.map(fl => ({
    key: fl.layerKey,
    file: `/api/map/geojson/layer-features?layerKey=${fl.layerKey}`,
  }));
  await Promise.all(
    [...staticLayers, ...dynamicLayers].map(async (l) => {
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

type UserOption = { id: string; name: string | null; image: string | null; designation?: string; reportsToId?: string | null };
export default function MapDashboard({ currentUserId, currentUserDesignation, currentUserRole, allUsers = [] }: { currentUserId?: string; currentUserDesignation?: string; currentUserRole?: string; allUsers?: UserOption[] }) {
  const [activeCity, setActiveCity] = useState<MapCity>("bangalore");
  const [visibleLayers, setVisibleLayers] = useState<Set<LayerKey>>(() => defaultLayers("bangalore"));
  const [featureCounts, setFeatureCounts] = useState<Partial<Record<LayerKey, number>>>({});
  const [geoDb, setGeoDb] = useState<{
    zones: { id: string; name: string }[];
    clusters: { id: string; name: string; settlementCount?: number }[];
  }>({ zones: [], clusters: [] });
  // Sidebar closed by default; opens on desktop via useEffect
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<"clusters" | "map">("clusters");
  const [zoneClusterIndex, setZoneClusterIndex] = useState<ZoneClusterIndex>({ zones: {}, clusters: {} });

  // ── The cluster query: every filter in the panel narrows this one list ──
  const [query, setQuery] = useState<ClusterQuery>(EMPTY_QUERY);
  const [facets, setFacets] = useState<ClusterFacet[] | null>(null);
  const [mineClusters, setMineClusters] = useState<Set<string> | null>(null);

  // ── Map click selection — temporarily overrides the query on the map ──
  const [activeZone, setActiveZone] = useState<string | null>(null);
  const [activeCluster, setActiveCluster] = useState<string | null>(null);
  const [selectedSettlement, setSelectedSettlement] = useState<SettlementFeature | null>(null);
  const [selectedCentre, setSelectedCentre] = useState<CentreFeature | null>(null);
  const [selectionFilter, setSelectionFilter] = useState<MapFilter | null>(null);

  // ── Colour-by lens (one at a time) ──
  const [colorBy, setColorBy] = useState<ColorBy>("none");
  const [progressHealth, setProgressHealth] = useState<{
    settlements: Record<string, string>;
    clusters: Record<string, string>;
    zones: Record<string, string>;
    checklistPct?: {
      settlements: Record<string, number>;
      clusters: Record<string, number>;
      zones: Record<string, number>;
    };
    period?: string;
  } | null>(null);
  const [progressPeriod, setProgressPeriod] = useState<ProgressPeriod>("all");
  const [progressToolbarMode, setProgressToolbarMode] = useState<ProgressMode>("goals");
  const [progressLevel, setProgressLevel] = useState<ProgressLevel>("settlement");
  const [progressLoading, setProgressLoading] = useState(false);
  const [needsHeatmap, setNeedsHeatmap] = useState<NeedsHeatmapData | null>(null);
  const [needsDomain, setNeedsDomain] = useState("");
  const [needsMetric, setNeedsMetric] = useState<NeedsMetric>("demand");
  const [needsLevel, setNeedsLevel] = useState<NeedsLevel>("settlement");
  const [needsThreshold, setNeedsThreshold] = useState(0);
  const [needsLoading, setNeedsLoading] = useState(false);
  const progressMode = colorBy === "progress";
  const needsMode = colorBy === "needs";

  // ── Facility points ──
  const [schoolFeatures, setSchoolFeatures] = useState<FeatureCollection>(EMPTY_FC);
  const [bbmpSchoolFeatures, setBbmpSchoolFeatures] = useState<FeatureCollection>(EMPTY_FC);
  const [canteenFeatures, setCanteenFeatures] = useState<FeatureCollection>(EMPTY_FC);
  const [healthFeatures, setHealthFeatures] = useState<FeatureCollection>(EMPTY_FC);
  const [healthTypes, setHealthTypes] = useState<Set<string>>(new Set(["CRC", "Foundation Health Centre", "Government Health Centre", "Referral Helpdesk Hospital", "Super Speciality Hospital"]));
  const [facilityLayers, setFacilityLayers] = useState<FacilityLayer[]>([]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const flyToRef = useRef<((latlng: [number, number], zoom?: number) => void) | null>(null);
  const openPopupRef = useRef<((layerKey: LayerKey, featureIdx: number) => void) | null>(null);
  const flyToCityRef = useRef<((city: MapCity) => void) | null>(null);
  const sharedMapRef = useRef<import("maplibre-gl").Map | null>(null);

  const geoData = useGeoData();

  const searchParams = useSearchParams();
  const settlementParam = searchParams.get("settlement");
  const clusterParam = searchParams.get("cluster");

  // Ref so the deep-link effect can call handleSettlementClick without it
  // needing to be in the dependency array (handleSettlementClick depends on geoData
  // which is already listed, avoiding an extra render cycle).
  const handleSettlementClickRef = useRef<((f: SettlementFeature) => void) | null>(null);
  const handleClusterSelectRef = useRef<((cluster: string | null) => void) | null>(null);
  const clusterDeepLinkAppliedRef = useRef(false);

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
    fetch("/api/admin/facility-layers")
      .then(r => r.json())
      .then((layers: FacilityLayer[]) => {
        setFacilityLayers(layers);
        // Programme centres are shown by default (bangalore only)
        setVisibleLayers(prev => {
          const next = new Set(prev);
          layers.forEach(fl => next.add(fl.layerKey));
          return next;
        });
        loadCounts(layers).then(setFeatureCounts);
      })
      .catch(() => loadCounts().then(setFeatureCounts));

    fetch("/data/zone_cluster_index.json")
      .then((r) => r.json())
      .then(setZoneClusterIndex)
      .catch(() => {});
    fetch("/api/geo")
      .then(r => r.json())
      .then(d => setGeoDb({ zones: d.zones ?? [], clusters: d.clusters ?? [] }))
      .catch(() => {});
    fetch("/api/map/health-centres")
      .then(r => r.json())
      .then(setHealthFeatures)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setFacets(null);
    fetch(`/api/map/cluster-facets?city=${activeCity}`)
      .then(r => r.json())
      .then((d: { clusters?: ClusterFacet[] }) => setFacets(d.clusters ?? []))
      .catch(() => setFacets([]));
  }, [activeCity]);

  // Schools and canteens follow the one distance slider in the panel.
  useEffect(() => {
    const km = query.km;
    fetch(`/api/map/schools?maxKm=${km}`).then(r => r.json()).then(setSchoolFeatures).catch(() => {});
    fetch(`/api/map/bbmp-schools?maxKm=${km}`).then(r => r.json()).then(setBbmpSchoolFeatures).catch(() => {});
    fetch(`/api/map/canteens?maxKm=${km}`).then(r => r.json()).then(setCanteenFeatures).catch(() => {});
  }, [query.km]);

  useEffect(() => {
    if (!query.mine || mineClusters) return;
    fetch("/api/map/my-goal-scope")
      .then(r => r.json())
      .then((d: { clusterNames?: string[] }) => setMineClusters(new Set((d.clusterNames ?? []).map(normName))))
      .catch(() => setMineClusters(new Set()));
  }, [query.mine, mineClusters]);

  // ── Derived: clusters with partners, the matches, and the map filter ──
  const cityPartnerLayers = useMemo(
    () => LAYERS.filter((l) => l.type === "polygon" && l.city === activeCity && l.file),
    [activeCity],
  );

  const rows: ClusterRow[] = useMemo(() => {
    const partnersBy = new Map<string, Set<string>>();
    if (geoData) {
      for (const l of cityPartnerLayers) {
        for (const f of geoData.settlements[l.key] ?? []) {
          const key = normName(f.properties.cluster as string);
          if (!key) continue;
          if (!partnersBy.has(key)) partnersBy.set(key, new Set());
          partnersBy.get(key)!.add(l.key);
        }
      }
    }
    return (facets ?? []).map((c) => ({ ...c, partners: Array.from(partnersBy.get(normName(c.name)) ?? []) }));
  }, [facets, geoData, cityPartnerLayers]);

  const matched = useMemo(
    () => rows.filter((c) => clusterMatches(c, query, mineClusters)),
    [rows, query, mineClusters],
  );
  const queryActive = isQueryActive(query);
  const matchedNames = useMemo(
    () => (queryActive ? new Set(matched.map((c) => normName(c.name))) : null),
    [queryActive, matched],
  );

  const queryFilter: MapFilter | null = useMemo(() => {
    if (!queryActive || facets === null || (query.mine && !mineClusters)) return null;
    return {
      source: "query",
      label: `${matched.length} of ${rows.length} clusters`,
      partnerKeys: new Set(query.partners),
      zones: new Set(matched.map((c) => c.zone)),
      clusters: new Set(matched.map((c) => c.name)),
      centrePartnerLabels: new Set(cityPartnerLayers.filter((l) => query.partners.has(l.key)).map((l) => l.label)),
      hideNonMatching: true,
      matchNothing: matched.length === 0,
    };
  }, [queryActive, facets, query, mineClusters, matched, rows.length, cityPartnerLayers]);

  // A click selection on the map wins; clearing it returns to the query.
  const mapFilter = selectionFilter ?? queryFilter;

  const healthWorkClusters = useMemo(
    () => new Set(rows.filter(hasHealthWork).map((c) => normName(c.name))),
    [rows],
  );

  const shownSchools = useMemo(() => nearClusters(schoolFeatures, matchedNames, query.km), [schoolFeatures, matchedNames, query.km]);
  const shownBbmpSchools = useMemo(
    () => (query.schoolTypes.has("bbmp_udise") ? nearClusters(bbmpSchoolFeatures, matchedNames, query.km) : EMPTY_FC),
    [bbmpSchoolFeatures, matchedNames, query.km, query.schoolTypes],
  );
  const shownCanteens = useMemo(() => nearClusters(canteenFeatures, matchedNames, query.km), [canteenFeatures, matchedNames, query.km]);
  const shownHealth = useMemo(() => nearClusters(healthFeatures, matchedNames), [healthFeatures, matchedNames]);

  const countSchools = (shownSchools.features as { properties?: { schoolType?: string } }[])
    .filter((f) => query.schoolTypes.has(f.properties?.schoolType ?? "Government")).length + shownBbmpSchools.features.length;

  // ── Query changes: turning a facility filter on also shows its points ──
  const handleQueryChange = useCallback((next: ClusterQuery) => {
    const show: LayerKey[] = [];
    if (next.schools && !query.schools) show.push("schools", "bbmp_schools");
    if (next.canteens && !query.canteens) show.push("canteens");
    if (next.health === "yes" && query.health !== "yes") show.push("health_centres");
    if (show.length) setVisibleLayers((v) => new Set([...v, ...show]));
    setQuery(next);
    // A fresh query replaces any click selection on the map.
    setSelectionFilter(null);
    setActiveZone(null);
    setActiveCluster(null);
  }, [query]);

  // ── Colour-by lenses ──
  async function fetchProgressHealth(period: ProgressPeriod) {
    setProgressLoading(true);
    try {
      const r = await fetch(`/api/map/progress-health?period=${period}`);
      if (r.ok) setProgressHealth(await r.json());
    } catch {
      // ignore
    } finally {
      setProgressLoading(false);
    }
  }

  async function fetchNeedsHeatmap(domain: string, metric: NeedsMetric, level: NeedsLevel) {
    if (!domain) return;
    setNeedsLoading(true);
    try {
      const r = await fetch(`/api/map/needs-heatmap?domain=${encodeURIComponent(domain)}&metric=${metric}&level=${level}`);
      if (r.ok) setNeedsHeatmap(await r.json());
    } catch {
      // ignore
    } finally {
      setNeedsLoading(false);
    }
  }

  async function loadNeeds() {
    // Load allDomains first, then auto-select first domain
    setNeedsLoading(true);
    try {
      const r = await fetch("/api/map/needs-heatmap");
      if (r.ok) {
        const data: NeedsHeatmapData = await r.json();
        const firstDomain = data.allDomains?.[0]?.domain ?? "";
        setNeedsHeatmap({ ...data, domain: data.allDomains?.[0] ?? null });
        if (firstDomain) {
          setNeedsDomain(firstDomain);
          setNeedsThreshold(0);
          await fetchNeedsHeatmap(firstDomain, needsMetric, needsLevel);
        }
      }
    } catch {
      // ignore
    } finally {
      setNeedsLoading(false);
    }
  }

  function changeColorBy(next: ColorBy) {
    if (next === colorBy) return;
    if (colorBy === "progress") setProgressHealth(null);
    if (colorBy === "needs") setNeedsHeatmap(null);
    setColorBy(next);
    if (next === "progress") fetchProgressHealth(progressPeriod);
    if (next === "needs") loadNeeds();
  }

  async function handleProgressPeriodChange(p: ProgressPeriod) {
    setProgressPeriod(p);
    if (progressMode) {
      await fetchProgressHealth(p);
    }
  }

  const toggleLayer = useCallback((key: LayerKey) => {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      // One "Schools" toggle covers both school sources.
      const keys: LayerKey[] = key === "schools" ? ["schools", "bbmp_schools"] : [key];
      const on = !next.has(key);
      keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
      return next;
    });
  }, []);

  const handleZoneSelect = useCallback((zoneId: string | null) => {
    setActiveZone(zoneId);
    setActiveCluster(null);
    if (zoneId) {
      const zoneName = geoDb.zones.find(z => z.id === zoneId)?.name ?? zoneId;
      setSelectedSettlement(null); setSelectedCentre(null);
      setSelectionFilter(geoData ? computeMapFilter("zone", geoData, { zone: zoneName }) : null);
    } else {
      setSelectionFilter(null);
    }
  }, [geoData, geoDb.zones]);

  const handleClusterSelect = useCallback((cluster: string | null) => {
    setActiveCluster(cluster);
    setActiveZone(null);
    if (cluster) {
      setSelectedSettlement(null); setSelectedCentre(null);
      setSelectionFilter(geoData ? computeMapFilter("cluster", geoData, { cluster }) : null);
    } else {
      setSelectionFilter(null);
    }
  }, [geoData]);

  const handleSettlementClick = useCallback((f: SettlementFeature) => {
    setSelectedSettlement(f);
    setSelectedCentre(null);
    setActiveZone(null);
    setActiveCluster(null);
    setSelectionFilter(geoData ? computeMapFilter("settlement", geoData, { settlementName: f.name }) : null);
  }, [geoData]);

  // Keep refs in sync so the deep-link effects (which run on geoData load) can
  // call the latest handlers without putting them in their dep arrays.
  useEffect(() => { handleSettlementClickRef.current = handleSettlementClick; }, [handleSettlementClick]);
  useEffect(() => { handleClusterSelectRef.current = handleClusterSelect; }, [handleClusterSelect]);

  // Deep-link: when geoData loads and a ?cluster=<name> param exists, select it.
  // Cluster fly-to fires automatically from MapView's activeCluster effect.
  useEffect(() => {
    if (!geoData || !clusterParam || clusterDeepLinkAppliedRef.current) return;
    const target = normName(clusterParam);
    let canonicalName: string | null = null;
    for (const features of Object.values(geoData.settlements)) {
      if (!features) continue;
      for (const f of features) {
        const name = String(f.properties.cluster ?? "");
        if (normName(name) === target) { canonicalName = name; break; }
      }
      if (canonicalName) break;
    }
    if (!canonicalName) return; // unknown cluster name — leave map at default
    clusterDeepLinkAppliedRef.current = true;
    handleClusterSelectRef.current?.(canonicalName);
  }, [geoData, clusterParam]);

  const handleCentreClick = useCallback((_centrePartner: string, _centreZone: string, _centreCluster: string, centreFeature?: CentreFeature) => {
    setSelectedSettlement(null);
    setActiveZone(null);
    setActiveCluster(null);
    if (centreFeature) {
      setSelectedCentre(centreFeature);
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectionFilter(null);
    setActiveZone(null);
    setActiveCluster(null);
    setSelectedSettlement(null);
  }, []);

  const switchCity = useCallback((city: MapCity) => {
    setActiveCity(city);
    setQuery({ ...EMPTY_QUERY });
    setActiveZone(null);
    setActiveCluster(null);
    setSelectedSettlement(null);
    setSelectionFilter(null);
    if (city !== "bangalore") setColorBy((c) => (c === "health" ? "none" : c));
    setVisibleLayers(prev => {
      const next = defaultLayers(city);
      // Facility layers are bangalore-only for now; keep their visibility
      if (city === "bangalore") prev.forEach(k => { if (!LAYERS.find(l => l.key === k)) next.add(k); });
      return next;
    });
    flyToCityRef.current?.(city);
  }, []);

  const staticPointLayers = LAYERS.filter((l) => l.type === "point" && l.city === activeCity && l.file);

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden bg-slate-100">

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
          "fixed inset-y-0 left-0 z-40 w-80 max-w-[90vw] shadow-2xl",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: relative flex item, no transform
          "sm:relative sm:flex-shrink-0 sm:shadow-sm sm:z-0 sm:translate-x-0",
          sidebarOpen ? "sm:w-80" : "sm:w-0",
        ].join(" ")}
      >
        <LayerPanel
          onClose={() => setSidebarOpen(false)}
          activeCity={activeCity}
          onCityChange={switchCity}
          tab={tab}
          onTabChange={setTab}
          query={query}
          onQueryChange={handleQueryChange}
          rows={rows}
          matched={matched}
          mineClusters={mineClusters}
          loading={facets === null}
          activeCluster={activeCluster}
          onClusterSelect={handleClusterSelect}
          selectionLabel={selectionFilter?.label ?? null}
          onClearSelection={clearSelection}
          partnerLayers={cityPartnerLayers}
          colorBy={colorBy}
          onColorByChange={changeColorBy}
          visibleLayers={visibleLayers}
          onToggle={toggleLayer}
          facilityLayers={activeCity === "bangalore" ? facilityLayers : []}
          staticPointLayers={staticPointLayers}
          featureCounts={featureCounts}
          pointCounts={{ schools: countSchools, health: shownHealth.features.length, canteens: shownCanteens.features.length }}
          healthTypes={healthTypes}
          onHealthTypesChange={setHealthTypes}
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

        {/* Desktop top-right: fullscreen */}
        <div className="hidden sm:flex absolute top-3 right-3 z-10 items-center gap-1.5">
          <button
            onClick={toggleFullscreen}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 shadow bg-white text-slate-600 hover:bg-slate-50 transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
          </button>
        </div>

        {/* Search — full-width on mobile, centred fixed-width on desktop */}
        <SearchBox geoData={geoData} flyToRef={flyToRef} openPopupRef={openPopupRef} />

        {/* Map */}
        <MapView
          visibleLayers={visibleLayers}
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
          progressMode={progressMode}
          progressHealth={progressHealth}
          progressToolbarMode={progressToolbarMode}
          progressLevel={progressLevel}
          needsMode={needsMode}
          needsHeatmap={needsHeatmap}
          needsLevel={needsLevel}
          needsThreshold={needsThreshold}
          activeCity={activeCity}
          schoolFeatures={shownSchools}
          schoolTypes={query.schoolTypes}
          canteenFeatures={shownCanteens}
          bbmpSchoolFeatures={shownBbmpSchools}
          healthFeatures={shownHealth}
          healthTypes={healthTypes}
          colorBy={colorBy}
          healthWorkClusters={healthWorkClusters}
          highlightClusters={!!queryFilter}
          sharedMapRef={sharedMapRef}
          facilityLayers={facilityLayers}
        />

        {/* Progress toolbar — shown when colouring by goal progress */}
        {progressMode && (
          <ProgressToolbar
            onClose={() => changeColorBy("none")}
            period={progressPeriod}
            onPeriodChange={handleProgressPeriodChange}
            mode={progressToolbarMode}
            onModeChange={setProgressToolbarMode}
            level={progressLevel}
            onLevelChange={setProgressLevel}
            health={progressHealth}
            loading={progressLoading}
          />
        )}

        {/* Needs toolbar — shown when colouring by needs */}
        {needsMode && (
          <NeedsToolbar
            onClose={() => changeColorBy("none")}
            heatmap={needsHeatmap}
            domain={needsDomain}
            metric={needsMetric}
            level={needsLevel}
            threshold={needsThreshold}
            loading={needsLoading}
            onDomainChange={(d) => {
              setNeedsDomain(d);
              setNeedsThreshold(0);
              fetchNeedsHeatmap(d, needsMetric, needsLevel);
            }}
            onMetricChange={(m) => {
              setNeedsMetric(m);
              setNeedsThreshold(0);
              fetchNeedsHeatmap(needsDomain, m, needsLevel);
            }}
            onLevelChange={(l) => {
              setNeedsLevel(l);
              setNeedsThreshold(0);
              fetchNeedsHeatmap(needsDomain, needsMetric, l);
            }}
            onThresholdChange={setNeedsThreshold}
          />
        )}

        {/* Map admin panel — Edit Map button + pin/polygon modes */}
        <MapAdminPanel
          mapRef={sharedMapRef}
          onRefresh={() => loadCounts(facilityLayers).then(setFeatureCounts)}
        />

        {/* Settlement detail sidebar */}
        <SettlementSidebar
          feature={selectedSettlement}
          geoData={geoData}
          onClose={() => setSelectedSettlement(null)}
          currentUserId={currentUserId}
          currentUserDesignation={currentUserDesignation}
          currentUserRole={currentUserRole}
          allUsers={allUsers}
        />

        {/* Centre detail sidebar (children centre / youth centre / creche) */}
        <CentreSidebar
          feature={!selectedSettlement ? selectedCentre : null}
          onClose={() => setSelectedCentre(null)}
        />

        {/* Zone / Cluster sidebar — shown when a boundary is active and no settlement is selected */}
        <ZoneClusterSidebar
          type={!selectedSettlement ? (activeCluster ? "cluster" : activeZone ? "zone" : null) : null}
          name={!selectedSettlement ? (activeCluster ?? (activeZone ? (geoDb.zones.find(z => z.id === activeZone)?.name ?? null) : null)) : null}
          parentZone={activeCluster ? zoneClusterIndex.clusters[activeCluster]?.zone : undefined}
          dbId={
            activeCluster
              ? (geoDb.clusters.find(c => normName(c.name) === normName(activeCluster))?.id ?? null)
              : activeZone ?? null
          }
          dbSettlementCount={
            activeCluster
              ? (geoDb.clusters.find(c => normName(c.name) === normName(activeCluster))?.settlementCount ?? null)
              : null
          }
          geoData={geoData}
          clusterIndex={zoneClusterIndex.clusters}
          zoneIndex={zoneClusterIndex.zones}
          onClose={clearSelection}
          currentUserId={currentUserId}
          currentUserDesignation={currentUserDesignation}
          currentUserRole={currentUserRole}
          allUsers={allUsers}
        />

        {/* Mobile bottom bar — sits just above the app's bottom nav (bottom-16 = 64px). */}
        <div className="sm:hidden absolute bottom-16 left-0 right-0 z-10 flex items-stretch bg-white/95 border-t border-slate-200 shadow-lg">
          <button
            onClick={() => { setTab("clusters"); setSidebarOpen(true); }}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold text-slate-700 border-r border-slate-100 active:bg-slate-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18l-7 8v6l-4 2v-8L3 4z" />
            </svg>
            Find clusters{queryActive ? ` · ${matched.length}` : ""}
          </button>
          <button
            onClick={() => { setTab("map"); setSidebarOpen(true); }}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold text-slate-700 active:bg-slate-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Map display
          </button>
        </div>
      </div>
    </div>
  );
}
