import { LAYERS } from "./layers";
import type { GeoData } from "./useGeoData";

export interface MapFilter {
  partnerKeys: Set<string>;          // settlement layer keys to highlight
  zones: Set<string>;                // zone names to highlight
  clusters: Set<string>;             // cluster keys to highlight
  centrePartnerLabels: Set<string>;  // centre partner labels to show
  source: "zone" | "cluster" | "settlement" | "partner" | "centre" | "mine";
  label: string;                     // human-readable description of active filter
  /** When true, hide non-matching settlements/centres entirely (opacity 0)
   *  instead of dimming them. Used by the "Mine" toggle so the RP sees
   *  only their territory. */
  hideNonMatching?: boolean;
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
      };
    }

    case "cluster": {
      const cluster = params.cluster!;
      const s = allSettlements.filter(x => x.cluster === cluster);
      const zone = s[0]?.zone || allCentres.find(c => c.cluster === cluster)?.zone || "";
      return {
        source,
        label: `Cluster: ${cluster.replace(/_/g, " ")}`,
        partnerKeys: new Set(s.map(x => x.partnerKey)),
        zones: zone ? new Set([zone]) : new Set(),
        clusters: new Set([cluster]),
        centrePartnerLabels: new Set(
          allCentres.filter(c => c.cluster === cluster).map(c => c.partner).filter(Boolean)
        ),
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
      };
    }

    // "mine" filters are built externally (MapDashboard composes the cluster
    // and zone sets from the user's goals via /api/map/my-goal-scope), so
    // this branch is never reached. Defined for completeness so the switch
    // is exhaustive.
    case "mine":
      return emptyFilter("mine", "Mine");
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

/** Returns true if a settlement feature matches the active filter */
export function settlementMatchesFilter(
  filter: MapFilter,
  partnerKey: string,
  zone: string,
  cluster: string
): boolean {
  const partnerMatch = filter.partnerKeys.size === 0 || filter.partnerKeys.has(partnerKey);
  const zoneMatch = filter.zones.size === 0 || filter.zones.has(zone);
  const clusterMatch = filter.clusters.size === 0 || filter.clusters.has(cluster);
  return partnerMatch && zoneMatch && clusterMatch;
}

/** Returns true if a centre feature matches the active filter */
export function centreMatchesFilter(
  filter: MapFilter,
  partner: string,
  zone: string,
  cluster: string
): boolean {
  const partnerMatch = filter.centrePartnerLabels.size === 0 || filter.centrePartnerLabels.has(partner);
  const zoneMatch = filter.zones.size === 0 || filter.zones.has(zone);
  const clusterMatch = filter.clusters.size === 0 || filter.clusters.has(cluster);
  return partnerMatch && zoneMatch && clusterMatch;
}
