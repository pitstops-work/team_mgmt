"use client";

import { useEffect, useState } from "react";
import { LAYERS, type LayerKey } from "./layers";

export interface GeoFeature {
  type: "Feature";
  geometry: {
    type: string;
    coordinates: number[] | number[][] | number[][][];
  };
  properties: {
    name: string;
    description?: string;
    zone?: string;
    cluster?: string;
    layer?: string;
    partner?: string;
    centre_type?: string;
    matched_settlement?: string;
    note?: string;
    [key: string]: unknown;
  };
}

export interface GeoData {
  settlements: Partial<Record<LayerKey, GeoFeature[]>>;
  centres: {
    resource: GeoFeature[];
    children: GeoFeature[];
    youth: GeoFeature[];
    creches: GeoFeature[];
  };
}

function centroidOf(feature: GeoFeature): [number, number] {
  const { type, coordinates } = feature.geometry;
  if (type === "Point") {
    const c = coordinates as number[];
    return [c[1], c[0]];
  }
  if (type === "Polygon") {
    const ring = (coordinates as number[][][])[0];
    const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    const lng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
    return [lat, lng];
  }
  if (type === "MultiPolygon") {
    const ring = ((coordinates as unknown) as number[][][][])[0][0];
    const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    const lng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
    return [lat, lng];
  }
  return [12.9716, 77.5946];
}

export { centroidOf };

const POLYGON_KEYS: LayerKey[] = LAYERS
  .filter(l => l.type === "polygon" && l.key !== "custom_settlements" && l.file !== "")
  .map(l => l.key);

export function useGeoData(): GeoData | null {
  const [data, setData] = useState<GeoData | null>(null);

  useEffect(() => {
    async function load() {
      const settlements: Partial<Record<LayerKey, GeoFeature[]>> = {};

      await Promise.all(
        POLYGON_KEYS.map(async (key) => {
          const layer = LAYERS.find((l) => l.key === key);
          if (!layer?.file) return;
          const r = await fetch(layer.file);
          const gj = await r.json();
          settlements[key] = gj.features ?? [];
        })
      );

      const centreKeys = [
        { key: "resource" as const,  layerKey: "resource_centres" },
        { key: "children" as const,  layerKey: "children_centres" },
        { key: "youth" as const,     layerKey: "youth_centres" },
        { key: "creches" as const,   layerKey: "creches" },
      ];

      const centreResults = await Promise.all(
        centreKeys.map(async ({ layerKey }) => {
          const r = await fetch(`/api/map/geojson/layer-features?layerKey=${layerKey}`);
          const gj = await r.json();
          return (gj.features ?? []) as GeoFeature[];
        })
      );

      setData({
        settlements,
        centres: {
          resource: centreResults[0],
          children: centreResults[1],
          youth:    centreResults[2],
          creches:  centreResults[3],
        },
      });
    }

    load();
  }, []);

  return data;
}

// Build a flat search index from GeoData
export interface SearchResult {
  label: string;
  sublabel: string;
  layerKey: LayerKey;
  centroid: [number, number];
  type: "polygon" | "point";
  feature: GeoFeature;
}

export function buildSearchIndex(data: GeoData): SearchResult[] {
  const results: SearchResult[] = [];

  POLYGON_KEYS.forEach((key) => {
    const features = data.settlements[key] ?? [];
    const layer = LAYERS.find((l) => l.key === key);
    features.forEach((f) => {
      const name = f.properties.name || "";
      if (!name) return;
      const parts = [
        layer?.label,
        f.properties.zone,
        f.properties.cluster?.replace(/_/g, " "),
      ].filter(Boolean);
      results.push({
        label: name,
        sublabel: parts.join(" · "),
        layerKey: key,
        centroid: centroidOf(f),
        type: "polygon",
        feature: f,
      });
    });
  });

  const centreEntries: Array<[keyof typeof data.centres, LayerKey, string]> = [
    ["resource", "resource_centres", "Resource Centre"],
    ["children", "children_centres", "Children Centre"],
    ["youth", "youth_centres", "Youth Centre"],
    ["creches", "creches", "Creche"],
  ];
  centreEntries.forEach(([centreKey, layerKey, label]) => {
    data.centres[centreKey].forEach((f) => {
      const name = f.properties.name || "";
      if (!name) return;
      const parts = [
        label,
        f.properties.partner,
        f.properties.zone,
      ].filter(Boolean);
      results.push({
        label: name,
        sublabel: parts.join(" · "),
        layerKey,
        centroid: centroidOf(f),
        type: "point",
        feature: f,
      });
    });
  });

  return results;
}
