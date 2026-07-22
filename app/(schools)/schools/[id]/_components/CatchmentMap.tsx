"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Settlement = {
  id: string;
  name: string;
  geoLat: number;
  geoLng: number;
  distanceMeters: number | null;
  walkMinutes: number | null;
  children3to14: number | null;
};

// Approximate a circle around a lat/lng at a given radius (metres) as a
// GeoJSON Polygon of 64 vertices. Good enough for a small catchment display;
// no dependency on Turf.
function buildCircle(lat: number, lng: number, radiusM: number, steps = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  const earthRadiusM = 6_378_137;
  const dLat = (radiusM / earthRadiusM) * (180 / Math.PI);
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    coords.push([lng + dLng * Math.cos(theta), lat + dLat * Math.sin(theta)]);
  }
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [coords] },
    properties: {},
  };
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
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap © CARTO",
    },
  },
  layers: [{ id: "carto", type: "raster", source: "carto-source" }],
};

export default function CatchmentMap({
  schoolLat, schoolLng, schoolName, settlements, walkRadiusMeters = 750,
}: {
  schoolLat: number; schoolLng: number; schoolName: string;
  settlements: Settlement[];
  walkRadiusMeters?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: [schoolLng, schoolLat],
      zoom: 14,
    });

    map.on("load", () => {
      // Walking-radius buffer (client-side circle approximation).
      map.addSource("buffer", { type: "geojson", data: buildCircle(schoolLat, schoolLng, walkRadiusMeters) });
      map.addLayer({ id: "buffer-fill", type: "fill",   source: "buffer", paint: { "fill-color": "#6366f1", "fill-opacity": 0.1 } });
      map.addLayer({ id: "buffer-line", type: "line",   source: "buffer", paint: { "line-color": "#6366f1", "line-width": 1.5, "line-dasharray": [2, 2] } });

      // Settlements.
      map.addSource("settlements", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: settlements
            .filter((s) => s.geoLat != null && s.geoLng != null)
            .map((s) => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [s.geoLng, s.geoLat] },
              properties: {
                id: s.id,
                name: s.name,
                distance: s.distanceMeters,
                walk: s.walkMinutes,
                kids: s.children3to14,
              },
            })),
        },
      });
      map.addLayer({
        id: "settlements-c",
        type: "circle",
        source: "settlements",
        paint: {
          "circle-radius": 5,
          "circle-color": "#3b82f6",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });

      // School marker (larger red dot).
      map.addSource("school", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "Point", coordinates: [schoolLng, schoolLat] },
          properties: { name: schoolName },
        },
      });
      map.addLayer({
        id: "school-c",
        type: "circle",
        source: "school",
        paint: {
          "circle-radius": 8,
          "circle-color": "#dc2626",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.5,
        },
      });

      map.on("click", "settlements-c", (e) => {
        const p = e.features?.[0]?.properties;
        if (!p) return;
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-size:12px"><b>${escapeHtml(String(p.name))}</b>` +
            (p.distance ? `<br/>${p.distance} m` : "") +
            (p.walk ? ` · ${p.walk} min walk` : "") +
            (p.kids ? `<br/>${p.kids} children (3–14)` : "") +
            `</div>`,
          )
          .addTo(map);
      });
      map.on("mouseenter", "settlements-c", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "settlements-c", () => { map.getCanvas().style.cursor = ""; });
    });

    return () => { map.remove(); };
  }, [schoolLat, schoolLng, schoolName, settlements, walkRadiusMeters]);

  return <div ref={containerRef} className="w-full h-80 rounded-lg border border-stone-200" />;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
