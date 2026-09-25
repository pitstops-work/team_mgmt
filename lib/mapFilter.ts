import { LAYERS } from "./layers";
import type { GeoData } from "./useGeoData";
import { normName } from "./clusterQuery";

export interface MapFilter {
  partnerKeys: Set<string>;          // settlement layer keys to highlight
  zones: Set<string>;                // zone names to highlight
  clusters: Set<string>;             // cluster keys to highlight
  centrePartnerLabels: Set<string>;  // centre partner labels to show
  source: "zone" | "cluster" | "settlement" | "partner" | "centre" | "mine" | "query";
  label: string;                     // human-readable description of active filter
  /** When true, hide non-matching settlements/centres entirely (opacity 0)
   *  instead of dimming them. Default for every filter source — selecting
   *  a partner / zone / cluster / settlement / centre in the panel or on
   *  the map should make the rest disappear so the chosen scope is
   *  readable. */
  hideNonMatching?: boolean;
  /** The panel's filters matched no cluster: hide everything rather than
   *  treating the empty sets as "no constraint". */
  matchNothing?: boolean;
}

type ComputeParams = {
  zone?: string;
  cluster?: string;
  settlementName?: string;
  partnerKey?: string;
  centrePartner?: string;
  centreZone?: string;
  centreCluster?: string;
};

export function computeMapFilter(
  source: MapFilter["source"],
  geoData: GeoData,
  params: ComputeParams
): MapFilter {
  // Flatten all settlements
  const allSettlements: Array<{ name: string; partnerKey: string; zone: string; cluster: string }> = [];
  Object.entries(geoData.settlements).forEach(([key, features]) => {
    features?.forEach(f =>
      allSettlements.push({
        name: f.properties.name || "",
        partnerKey: key,
        zone: f.properties.zone || "",
        cluster: f.properties.cluster || "",
      })
    );
  });

  // Flatten all centres
  const allCentres = [
    ...geoData.centres.children,
    ...geoData.centres.youth,
    ...geoData.centres.creches,
    ...geoData.centres.resource,
  ].map(f => ({
    partner: f.properties.partner || "",
    zone: f.properties.zone || "",
    cluster: f.properties.cluster || "",
  }));

  switch (source) {
    case "zone": {
      const zone = params.zone!;
      const s = allSettlements.filter(x => x.zone === zone);
      return {
        source,
        label: `Zone: ${zone}`,
        partnerKeys: new Set(s.map(x => x.partnerKey)),
        zones: new Set([zone]),
        clusters: new Set(s.map(x => x.cluster).filter(Boolean)),
        centrePartnerLabels: new Set(
          allCentres.filter(c => c.zone === zone).map(c => c.partner).filter(Boolean)
        ),
        hideNonMatching: true,
      };
    }

    case "cluster": {
      const cluster = params.cluster!;
      const key = normName(cluster);
      const s = allSettlements.filter(x => normName(x.cluster) === key);
      const zone = s[0]?.zone || allCentres.find(c => normName(c.cluster) === key)?.zone || "";
      return {
        source,
        label: `Cluster: ${cluster.replace(/_/g, " ")}`,
        partnerKeys: new Set(s.map(x => x.partnerKey)),
        zones: zone ? new Set([zone]) : new Set(),
        clusters: new Set([cluster]),
        centrePartnerLabels: new Set(
          allCentres.filter(c => normName(c.cluster) === key).map(c => c.partner).filter(Boolean)
        ),
        hideNonMatching: true,
      };
    }

    case "settlement": {
      const name = params.settlementName!;
      const s = allSettlements.find(x => x.name === name);
      if (!s) return emptyFilter("settlement", name);
      return {
        source,
        label: `Settlement: ${name}`,
        partnerKeys: new Set([s.partnerKey]),
        zones: s.zone ? new Set([s.zone]) : new Set(),
        clusters: s.cluster ? new Set([s.cluster]) : new Set(),
        centrePartnerLabels: new Set(
          allCentres.filter(c => c.cluster === s.cluster).map(c => c.partner).filter(Boolean)
        ),
        hideNonMatching: true,
      };
    }

    case "partner": {
      const key = params.partnerKey!;
      const s = allSettlements.filter(x => x.partnerKey === key);
      const label = LAYERS.find(l => l.key === key)?.label || key;
      return {
        source,
        label: `Partner: ${label}`,
        partnerKeys: new Set([key]),
        zones: new Set(s.map(x => x.zone).filter(Boolean)),
        clusters: new Set(s.map(x => x.cluster).filter(Boolean)),
        centrePartnerLabels: new Set([label]),
        hideNonMatching: true,
      };
    }

    case "centre": {
      const { centrePartner = "", centreZone = "", centreCluster = "" } = params;
      const partnerKey = LAYERS.find(
        l => l.label.toLowerCase() === centrePartner.toLowerCase()
      )?.key;
      return {
        source,
        label: `Centre: ${params.centrePartner ?? ""}`,
        partnerKeys: partnerKey ? new Set([partnerKey]) : new Set(),
        zones: centreZone ? new Set([centreZone]) : new Set(),
        clusters: centreCluster ? new Set([centreCluster]) : new Set(),
        centrePartnerLabels: centrePartner ? new Set([centrePartner]) : new Set(),
        hideNonMatching: true,
      };
    }

    // "mine" and "query" filters are built externally (MapDashboard composes the cluster
    // and zone sets from the user's goals via /api/map/my-goal-scope), so
    // this branch is never reached. Defined for completeness so the switch
    // is exhaustive.
    case "mine":
    case "query":
      return emptyFilter(source, source === "mine" ? "Mine" : "Filters");
  }
}

function emptyFilter(source: MapFilter["source"], label: string): MapFilter {
  return {
    source,
    label,
    partnerKeys: new Set(),
    zones: new Set(),
    clusters: new Set(),
    centrePartnerLabels: new Set(),
  };
}

// Zone / cluster names differ in spelling between the DB and the partner
// geojson ("JJR Nagar" vs "JJR_Nagar"), so membership is checked on the
// normalised form. Cached per Set so a filter pass over thousands of
// features normalises each filter set once.
const normCache = new WeakMap<Set<string>, Set<string>>();
function normSet(s: Set<string>): Set<string> {
  let n = normCache.get(s);
  if (!n) {
    n = new Set(Array.from(s, normName));
    normCache.set(s, n);
  }
  return n;
}
function inSet(s: Set<string>, value: string): boolean {
  return s.size === 0 || normSet(s).has(normName(value));
}

/** Returns true if a settlement feature matches the active filter */
export function settlementMatchesFilter(
  filter: MapFilter,
  partnerKey: string,
  zone: string,
  cluster: string
): boolean {
  if (filter.matchNothing) return false;
  const partnerMatch = filter.partnerKeys.size === 0 || filter.partnerKeys.has(partnerKey);
  return partnerMatch && inSet(filter.zones, zone) && inSet(filter.clusters, cluster);
}

/** Returns true if a centre feature matches the active filter */
export function centreMatchesFilter(
  filter: MapFilter,
  partner: string,
  zone: string,
  cluster: string
): boolean {
  if (filter.matchNothing) return false;
  const partnerMatch = filter.centrePartnerLabels.size === 0 || filter.centrePartnerLabels.has(partner);
  return partnerMatch && inSet(filter.zones, zone) && inSet(filter.clusters, cluster);
}
