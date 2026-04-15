export type LayerKey =
  | "sangama"
  | "gubbachi"
  | "cfar"
  | "actionaid"
  | "janasha"
  | "thamate"
  | "maarga"
  | "sieds"

  // Chennai partners
  | "arunodhaya"
  | "tndwwt"
  | "dbai"
  | "dbsss"
  | "thozhamai"

  | "resource_centres"
  | "children_centres"
  | "youth_centres"
  | "creches"
  | "custom"
  | "custom_settlements";

export type MapCity = "bangalore" | "chennai";

export interface LayerConfig {
  key: LayerKey;
  label: string;
  file: string;
  color: string;
  type: "polygon" | "point";
  description: string;
  city: MapCity;  // which city this layer belongs to
}

export const LAYERS: LayerConfig[] = [
  // ── Bangalore partners ────────────────────────────────────────────────────
  { key: "sangama",  label: "Sangama",     file: "/data/sangama.geojson",  color: "#6366f1", type: "polygon", city: "bangalore", description: "Sangama partner settlements" },
  { key: "cfar",     label: "CFAR",        file: "/data/cfar.geojson",     color: "#10b981", type: "polygon", city: "bangalore", description: "CFAR partner settlements" },
  { key: "actionaid",label: "ActionAid",   file: "/data/actionaid.geojson",color: "#ef4444", type: "polygon", city: "bangalore", description: "ActionAid partner settlements" },
  { key: "gubbachi", label: "Gubbachi",    file: "/data/gubbachi.geojson", color: "#f59e0b", type: "polygon", city: "bangalore", description: "Gubbachi partner settlements" },
  { key: "sieds",    label: "SIEDS",       file: "/data/sieds.geojson",    color: "#ec4899", type: "polygon", city: "bangalore", description: "SIEDS partner settlements" },
  { key: "janasha",  label: "Janashayog",  file: "/data/janasha.geojson",  color: "#8b5cf6", type: "polygon", city: "bangalore", description: "Janashayog partner settlements" },
  { key: "maarga",   label: "Maarga",      file: "/data/maarga.geojson",   color: "#f97316", type: "polygon", city: "bangalore", description: "Maarga partner settlements" },
  { key: "thamate",  label: "Thamate",     file: "/data/thamate.geojson",  color: "#06b6d4", type: "polygon", city: "bangalore", description: "Thamate partner settlements" },

  // ── Chennai partners ──────────────────────────────────────────────────────
  { key: "arunodhaya", label: "Arunodhaya", file: "/data/arunodhaya.geojson", color: "#0ea5e9", type: "polygon", city: "chennai", description: "Arunodhaya partner settlements — Chennai" },
  { key: "tndwwt",     label: "TNDWWT",     file: "/data/tndwwt.geojson",     color: "#16a34a", type: "polygon", city: "chennai", description: "TNDWWT partner settlements — Chennai" },
  { key: "dbai",       label: "DBAI",       file: "/data/dbai.geojson",       color: "#b45309", type: "polygon", city: "chennai", description: "DBAI partner settlements — Chennai" },
  { key: "dbsss",      label: "DBSSS",      file: "/data/dbsss.geojson",      color: "#7c3aed", type: "polygon", city: "chennai", description: "DBSSS partner settlements — Chennai" },
  { key: "thozhamai",  label: "Thozhamai",  file: "/data/thozhamai.geojson",  color: "#be123c", type: "polygon", city: "chennai", description: "Thozhamai partner settlements — Chennai" },

  // ── Programme centres (Bangalore) ─────────────────────────────────────────
  { key: "resource_centres",  label: "Resource Centres",  file: "/data/resource_centres.geojson",  color: "#1d4ed8", type: "point", city: "bangalore", description: "Programme resource centres" },
  { key: "children_centres",  label: "Children Centres",  file: "/data/children_centres.geojson",  color: "#f97316", type: "point", city: "bangalore", description: "Children programme centres" },
  { key: "youth_centres",     label: "Youth Centres",     file: "/data/youth_centres.geojson",     color: "#8b5cf6", type: "point", city: "bangalore", description: "Youth programme centres" },
  { key: "creches",           label: "Creches",           file: "/data/creches.geojson",           color: "#ec4899", type: "point", city: "bangalore", description: "Creche programme centres" },

  { key: "custom_settlements", label: "Custom Settlements", file: "", color: "#6366f1", type: "polygon", city: "bangalore", description: "User-added settlement polygons" },
];

export const LAYER_MAP = Object.fromEntries(
  LAYERS.map((l) => [l.key, l])
) as Record<LayerKey, LayerConfig>;
