"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LAYERS, type LayerConfig, type LayerKey, type MapCity } from "@/lib/layers";
import type { FacilityLayer } from "@/components/map/MapDashboard";
import { type MapFilter, settlementMatchesFilter, centreMatchesFilter } from "@/lib/mapFilter";

export interface CentreFeature {
  name: string;
  centreType: string;
  layerKey: LayerKey;
  layerColor: string;
  matchedSettlement: string;
  zone: string;
  cluster: string;
  partner: string;
  latlng: [number, number];
}

export interface SettlementFeature {
  name: string;
  layerKey: LayerKey;
  layerColor: string;
  layerLabel: string;
  zone: string;
  cluster: string;
  description: string;
  centroid: [number, number]; // [lat, lng]
}

export type ProgressHealth = {
  settlements: Record<string, string>;
  clusters: Record<string, string>;
  zones: Record<string, string>;
  checklistPct?: {
    settlements: Record<string, number>;
    clusters: Record<string, number>;
    zones: Record<string, number>;
  };
  period?: string;
} | null;

interface MapViewProps {
  visibleLayers: Set<LayerKey>;
  activeZone: string | null;
  activeCluster: string | null;
  onSettlementClick: (f: SettlementFeature) => void;
  onZoneSelect: (zone: string | null) => void;
  onClusterSelect: (cluster: string | null) => void;
  flyToRef: React.MutableRefObject<((latlng: [number, number], zoom?: number) => void) | null>;
  flyToCityRef: React.MutableRefObject<((city: MapCity) => void) | null>;
  openPopupRef: React.MutableRefObject<((layerKey: LayerKey, featureIdx: number) => void) | null>;
  activeCity: MapCity;
  mapFilter: MapFilter | null;
  onCentreClick?: (partner: string, zone: string, cluster: string, centreFeature?: CentreFeature) => void;
  sharedMapRef?: React.MutableRefObject<maplibregl.Map | null>;
  progressMode?: boolean;
  progressToolbarMode?: "goals" | "checklist" | "nogaps";
  progressLevel?: "settlement" | "cluster" | "zone";
  progressHealth?: ProgressHealth;
  schoolFeatures?: { type: string; features: unknown[] };
  schoolTypes?: Set<string>;
  healthFeatures?: { type: string; features: unknown[] };
  healthTypes?: Set<string>;
  showHealthClusters?: boolean;
  healthClusterMap?: Record<string, boolean>;
  facilityLayers?: FacilityLayer[];
}

const CITY_CENTERS: Record<MapCity, { center: [number, number]; zoom: number }> = {
  bangalore: { center: [77.5946, 12.9716], zoom: 11 },
  chennai:   { center: [80.2707, 13.0827], zoom: 12 },
};

const ZONE_BOUNDS: Record<string, [[number, number], [number, number]]> = {
  North:   [[77.45, 13.0],  [77.75, 13.2]],
  South:   [[77.45, 12.75], [77.75, 12.97]],
  Central: [[77.52, 12.92], [77.65, 13.05]],
  West:    [[77.42, 12.88], [77.56, 13.08]],
};

const HEALTH_COLORS: Record<string, string> = {
  red:   "#ef4444",
  amber: "#f59e0b",
  green: "#10b981",
};

const STATIC_CENTRE_KEYS: LayerKey[] = ["resource_centres"];

function polygonCentroid(feature: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }): [number, number] {
  try {
    const ring = feature.geometry.type === "MultiPolygon"
      ? (feature.geometry.coordinates as number[][][][])[0][0]
      : (feature.geometry.coordinates as number[][][])[0];
    const lng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
    const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    return [lat, lng]; // return [lat, lng] for external API consistency
  } catch {
    return [0, 0];
  }
}

function getPolygonEnvelope(feature: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }): [number, number][] {
  try {
    if (feature.geometry.type === "MultiPolygon") {
      return (feature.geometry.coordinates as number[][][][]).flatMap(p => p[0]) as [number, number][];
    }
    return (feature.geometry.coordinates as number[][][])[0] as [number, number][];
  } catch {
    return [];
  }
}

function makePolygonPopup(name: string, layer: LayerConfig, desc: string, zone?: string, cluster?: string) {
  return `
    <div class="map-popup">
      <span class="badge" style="background:${layer.color}">${layer.label}</span>
      <h3>${name}</h3>
      ${zone ? `<div class="info" style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">
        <span style="background:#e0e7ff;color:#4338ca;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:700">${zone}</span>
        ${cluster ? `<span style="background:#fef3c7;color:#92400e;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:600">${cluster.replace(/_/g, " ")}</span>` : ""}
      </div>` : ""}
      ${desc ? `<div class="info" style="margin-top:6px">${desc}</div>` : ""}
      <div class="info" style="margin-top:8px;font-size:11px;color:#6366f1;font-weight:600">Click for full details →</div>
    </div>
  `;
}

function makeRCPopup(name: string, desc: string) {
  const orgMatch = name.match(/(Sangama|Actionaid|CFAR|Thamate|SIEDS|Janashayog|Maarga|Sama|Gubbachi)/i);
  const org = orgMatch ? orgMatch[1] : "";
  return `
    <div class="map-popup">
      <span class="badge" style="background:#1d4ed8">Resource Centre</span>
      <h3>${name}</h3>
      ${org ? `<div class="info" style="font-weight:600;color:#1d4ed8;margin-top:4px">${org}</div>` : ""}
      ${desc ? `<div class="info">${desc}</div>` : ""}
    </div>
  `;
}

function makeProgrammeCentrePopup(
  centreType: string, name: string, partner: string,
  zone: string, cluster: string, color: string, note?: string
) {
  return `
    <div class="map-popup">
      <span class="badge" style="background:${color}">${centreType}</span>
      <h3>${name}</h3>
      ${partner ? `<div class="info" style="display:flex;gap:6px;margin-top:5px;flex-wrap:wrap">
        <span style="background:#f3f4f6;color:#374151;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700">${partner}</span>
        ${zone ? `<span style="background:#e0e7ff;color:#4338ca;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600">${zone}</span>` : ""}
        ${cluster ? `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600">${cluster.replace(/_/g, " ")}</span>` : ""}
      </div>` : ""}
      ${note ? `<div class="info" style="margin-top:6px;font-style:italic;color:#94a3b8;font-size:11px">${note}</div>` : ""}
    </div>
  `;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filterCentreGeojson(geojson: any, mapFilter: MapFilter | null): any {
  if (!mapFilter) return geojson;
  return {
    ...geojson,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    features: geojson.features.filter((f: any) =>
      centreMatchesFilter(
        mapFilter,
        f.properties?.partner ?? "",
        f.properties?.zone ?? "",
        f.properties?.cluster ?? ""
      )
    ),
  };
}

const BASEMAP_LAYERS = { carto: "carto-layer", osm: "osm-layer", satellite: "satellite-layer" };

const INITIAL_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
  sources: {
    "carto-source": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
    "osm-source": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
    "satellite-source": {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "© Esri, Maxar",
    },
  },
  layers: [
    { id: "carto-layer",     type: "raster", source: "carto-source"     },
    { id: "osm-layer",       type: "raster", source: "osm-source",      layout: { visibility: "none" } },
    { id: "satellite-layer", type: "raster", source: "satellite-source", layout: { visibility: "none" } },
  ],
};

export default function MapView({
  visibleLayers,
  activeZone, activeCluster, onSettlementClick,
  onZoneSelect, onClusterSelect, onCentreClick,
  flyToRef, flyToCityRef, openPopupRef, mapFilter,
  sharedMapRef,
  progressMode = false, progressHealth = null,
  progressToolbarMode = "goals",
  progressLevel = "settlement",
  activeCity = "bangalore",
  schoolFeatures,
  schoolTypes,
  healthFeatures,
  healthTypes,
  showHealthClusters = false,
  healthClusterMap = {},
  facilityLayers = [],
}: MapViewProps) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layersReadyRef = useRef(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settlementFeaturesRef = useRef<Partial<Record<LayerKey, any[]>>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const centreGeoJSONRef = useRef<Partial<Record<LayerKey, any>>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zoneFeaturesRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clusterFeaturesRef = useRef<any[]>([]);

  const activePopupRef = useRef<maplibregl.Popup | null>(null);
  const mapFilterRef = useRef(mapFilter);
  const onCentreClickRef = useRef(onCentreClick);
  const onSettlementClickRef = useRef(onSettlementClick);
  const onZoneSelectRef = useRef(onZoneSelect);
  const onClusterSelectRef = useRef(onClusterSelect);
  const visibleLayersRef = useRef(visibleLayers);
  const progressHealthRef = useRef(progressHealth);

  const [basemap, setBasemap] = useState<"carto" | "osm" | "satellite">("carto");
  const [showZones, setShowZones] = useState(false);
  const [showClusters, setShowClusters] = useState(false);
  const showZonesRef = useRef(false);
  const showClustersRef = useRef(false);

  const facilityLayersRef = useRef(facilityLayers);
  useEffect(() => { facilityLayersRef.current = facilityLayers; }, [facilityLayers]);

  useEffect(() => { mapFilterRef.current = mapFilter; }, [mapFilter]);
  useEffect(() => { onCentreClickRef.current = onCentreClick; }, [onCentreClick]);
  useEffect(() => { onSettlementClickRef.current = onSettlementClick; }, [onSettlementClick]);
  useEffect(() => { onZoneSelectRef.current = onZoneSelect; }, [onZoneSelect]);
  useEffect(() => { onClusterSelectRef.current = onClusterSelect; }, [onClusterSelect]);
  useEffect(() => { visibleLayersRef.current = visibleLayers; }, [visibleLayers]);
  useEffect(() => { progressHealthRef.current = progressHealth; }, [progressHealth]);
  useEffect(() => { showZonesRef.current = showZones; }, [showZones]);
  useEffect(() => { showClustersRef.current = showClusters; }, [showClusters]);

  // ── Register a DB-driven facility layer as a circle point layer ──────────
  function registerFacilityLayer(map: maplibregl.Map, fl: FacilityLayer) {
    const srcId = `${fl.layerKey}-source`;
    const circId = `${fl.layerKey}-circle`;
    if (map.getSource(srcId)) return; // already registered
    const vis = visibleLayersRef.current.has(fl.layerKey) ? "visible" : "none";
    fetch(`/api/map/geojson/layer-features?layerKey=${fl.layerKey}`)
      .then(r => r.json())
      .then(geojson => {
        if (mapRef.current !== map) return;
        centreGeoJSONRef.current[fl.layerKey] = geojson;
        const filtered = filterCentreGeojson(geojson, mapFilterRef.current);
        try {
          if (map.getSource(srcId)) return;
          map.addSource(srcId, { type: "geojson", data: filtered });
          map.addLayer({
            id: circId,
            type: "circle",
            source: srcId,
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 13, 6, 16, 10],
              "circle-color": fl.color,
              "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 13, 1.5, 16, 3],
              "circle-stroke-color": "white",
            },
            layout: { visibility: vis },
          });
          map.on("click", circId, (e) => {
            if (!e.features?.length) return;
            const props = e.features[0].properties ?? {};
            const name = props.name || fl.label;
            activePopupRef.current?.remove();
            activePopupRef.current = new maplibregl.Popup({ maxWidth: "300px", className: "maplibre-popup-clean" })
              .setLngLat(e.lngLat)
              .setHTML(makeProgrammeCentrePopup(
                props.centre_type || fl.label, name,
                props.partner || "", props.zone || "", props.cluster || "",
                fl.color, props.note || ""
              ))
              .addTo(map);
            if (onCentreClickRef.current) {
              const latlng: [number, number] = [e.lngLat.lat, e.lngLat.lng];
              const centreFeature: CentreFeature = {
                name, centreType: props.centre_type || fl.label,
                layerKey: fl.layerKey, layerColor: fl.color,
                matchedSettlement: props.matched_settlement || "",
                zone: props.zone || "", cluster: props.cluster || "",
                partner: props.partner || "", latlng,
              };
              onCentreClickRef.current(props.partner || "", props.zone || "", props.cluster || "", centreFeature);
            }
          });
          map.on("mouseenter", circId, () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", circId, () => { map.getCanvas().style.cursor = ""; });
        } catch (err) {
          console.warn(`[MapView] facility layer ${fl.layerKey} setup skipped:`, err instanceof Error ? err.message : err);
        }
      })
      .catch(() => {});
  }

  // ── Map initialization ────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: INITIAL_STYLE,
      center: CITY_CENTERS.bangalore.center,
      zoom: CITY_CENTERS.bangalore.zoom,
    });

    mapRef.current = map;
    if (sharedMapRef) sharedMapRef.current = map;

    map.on("load", () => {
      if (mapRef.current !== map) return; // map was removed before style finished loading

      // ── Settlement click + cursor ────────────────────────────────────────────
      // Two-stage hit detection:
      //   1. queryRenderedFeatures (fast, accurate when zoomed in — polygon ≥ a few px wide)
      //   2. Centroid-proximity fallback (catches settlements that are sub-pixel at zoom 11)
      //      At zoom 11, a 200 m settlement is only ~2-3 screen pixels; QRF misses it because
      //      no rendered pixel falls in the bounding box. Proximity search uses the stored
      //      GeoJSON centroids instead.
      const settlementFillIds = LAYERS
        .filter(l => l.file && l.type === "polygon")
        .map(l => `${l.key}-fill`);

      // Returns the nearest visible settlement feature within maxPx screen pixels of (x,y).
      function nearestSettlement(x: number, y: number, maxPx: number): {
        layerConfig: LayerConfig; props: Record<string, unknown>; centroid: [number, number];
      } | null {
        let bestDist = Infinity;
        let best: { layerConfig: LayerConfig; props: Record<string, unknown>; centroid: [number, number] } | null = null;
        const maxPx2 = maxPx * maxPx;
        for (const lc of LAYERS.filter(l => l.file && l.type === "polygon")) {
          if (!visibleLayersRef.current.has(lc.key)) continue;
          const feats = settlementFeaturesRef.current[lc.key] ?? [];
          for (const feat of feats) {
            const [lat, lng] = polygonCentroid(feat as { geometry: { type: string; coordinates: number[][][] } });
            if (lat === 0 && lng === 0) continue;
            const pt = map.project([lng, lat]); // project needs [lng, lat]
            const dx = pt.x - x, dy = pt.y - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < maxPx2 && d2 < bestDist) {
              bestDist = d2;
              best = { layerConfig: lc, props: (feat as { properties: Record<string, unknown> }).properties ?? {}, centroid: [lat, lng] };
            }
          }
        }
        return best;
      }

      map.on("click", (e) => {
        const { x, y } = e.point;

        // If a point/circle layer was clicked, let its own handler run instead
        const circleLayers = (map.getStyle()?.layers ?? [])
          .filter(l => l.id.endsWith("-circle"))
          .map(l => l.id);
        if (circleLayers.length) {
          const circleHits = map.queryRenderedFeatures(e.point, { layers: circleLayers });
          if (circleHits.length) return;
        }

        // Stage 1: rendered-pixel hit test
        const existingIds = settlementFillIds.filter(id => !!map.getLayer(id));
        let layerConfig: LayerConfig | undefined;
        let props: Record<string, unknown> = {};
        let centroid: [number, number] = [0, 0];

        if (existingIds.length) {
          const hits = map.queryRenderedFeatures(
            [[x - 8, y - 8], [x + 8, y + 8]] as [maplibregl.PointLike, maplibregl.PointLike],
            { layers: existingIds }
          );
          if (hits.length) {
            const hit = hits[0];
            const lk = (hit.layer.id as string).replace(/-fill$/, "") as LayerKey;
            layerConfig = LAYERS.find(l => l.key === lk);
            props = hit.properties ?? {};
            centroid = polygonCentroid(hit as unknown as { geometry: { type: string; coordinates: number[][][] } });
          }
        }

        // Stage 2: centroid-proximity fallback (works at any zoom)
        if (!layerConfig) {
          const near = nearestSettlement(x, y, 24);
          if (near) { layerConfig = near.layerConfig; props = near.props; centroid = near.centroid; }
        }

        if (!layerConfig) return;

        // Close any open popup (settlement, zone, or centre) before showing the new one
        activePopupRef.current?.remove();
        const name = (props.name as string) || "Unnamed";
        activePopupRef.current = new maplibregl.Popup({ maxWidth: "300px", className: "maplibre-popup-clean" })
          .setLngLat(e.lngLat)
          .setHTML(makePolygonPopup(name, layerConfig, (props.description as string) || "", props.zone as string, props.cluster as string))
          .addTo(map);
        onSettlementClickRef.current({
          name,
          layerKey: layerConfig.key,
          layerColor: layerConfig.color,
          layerLabel: layerConfig.label,
          zone: (props.zone as string) || "",
          cluster: (props.cluster as string) || "",
          description: (props.description as string) || "",
          centroid,
        });
      });

      // Cursor: pointer when over any clickable polygon layer.
      // Single mousemove handler is the sole cursor controller — no mouseenter/mouseleave on fills.
      map.on("mousemove", (e) => {
        const { x, y } = e.point;
        const box = [[x - 3, y - 3], [x + 3, y + 3]] as [maplibregl.PointLike, maplibregl.PointLike];
        const settlementIds = settlementFillIds.filter(id => !!map.getLayer(id));
        const zoneCluIds = (["zones-fill", "clusters-fill"] as const).filter(id => !!map.getLayer(id));
        const checkIds = [...settlementIds, ...zoneCluIds];
        const near = checkIds.length > 0 && map.queryRenderedFeatures(box, { layers: checkIds }).length > 0;
        map.getCanvas().style.cursor = near ? "pointer" : "";
      });

      // ── Settlement polygon layers ────────────────────────────────────────
      LAYERS.filter((l) => l.file && l.type === "polygon").forEach((layerConfig) => {
        fetch(layerConfig.file)
          .then((r) => r.json())
          .then((geojson) => {
            if (mapRef.current !== map) return; // map was cleaned up
            settlementFeaturesRef.current[layerConfig.key] = geojson.features;

            const srcId = `${layerConfig.key}-source`;
            const fillId = `${layerConfig.key}-fill`;
            const lineId = `${layerConfig.key}-line`;
            const vis = visibleLayersRef.current.has(layerConfig.key) ? "visible" : "none";

            try {
              if (map.getSource(srcId)) return; // already added (double-fire guard)
              map.addSource(srcId, { type: "geojson", data: geojson });

              map.addLayer({
                id: fillId,
                type: "fill",
                source: srcId,
                paint: {
                  "fill-color": [
                    "case",
                    ["==", ["get", "health"], "checklist"], ["coalesce", ["get", "checklistColor"], "#e2e8f0"],
                    ["==", ["get", "health"], "nogap"],     "#ef4444",
                    ["==", ["get", "health"], "has_goals"], "#e2e8f0",
                    ["==", ["get", "health"], "red"],       HEALTH_COLORS.red,
                    ["==", ["get", "health"], "amber"],     HEALTH_COLORS.amber,
                    ["==", ["get", "health"], "green"],     HEALTH_COLORS.green,
                    layerConfig.color,
                  ],
                  "fill-opacity": [
                    "case",
                    ["==", ["get", "health"], "checklist"],  0.65,
                    ["==", ["get", "health"], "nogap"],      0.45,
                    ["==", ["get", "health"], "has_goals"],  0.15,
                    ["in", ["get", "health"], ["literal", ["red", "amber", "green"]]], 0.5,
                    ["==", ["get", "health"], "dim"],        0.1,
                    0.25,
                  ],
                },
                layout: { visibility: vis },
              });

              map.addLayer({
                id: lineId,
                type: "line",
                source: srcId,
                paint: {
                  "line-color": [
                    "case",
                    ["==", ["get", "health"], "checklist"], ["coalesce", ["get", "checklistColor"], "#e2e8f0"],
                    ["==", ["get", "health"], "nogap"],     "#ef4444",
                    ["==", ["get", "health"], "red"],       HEALTH_COLORS.red,
                    ["==", ["get", "health"], "amber"],     HEALTH_COLORS.amber,
                    ["==", ["get", "health"], "green"],     HEALTH_COLORS.green,
                    layerConfig.color,
                  ],
                  "line-width": 2,
                  "line-opacity": 0.9,
                },
                layout: { visibility: vis },
              });

              // cursor is managed by the global mousemove handler above

              // Apply map filter highlighting if active
              const mf = mapFilterRef.current;
              if (mf && (mf.partnerKeys.size > 0 || mf.zones.size > 0 || mf.clusters.size > 0)) {
                applyFilterHighlight(map, mf, visibleLayersRef.current);
              }

              // Apply progress health if active
              if (progressHealthRef.current) {
                enrichSourceWithHealth(map, layerConfig.key, progressHealthRef.current);
              }
            } catch (err) {
              console.warn("[MapView] polygon layer setup skipped:", err instanceof Error ? err.message : err);
            }
          });
      });

      // ── Centre point layers ──────────────────────────────────────────────
      LAYERS.filter((l) => l.file && l.type === "point").forEach((layerConfig) => {
        fetch(layerConfig.file)
          .then((r) => r.json())
          .then((geojson) => {
            if (mapRef.current !== map) return; // map was cleaned up
            centreGeoJSONRef.current[layerConfig.key] = geojson;
            const filtered = filterCentreGeojson(geojson, mapFilterRef.current);
            const srcId = `${layerConfig.key}-source`;
            const circId = `${layerConfig.key}-circle`;
            const isProgramme = ["children_centres", "youth_centres", "creches"].includes(layerConfig.key);
            const vis = visibleLayersRef.current.has(layerConfig.key) ? "visible" : "none";

            try {
              if (map.getSource(srcId)) return; // already added (double-fire guard)
              map.addSource(srcId, { type: "geojson", data: filtered });
              map.addLayer({
                id: circId,
                type: "circle",
                source: srcId,
                paint: {
                  "circle-radius": isProgramme
                    ? ["interpolate", ["linear"], ["zoom"], 10, 4, 13, 6, 16, 10]
                    : ["interpolate", ["linear"], ["zoom"], 10, 3.5, 13, 5.5, 16, 9],
                  "circle-color": layerConfig.color,
                  "circle-stroke-width": isProgramme
                    ? ["interpolate", ["linear"], ["zoom"], 10, 1, 13, 1.5, 16, 3]
                    : ["interpolate", ["linear"], ["zoom"], 10, 1, 13, 1.5, 16, 2.5],
                  "circle-stroke-color": "white",
                },
                layout: { visibility: vis },
              });

              map.on("click", circId, (e) => {
                if (!e.features?.length) return;
                const props = e.features[0].properties ?? {};
                const name = props.name || layerConfig.label;

                const html = isProgramme
                  ? makeProgrammeCentrePopup(
                      props.centre_type || layerConfig.label, name,
                      props.partner || "", props.zone || "", props.cluster || "",
                      layerConfig.color, props.note || ""
                    )
                  : makeRCPopup(name, props.description || "");

                activePopupRef.current?.remove();
                activePopupRef.current = new maplibregl.Popup({ maxWidth: "300px", className: "maplibre-popup-clean" })
                  .setLngLat(e.lngLat)
                  .setHTML(html)
                  .addTo(map);

                if (onCentreClickRef.current && isProgramme) {
                  const latlng: [number, number] = [e.lngLat.lat, e.lngLat.lng];
                  const centreFeature: CentreFeature = {
                    name, centreType: props.centre_type || layerConfig.label,
                    layerKey: layerConfig.key, layerColor: layerConfig.color,
                    matchedSettlement: props.matched_settlement || "",
                    zone: props.zone || "", cluster: props.cluster || "",
                    partner: props.partner || "", latlng,
                  };
                  onCentreClickRef.current(props.partner || "", props.zone || "", props.cluster || "", centreFeature);
                } else if (onCentreClickRef.current) {
                  onCentreClickRef.current(props.partner || "", props.zone || "", props.cluster || "");
                }
              });

              map.on("mouseenter", circId, () => { map.getCanvas().style.cursor = "pointer"; });
              map.on("mouseleave", circId, () => { map.getCanvas().style.cursor = ""; });
            } catch (err) {
              console.warn("[MapView] point layer setup skipped:", err instanceof Error ? err.message : err);
            }
          });
      });

      // ── School markers source ────────────────────────────────────────────
      try {
        if (!map.getSource("schools-source")) {
          map.addSource("schools-source", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          map.addLayer({
            id: "schools-circle",
            type: "circle",
            source: "schools-source",
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 13, 5, 16, 8],
              "circle-color": ["get", "color"],
              "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 13, 1.5, 16, 2],
              "circle-stroke-color": "white",
            },
            layout: { visibility: visibleLayersRef.current.has("schools") ? "visible" : "none" },
          });
          map.on("click", "schools-circle", (e) => {
            if (!e.features?.length) return;
            const props = e.features[0].properties ?? {};
            const TYPE_LABELS: Record<string, string> = {
              "Government": "Govt School", "BBMP": "BBMP School", "Karnataka Public School": "KPS",
            };
            const TYPE_COLORS: Record<string, string> = {
              "Government": "#dc2626", "BBMP": "#1e293b", "Karnataka Public School": "#0288D1",
            };
            const sType = props.schoolType ?? "Government";
            const color = TYPE_COLORS[sType] ?? "#16a34a";
            const settlementList = JSON.parse(props.settlements || "[]")
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((s: any) => `<li style="margin:2px 0">${s.name} <span style="color:#64748b;font-size:10px">(${s.distanceKm.toFixed(1)} km)</span></li>`)
              .join("");
            activePopupRef.current?.remove();
            activePopupRef.current = new maplibregl.Popup({ maxWidth: "280px", className: "maplibre-popup-clean" })
              .setLngLat(e.lngLat)
              .setHTML(`<div class="map-popup">
                <span class="badge" style="background:${color}">${TYPE_LABELS[sType] ?? "School"}</span>
                <h3>${props.name}</h3>
                ${props.address ? `<div class="info" style="margin-top:4px;color:#64748b;font-size:11px">${props.address}</div>` : ""}
                ${settlementList ? `<div style="margin-top:8px"><div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:3px;text-transform:uppercase;letter-spacing:.05em">Nearby Settlements</div><ul style="padding:0;margin:0;list-style:none;font-size:12px;color:#1e293b">${settlementList}</ul></div>` : ""}
              </div>`)
              .addTo(map);
          });
          map.on("mouseenter", "schools-circle", () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", "schools-circle", () => { map.getCanvas().style.cursor = ""; });
        }
      } catch (err) {
        console.warn("[MapView] schools source setup skipped:", err instanceof Error ? err.message : err);
      }

      // ── Health centre source ─────────────────────────────────────────────
      try {
        if (!map.getSource("health-source")) {
          map.addSource("health-source", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          map.addLayer({
            id: "health-circle",
            type: "circle",
            source: "health-source",
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 13, 5, 16, 8],
              "circle-color": ["get", "color"],
              "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 13, 1.5, 16, 2],
              "circle-stroke-color": "white",
            },
            layout: { visibility: visibleLayersRef.current.has("health_centres") ? "visible" : "none" },
          });
          map.on("click", "health-circle", (e) => {
            if (!e.features?.length) return;
            const props = e.features[0].properties ?? {};
            const TYPE_CONFIG: Record<string, { color: string; label: string }> = {
              "CRC": { color: "#7c3aed", label: "CRC" },
              "Foundation Health Centre": { color: "#0284c7", label: "Foundation HC" },
              "Government Health Centre": { color: "#059669", label: "Govt Health Centre" },
              "Referral Helpdesk Hospital": { color: "#d97706", label: "Referral Hospital" },
              "Super Speciality Hospital": { color: "#dc2626", label: "Super Speciality" },
            };
            const cfg = TYPE_CONFIG[props.centreType ?? ""] ?? { color: "#e11d48", label: "Health Centre" };
            const settlementList = JSON.parse(props.settlements || "[]")
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((s: any) => `<li style="margin:2px 0">${s.name} <span style="color:#64748b;font-size:10px">(${s.distanceKm.toFixed(1)} km)</span></li>`)
              .join("");
            activePopupRef.current?.remove();
            activePopupRef.current = new maplibregl.Popup({ maxWidth: "300px", className: "maplibre-popup-clean" })
              .setLngLat(e.lngLat)
              .setHTML(`<div class="map-popup">
                <span class="badge" style="background:${cfg.color}">${cfg.label}</span>
                <h3>${props.name}</h3>
                ${props.notes ? `<div class="info" style="margin-top:4px;color:#64748b;font-size:11px">${props.notes}</div>` : ""}
                ${settlementList ? `<div style="margin-top:8px"><div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:3px;text-transform:uppercase;letter-spacing:.05em">Nearby Settlements (≤2 km)</div><ul style="padding:0;margin:0;list-style:none;font-size:12px;color:#1e293b">${settlementList}</ul></div>` : `<div style="margin-top:6px;font-size:11px;color:#94a3b8;font-style:italic">No settlements within 2 km</div>`}
              </div>`)
              .addTo(map);
          });
          map.on("mouseenter", "health-circle", () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", "health-circle", () => { map.getCanvas().style.cursor = ""; });
        }
      } catch (err) {
        console.warn("[MapView] health source setup skipped:", err instanceof Error ? err.message : err);
      }

      // ── Zone boundaries ──────────────────────────────────────────────────
      fetch("/api/map/geojson/zones").then((r) => r.json()).then((gj) => {
        if (mapRef.current !== map) return; // map was cleaned up
        zoneFeaturesRef.current = gj.features ?? [];
        try {
          if (map.getSource("zones-source")) return; // already added
          map.addSource("zones-source", { type: "geojson", data: gj });
          map.addLayer({
            id: "zones-fill",
            type: "fill",
            source: "zones-source",
            paint: {
              "fill-color": [
                "case",
                ["==", ["get", "health"], "red"],   HEALTH_COLORS.red,
                ["==", ["get", "health"], "amber"],  HEALTH_COLORS.amber,
                ["==", ["get", "health"], "green"],  HEALTH_COLORS.green,
                ["get", "color"],
              ],
              "fill-opacity": ["case", ["in", ["get", "health"], ["literal", ["red", "amber", "green"]]], 0.22, 0.07],
            },
            layout: { visibility: "none" },
          });
          map.addLayer({
            id: "zones-line",
            type: "line",
            source: "zones-source",
            paint: {
              "line-color": ["get", "color"],
              "line-width": 2.5,
              "line-opacity": 0.85,
              "line-dasharray": [8, 5],
            },
            layout: { visibility: "none" },
          });
          map.addLayer({
            id: "zones-label",
            type: "symbol",
            source: "zones-source",
            layout: {
              "text-field": ["get", "zone"],
              "text-size": 12,
              "text-font": ["Open Sans Bold", "Arial Unicode MS Regular"],
              "symbol-placement": "point",
              "text-transform": "uppercase",
              "text-letter-spacing": 0.08,
              visibility: "none",
            },
            paint: {
              "text-color": "#1e293b",
              "text-halo-color": "rgba(255,255,255,0.9)",
              "text-halo-width": 2,
              "text-opacity": 0.7,
            },
          });
          map.on("click", "zones-fill", (e) => {
            if (!e.features?.length) return;
            // Skip if a settlement polygon was also hit — settlement click handler takes priority
            const sIds = LAYERS.filter(l => l.file && l.type === "polygon").map(l => `${l.key}-fill`).filter(id => !!map.getLayer(id));
            if (sIds.length && map.queryRenderedFeatures([[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]] as [maplibregl.PointLike, maplibregl.PointLike], { layers: sIds }).length) return;
            activePopupRef.current?.remove(); activePopupRef.current = null;
            onZoneSelectRef.current(e.features[0].properties?.id ?? null);
          });
          // cursor managed by the global mousemove handler
        } catch (err) {
          console.warn("[MapView] zones layer setup skipped:", err instanceof Error ? err.message : err);
        }
      });

      // ── Cluster boundaries ───────────────────────────────────────────────
      fetch("/api/map/geojson/clusters").then((r) => r.json()).then((gj) => {
        if (mapRef.current !== map) return; // map was cleaned up
        clusterFeaturesRef.current = gj.features ?? [];
        try {
          if (map.getSource("clusters-source")) return; // already added
          map.addSource("clusters-source", { type: "geojson", data: gj });
          map.addLayer({
            id: "clusters-fill",
            type: "fill",
            source: "clusters-source",
            paint: {
              "fill-color": [
                "case",
                ["==", ["get", "health"], "red"],   HEALTH_COLORS.red,
                ["==", ["get", "health"], "amber"],  HEALTH_COLORS.amber,
                ["==", ["get", "health"], "green"],  HEALTH_COLORS.green,
                ["get", "color"],
              ],
              "fill-opacity": ["case", ["in", ["get", "health"], ["literal", ["red", "amber", "green"]]], 0.18, 0.09],
            },
            layout: { visibility: "none" },
          });
          map.addLayer({
            id: "clusters-line",
            type: "line",
            source: "clusters-source",
            paint: {
              "line-color": ["get", "color"],
              "line-width": 1.8,
              "line-opacity": 0.8,
              "line-dasharray": [5, 4],
            },
            layout: { visibility: "none" },
          });
          map.addLayer({
            id: "clusters-label",
            type: "symbol",
            source: "clusters-source",
            layout: {
              "text-field": ["get", "label"],
              "text-size": 10,
              "text-font": ["Open Sans Bold", "Arial Unicode MS Regular"],
              "symbol-placement": "point",
              "text-transform": "uppercase",
              "text-letter-spacing": 0.05,
              visibility: "none",
            },
            paint: {
              "text-color": "#334155",
              "text-halo-color": "rgba(255,255,255,0.9)",
              "text-halo-width": 1.5,
              "text-opacity": 0.75,
            },
          });
          map.on("click", "clusters-fill", (e) => {
            if (!e.features?.length) return;
            // Skip if a settlement polygon was also hit — settlement click handler takes priority
            const sIds = LAYERS.filter(l => l.file && l.type === "polygon").map(l => `${l.key}-fill`).filter(id => !!map.getLayer(id));
            if (sIds.length && map.queryRenderedFeatures([[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]] as [maplibregl.PointLike, maplibregl.PointLike], { layers: sIds }).length) return;
            activePopupRef.current?.remove(); activePopupRef.current = null;
            onClusterSelectRef.current(e.features[0].properties?.cluster ?? null);
          });
          // cursor managed by the global mousemove handler
        } catch (err) {
          console.warn("[MapView] clusters layer setup skipped:", err instanceof Error ? err.message : err);
        }
      });

      // ── Dynamic facility layers ──────────────────────────────────────────
      facilityLayersRef.current.forEach((fl) => registerFacilityLayer(map, fl));

      layersReadyRef.current = true;
    });

    // ── Imperative refs ──────────────────────────────────────────────────────
    flyToRef.current = (latlng, zoom = 16) =>
      map.flyTo({ center: [latlng[1], latlng[0]], zoom, duration: 700 });

    flyToCityRef.current = (city: MapCity) =>
      map.flyTo({ center: CITY_CENTERS[city].center, zoom: CITY_CENTERS[city].zoom, duration: 800 });

    openPopupRef.current = (layerKey, featureIdx) => {
      const features = settlementFeaturesRef.current[layerKey];
      const centreGeojson = centreGeoJSONRef.current[layerKey];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allFeatures: any[] = features ?? centreGeojson?.features ?? [];
      const feature = allFeatures[featureIdx];
      if (!feature) return;

      let center: [number, number];
      if (feature.geometry.type === "Point") {
        center = feature.geometry.coordinates as [number, number]; // already [lng, lat]
      } else {
        const [lat, lng] = polygonCentroid(feature);
        center = [lng, lat];
      }

      map.flyTo({ center, zoom: 16, duration: 700 });

      const layerConfig = LAYERS.find((l) => l.key === layerKey);
      if (!layerConfig) return;
      const props = feature.properties ?? {};
      const html = layerConfig.type === "polygon"
        ? makePolygonPopup(props.name || "Unnamed", layerConfig, props.description || "", props.zone, props.cluster)
        : makeProgrammeCentrePopup(
            props.centre_type || layerConfig.label, props.name || layerConfig.label,
            props.partner || "", props.zone || "", props.cluster || "", layerConfig.color
          );

      setTimeout(() => {
        activePopupRef.current?.remove();
        activePopupRef.current = new maplibregl.Popup({ maxWidth: "300px", className: "maplibre-popup-clean" })
          .setLngLat(center)
          .setHTML(html)
          .addTo(map);
      }, 750);
    };

    return () => {
      map.remove();
      mapRef.current = null;
      layersReadyRef.current = false;
      if (sharedMapRef) sharedMapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helper: enrich settlement source with health data ──────────────────────
  function enrichSourceWithHealth(map: maplibregl.Map, key: LayerKey, ph: NonNullable<ProgressHealth>) {
    const src = map.getSource(`${key}-source`) as maplibregl.GeoJSONSource | undefined;
    const rawFeatures = settlementFeaturesRef.current[key];
    if (!src || !rawFeatures) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = rawFeatures.map((f: any) => {
      const h = ph.settlements[(f.properties?.name ?? "").toLowerCase()];
      return { ...f, properties: { ...f.properties, health: h ?? "dim" } };
    });
    src.setData({ type: "FeatureCollection", features: enriched });
  }

  // ── Helper: colour settlement source by checklist % ──────────────────────
  function checklistPctToColor(pct: number): string {
    if (pct >= 90) return "#10b981";
    if (pct >= 70) return "#6ee7b7";
    if (pct >= 40) return "#d1fae5";
    if (pct >= 10) return "#fef3c7";
    return "#fee2e2";
  }

  function enrichSourceWithChecklist(
    map: maplibregl.Map, key: LayerKey,
    ph: NonNullable<ProgressHealth>,
    nameKey: "settlements" | "clusters" | "zones",
    featurePropKey: string,
  ) {
    const src = map.getSource(`${key}-source`) as maplibregl.GeoJSONSource | undefined;
    const rawFeatures = settlementFeaturesRef.current[key];
    if (!src || !rawFeatures) return;
    const pctMap = ph.checklistPct?.[nameKey] ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = rawFeatures.map((f: any) => {
      const name = (f.properties?.[featurePropKey] ?? "").toLowerCase();
      const pct = pctMap[name];
      const color = pct !== undefined ? checklistPctToColor(pct) : "#e2e8f0";
      return { ...f, properties: { ...f.properties, health: "checklist", checklistColor: color } };
    });
    src.setData({ type: "FeatureCollection", features: enriched });
  }

  // ── Helper: colour settlement source for "no goals" mode ─────────────────
  function enrichSourceWithNoGoals(
    map: maplibregl.Map, key: LayerKey,
    ph: NonNullable<ProgressHealth>,
    nameKey: "settlements" | "clusters" | "zones",
    featurePropKey: string,
  ) {
    const src = map.getSource(`${key}-source`) as maplibregl.GeoJSONSource | undefined;
    const rawFeatures = settlementFeaturesRef.current[key];
    if (!src || !rawFeatures) return;
    const healthMap = ph[nameKey];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = rawFeatures.map((f: any) => {
      const name = (f.properties?.[featurePropKey] ?? "").toLowerCase();
      const h = healthMap[name];
      const health = h === "none" ? "nogap" : "has_goals";
      return { ...f, properties: { ...f.properties, health } };
    });
    src.setData({ type: "FeatureCollection", features: enriched });
  }

  // ── Helper: apply zone/cluster filter highlighting ─────────────────────────
  function applyFilterHighlight(map: maplibregl.Map, filter: MapFilter | null, visible: Set<LayerKey>) {
    LAYERS.filter((l) => l.file && l.type === "polygon").forEach((layerConfig) => {
      const fillId = `${layerConfig.key}-fill`;
      const lineId = `${layerConfig.key}-line`;
      if (!map.getLayer(fillId) || !map.getLayer(lineId)) return;
      if (!visible.has(layerConfig.key)) return;

      const hasFilter = filter && (filter.partnerKeys.size > 0 || filter.zones.size > 0 || filter.clusters.size > 0);
      if (!hasFilter) {
        map.setPaintProperty(fillId, "fill-opacity", 0.25);
        map.setPaintProperty(lineId, "line-width", 2);
        return;
      }

      const rawFeatures = settlementFeaturesRef.current[layerConfig.key] ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const enriched = rawFeatures.map((f: any) => {
        const matches = settlementMatchesFilter(filter!, layerConfig.key, f.properties?.zone, f.properties?.cluster);
        return { ...f, properties: { ...f.properties, filterMatch: matches ? 1 : 0 } };
      });
      (map.getSource(`${layerConfig.key}-source`) as maplibregl.GeoJSONSource)?.setData({ type: "FeatureCollection", features: enriched });
      map.setPaintProperty(fillId, "fill-opacity", ["case", ["==", ["get", "filterMatch"], 1], 0.55, 0.08]);
      map.setPaintProperty(lineId, "line-width", ["case", ["==", ["get", "filterMatch"], 1], 2.5, 1]);
    });
  }

  // ── Register new facility layers if they arrive after map is loaded ───────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;
    facilityLayers.forEach(fl => registerFacilityLayer(map, fl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityLayers]);

  // ── Layer visibility toggling ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;
    try {
      LAYERS.filter((l) => l.file).forEach((layerConfig) => {
        const vis = visibleLayers.has(layerConfig.key) ? "visible" : "none";
        if (layerConfig.type === "polygon") {
          if (map.getLayer(`${layerConfig.key}-fill`)) map.setLayoutProperty(`${layerConfig.key}-fill`, "visibility", vis);
          if (map.getLayer(`${layerConfig.key}-line`)) map.setLayoutProperty(`${layerConfig.key}-line`, "visibility", vis);
        } else {
          if (map.getLayer(`${layerConfig.key}-circle`)) map.setLayoutProperty(`${layerConfig.key}-circle`, "visibility", vis);
        }
      });
      // Facility layers are not in LAYERS — handle them separately
      facilityLayersRef.current.forEach((fl) => {
        const vis = visibleLayers.has(fl.layerKey) ? "visible" : "none";
        if (map.getLayer(`${fl.layerKey}-circle`)) map.setLayoutProperty(`${fl.layerKey}-circle`, "visibility", vis);
      });
      applyFilterHighlight(map, mapFilterRef.current, visibleLayers);
    } catch (err) {
      console.error("[MapView] visibleLayers effect error:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleLayers]);

  // ── Basemap switching ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.entries(BASEMAP_LAYERS).forEach(([key, layerId]) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", key === basemap ? "visible" : "none");
      }
    });
  }, [basemap]);

  // ── Progress health colouring ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const ph = progressHealth;
    const active = progressMode && !!ph;

    // ── Settlement polygon layers ─────────────────────────────────────────
    // Only paint at settlement level; dim otherwise
    LAYERS.filter((l) => l.file && l.type === "polygon").forEach((layerConfig) => {
      const src = map.getSource(`${layerConfig.key}-source`) as maplibregl.GeoJSONSource | undefined;
      const rawFeatures = settlementFeaturesRef.current[layerConfig.key];
      if (!src || !rawFeatures) return;

      if (!active) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const restored = rawFeatures.map((f: any) => ({ ...f, properties: { ...f.properties, health: undefined, checklistColor: undefined } }));
        src.setData({ type: "FeatureCollection", features: restored });
        return;
      }

      // Show settlement layer only when level === "settlement"
      if (progressLevel !== "settlement") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dimmed = rawFeatures.map((f: any) => ({ ...f, properties: { ...f.properties, health: "dim", checklistColor: undefined } }));
        src.setData({ type: "FeatureCollection", features: dimmed });
        return;
      }

      if (progressToolbarMode === "checklist") {
        enrichSourceWithChecklist(map, layerConfig.key, ph, "settlements", "name");
      } else if (progressToolbarMode === "nogaps") {
        enrichSourceWithNoGoals(map, layerConfig.key, ph, "settlements", "name");
      } else {
        enrichSourceWithHealth(map, layerConfig.key, ph);
      }
    });

    // ── Zone boundaries ───────────────────────────────────────────────────
    const zoneSrc = map.getSource("zones-source") as maplibregl.GeoJSONSource | undefined;
    if (zoneSrc && zoneFeaturesRef.current.length > 0) {
      if (!active || progressLevel !== "zone") {
        zoneSrc.setData({ type: "FeatureCollection", features: zoneFeaturesRef.current });
      } else if (progressToolbarMode === "checklist") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pctMap = ph.checklistPct?.zones ?? {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const enriched = zoneFeaturesRef.current.map((f: any) => {
          const name = (f.properties?.zone ?? "").toLowerCase();
          const pct = pctMap[name];
          return { ...f, properties: { ...f.properties, health: "checklist", checklistColor: pct !== undefined ? checklistPctToColor(pct) : "#e2e8f0" } };
        });
        zoneSrc.setData({ type: "FeatureCollection", features: enriched });
      } else if (progressToolbarMode === "nogaps") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const enriched = zoneFeaturesRef.current.map((f: any) => {
          const name = (f.properties?.zone ?? "").toLowerCase();
          const h = ph.zones[name];
          return { ...f, properties: { ...f.properties, health: h === "none" ? "nogap" : "has_goals" } };
        });
        zoneSrc.setData({ type: "FeatureCollection", features: enriched });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const enriched = zoneFeaturesRef.current.map((f: any) => ({
          ...f, properties: { ...f.properties, health: ph.zones[(f.properties?.zone ?? "").toLowerCase()] ?? "" },
        }));
        zoneSrc.setData({ type: "FeatureCollection", features: enriched });
      }
    }

    // ── Cluster boundaries ────────────────────────────────────────────────
    const clusterSrc = map.getSource("clusters-source") as maplibregl.GeoJSONSource | undefined;
    if (clusterSrc && clusterFeaturesRef.current.length > 0) {
      if (!active || progressLevel !== "cluster") {
        clusterSrc.setData({ type: "FeatureCollection", features: clusterFeaturesRef.current });
      } else if (progressToolbarMode === "checklist") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pctMap = ph.checklistPct?.clusters ?? {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const enriched = clusterFeaturesRef.current.map((f: any) => {
          const name = (f.properties?.cluster ?? "").toLowerCase();
          const pct = pctMap[name];
          return { ...f, properties: { ...f.properties, health: "checklist", checklistColor: pct !== undefined ? checklistPctToColor(pct) : "#e2e8f0" } };
        });
        clusterSrc.setData({ type: "FeatureCollection", features: enriched });
      } else if (progressToolbarMode === "nogaps") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const enriched = clusterFeaturesRef.current.map((f: any) => {
          const name = (f.properties?.cluster ?? "").toLowerCase();
          const h = ph.clusters[name];
          return { ...f, properties: { ...f.properties, health: h === "none" ? "nogap" : "has_goals" } };
        });
        clusterSrc.setData({ type: "FeatureCollection", features: enriched });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const enriched = clusterFeaturesRef.current.map((f: any) => ({
          ...f, properties: { ...f.properties, health: ph.clusters[(f.properties?.cluster ?? "").toLowerCase()] ?? "" },
        }));
        clusterSrc.setData({ type: "FeatureCollection", features: enriched });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressMode, progressHealth, progressToolbarMode, progressLevel]);

  // ── Rebuild centre layers when map filter changes ─────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      const allCentreKeys = [
        ...STATIC_CENTRE_KEYS,
        ...facilityLayersRef.current.map(fl => fl.layerKey),
      ];
      allCentreKeys.forEach((key) => {
        const geojson = centreGeoJSONRef.current[key];
        const src = map.getSource(`${key}-source`) as maplibregl.GeoJSONSource | undefined;
        if (!src || !geojson) return;
        src.setData(filterCentreGeojson(geojson, mapFilter));
      });
      applyFilterHighlight(map, mapFilter, visibleLayersRef.current);
    } catch (err) {
      console.error("[MapView] mapFilter effect error:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapFilter]);

  // ── School markers ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("schools-source") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const TYPE_COLORS: Record<string, string> = {
      "Government": "#dc2626", "BBMP": "#1e293b", "Karnataka Public School": "#0288D1",
    };

    if (!visibleLayers.has("schools") || !schoolFeatures) {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const features = (schoolFeatures.features as any[]).filter((f: any) => {
      if (!schoolTypes) return true;
      return schoolTypes.has(f.properties?.schoolType ?? "Government");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }).map((f: any) => ({
      ...f,
      properties: {
        ...f.properties,
        color: TYPE_COLORS[f.properties?.schoolType ?? "Government"] ?? "#16a34a",
        settlements: JSON.stringify(f.properties?.settlements ?? []),
      },
    }));

    src.setData({ type: "FeatureCollection", features });
    if (map?.getLayer("schools-circle")) map.setLayoutProperty("schools-circle", "visibility", "visible");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolFeatures, visibleLayers, schoolTypes]);

  // ── Health centre markers ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("health-source") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const TYPE_COLORS: Record<string, string> = {
      "CRC": "#7c3aed", "Foundation Health Centre": "#0284c7",
      "Government Health Centre": "#059669", "Referral Helpdesk Hospital": "#d97706",
      "Super Speciality Hospital": "#dc2626",
    };

    if (!visibleLayers.has("health_centres") || !healthFeatures) {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const features = (healthFeatures.features as any[]).filter((f: any) => {
      if (!healthTypes) return true;
      return healthTypes.has(f.properties?.centreType ?? "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }).map((f: any) => ({
      ...f,
      properties: {
        ...f.properties,
        color: TYPE_COLORS[f.properties?.centreType ?? ""] ?? "#e11d48",
        settlements: JSON.stringify(f.properties?.settlements ?? []),
      },
    }));

    src.setData({ type: "FeatureCollection", features });
    if (map?.getLayer("health-circle")) map.setLayoutProperty("health-circle", "visibility", "visible");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthFeatures, visibleLayers, healthTypes]);

  // ── Health cluster overlay ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("clusters-source") as maplibregl.GeoJSONSource | undefined;
    if (!src || !clusterFeaturesRef.current.length) return;

    // Ensure cluster layer is visible when overlay is on
    if (showHealthClusters && map?.getLayer("clusters-fill")) {
      map.setLayoutProperty("clusters-fill", "visibility", "visible");
      map.setLayoutProperty("clusters-line", "visibility", "visible");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = clusterFeaturesRef.current.map((f: any) => {
      const key = f.properties?.cluster ?? "";
      const isHealth = showHealthClusters && (healthClusterMap[key] ?? healthClusterMap[key.replace(/_/g, " ")] ?? false);
      return { ...f, properties: { ...f.properties, healthOverlay: isHealth ? "health" : "" } };
    });

    if (showHealthClusters) {
      src.setData({ type: "FeatureCollection", features: enriched });
      if (map?.getLayer("clusters-fill")) {
        map?.setPaintProperty("clusters-fill", "fill-color", [
          "case", ["==", ["get", "healthOverlay"], "health"], "#f43f5e", ["get", "color"],
        ]);
        map?.setPaintProperty("clusters-fill", "fill-opacity", [
          "case", ["==", ["get", "healthOverlay"], "health"], 0.22, 0.06,
        ]);
      }
    } else {
      src.setData({ type: "FeatureCollection", features: clusterFeaturesRef.current });
      if (map?.getLayer("clusters-fill")) {
        map?.setPaintProperty("clusters-fill", "fill-color", [
          "case",
          ["==", ["get", "health"], "red"],   HEALTH_COLORS.red,
          ["==", ["get", "health"], "amber"],  HEALTH_COLORS.amber,
          ["==", ["get", "health"], "green"],  HEALTH_COLORS.green,
          ["get", "color"],
        ]);
        map?.setPaintProperty("clusters-fill", "fill-opacity", [
          "case", ["in", ["get", "health"], ["literal", ["red", "amber", "green"]]], 0.18, 0.09,
        ]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHealthClusters, healthClusterMap]);

  // ── Zone flyTo ────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (activeZone && !activeCluster) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const zf = zoneFeaturesRef.current.find((f: any) => f.properties?.id === activeZone);
        if (zf) {
          const pts = getPolygonEnvelope(zf as Parameters<typeof getPolygonEnvelope>[0]);
          if (pts.length) {
            const lngs = pts.map(p => p[0]), lats = pts.map(p => p[1]);
            map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { duration: 800, padding: 40 });
          }
        }
      } else if (!activeZone && !activeCluster) {
        map.flyTo({ center: CITY_CENTERS[activeCity].center, zoom: CITY_CENTERS[activeCity].zoom, duration: 800 });
      }
      const src = map.getSource("zones-source") as maplibregl.GeoJSONSource | undefined;
      if (src && zoneFeaturesRef.current.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const enriched = zoneFeaturesRef.current.map((f: any) => ({
          ...f, properties: { ...f.properties, active: f.properties?.id === activeZone ? 1 : 0 },
        }));
        src.setData({ type: "FeatureCollection", features: enriched });
        if (map.getLayer("zones-fill")) {
          map.setPaintProperty("zones-fill", "fill-opacity", [
            "case",
            ["==", ["get", "active"], 1], 0.18,
            activeZone ? 0.03 : ["case", ["in", ["get", "health"], ["literal", ["red", "amber", "green"]]], 0.22, 0.07],
          ]);
        }
      }
    } catch (err) {
      console.error("[MapView] activeZone effect error:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeZone, activeCluster, activeCity]);

  // ── Cluster flyTo ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeCluster) return;
    try {
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      Object.values(settlementFeaturesRef.current).forEach((features) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        features?.forEach((f: any) => {
          if (f.properties?.cluster !== activeCluster) return;
          getPolygonEnvelope(f).forEach(([lng, lat]) => {
            minLng = Math.min(minLng, lng); minLat = Math.min(minLat, lat);
            maxLng = Math.max(maxLng, lng); maxLat = Math.max(maxLat, lat);
          });
        });
      });
      if (isFinite(minLng)) {
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { duration: 800, padding: 60 });
      }

      const src = map.getSource("clusters-source") as maplibregl.GeoJSONSource | undefined;
      if (src && clusterFeaturesRef.current.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const enriched = clusterFeaturesRef.current.map((f: any) => ({
          ...f, properties: { ...f.properties, active: f.properties?.cluster === activeCluster ? 1 : 0 },
        }));
        src.setData({ type: "FeatureCollection", features: enriched });
        if (map.getLayer("clusters-fill")) {
          map.setPaintProperty("clusters-fill", "fill-opacity", [
            "case",
            ["==", ["get", "active"], 1], 0.22,
            activeCluster ? 0.03 : ["case", ["in", ["get", "health"], ["literal", ["red", "amber", "green"]]], 0.18, 0.09],
          ]);
        }
      }
    } catch (err) {
      console.error("[MapView] activeCluster effect error:", err);
    }
  }, [activeCluster]);

  // ── Zone/cluster overlay toggles ──────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const vis = showZones ? "visible" : "none";
    ["zones-fill", "zones-line", "zones-label"].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
    });
  }, [showZones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const vis = showClusters ? "visible" : "none";
    ["clusters-fill", "clusters-line", "clusters-label"].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
    });
  }, [showClusters]);

  // ── Re-fetch zone/cluster boundaries when Geography settings change ───────
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel("pitstop:geo");
      ch.onmessage = () => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;
        fetch("/api/map/geojson/zones").then(r => r.json()).then(gj => {
          if (mapRef.current !== map) return;
          zoneFeaturesRef.current = gj.features ?? [];
          (map.getSource("zones-source") as maplibregl.GeoJSONSource | undefined)
            ?.setData({ type: "FeatureCollection", features: gj.features ?? [] });
        }).catch(() => {});
        fetch("/api/map/geojson/clusters").then(r => r.json()).then(gj => {
          if (mapRef.current !== map) return;
          clusterFeaturesRef.current = gj.features ?? [];
          (map.getSource("clusters-source") as maplibregl.GeoJSONSource | undefined)
            ?.setData({ type: "FeatureCollection", features: gj.features ?? [] });
        }).catch(() => {});
      };
    } catch { /* BroadcastChannel unsupported */ }
    return () => { ch?.close(); };
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Progress toolbar is rendered by MapDashboard, not here */}

      {/* Bottom-right controls */}
      <div className="absolute bottom-28 sm:bottom-6 right-3 z-10 flex flex-col gap-1.5 items-end">
        <button
          onClick={() => setShowZones((v) => !v)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border shadow-lg transition-colors flex items-center gap-1.5 ${
            showZones
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-sm border-2 flex-shrink-0" style={{ borderColor: showZones ? "white" : "#6366f1", borderStyle: "dashed" }} />
          Zones
        </button>
        <button
          onClick={() => setShowClusters((v) => !v)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border shadow-lg transition-colors flex items-center gap-1.5 ${
            showClusters
              ? "bg-amber-500 text-white border-amber-500"
              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-sm border-2 flex-shrink-0" style={{ borderColor: showClusters ? "white" : "#f59e0b", borderStyle: "dashed" }} />
          Clusters
        </button>
        <button
          onClick={() => setBasemap((b) => b === "carto" ? "osm" : b === "osm" ? "satellite" : "carto")}
          className="bg-white border border-slate-200 shadow-lg px-3 py-1.5 rounded-full text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          {basemap === "carto" ? "OSM" : basemap === "osm" ? "Satellite" : "Carto"}
        </button>
      </div>
    </div>
  );
}
