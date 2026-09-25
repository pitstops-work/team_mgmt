// Programme Map cluster query — the single model behind the map's filters.
//
// Every filter narrows the same list of clusters (AND across filters, OR
// within a multi-select such as zones or partners). The panel shows, for
// each option, how many clusters would match given the other filters, and
// the map draws only the matching clusters.

/** A cluster "has health work" when a health centre is within this distance of any of its settlements. */
export const HEALTH_WORK_KM = 2;
/** Upper bound of the facility distance slider; the API returns facilities up to this distance. */
export const MAX_FACILITY_KM = 10;

/** What the map colours polygons by. Only one lens is active at a time. */
export type ColorBy = "none" | "partner" | "health" | "progress" | "needs";
export const HEALTH_WORK_COLOR = "#e11d48";
export const NO_HEALTH_WORK_COLOR = "#94a3b8";

export interface NearFacility {
  id: string;
  type: string;
  /** Nearest distance from the facility to any settlement in the cluster. */
  km: number;
}

export interface ClusterFacet {
  id: string;
  name: string;
  label: string;
  zone: string;
  settlementCount: number;
  healthCentres: NearFacility[];
  schools: NearFacility[];
  canteens: NearFacility[];
}

/** A facet plus the partner layer keys derived from the settlement polygons. */
export interface ClusterRow extends ClusterFacet {
  partners: string[];
}

export const SCHOOL_TYPES: { key: string; label: string; color: string }[] = [
  { key: "Government",             label: "Govt (DPI)",   color: "#dc2626" },
  { key: "BBMP",                   label: "BBMP",         color: "#1e293b" },
  { key: "Karnataka Public School", label: "KPS",         color: "#0288D1" },
  { key: "bbmp_udise",             label: "BBMP (UDISE)", color: "#0d9488" },
];

export type HealthFilter = "any" | "yes" | "no";

export interface ClusterQuery {
  zones: Set<string>;
  partners: Set<string>;
  health: HealthFilter;
  schools: boolean;
  schoolTypes: Set<string>;
  canteens: boolean;
  /** One distance rule for schools and canteens: within km of any settlement. */
  km: number;
  mine: boolean;
}

export type QueryDimension = "zone" | "partner" | "health" | "schools" | "canteens" | "mine";

export const EMPTY_QUERY: ClusterQuery = {
  zones: new Set(),
  partners: new Set(),
  health: "any",
  schools: false,
  schoolTypes: new Set(SCHOOL_TYPES.map((t) => t.key)),
  canteens: false,
  km: 4,
  mine: false,
};

/** Cluster names arrive as "JJR Nagar", "JJR_Nagar" or "jjr-nagar" depending on the source. */
export function normName(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");
}

export function hasHealthWork(c: ClusterFacet): boolean {
  return c.healthCentres.length > 0;
}

export function schoolsWithin(c: ClusterFacet, q: Pick<ClusterQuery, "km" | "schoolTypes">): number {
  return c.schools.filter((s) => s.km <= q.km && q.schoolTypes.has(s.type)).length;
}

export function canteensWithin(c: ClusterFacet, km: number): number {
  return c.canteens.filter((s) => s.km <= km).length;
}

export function isQueryActive(q: ClusterQuery): boolean {
  return q.zones.size > 0 || q.partners.size > 0 || q.health !== "any" || q.schools || q.canteens || q.mine;
}

/**
 * Does the cluster satisfy every filter except `skip`? Skipping one dimension
 * is how the panel counts "clusters you'd get if you picked this option".
 */
export function clusterMatches(
  c: ClusterRow,
  q: ClusterQuery,
  mineClusters: Set<string> | null,
  skip?: QueryDimension,
): boolean {
  if (skip !== "zone" && q.zones.size > 0 && !q.zones.has(c.zone)) return false;
  if (skip !== "partner" && q.partners.size > 0 && !c.partners.some((p) => q.partners.has(p))) return false;
  if (skip !== "health" && q.health !== "any" && hasHealthWork(c) !== (q.health === "yes")) return false;
  if (skip !== "schools" && q.schools && schoolsWithin(c, q) === 0) return false;
  if (skip !== "canteens" && q.canteens && canteensWithin(c, q.km) === 0) return false;
  if (skip !== "mine" && q.mine && !(mineClusters?.has(normName(c.name)) ?? false)) return false;
  return true;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function clustersToCsv(rows: ClusterRow[], q: ClusterQuery, partnerLabel: (key: string) => string): string {
  const header = [
    "Cluster", "Zone", "Partners", "Settlements",
    "Health work", `Health centres ≤${HEALTH_WORK_KM} km`,
    `Schools ≤${q.km} km`, `Indira canteens ≤${q.km} km`,
  ];
  const lines = rows.map((c) => [
    c.label, c.zone, c.partners.map(partnerLabel).join("; "), c.settlementCount,
    hasHealthWork(c) ? "Yes" : "No", c.healthCentres.length,
    schoolsWithin(c, q), canteensWithin(c, q.km),
  ].map(csvCell).join(","));
  return [header.map(csvCell).join(","), ...lines].join("\n");
}
