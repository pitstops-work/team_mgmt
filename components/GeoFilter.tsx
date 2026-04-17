"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export interface GeoFilterValue {
  zoneId: string;
  clusterId: string;
}

interface GeoZone {
  id: string;
  name: string;
  cityName: string | null;
}

interface GeoCluster {
  id: string;
  name: string;
  zoneId: string;
}

interface GeoFilterProps {
  value: GeoFilterValue;
  onChange: (v: GeoFilterValue) => void;
  compact?: boolean;
}

export default function GeoFilter({ value, onChange, compact = false }: GeoFilterProps) {
  const [zones, setZones] = useState<GeoZone[]>([]);
  const [clusters, setClusters] = useState<GeoCluster[]>([]);
  const [multipleCities, setMultipleCities] = useState(false);

  useEffect(() => {
    fetch("/api/geo")
      .then(r => r.json())
      .then(d => {
        const z: GeoZone[] = d.zones ?? [];
        const c: GeoCluster[] = d.clusters ?? [];
        setZones(z);
        setClusters(c);
        const cities = new Set(z.map(zone => zone.cityName).filter(Boolean));
        setMultipleCities(cities.size > 1);
      })
      .catch(() => {});
  }, []);

  const selectClass = compact
    ? "px-2 py-1 text-xs border border-stone-200 rounded-lg bg-white text-stone-600 outline-none transition-colors hover:border-stone-300"
    : "px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white text-stone-600 outline-none transition-colors hover:border-stone-300";

  const filteredClusters = value.zoneId
    ? clusters.filter(c => c.zoneId === value.zoneId)
    : clusters;

  const isActive = value.zoneId !== "" || value.clusterId !== "";

  const handleZoneChange = (zoneId: string) => {
    onChange({ zoneId, clusterId: "" });
  };

  const handleClusterChange = (clusterId: string) => {
    onChange({ ...value, clusterId });
  };

  const handleClear = () => {
    onChange({ zoneId: "", clusterId: "" });
  };

  if (zones.length === 0 && clusters.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={value.zoneId}
        onChange={e => handleZoneChange(e.target.value)}
        className={`${selectClass} ${value.zoneId ? "border-sky-400 text-sky-700 bg-sky-50" : ""}`}
      >
        <option value="">All zones</option>
        {zones.map(z => (
          <option key={z.id} value={z.id}>
            {z.name}{multipleCities && z.cityName ? ` (${z.cityName})` : ""}
          </option>
        ))}
      </select>

      <select
        value={value.clusterId}
        onChange={e => handleClusterChange(e.target.value)}
        className={`${selectClass} ${value.clusterId ? "border-sky-400 text-sky-700 bg-sky-50" : ""}`}
      >
        <option value="">All clusters</option>
        {filteredClusters.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {isActive && (
        <button
          onClick={handleClear}
          title="Clear geo filter"
          className={`flex items-center justify-center rounded-md text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors ${compact ? "p-0.5" : "p-1"}`}
        >
          <X className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
        </button>
      )}
    </div>
  );
}
