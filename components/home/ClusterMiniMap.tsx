"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type SettlementGeo = {
  id: string;
  name: string;
  polygon: unknown | null;
  centroidLat: number | null;
  centroidLng: number | null;
};
type Facility = {
  id: string;
  name: string;
  layerKey: string;
  lat: number;
  lng: number;
};

type Props = {
  clusterId: string;
  clusterGeometry: unknown | null;
  settlements: SettlementGeo[];
  facilities: Facility[];
  highlightedSettlementIds: Set<string>;
  highlightedFacilityIds: Set<string>;
  facilityColors: Record<string, string>;
  selectedSettlementId: string | null;
  selectedFacilityId: string | null;
  onSettlementTap: (id: string) => void;
  onFacilityTap: (id: string) => void;
  onClear: () => void;
};

const SETTLEMENT_FILL = "settlements-fill";
const SETTLEMENT_LINE = "settlements-line";
const SETTLEMENT_CENTROID = "settlements-centroid";
const FACILITY_LAYER = "facilities-circle";
const CLUSTER_FILL = "cluster-fill";
const CLUSTER_LINE = "cluster-line";

export default function ClusterMiniMap({
  clusterId,
  clusterGeometry,
  settlements,
  facilities,
  highlightedSettlementIds,
  highlightedFacilityIds,
  facilityColors,
  selectedSettlementId,
  selectedFacilityId,
  onSettlementTap,
  onFacilityTap,
  onClear,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Keep latest callbacks in refs so the map listeners don't need re-binding.
  const tapHandlersRef = useRef({ onSettlementTap, onFacilityTap, onClear });
  useEffect(() => {
    tapHandlersRef.current = { onSettlementTap, onFacilityTap, onClear };
  }, [onSettlementTap, onFacilityTap, onClear]);

  const settlementFeatures = useMemo(
    () =>
      settlements
        .filter(s => s.polygon)
        .map<GeoJSON.Feature>(s => ({
          type: "Feature",
          geometry: s.polygon as GeoJSON.Geometry,
          properties: { id: s.id, name: s.name },
        })),
    [settlements]
  );
  const centroidFeatures = useMemo(
    () =>
      settlements
        .filter(s => !s.polygon && s.centroidLat != null && s.centroidLng != null)
        .map<GeoJSON.Feature>(s => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [s.centroidLng!, s.centroidLat!] },
          properties: { id: s.id, name: s.name },
        })),
    [settlements]
  );

  // Initialize the map once per cluster. Cluster geometry is immutable for the
  // lifetime of a mounted card, so we don't need to react to geometry changes.
  useEffect(() => {
    if (!containerRef.current) return;
    const bounds = computeBounds(clusterGeometry, settlements);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      bounds,
      fitBoundsOptions: { padding: 24, duration: 0 },
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      if (clusterGeometry) {
        map.addSource("cluster", {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: clusterGeometry as GeoJSON.Geometry,
            properties: {},
          },
        });
        map.addLayer({
          id: CLUSTER_FILL,
          type: "fill",
          source: "cluster",
          paint: { "fill-color": "#475569", "fill-opacity": 0.04 },
        });
        map.addLayer({
          id: CLUSTER_LINE,
          type: "line",
          source: "cluster",
          paint: { "line-color": "#334155", "line-width": 2, "line-dasharray": [2, 2] },
        });
      }

      map.addSource("settlements", {
        type: "geojson",
        data: { type: "FeatureCollection", features: settlementFeatures },
      });
      map.addLayer({
        id: SETTLEMENT_FILL,
        type: "fill",
        source: "settlements",
        paint: {
          "fill-color": settlementFillColor(highlightedSettlementIds, selectedSettlementId),
          "fill-opacity": settlementFillOpacity(highlightedSettlementIds, selectedSettlementId),
        },
      });
      map.addLayer({
        id: SETTLEMENT_LINE,
        type: "line",
        source: "settlements",
        paint: {
          "line-color": settlementLineColor(selectedSettlementId),
          "line-width": settlementLineWidth(selectedSettlementId),
        },
      });

      map.addSource("settlement-centroids", {
        type: "geojson",
        data: { type: "FeatureCollection", features: centroidFeatures },
      });
      map.addLayer({
        id: SETTLEMENT_CENTROID,
        type: "circle",
        source: "settlement-centroids",
        paint: {
          "circle-radius": 4,
          "circle-color": "#a8a29e",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
          "circle-opacity": 0.65,
        },
      });

      map.addSource("facilities", {
        type: "geojson",
        data: buildFacilityFC(facilities, facilityColors, highlightedFacilityIds, selectedFacilityId),
      });
      map.addLayer({
        id: FACILITY_LAYER,
        type: "circle",
        source: "facilities",
        paint: {
          "circle-radius": [
            "case",
            ["==", ["get", "selected"], 1], 9,
            ["==", ["get", "highlighted"], 1], 7,
            5,
          ],
          "circle-color": ["get", "color"],
          "circle-opacity": [
            "case",
            ["==", ["get", "selected"], 1], 1,
            ["==", ["get", "highlighted"], 1], 0.95,
            0.35,
          ],
          "circle-stroke-color": [
            "case",
            ["==", ["get", "selected"], 1], "#0284c7",
            "#ffffff",
          ],
          "circle-stroke-width": [
            "case",
            ["==", ["get", "selected"], 1], 2.5,
            1,
          ],
        },
      });

      const settlementClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const f = e.features?.[0];
        if (f?.properties?.id) tapHandlersRef.current.onSettlementTap(String(f.properties.id));
      };
      const facilityClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const f = e.features?.[0];
        if (f?.properties?.id) tapHandlersRef.current.onFacilityTap(String(f.properties.id));
      };
      map.on("click", SETTLEMENT_FILL, settlementClick);
      map.on("click", SETTLEMENT_CENTROID, settlementClick);
      map.on("click", FACILITY_LAYER, facilityClick);
      map.on("click", e => {
        const hits = map.queryRenderedFeatures(e.point, {
          layers: [SETTLEMENT_FILL, SETTLEMENT_CENTROID, FACILITY_LAYER],
        });
        if (hits.length === 0) tapHandlersRef.current.onClear();
      });

      const setPointer = () => { map.getCanvas().style.cursor = "pointer"; };
      const resetCursor = () => { map.getCanvas().style.cursor = ""; };
      for (const layer of [SETTLEMENT_FILL, SETTLEMENT_CENTROID, FACILITY_LAYER]) {
        map.on("mouseenter", layer, setPointer);
        map.on("mouseleave", layer, resetCursor);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId]);

  // Update settlement paint + facility source data when selection or highlight changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer(SETTLEMENT_FILL)) {
        map.setPaintProperty(SETTLEMENT_FILL, "fill-color", settlementFillColor(highlightedSettlementIds, selectedSettlementId));
        map.setPaintProperty(SETTLEMENT_FILL, "fill-opacity", settlementFillOpacity(highlightedSettlementIds, selectedSettlementId));
      }
      if (map.getLayer(SETTLEMENT_LINE)) {
        map.setPaintProperty(SETTLEMENT_LINE, "line-color", settlementLineColor(selectedSettlementId));
        map.setPaintProperty(SETTLEMENT_LINE, "line-width", settlementLineWidth(selectedSettlementId));
      }
      const src = map.getSource("facilities") as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(buildFacilityFC(facilities, facilityColors, highlightedFacilityIds, selectedFacilityId));
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [highlightedSettlementIds, highlightedFacilityIds, selectedSettlementId, selectedFacilityId, facilities, facilityColors]);

  return <div ref={containerRef} className="w-full h-full" />;
}

const BASEMAP_STYLE: maplibregl.StyleSpecification = {
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
      attribution: "© OpenStreetMap © CARTO",
    },
  },
  layers: [{ id: "carto-layer", type: "raster", source: "carto-source" }],
};

function buildFacilityFC(
  facilities: Facility[],
  colors: Record<string, string>,
  highlighted: Set<string>,
  selectedId: string | null,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: facilities.map(f => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [f.lng, f.lat] },
      properties: {
        id: f.id,
        name: f.name,
        layerKey: f.layerKey,
        color: colors[f.layerKey] ?? "#6366f1",
        highlighted: highlighted.has(f.id) ? 1 : 0,
        selected: selectedId === f.id ? 1 : 0,
      },
    })),
  };
}

function settlementFillColor(highlighted: Set<string>, selectedId: string | null): maplibregl.DataDrivenPropertyValueSpecification<string> {
  return [
    "case",
    ["==", ["get", "id"], selectedId ?? ""], "#0ea5e9",
    ["in", ["get", "id"], ["literal", Array.from(highlighted)]], "#f59e0b",
    "#a8a29e",
  ] as unknown as maplibregl.DataDrivenPropertyValueSpecification<string>;
}
function settlementFillOpacity(highlighted: Set<string>, selectedId: string | null): maplibregl.DataDrivenPropertyValueSpecification<number> {
  return [
    "case",
    ["==", ["get", "id"], selectedId ?? ""], 0.5,
    ["in", ["get", "id"], ["literal", Array.from(highlighted)]], 0.35,
    0.1,
  ] as unknown as maplibregl.DataDrivenPropertyValueSpecification<number>;
}
function settlementLineColor(selectedId: string | null): maplibregl.DataDrivenPropertyValueSpecification<string> {
  return [
    "case",
    ["==", ["get", "id"], selectedId ?? ""], "#0284c7",
    "#78716c",
  ] as unknown as maplibregl.DataDrivenPropertyValueSpecification<string>;
}
function settlementLineWidth(selectedId: string | null): maplibregl.DataDrivenPropertyValueSpecification<number> {
  return [
    "case",
    ["==", ["get", "id"], selectedId ?? ""], 2.5,
    0.75,
  ] as unknown as maplibregl.DataDrivenPropertyValueSpecification<number>;
}

function computeBounds(geometry: unknown | null, settlements: SettlementGeo[]): maplibregl.LngLatBoundsLike {
  const pts: [number, number][] = [];
  if (geometry) collectCoords(geometry as GeoJSON.Geometry, pts);
  for (const s of settlements) {
    if (s.polygon) collectCoords(s.polygon as GeoJSON.Geometry, pts);
    else if (s.centroidLng != null && s.centroidLat != null) pts.push([s.centroidLng, s.centroidLat]);
  }
  if (pts.length === 0) {
    // Bangalore fallback
    return [[77.45, 12.85], [77.75, 13.10]];
  }
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of pts) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  if (minLng === maxLng || minLat === maxLat) {
    const pad = 0.01;
    return [[minLng - pad, minLat - pad], [maxLng + pad, maxLat + pad]];
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

function collectCoords(geom: GeoJSON.Geometry, out: [number, number][]) {
  if (geom.type === "Polygon") {
    for (const ring of geom.coordinates) for (const c of ring) out.push([c[0] as number, c[1] as number]);
  } else if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) for (const ring of poly) for (const c of ring) out.push([c[0] as number, c[1] as number]);
  } else if (geom.type === "Point") {
    out.push([geom.coordinates[0] as number, geom.coordinates[1] as number]);
  } else if (geom.type === "GeometryCollection") {
    for (const g of geom.geometries) collectCoords(g, out);
  }
}
