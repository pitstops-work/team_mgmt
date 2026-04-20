"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LAYERS, type LayerConfig, type LayerKey, type MapCity } from "@/lib/layers";
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
  sharedMapRef?: React.MutableRefObject<L.Map | null>;
  progressMode?: boolean;
  progressHealth?: ProgressHealth;
  schoolFeatures?: { type: string; features: unknown[] };
  schoolTypes?: Set<string>;
  healthFeatures?: { type: string; features: unknown[] };
  healthTypes?: Set<string>;
  showHealthClusters?: boolean;
  healthClusterMap?: Record<string, boolean>;
}

interface FeatureLayer {
  leafletLayer: L.Path;
  props: Record<string, string>;
  baseColor: string;
}

const BANGALORE_CENTER: L.LatLngTuple = [12.9716, 77.5946];

const ZONE_BOUNDS: Record<string, L.LatLngBoundsLiteral> = {
  North:   [[13.0, 77.45], [13.2, 77.75]],
  South:   [[12.75, 77.45], [12.97, 77.75]],
  Central: [[12.92, 77.52], [13.05, 77.65]],
  West:    [[12.88, 77.42], [13.08, 77.56]],
};

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

const CENTRE_LAYER_KEYS: LayerKey[] = ["children_centres", "youth_centres", "creches", "resource_centres"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildCentreLayer(
  layerConfig: LayerConfig,
  group: L.LayerGroup,
  geojson: any,
  mapFilter: MapFilter | null,
  onCentreClick?: (partner: string, zone: string, cluster: string, centreFeature?: CentreFeature) => void
) {
  group.clearLayers();
  const isProgrammeCentre = ["children_centres", "youth_centres", "creches"].includes(layerConfig.key);
  L.geoJSON(geojson, {
    filter: (feature) => {
      if (!mapFilter) return true;
      return centreMatchesFilter(
        mapFilter,
        feature.properties?.partner ?? "",
        feature.properties?.zone ?? "",
        feature.properties?.cluster ?? ""
      );
    },
    pointToLayer: (_f, latlng) =>
      L.circleMarker(latlng, {
        radius: isProgrammeCentre ? 9 : 8,
        fillColor: layerConfig.color,
        color: "white",
        weight: isProgrammeCentre ? 3 : 2.5,
        opacity: 1, fillOpacity: 1,
      }),
    onEachFeature: (feature, layer) => {
      const props = feature.properties ?? {};
      const name = props.name || layerConfig.label;
      if (isProgrammeCentre) {
        layer.bindPopup(makeProgrammeCentrePopup(
          props.centre_type || layerConfig.label, name,
          props.partner || "", props.zone || "", props.cluster || "",
          layerConfig.color, props.note || ""
        ), { maxWidth: 300 });
      } else {
        layer.bindPopup(makeRCPopup(name, props.description || ""), { maxWidth: 300 });
      }
      if (onCentreClick && isProgrammeCentre) {
        layer.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          const latlng: [number, number] = [e.latlng.lat, e.latlng.lng];
          const centreFeature: CentreFeature = {
            name,
            centreType: props.centre_type || layerConfig.label,
            layerKey: layerConfig.key,
            layerColor: layerConfig.color,
            matchedSettlement: props.matched_settlement || "",
            zone: props.zone || "",
            cluster: props.cluster || "",
            partner: props.partner || "",
            latlng,
          };
          onCentreClick(props.partner || "", props.zone || "", props.cluster || "", centreFeature);
        });
      } else if (onCentreClick) {
        layer.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onCentreClick(props.partner || "", props.zone || "", props.cluster || "");
        });
      }
    },
  }).addTo(group);
}

const HEALTH_COLORS: Record<string, string> = {
  red:   "#ef4444",
  amber: "#f59e0b",
  green: "#10b981",
};

const CITY_CENTERS: Record<MapCity, { latlng: L.LatLngTuple; zoom: number }> = {
  bangalore: { latlng: [12.9716, 77.5946], zoom: 11 },
  chennai:   { latlng: [13.0827, 80.2707], zoom: 12 },
};

export default function MapView({
  visibleLayers,
  activeZone, activeCluster, onSettlementClick,
  onZoneSelect, onClusterSelect, onCentreClick,
  flyToRef, flyToCityRef, openPopupRef, mapFilter,
  sharedMapRef,
  progressMode = false, progressHealth = null,
  activeCity = "bangalore",
  schoolFeatures,
  schoolTypes,
  healthFeatures,
  healthTypes,
  showHealthClusters = false,
  healthClusterMap = {},
}: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layerGroupsRef = useRef<Partial<Record<LayerKey, L.LayerGroup>>>({});
  const zoneBoundaryGroupRef = useRef<L.LayerGroup | null>(null);
  const clusterBoundaryGroupRef = useRef<L.LayerGroup | null>(null);
  const zoneBoundaryLayersRef = useRef<Map<string, L.Path>>(new Map());
  const clusterBoundaryLayersRef = useRef<Map<string, L.Path>>(new Map());
  // Original fill colors for boundaries (needed to reset after progress mode)
  const zoneBoundaryColorsRef = useRef<Map<string, string>>(new Map());
  const clusterBoundaryColorsRef = useRef<Map<string, string>>(new Map());
  const allFeatureLayers = useRef<FeatureLayer[]>([]);
  const featureLayersByKey = useRef<Partial<Record<LayerKey, L.Layer[]>>>({});
  const schoolLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const healthLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const [basemap, setBasemap] = useState<"carto" | "osm" | "satellite">("carto");
  const [showZones, setShowZones] = useState(false);
  const [showClusters, setShowClusters] = useState(false);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const onZoneSelectRef = useRef(onZoneSelect);
  const onClusterSelectRef = useRef(onClusterSelect);
  useEffect(() => { onZoneSelectRef.current = onZoneSelect; }, [onZoneSelect]);
  useEffect(() => { onClusterSelectRef.current = onClusterSelect; }, [onClusterSelect]);

  const onSettlementClickRef = useRef(onSettlementClick);
  useEffect(() => { onSettlementClickRef.current = onSettlementClick; }, [onSettlementClick]);

  const visibleLayersRef = useRef(visibleLayers);
  useEffect(() => { visibleLayersRef.current = visibleLayers; }, [visibleLayers]);

  // Store raw GeoJSON for centre layers so we can rebuild with map filter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const centreGeoJSONRef = useRef<Partial<Record<LayerKey, any>>>({});
  const mapFilterRef = useRef(mapFilter);
  useEffect(() => { mapFilterRef.current = mapFilter; }, [mapFilter]);
  const onCentreClickRef = useRef(onCentreClick);
  useEffect(() => { onCentreClickRef.current = onCentreClick; }, [onCentreClick]);

  // Swap tile layer when basemap changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    if (basemap === "carto") {
      tileLayerRef.current = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>', subdomains: "abcd", maxZoom: 19 }
      ).addTo(map);
    } else if (basemap === "satellite") {
      tileLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: '&copy; <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics', maxZoom: 19 }
      ).addTo(map);
    } else {
      tileLayerRef.current = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }
      ).addTo(map);
    }
    tileLayerRef.current.bringToBack();
  }, [basemap]);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, { center: BANGALORE_CENTER, zoom: 11 });

    tileLayerRef.current = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>', subdomains: "abcd", maxZoom: 19 }
    ).addTo(map);

    mapRef.current = map;
    if (sharedMapRef) sharedMapRef.current = map;
    allFeatureLayers.current = [];

    flyToRef.current = (latlng, zoom = 16) =>
      map.flyTo(latlng, zoom, { duration: 0.7 });
    flyToCityRef.current = (city: MapCity) => {
      const { latlng, zoom } = CITY_CENTERS[city];
      map.flyTo(latlng, zoom, { duration: 0.8 });
    };
    openPopupRef.current = (layerKey, featureIdx) => {
      const layer = featureLayersByKey.current[layerKey]?.[featureIdx];
      if (!layer) return;
      const latlng = (layer as L.CircleMarker).getLatLng?.() ??
        (layer as L.Polygon).getBounds?.().getCenter();
      if (latlng) map.flyTo(latlng, 16, { duration: 0.7 });
      setTimeout(() => (layer as L.Layer & { openPopup: () => void }).openPopup?.(), 750);
    };

    LAYERS.filter((l) => l.file).forEach((layerConfig) => {
      const group = L.layerGroup().addTo(map);
      layerGroupsRef.current[layerConfig.key] = group;
      featureLayersByKey.current[layerConfig.key] = [];

      fetch(layerConfig.file)
        .then((r) => r.json())
        .then((geojson) => {
          if (layerConfig.type === "polygon") {
            L.geoJSON(geojson, {
              style: {
                color: layerConfig.color, weight: 2, opacity: 0.9,
                fillColor: layerConfig.color, fillOpacity: 0.25,
              },
              onEachFeature: (feature, layer) => {
                const props = feature.properties ?? {};
                const name = props.name || "Unnamed";
                const desc = props.description || "";
                const zone = props.zone || "";
                const cluster = props.cluster || "";

                layer.bindPopup(makePolygonPopup(name, layerConfig, desc, zone, cluster), { maxWidth: 300 });

                const path = layer as L.Path;
                path.on("mouseover", () => path.setStyle({ fillOpacity: 0.55, weight: 3 }));
                path.on("mouseout", () => path.setStyle({
                  fillOpacity: path.options.fillOpacity ?? 0.25, weight: 2,
                }));
                path.on("click", () => {
                  // Compute polygon centroid (average of outer ring coordinates)
                  let centroid: [number, number] = [0, 0];
                  try {
                    const geom = feature.geometry as { type: string; coordinates: number[][][] | number[][][][] };
                    const ring = geom.type === "MultiPolygon"
                      ? (geom.coordinates as number[][][][])[0][0]
                      : (geom.coordinates as number[][][])[0];
                    const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
                    const lng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
                    centroid = [lat, lng];
                  } catch {}
                  onSettlementClickRef.current({
                    name, layerKey: layerConfig.key,
                    layerColor: layerConfig.color, layerLabel: layerConfig.label,
                    zone, cluster, description: desc, centroid,
                  });
                });

                allFeatureLayers.current.push({
                  leafletLayer: path,
                  props: { zone, cluster, name, layer: layerConfig.key },
                  baseColor: layerConfig.color,
                });
                featureLayersByKey.current[layerConfig.key]!.push(layer);
              },
            }).addTo(group);
          } else {
            // Store raw GeoJSON for centre layers (needed for map filter rebuilds)
            if (CENTRE_LAYER_KEYS.includes(layerConfig.key)) {
              centreGeoJSONRef.current[layerConfig.key] = geojson;
            }
            buildCentreLayer(
              layerConfig, group, geojson, mapFilterRef.current,
              (p, z, c, cf) => onCentreClickRef.current?.(p, z, c, cf)
            );
          }
        });
    });

    schoolLayerGroupRef.current = L.layerGroup().addTo(map);
    healthLayerGroupRef.current = L.layerGroup().addTo(map);

    // ── Boundary layers (zone + cluster) — loaded once, toggled via state ──
    const zoneBoundaryGroup = L.layerGroup();
    const clusterBoundaryGroup = L.layerGroup();
    zoneBoundaryGroupRef.current = zoneBoundaryGroup;
    clusterBoundaryGroupRef.current = clusterBoundaryGroup;

    fetch("/api/map/geojson/zones").then((r) => r.json()).then((gj) => {
      L.geoJSON(gj, {
        style: (f) => ({
          color: f?.properties.color ?? "#64748b",
          weight: 2.5,
          opacity: 0.85,
          fillColor: f?.properties.color ?? "#64748b",
          fillOpacity: 0.07,
          dashArray: "8 5",
        }),
        onEachFeature: (feature, layer) => {
          const zone = feature.properties.zone as string;
          layer.bindTooltip(zone, { permanent: true, direction: "center", className: "boundary-label zone-label" });
          (layer as L.Path).on("click", () => onZoneSelectRef.current(zone));
          (layer as L.Path).on("mouseover", () => (layer as L.Path).setStyle({ fillOpacity: 0.18, weight: 3 }));
          (layer as L.Path).on("mouseout", () => (layer as L.Path).setStyle({ fillOpacity: 0.07, weight: 2.5 }));
          zoneBoundaryLayersRef.current.set(zone, layer as L.Path);
          zoneBoundaryColorsRef.current.set(zone, feature.properties.color ?? "#64748b");
        },
      }).addTo(zoneBoundaryGroup);
    });

    fetch("/api/map/geojson/clusters").then((r) => r.json()).then((gj) => {
      L.geoJSON(gj, {
        style: (f) => ({
          color: f?.properties.color ?? "#64748b",
          weight: 1.8,
          opacity: 0.8,
          fillColor: f?.properties.color ?? "#64748b",
          fillOpacity: 0.09,
          dashArray: "5 4",
        }),
        onEachFeature: (feature, layer) => {
          const cluster = feature.properties.cluster as string;
          const label = feature.properties.label as string;
          layer.bindTooltip(label, { permanent: true, direction: "center", className: "boundary-label cluster-label" });
          (layer as L.Path).on("click", () => onClusterSelectRef.current(cluster));
          (layer as L.Path).on("mouseover", () => (layer as L.Path).setStyle({ fillOpacity: 0.22, weight: 2.5 }));
          (layer as L.Path).on("mouseout", () => (layer as L.Path).setStyle({ fillOpacity: 0.09, weight: 1.8 }));
          clusterBoundaryLayersRef.current.set(cluster, layer as L.Path);
          clusterBoundaryColorsRef.current.set(cluster, feature.properties.color ?? "#64748b");
        },
      }).addTo(clusterBoundaryGroup);
    });

    return () => { map.remove(); mapRef.current = null; if (sharedMapRef) sharedMapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    LAYERS.filter((l) => l.file).forEach((layerConfig) => {
      const group = layerGroupsRef.current[layerConfig.key];
      if (!group) return;
      if (visibleLayers.has(layerConfig.key)) {
        if (!map.hasLayer(group)) group.addTo(map);
      } else {
        if (map.hasLayer(group)) map.removeLayer(group);
      }
    });
    // Re-apply filter styles so newly-visible layers get correct styles
    applyZoneClusterHighlight(mapFilterRef.current, visibleLayers);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleLayers]);

  // ── Progress health colouring ─────────────────────────────────────────────
  // When progressMode is on: override polygon fill with red/amber/green.
  // When off: restore all polygons and boundaries to their original colours.
  useEffect(() => {
    if (!progressMode || !progressHealth) {
      // Restore settlement polygons to their original layer colour
      allFeatureLayers.current.forEach(({ leafletLayer, baseColor }) => {
        leafletLayer.setStyle({ fillColor: baseColor, color: baseColor, fillOpacity: 0.25, opacity: 0.9, weight: 2 });
      });
      // Restore zone boundaries
      zoneBoundaryLayersRef.current.forEach((layer, zoneName) => {
        const orig = zoneBoundaryColorsRef.current.get(zoneName) ?? "#64748b";
        layer.setStyle({ fillColor: orig, color: orig, fillOpacity: 0.07, opacity: 0.85, weight: 2.5 });
      });
      // Restore cluster boundaries
      clusterBoundaryLayersRef.current.forEach((layer, clusterKey) => {
        const orig = clusterBoundaryColorsRef.current.get(clusterKey) ?? "#64748b";
        layer.setStyle({ fillColor: orig, color: orig, fillOpacity: 0.09, opacity: 0.8, weight: 1.8 });
      });
      return;
    }

    // Apply health colours — settlement polygons
    allFeatureLayers.current.forEach(({ leafletLayer, props, baseColor }) => {
      const key = (props.name ?? "").toLowerCase();
      const health = progressHealth.settlements[key];
      const hc = health ? HEALTH_COLORS[health] : null;
      if (hc) {
        leafletLayer.setStyle({ fillColor: hc, color: hc, fillOpacity: 0.5, opacity: 1, weight: 2 });
      } else {
        // Settlements with no goals: dim
        leafletLayer.setStyle({ fillColor: baseColor, color: baseColor, fillOpacity: 0.1, opacity: 0.4, weight: 1 });
      }
    });

    // Zone boundaries
    zoneBoundaryLayersRef.current.forEach((layer, zoneName) => {
      const health = progressHealth.zones[zoneName.toLowerCase()];
      const hc = health ? HEALTH_COLORS[health] : null;
      if (hc) {
        layer.setStyle({ fillColor: hc, color: hc, fillOpacity: 0.22, opacity: 1, weight: 3 });
      } else {
        const orig = zoneBoundaryColorsRef.current.get(zoneName) ?? "#64748b";
        layer.setStyle({ fillColor: orig, color: orig, fillOpacity: 0.05, opacity: 0.5, weight: 2 });
      }
    });

    // Cluster boundaries
    clusterBoundaryLayersRef.current.forEach((layer, clusterKey) => {
      const health = progressHealth.clusters[clusterKey.toLowerCase()];
      const hc = health ? HEALTH_COLORS[health] : null;
      if (hc) {
        layer.setStyle({ fillColor: hc, color: hc, fillOpacity: 0.18, opacity: 1, weight: 2.5 });
      } else {
        const orig = clusterBoundaryColorsRef.current.get(clusterKey) ?? "#64748b";
        layer.setStyle({ fillColor: orig, color: orig, fillOpacity: 0.06, opacity: 0.5, weight: 1.5 });
      }
    });
  }, [progressMode, progressHealth]);

  // Rebuild centre layer groups when map filter changes
  useEffect(() => {
    CENTRE_LAYER_KEYS.forEach((key) => {
      const layerConfig = LAYERS.find((l) => l.key === key);
      const group = layerGroupsRef.current[key];
      const geojson = centreGeoJSONRef.current[key];
      if (layerConfig && group && geojson) {
        buildCentreLayer(
          layerConfig, group, geojson, mapFilter,
          (p, z, c, cf) => onCentreClickRef.current?.(p, z, c, cf)
        );
      }
    });
    // Also re-apply settlement styling
    applyZoneClusterHighlight(mapFilter, visibleLayersRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapFilter]);

  // Render / update school markers when data or visibility changes
  useEffect(() => {
    const group = schoolLayerGroupRef.current;
    if (!group) return;
    group.clearLayers();
    if (!visibleLayers.has("schools") || !schoolFeatures) return;

    const TYPE_COLORS: Record<string, string> = {
      "Government":             "#dc2626",
      "BBMP":                   "#1e293b",
      "Karnataka Public School":"#0288D1",
    };
    const TYPE_LABELS: Record<string, string> = {
      "Government":             "Govt School",
      "BBMP":                   "BBMP School",
      "Karnataka Public School":"KPS",
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (schoolFeatures.features as any[]).forEach((feature: any) => {
      const [lng, lat] = feature.geometry.coordinates;
      const props = feature.properties ?? {};
      const sType: string = props.schoolType ?? "Government";

      // Filter by active types
      if (schoolTypes && !schoolTypes.has(sType)) return;

      const color = TYPE_COLORS[sType] ?? "#16a34a";
      const marker = L.circleMarker([lat, lng] as L.LatLngTuple, {
        radius: 7,
        fillColor: color,
        color: "white",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
      });

      const settlementList = (props.settlements ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((s: any) => `<li style="margin:2px 0">${s.name} <span style="color:#64748b;font-size:10px">(${s.distanceKm.toFixed(1)} km)</span></li>`)
        .join("");

      marker.bindPopup(`
        <div class="map-popup">
          <span class="badge" style="background:${color}">${TYPE_LABELS[sType] ?? "School"}</span>
          <h3>${props.name}</h3>
          ${props.address ? `<div class="info" style="margin-top:4px;color:#64748b;font-size:11px">${props.address}</div>` : ""}
          ${settlementList ? `
            <div style="margin-top:8px">
              <div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:3px;text-transform:uppercase;letter-spacing:.05em">Nearby Settlements</div>
              <ul style="padding:0;margin:0;list-style:none;font-size:12px;color:#1e293b">${settlementList}</ul>
            </div>` : ""}
        </div>
      `, { maxWidth: 280 });

      group.addLayer(marker);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolFeatures, visibleLayers, schoolTypes]);

  // Render health centre markers
  useEffect(() => {
    const group = healthLayerGroupRef.current;
    if (!group) return;
    group.clearLayers();
    if (!visibleLayers.has("health_centres") || !healthFeatures) return;

    const TYPE_CONFIG: Record<string, { color: string; label: string }> = {
      "CRC":                       { color: "#7c3aed", label: "CRC" },
      "Foundation Health Centre":  { color: "#0284c7", label: "Foundation HC" },
      "Government Health Centre":  { color: "#059669", label: "Govt Health Centre" },
      "Referral Helpdesk Hospital":{ color: "#d97706", label: "Referral Hospital" },
      "Super Speciality Hospital": { color: "#dc2626", label: "Super Speciality" },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (healthFeatures.features as any[]).forEach((feature: any) => {
      const [lng, lat] = feature.geometry.coordinates;
      const props = feature.properties ?? {};
      const cType: string = props.centreType ?? "";
      if (healthTypes && !healthTypes.has(cType)) return;

      const cfg = TYPE_CONFIG[cType] ?? { color: "#e11d48", label: "Health Centre" };

      // Diamond shape via rotated square marker using divIcon
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:12px;height:12px;background:${cfg.color};transform:rotate(45deg);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });

      const marker = L.marker([lat, lng] as L.LatLngTuple, { icon });

      const settlementList = (props.settlements ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((s: any) => `<li style="margin:2px 0">${s.name} <span style="color:#64748b;font-size:10px">(${s.distanceKm.toFixed(1)} km)</span></li>`)
        .join("");

      marker.bindPopup(`
        <div class="map-popup">
          <span class="badge" style="background:${cfg.color}">${cfg.label}</span>
          <h3>${props.name}</h3>
          ${props.notes ? `<div class="info" style="margin-top:4px;color:#64748b;font-size:11px">${props.notes}</div>` : ""}
          ${settlementList ? `
            <div style="margin-top:8px">
              <div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:3px;text-transform:uppercase;letter-spacing:.05em">Nearby Settlements (≤2 km)</div>
              <ul style="padding:0;margin:0;list-style:none;font-size:12px;color:#1e293b">${settlementList}</ul>
            </div>` : `<div style="margin-top:6px;font-size:11px;color:#94a3b8;font-style:italic">No settlements within 2 km</div>`}
        </div>
      `, { maxWidth: 300 });

      group.addLayer(marker);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthFeatures, visibleLayers, healthTypes]);

  // Health cluster overlay — tint cluster boundaries by health status
  useEffect(() => {
    // Ensure cluster boundary group is visible when overlay is on
    const map = mapRef.current;
    const group = clusterBoundaryGroupRef.current;
    if (map && group && showHealthClusters && !map.hasLayer(group)) group.addTo(map);

    clusterBoundaryLayersRef.current.forEach((layer, clusterKey) => {
      if (!showHealthClusters) {
        // Reset to default styling (re-use original color)
        const orig = clusterBoundaryColorsRef.current.get(clusterKey) ?? "#64748b";
        layer.setStyle({ fillColor: orig, color: orig, fillOpacity: 0.09, opacity: 0.8, weight: 1.8, dashArray: "5 4" });
      } else {
        const isHealth = healthClusterMap[clusterKey] ?? healthClusterMap[clusterKey.replace(/_/g, " ")] ?? false;
        if (isHealth) {
          layer.setStyle({ fillColor: "#f43f5e", color: "#e11d48", fillOpacity: 0.22, opacity: 1, weight: 2.5, dashArray: undefined });
        } else {
          layer.setStyle({ fillColor: "#94a3b8", color: "#94a3b8", fillOpacity: 0.06, opacity: 0.4, weight: 1.5, dashArray: "5 4" });
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHealthClusters, healthClusterMap]);

  function applyZoneClusterHighlight(
    filter: MapFilter | null, visible: Set<LayerKey>
  ) {
    const map = mapRef.current;
    if (!map) return;
    const hasFilter = filter && (
      filter.partnerKeys.size > 0 || filter.zones.size > 0 || filter.clusters.size > 0
    );
    allFeatureLayers.current.forEach(({ leafletLayer, props, baseColor }) => {
      // Only touch polygons whose layer group is currently visible
      if (!visible.has(props.layer as LayerKey)) return;
      if (!hasFilter) {
        leafletLayer.setStyle({ fillColor: baseColor, fillOpacity: 0.25, opacity: 0.9, weight: 2 });
        return;
      }
      const matches = settlementMatchesFilter(filter!, props.layer, props.zone, props.cluster);
      if (matches) {
        leafletLayer.setStyle({ fillColor: baseColor, fillOpacity: 0.55, opacity: 1, weight: 2.5 });
        leafletLayer.bringToFront();
      } else {
        leafletLayer.setStyle({ fillColor: "#94a3b8", fillOpacity: 0.08, opacity: 0.3, weight: 1 });
      }
    });
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // FlyTo behavior based on zone/cluster selection
    if (activeZone && !activeCluster && ZONE_BOUNDS[activeZone]) {
      map.flyToBounds(ZONE_BOUNDS[activeZone], { duration: 0.8, padding: [30, 30] });
    } else if (!activeZone && !activeCluster) {
      const { latlng, zoom } = CITY_CENTERS[activeCity];
      map.flyTo(latlng, zoom, { duration: 0.8 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeZone, activeCluster, activeCity]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeCluster) return;
    const matched = allFeatureLayers.current.filter((f) => f.props.cluster === activeCluster);
    if (!matched.length) return;
    const bounds = L.latLngBounds([]);
    matched.forEach(({ leafletLayer }) => {
      try {
        const b = (leafletLayer as L.Polygon).getBounds();
        if (b.isValid()) bounds.extend(b);
      } catch {}
    });
    if (bounds.isValid()) map.flyToBounds(bounds, { duration: 0.8, padding: [60, 60] });
  }, [activeCluster]);

  // Toggle zone/cluster boundary visibility
  useEffect(() => {
    const map = mapRef.current;
    const group = zoneBoundaryGroupRef.current;
    if (!map || !group) return;
    if (showZones) { if (!map.hasLayer(group)) group.addTo(map); }
    else { if (map.hasLayer(group)) map.removeLayer(group); }
  }, [showZones]);

  useEffect(() => {
    const map = mapRef.current;
    const group = clusterBoundaryGroupRef.current;
    if (!map || !group) return;
    if (showClusters) { if (!map.hasLayer(group)) group.addTo(map); }
    else { if (map.hasLayer(group)) map.removeLayer(group); }
  }, [showClusters]);

  // Highlight active zone/cluster boundary
  useEffect(() => {
    zoneBoundaryLayersRef.current.forEach((layer, zone) => {
      if (!activeZone) {
        layer.setStyle({ fillOpacity: 0.07, weight: 2.5, opacity: 0.85 });
      } else if (zone === activeZone) {
        layer.setStyle({ fillOpacity: 0.18, weight: 3.5, opacity: 1 });
        layer.bringToFront();
      } else {
        layer.setStyle({ fillOpacity: 0.03, weight: 1.5, opacity: 0.4 });
      }
    });
  }, [activeZone]);

  useEffect(() => {
    clusterBoundaryLayersRef.current.forEach((layer, cluster) => {
      if (!activeCluster) {
        layer.setStyle({ fillOpacity: 0.09, weight: 1.8, opacity: 0.8 });
      } else if (cluster === activeCluster) {
        layer.setStyle({ fillOpacity: 0.22, weight: 3, opacity: 1 });
        layer.bringToFront();
      } else {
        layer.setStyle({ fillOpacity: 0.03, weight: 1, opacity: 0.3 });
      }
    });
  }, [activeCluster]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Progress mode legend */}
      {progressMode && (
        <div className="absolute bottom-28 sm:bottom-6 left-3 z-10 bg-white/95 backdrop-blur-sm rounded-xl border border-slate-200 shadow-lg px-3 py-2.5">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">Goal health</p>
          <div className="space-y-1.5">
            {[
              { color: "#ef4444", label: "Overdue goals" },
              { color: "#f59e0b", label: "At risk (due <30d)" },
              { color: "#10b981", label: "On track / done" },
            ].map(({ color, label }) => (
              <div key={color} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }} />
                <span className="text-[10px] text-slate-600">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom-right controls: boundary toggles + basemap */}
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
