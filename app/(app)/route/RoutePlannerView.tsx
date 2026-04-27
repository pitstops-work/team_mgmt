"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ChevronUp, ChevronDown, X, Navigation, Shuffle, MapPin } from "lucide-react";
import type { SettlementStop } from "./page";

const HEALTH_COLORS = { red: "#ef4444", amber: "#f59e0b", green: "#10b981", grey: "#94a3b8" };

const TILE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
  sources: {
    "carto": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [{ id: "carto-layer", type: "raster", source: "carto" }],
};

function nearestNeighbor(stops: SettlementStop[]): SettlementStop[] {
  if (stops.length <= 2) return [...stops];
  const remaining = [...stops];
  const result = [remaining.splice(0, 1)[0]];
  while (remaining.length > 0) {
    const last = result[result.length - 1];
    let minDist = Infinity, minIdx = 0;
    remaining.forEach((s, i) => {
      const d =
        Math.pow(s.lat - last.lat, 2) + Math.pow(s.lng - last.lng, 2);
      if (d < minDist) { minDist = d; minIdx = i; }
    });
    result.push(remaining.splice(minIdx, 1)[0]);
  }
  return result;
}

function buildGoogleMapsUrl(route: SettlementStop[]): string {
  if (route.length === 0) return "";
  const stops = route.map((s) => `${s.lat},${s.lng}`).join("/");
  return `https://www.google.com/maps/dir/${stops}`;
}

interface Props {
  stops: SettlementStop[];
}

export default function RoutePlannerView({ stops }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [route, setRoute] = useState<SettlementStop[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const routeRef = useRef<SettlementStop[]>([]);

  useEffect(() => { routeRef.current = route; }, [route]);

  // ── Map initialization ────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    // Compute center from all stops
    const lats = stops.map((s) => s.lat);
    const lngs = stops.map((s) => s.lng);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: TILE_STYLE,
      center: stops.length ? [centerLng, centerLat] : [77.5946, 12.9716],
      zoom: 11,
    });

    mapRef.current = map;

    map.on("load", () => {
      if (mapRef.current !== map) return; // map was removed before style finished loading

      // ── All settlements: health-colored circles ──────────────────────────
      const features: GeoJSON.Feature[] = stops.map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lng, s.lat] },
        properties: {
          id: s.id,
          name: s.name,
          health: s.health,
          color: HEALTH_COLORS[s.health],
          routeOrder: 0,
        },
      }));

      map.addSource("settlements", {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      });

      // Outer ring (white) for visibility
      map.addLayer({
        id: "settlements-ring",
        type: "circle",
        source: "settlements",
        paint: {
          "circle-radius": ["case", ["==", ["get", "routeOrder"], 0], 10, 13],
          "circle-color": "white",
          "circle-opacity": 0.9,
        },
      });

      // Colored fill
      map.addLayer({
        id: "settlements-fill",
        type: "circle",
        source: "settlements",
        paint: {
          "circle-radius": ["case", ["==", ["get", "routeOrder"], 0], 7, 10],
          "circle-color": ["get", "color"],
          "circle-stroke-width": ["case", ["==", ["get", "routeOrder"], 0], 0, 2.5],
          "circle-stroke-color": "#1e293b",
        },
      });

      // Route number labels (only for selected stops)
      map.addLayer({
        id: "settlements-label",
        type: "symbol",
        source: "settlements",
        filter: [">", ["get", "routeOrder"], 0],
        layout: {
          "text-field": ["to-string", ["get", "routeOrder"]],
          "text-size": 11,
          "text-font": ["Open Sans Bold", "Arial Unicode MS Regular"],
          "text-allow-overlap": true,
          "icon-allow-overlap": true,
        },
        paint: {
          "text-color": "white",
          "text-halo-color": "#1e293b",
          "text-halo-width": 1,
        },
      });

      // Route polyline
      map.addSource("route-line", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "route-line-layer",
        type: "line",
        source: "route-line",
        paint: {
          "line-color": "#6366f1",
          "line-width": 2.5,
          "line-opacity": 0.7,
          "line-dasharray": [4, 3],
        },
      });

      // Click to toggle stops
      map.on("click", "settlements-fill", (e) => {
        if (!e.features?.length) return;
        const props = e.features[0].properties ?? {};
        const id = props.id as string;
        const stop = stops.find((s) => s.id === id);
        if (!stop) return;

        const current = routeRef.current;
        const existing = current.findIndex((s) => s.id === id);
        const next = existing >= 0
          ? current.filter((s) => s.id !== id)
          : [...current, stop];

        setRoute(next);
        updateMapRoute(map, stops, next);
        if (next.length > 0) setPanelOpen(true);
      });

      map.on("mouseenter", "settlements-fill", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "settlements-fill", () => { map.getCanvas().style.cursor = ""; });

      // Popup on hover (name)
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: "maplibre-popup-clean" });
      map.on("mouseenter", "settlements-fill", (e) => {
        if (!e.features?.length) return;
        const props = e.features[0].properties ?? {};
        popup.setLngLat(e.lngLat).setHTML(`<div class="map-popup" style="padding:8px 10px"><p style="margin:0;font-size:12px;font-weight:700;color:#1e293b">${props.name}</p></div>`).addTo(map);
      });
      map.on("mouseleave", "settlements-fill", () => popup.remove());
    });

    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateMapRoute(map: maplibregl.Map, allStops: SettlementStop[], currentRoute: SettlementStop[]) {
    const routeIds = new Set(currentRoute.map((s) => s.id));
    const routeOrderMap = new Map(currentRoute.map((s, i) => [s.id, i + 1]));

    const features: GeoJSON.Feature[] = allStops.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
      properties: {
        id: s.id,
        name: s.name,
        health: s.health,
        color: routeIds.has(s.id) ? "#6366f1" : HEALTH_COLORS[s.health],
        routeOrder: routeOrderMap.get(s.id) ?? 0,
      },
    }));

    (map.getSource("settlements") as maplibregl.GeoJSONSource)?.setData({ type: "FeatureCollection", features });

    // Route polyline
    const lineCoords = currentRoute.map((s) => [s.lng, s.lat]);
    (map.getSource("route-line") as maplibregl.GeoJSONSource)?.setData({
      type: "FeatureCollection",
      features: lineCoords.length >= 2 ? [{
        type: "Feature",
        geometry: { type: "LineString", coordinates: lineCoords },
        properties: {},
      }] : [],
    });
  }

  const removeStop = useCallback((id: string) => {
    setRoute((prev) => {
      const next = prev.filter((s) => s.id !== id);
      const map = mapRef.current;
      if (map) updateMapRoute(map, stops, next);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops]);

  const clearRoute = useCallback(() => {
    setRoute([]);
    const map = mapRef.current;
    if (map) updateMapRoute(map, stops, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops]);

  const optimizeRoute = useCallback(() => {
    if (route.length < 2) return;
    const optimized = nearestNeighbor(route);
    setRoute(optimized);
    const map = mapRef.current;
    if (map) updateMapRoute(map, stops, optimized);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, stops]);

  const HEALTH_LABELS = { red: "Overdue", amber: "Due soon", green: "On track", grey: "No goals" };
  const HEALTH_DOT = { red: "bg-red-500", amber: "bg-amber-400", green: "bg-emerald-500", grey: "bg-slate-300" };

  const mapsUrl = buildGoogleMapsUrl(route);

  return (
    <div className="relative w-full h-full flex flex-col">

      {/* Map */}
      <div ref={containerRef} className="flex-1 w-full" />

      {/* Legend overlay */}
      <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-sm rounded-xl border border-slate-200 shadow-lg px-3 py-2.5">
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">Pitstop health</p>
        <div className="space-y-1">
          {(["red", "amber", "green", "grey"] as const).map((h) => (
            <div key={h} className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${HEALTH_DOT[h]}`} />
              <span className="text-[10px] text-slate-600">{HEALTH_LABELS[h]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tap hint */}
      {route.length === 0 && (
        <div className="absolute top-3 right-3 z-10 bg-indigo-50 border border-indigo-200 rounded-xl shadow px-3 py-2">
          <p className="text-[11px] font-semibold text-indigo-700 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            Tap settlements to build route
          </p>
        </div>
      )}

      {/* Bottom panel */}
      <div
        className={[
          "absolute left-0 right-0 bottom-16 sm:bottom-0 z-20 bg-white border-t border-slate-200 shadow-2xl rounded-t-2xl transition-all duration-300",
          panelOpen && route.length > 0 ? "max-h-80" : "h-12",
        ].join(" ")}
      >
        {/* Handle row */}
        <button
          className="w-full flex items-center justify-between px-4 h-12 text-sm font-semibold text-slate-700"
          onClick={() => route.length > 0 && setPanelOpen((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-indigo-500" />
            {route.length === 0
              ? "No stops selected"
              : `${route.length} stop${route.length === 1 ? "" : "s"} selected`}
          </span>
          <span className="flex items-center gap-2">
            {route.length > 0 && (
              <span className="text-xs font-normal text-slate-500 mr-1">
                {route.length} km est.
              </span>
            )}
            {route.length > 0 && (panelOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />)}
          </span>
        </button>

        {/* Expanded content */}
        {panelOpen && route.length > 0 && (
          <div className="px-4 pb-4 flex flex-col gap-3 max-h-[calc(80vh-3rem)] overflow-y-auto">
            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={optimizeRoute}
                disabled={route.length < 2}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors flex-1 justify-center"
              >
                <Shuffle className="w-3.5 h-3.5" />
                Optimize order
              </button>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors flex-1 justify-center"
              >
                <Navigation className="w-3.5 h-3.5" />
                Open in Maps
              </a>
              <button
                onClick={clearRoute}
                className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Clear
              </button>
            </div>

            {/* Stop list */}
            <ol className="space-y-1.5">
              {route.map((stop, i) => (
                <li key={stop.id} className="flex items-center gap-2 group">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${HEALTH_DOT[stop.health]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{stop.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{stop.clusterName.replace(/_/g, " ")} · {stop.zoneName}</p>
                  </div>
                  <button
                    onClick={() => removeStop(stop.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
