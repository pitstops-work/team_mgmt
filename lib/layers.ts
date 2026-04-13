export type LayerKey =
  | "sangama"
  | "gubbachi"
  | "cfar"
  | "actionaid"
  | "janasha"
  | "thamate"
  | "maarga"

  | "sieds"
  | "resource_centres"
  | "children_centres"
  | "youth_centres"
  | "creches"
  | "custom"
  | "custom_settlements";

export interface LayerConfig {
  key: LayerKey;
  label: string;
  file: string;
  color: string;
  type: "polygon" | "point";
  description: string;
}

export const LAYERS: LayerConfig[] = [
  {
    key: "sangama",
    label: "Sangama",
    file: "/data/sangama.geojson",
    color: "#6366f1",
    type: "polygon",
    description: "Sangama partner settlements",
  },
  {
    key: "cfar",
    label: "CFAR",
    file: "/data/cfar.geojson",
    color: "#10b981",
    type: "polygon",
    description: "CFAR partner settlements",
  },
  {
    key: "actionaid",
    label: "ActionAid",
    file: "/data/actionaid.geojson",
    color: "#ef4444",
    type: "polygon",
    description: "ActionAid partner settlements",
  },

  {
    key: "gubbachi",
    label: "Gubbachi",
    file: "/data/gubbachi.geojson",
    color: "#f59e0b",
    type: "polygon",
    description: "Gubbachi partner settlements",
  },
  {
    key: "sieds",
    label: "SIEDS",
    file: "/data/sieds.geojson",
    color: "#ec4899",
    type: "polygon",
    description: "SIEDS partner settlements",
  },
  {
    key: "janasha",
    label: "Janashayog",
    file: "/data/janasha.geojson",
    color: "#8b5cf6",
    type: "polygon",
    description: "Janashayog partner settlements",
  },
  {
    key: "maarga",
    label: "Maarga",
    file: "/data/maarga.geojson",
    color: "#f97316",
    type: "polygon",
    description: "Maarga partner settlements",
  },
  {
    key: "thamate",
    label: "Thamate",
    file: "/data/thamate.geojson",
    color: "#06b6d4",
    type: "polygon",
    description: "Thamate partner settlements",
  },
  {
    key: "resource_centres",
    label: "Resource Centres",
    file: "/data/resource_centres.geojson",
    color: "#1d4ed8",
    type: "point",
    description: "Programme resource centres",
  },
  {
    key: "children_centres",
    label: "Children Centres",
    file: "/data/children_centres.geojson",
    color: "#f97316",
    type: "point",
    description: "Children programme centres",
  },
  {
    key: "youth_centres",
    label: "Youth Centres",
    file: "/data/youth_centres.geojson",
    color: "#8b5cf6",
    type: "point",
    description: "Youth programme centres",
  },
  {
    key: "creches",
    label: "Creches",
    file: "/data/creches.geojson",
    color: "#ec4899",
    type: "point",
    description: "Creche programme centres",
  },
  {
    key: "custom_settlements",
    label: "Custom Settlements",
    file: "",
    color: "#6366f1",
    type: "polygon",
    description: "User-added settlement polygons",
  },
];

export const LAYER_MAP = Object.fromEntries(
  LAYERS.map((l) => [l.key, l])
) as Record<LayerKey, LayerConfig>;
