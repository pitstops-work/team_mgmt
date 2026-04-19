"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

interface CustomFeature {
  id: string;
  name: string;
  description: string;
  type: string;
  lat: number;
  lng: number;
  createdAt: string;
}

export interface CustomPolygonFeature {
  type: "Feature";
  properties: {
    id: string;
    name: string;
    partnerKey: string;
    zone: string;
    cluster: string;
    description: string;
    createdAt: string;
  };
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

export type ProgressHealth = {
  settlements: Record<string, string>;
  clusters: Record<string, string>;
  zones: Record<string, string>;
} | null;

interface MapViewProps {
  visibleLayers: Set<LayerKey>;
  onFeatureAdded: () => void;
  customFeatures: CustomFeature[];
  customPolygons?: CustomPolygonFeature[];
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
  dbPartners?: { key: string; label: string; color: string }[];
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
        layer.on("click", () => {
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
  visibleLayers, onFeatureAdded, customFeatures, customPolygons = [],
  activeZone, activeCluster, onSettlementClick,
  onZoneSelect, onClusterSelect, onCentreClick,
  flyToRef, flyToCityRef, openPopupRef, mapFilter, dbPartners = [],
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
  const customLayerRef = useRef<L.LayerGroup | null>(null);
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

  const router = useRouter();
  const [addMode, setAddMode] = useState(false);
  const [pendingLatLng, setPendingLatLng] = useState<L.LatLng | null>(null);
  const [formData, setFormData] = useState({ name: "", settlementName: "", cluster: "", zone: "", partner: "", description: "", type: "settlement", customType: "" });
  const [saving, setSaving] = useState(false);
  const [basemap, setBasemap] = useState<"carto" | "osm" | "satellite">("carto");
  const [showZones, setShowZones] = useState(false);
  const [showClusters, setShowClusters] = useState(false);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Zone→cluster index for dropdowns
  const [zoneClusterIndex, setZoneClusterIndex] = useState<Record<string, string[]>>({});
  const ZONES = ["Central", "West", "North", "South"];
  const builtInPartnerOptions = LAYERS.filter((l) => l.type === "polygon" && l.key !== "custom_settlements");
  const partnerOptions = [
    ...builtInPartnerOptions,
    ...dbPartners.filter((d) => !builtInPartnerOptions.some((b) => b.key === d.key)),
  ];

  // Draw mode state
  const [drawMode, setDrawMode] = useState(false);
  const [drawVertices, setDrawVertices] = useState<L.LatLng[]>([]);
  const [pendingPolygon, setPendingPolygon] = useState<L.LatLng[] | null>(null);
  const [polyFormData, setPolyFormData] = useState({ name: "", zone: "", cluster: "", partner: "", description: "" });
  const [polySaving, setPolySaving] = useState(false);
  const drawPreviewRef = useRef<L.LayerGroup | null>(null);
  const customPolygonLayerRef = useRef<L.LayerGroup | null>(null);

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

  // Load zone→cluster index for form dropdowns
  useEffect(() => {
    fetch("/data/zone_cluster_index.json")
      .then((r) => r.json())
      .then((data: { clusters: Record<string, { zone: string }> }) => {
        const idx: Record<string, string[]> = {};
        Object.entries(data.clusters).forEach(([cluster, info]) => {
          if (!idx[info.zone]) idx[info.zone] = [];
          idx[info.zone].push(cluster);
        });
        setZoneClusterIndex(idx);
      })
      .catch(() => {});
  }, []);

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

    customLayerRef.current = L.layerGroup().addTo(map);
    drawPreviewRef.current = L.layerGroup().addTo(map);
    customPolygonLayerRef.current = L.layerGroup().addTo(map);
    schoolLayerGroupRef.current = L.layerGroup().addTo(map);
    healthLayerGroupRef.current = L.layerGroup().addTo(map);

    // ── Boundary layers (zone + cluster) — loaded once, toggled via state ──
    const zoneBoundaryGroup = L.layerGroup();
    const clusterBoundaryGroup = L.layerGroup();
    zoneBoundaryGroupRef.current = zoneBoundaryGroup;
    clusterBoundaryGroupRef.current = clusterBoundaryGroup;

    fetch("/data/zones.geojson").then((r) => r.json()).then((gj) => {
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

    fetch("/data/clusters.geojson").then((r) => r.json()).then((gj) => {
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

    return () => { map.remove(); mapRef.current = null; };
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
          (p, z, c) => onCentreClickRef.current?.(p, z, c)
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
        const isHealth = healthClusterMap[clusterKey] ?? false;
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

  useEffect(() => {
    const c = containerRef.current;
    if (c) c.style.cursor = (addMode || drawMode) ? "crosshair" : "";
  }, [addMode, drawMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = (e: L.LeafletMouseEvent) => { if (addMode) setPendingLatLng(e.latlng); };
    map.on("click", handler);
    return () => { map.off("click", handler); };
  }, [addMode]);

  // Draw mode: add vertex on click, finish on dblclick
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!drawMode) return;

    const clickHandler = (e: L.LeafletMouseEvent) => {
      // Ignore double-click's second click event by checking detail
      setDrawVertices((prev) => [...prev, e.latlng]);
    };
    const dblClickHandler = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      setDrawVertices((prev) => {
        if (prev.length >= 3) {
          setPendingPolygon(prev);
          setDrawMode(false);
          return [];
        }
        return prev;
      });
    };

    map.on("click", clickHandler);
    map.on("dblclick", dblClickHandler);
    map.doubleClickZoom.disable();
    return () => {
      map.off("click", clickHandler);
      map.off("dblclick", dblClickHandler);
      map.doubleClickZoom.enable();
    };
  }, [drawMode]);

  // Render draw preview
  useEffect(() => {
    const group = drawPreviewRef.current;
    if (!group) return;
    group.clearLayers();
    if (drawVertices.length === 0) return;

    // Draw dots for each vertex
    drawVertices.forEach((v) => {
      L.circleMarker(v, { radius: 5, fillColor: "#6366f1", color: "white", weight: 2, fillOpacity: 1 }).addTo(group);
    });

    // Draw preview polygon outline if 3+ vertices
    if (drawVertices.length >= 3) {
      L.polygon(drawVertices, {
        color: "#6366f1",
        weight: 2,
        dashArray: "6 4",
        fillColor: "#6366f1",
        fillOpacity: 0.12,
      }).addTo(group);
    } else if (drawVertices.length >= 2) {
      L.polyline(drawVertices, { color: "#6366f1", weight: 2, dashArray: "6 4" }).addTo(group);
    }
  }, [drawVertices]);

  // Render custom polygons from DB
  useEffect(() => {
    const group = customPolygonLayerRef.current;
    if (!group) return;
    group.clearLayers();

    customPolygons.forEach((feature) => {
      const props = feature.properties;
      const partnerLayer = LAYERS.find((l) => l.key === props.partnerKey);
      const color = partnerLayer?.color ?? "#6366f1";

      // Convert GeoJSON [lng,lat] coordinates to Leaflet [lat,lng]
      const latlngs = feature.geometry.coordinates[0].map(
        (c) => [c[1], c[0]] as [number, number]
      );

      const poly = L.polygon(latlngs, {
        color,
        weight: 2,
        opacity: 0.9,
        fillColor: color,
        fillOpacity: 0.25,
      });

      poly.bindPopup(`
        <div class="map-popup">
          <span class="badge" style="background:${color}">${partnerLayer?.label ?? props.partnerKey}</span>
          <h3>${props.name}</h3>
          ${props.zone || props.cluster ? `<div class="info" style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">
            ${props.zone ? `<span style="background:#e0e7ff;color:#4338ca;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:700">${props.zone}</span>` : ""}
            ${props.cluster ? `<span style="background:#fef3c7;color:#92400e;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:600">${props.cluster.replace(/_/g, " ")}</span>` : ""}
          </div>` : ""}
          ${props.description ? `<div class="info" style="margin-top:6px">${props.description}</div>` : ""}
          <div class="info" style="margin-top:6px;color:#94a3b8;font-size:11px">Custom Settlement</div>
        </div>
      `, { maxWidth: 300 });

      poly.on("mouseover", () => poly.setStyle({ fillOpacity: 0.5, weight: 3 }));
      poly.on("mouseout", () => poly.setStyle({ fillOpacity: 0.25, weight: 2 }));

      // Register in allFeatureLayers for cross-filter support
      allFeatureLayers.current.push({
        leafletLayer: poly,
        props: { zone: props.zone, cluster: props.cluster, name: props.name, layer: "custom_settlements" },
        baseColor: color,
      });

      group.addLayer(poly);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customPolygons]);

  // Toggle custom polygon layer visibility
  useEffect(() => {
    const map = mapRef.current;
    const group = customPolygonLayerRef.current;
    if (!map || !group) return;
    if (visibleLayers.has("custom_settlements")) {
      if (!map.hasLayer(group)) group.addTo(map);
    } else {
      if (map.hasLayer(group)) map.removeLayer(group);
    }
  }, [visibleLayers]);

  useEffect(() => {
    const layer = customLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    customFeatures.forEach((f) => {
      const marker = L.circleMarker([f.lat, f.lng], {
        radius: 9, fillColor: "#f59e0b", color: "white", weight: 2.5, opacity: 1, fillOpacity: 1,
      });
      marker.bindPopup(`
        <div class="map-popup">
          <span class="badge" style="background:#f59e0b">Custom</span>
          <h3>${f.name}</h3>
          ${f.description ? `<div class="info">${f.description}</div>` : ""}
          <div class="info" style="margin-top:6px;color:#94a3b8;font-size:11px">${f.type} · Added ${new Date(f.createdAt).toLocaleDateString("en-IN")}</div>
        </div>
      `);
      layer.addLayer(marker);
    });
  }, [customFeatures]);

  // Types that should open the assessment form after saving
  const ASSESSMENT_TYPES = new Set(["settlement", "children_centre", "youth_centre", "creche", "elderly_centre"]);

  async function registerAndNavigate(name: string, clusterName: string, zone: string) {
    const res = await fetch("/api/map/register-settlement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, clusterName, zone }),
    });
    if (res.ok) {
      const { settlementId } = await res.json();
      if (settlementId) {
        router.push(`/needs/settlement/${settlementId}`);
        return true;
      }
    }
    return false;
  }

  async function handleSave() {
    if (!pendingLatLng || !formData.name.trim()) return;
    setSaving(true);
    try {
      const resolvedType = formData.type === "custom" ? formData.customType.trim() || "other" : formData.type;
      const res = await fetch("/api/map/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name, cluster: formData.cluster, zone: formData.zone,
          partner: formData.partner, description: formData.description,
          type: resolvedType, lat: pendingLatLng.lat, lng: pendingLatLng.lng,
        }),
      });
      if (res.ok) {
        onFeatureAdded();
        // For settlement/centre types, resolve to DB and open assessment form
        if (ASSESSMENT_TYPES.has(resolvedType)) {
          const settlementName = resolvedType === "settlement"
            ? formData.name
            : (formData.settlementName.trim() || formData.name);
          const navigated = await registerAndNavigate(settlementName, formData.cluster, formData.zone);
          if (navigated) return; // router.push will navigate away
        }
        setPendingLatLng(null);
        setFormData({ name: "", settlementName: "", cluster: "", zone: "", partner: "", description: "", type: "settlement", customType: "" });
        setAddMode(false);
      }
    } finally { setSaving(false); }
  }

  async function handlePolySave() {
    if (!pendingPolygon || !polyFormData.name.trim()) return;
    setPolySaving(true);
    try {
      const coordinates = pendingPolygon.map((v) => ({ lat: v.lat, lng: v.lng }));
      const res = await fetch("/api/map/polygons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: polyFormData.name,
          partnerKey: polyFormData.partner || "custom_settlements",
          zone: polyFormData.zone,
          cluster: polyFormData.cluster,
          description: polyFormData.description,
          coordinates,
        }),
      });
      if (res.ok) {
        onFeatureAdded();
        // Polygons are always settlements — register in DB and open assessment
        const navigated = await registerAndNavigate(polyFormData.name, polyFormData.cluster, polyFormData.zone);
        if (navigated) return;
        setPendingPolygon(null);
        setPolyFormData({ name: "", zone: "", cluster: "", partner: "", description: "" });
        drawPreviewRef.current?.clearLayers();
      }
    } finally { setPolySaving(false); }
  }

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

      <div className="absolute bottom-28 sm:bottom-6 left-1/2 -translate-x-1/2 z-10 flex gap-2">
        {!addMode && !drawMode ? (
          <>
            <button
              onClick={() => setAddMode(true)}
              className="bg-white border border-slate-200 shadow-lg px-4 py-2 rounded-full text-sm font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-2"
            >
              <span className="text-base">+</span> Add New Point
            </button>
            <button
              onClick={() => { setDrawMode(true); setDrawVertices([]); }}
              className="bg-white border border-indigo-200 shadow-lg px-4 py-2 rounded-full text-sm font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              Draw Settlement
            </button>
          </>
        ) : addMode ? (
          <div className="bg-amber-50 border border-amber-300 shadow-lg px-4 py-2 rounded-full text-sm font-semibold text-amber-800 flex items-center gap-3">
            <span>Click on map to place point</span>
            <button onClick={() => { setAddMode(false); setPendingLatLng(null); }} className="text-amber-600 hover:text-amber-900">✕ Cancel</button>
          </div>
        ) : drawMode ? (
          <div className="bg-indigo-50 border border-indigo-300 shadow-lg px-4 py-2 rounded-full text-sm font-semibold text-indigo-800 flex items-center gap-3">
            <span>Click to add vertices · Double-click to finish (min 3 points)</span>
            <span className="text-indigo-500 font-bold">{drawVertices.length} pts</span>
            <button onClick={() => { setDrawMode(false); setDrawVertices([]); drawPreviewRef.current?.clearLayers(); }} className="text-indigo-600 hover:text-indigo-900">✕ Cancel</button>
          </div>
        ) : null}
      </div>

      {pendingLatLng && (
        <div className="absolute top-16 left-3 right-3 sm:top-4 sm:right-4 sm:left-auto sm:w-80 z-20 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-800">Add New Point</span>
            <span className="text-xs text-slate-400">{pendingLatLng.lat.toFixed(4)}, {pendingLatLng.lng.toFixed(4)}</span>
          </div>
          <div className="p-5 space-y-3 overflow-y-auto max-h-[70vh]">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Settlement Name *</label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Mattikere Slum"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Zone</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={formData.zone}
                onChange={(e) => setFormData((f) => ({ ...f, zone: e.target.value, cluster: "" }))}
              >
                <option value="">— Select zone —</option>
                {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Cluster</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={formData.cluster}
                onChange={(e) => setFormData((f) => ({ ...f, cluster: e.target.value }))}
                disabled={!formData.zone}
              >
                <option value="">— Select cluster —</option>
                {(zoneClusterIndex[formData.zone] ?? []).sort().map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Partner NGO</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={formData.partner}
                onChange={(e) => setFormData((f) => ({ ...f, partner: e.target.value }))}
              >
                <option value="">— Select partner —</option>
                {partnerOptions.map((l) => (
                  <option key={l.key} value={l.key}>{l.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Type</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={formData.type}
                onChange={(e) => setFormData((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="settlement">Settlement</option>
                <option value="community_resource_centre">Community Resource Centre</option>
                <option value="children_centre">Children Centre</option>
                <option value="youth_centre">Youth Centre</option>
                <option value="creche">Creche</option>
                <option value="elderly_centre">Elderly Centre</option>
                <option value="fdp_point">FDP Point</option>
                <option value="kitchen">Kitchen</option>
                <option value="custom">Custom…</option>
              </select>
            </div>
            {formData.type === "custom" && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Custom Type</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={formData.customType}
                  onChange={(e) => setFormData((f) => ({ ...f, customType: e.target.value }))}
                  placeholder="Describe the type…"
                  autoFocus
                />
              </div>
            )}
            {ASSESSMENT_TYPES.has(formData.type) && formData.type !== "settlement" && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Settlement (for assessment) *</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={formData.settlementName}
                  onChange={(e) => setFormData((f) => ({ ...f, settlementName: e.target.value }))}
                  placeholder="Which settlement is this centre in?"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Used to link this centre to the right assessment form</p>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                placeholder="Address, households, observations…"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={!formData.name.trim() || saving}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50 hover:bg-indigo-700 transition-colors"
              >
                {saving ? "Saving…" : ASSESSMENT_TYPES.has(formData.type === "custom" ? formData.customType || "other" : formData.type) ? "Save & Open Assessment →" : "Save Point"}
              </button>
              <button
                onClick={() => setPendingLatLng(null)}
                className="flex-1 border border-slate-200 rounded-lg py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draw Settlement form panel */}
      {pendingPolygon && (
        <div className="absolute top-16 left-3 right-3 sm:top-4 sm:right-4 sm:left-auto sm:w-80 z-20 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-indigo-50 flex items-center justify-between">
            <span className="text-sm font-bold text-indigo-800">New Settlement Polygon</span>
            <span className="text-xs text-indigo-500">{pendingPolygon.length} vertices</span>
          </div>
          <div className="p-5 space-y-3 overflow-y-auto max-h-[70vh]">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Settlement Name *</label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={polyFormData.name}
                onChange={(e) => setPolyFormData((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Mattikere Slum"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Zone</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={polyFormData.zone}
                onChange={(e) => setPolyFormData((f) => ({ ...f, zone: e.target.value, cluster: "" }))}
              >
                <option value="">— Select zone —</option>
                {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Cluster</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={polyFormData.cluster}
                onChange={(e) => setPolyFormData((f) => ({ ...f, cluster: e.target.value }))}
                disabled={!polyFormData.zone}
              >
                <option value="">— Select cluster —</option>
                {(zoneClusterIndex[polyFormData.zone] ?? []).sort().map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Partner NGO</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={polyFormData.partner}
                onChange={(e) => setPolyFormData((f) => ({ ...f, partner: e.target.value }))}
              >
                <option value="">— Select partner —</option>
                {partnerOptions.map((l) => (
                  <option key={l.key} value={l.key}>{l.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                rows={2}
                value={polyFormData.description}
                onChange={(e) => setPolyFormData((f) => ({ ...f, description: e.target.value }))}
                placeholder="Address, households, observations…"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handlePolySave}
                disabled={!polyFormData.name.trim() || polySaving}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50 hover:bg-indigo-700 transition-colors"
              >
                {polySaving ? "Saving…" : "Save & Open Assessment →"}
              </button>
              <button
                onClick={() => { setPendingPolygon(null); drawPreviewRef.current?.clearLayers(); }}
                className="flex-1 border border-slate-200 rounded-lg py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
