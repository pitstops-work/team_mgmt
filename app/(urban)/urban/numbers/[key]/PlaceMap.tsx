"use client";
// The Programme screen's map: one circle per row (a place's centroid, averaged
// from the settlements under it). Size = the row's weight (need remaining, or
// eligible households); colour = its tone. Click → drill into that place.
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type MapPoint = { id: string; name: string; lat: number; lng: number; weight: number; tone: "red" | "amber" | "green" | "grey"; label: string; drill: boolean };

// CARTO needs a key (key-less tiles come back watermarked); without one, use OSM.
const CARTO_API_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY ?? "";
const TILES = CARTO_API_KEY
  ? ["a", "b", "c", "d"].map((s) => `https://${s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png?key=${CARTO_API_KEY}`)
  : ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"];

const TONE: Record<MapPoint["tone"], string> = { red: "#dc2626", amber: "#d97706", green: "#059669", grey: "#a8a29e" };

export default function PlaceMap({ points, hrefBase }: { points: MapPoint[]; hrefBase: string }) {
  const el = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const key = points.map((p) => `${p.id}:${p.weight}:${p.tone}`).join("|");

  useEffect(() => {
    if (!el.current || !points.length) return;
    const map = new maplibregl.Map({
      container: el.current,
      style: {
        version: 8,
        sources: { base: { type: "raster", tiles: TILES, tileSize: 256, attribution: CARTO_API_KEY ? "© OpenStreetMap contributors © CARTO" : "© OpenStreetMap contributors" } },
        layers: [{ id: "base", type: "raster", source: "base" }],
      },
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const max = Math.max(1, ...points.map((p) => p.weight));
    const data: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: points.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: { id: p.id, name: p.name, label: p.label, drill: p.drill, r: 5 + 17 * Math.sqrt(p.weight / max), color: TONE[p.tone] },
      })),
    };
    const bounds = new maplibregl.LngLatBounds();
    points.forEach((p) => bounds.extend([p.lng, p.lat]));

    map.on("load", () => {
      map.addSource("pts", { type: "geojson", data });
      map.addLayer({
        id: "pts", type: "circle", source: "pts",
        paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "color"], "circle-opacity": 0.55, "circle-stroke-color": ["get", "color"], "circle-stroke-width": 1.5 },
      });
      map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 0 });
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
      map.on("mousemove", "pts", (ev) => {
        const f = ev.features?.[0];
        if (!f) return;
        map.getCanvas().style.cursor = f.properties.drill ? "pointer" : "";
        const div = document.createElement("div");
        div.className = "text-xs";
        const b = document.createElement("div"); b.className = "font-medium"; b.textContent = String(f.properties.name);
        const l = document.createElement("div"); l.className = "text-stone-500"; l.textContent = String(f.properties.label);
        div.append(b, l);
        popup.setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]).setDOMContent(div).addTo(map);
      });
      map.on("mouseleave", "pts", () => { map.getCanvas().style.cursor = ""; popup.remove(); });
      map.on("click", "pts", (ev) => {
        const f = ev.features?.[0];
        if (f?.properties.drill) router.push(`${hrefBase}?place=${encodeURIComponent(String(f.properties.id))}`);
      });
    });
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hrefBase]);

  if (!points.length) return <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white text-sm text-stone-400">No coordinates for these places yet.</div>;
  return <div ref={el} className="h-72 w-full overflow-hidden rounded-xl border border-stone-200 sm:h-96" />;
}
