"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export interface GeoFilterValue {
  cityId: string;
  zoneId: string;
  clusterId: string;
}

interface GeoCity {
  id: string;
  name: string;
}

interface GeoZone {
  id: string;
  name: string;
  cityId: string | null;
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
  const [cities, setCities] = useState<GeoCity[]>([]);
  const [zones, setZones] = useState<GeoZone[]>([]);
  const [clusters, setClusters] = useState<GeoCluster[]>([]);
  const [multipleCities, setMultipleCities] = useState(false);

  useEffect(() => {
    fetch("/api/geo")
      .then(r => r.json())
      .then(d => {
        const ci: GeoCity[] = d.cities ?? [];
        const z: GeoZone[] = d.zones ?? [];
        const c: GeoCluster[] = d.clusters ?? [];
        setCities(ci);
        setZones(z);
        setClusters(c);
        setMultipleCities(ci.length > 1);
      })
      .catch(() => {});
  }, []);

  const selectClass = compact
    ? "px-2 py-1 text-xs border border-stone-200 rounded-lg bg-white text-stone-600 outline-none transition-colors hover:border-stone-300"
    : "px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white text-stone-600 outline-none transition-colors hover:border-stone-300";

  const filteredZones = value.cityId
    ? zones.filter(z => z.cityId === value.cityId)
    : zones;

  const filteredClusters = value.zoneId
    ? clusters.filter(c => c.zoneId === value.zoneId)
    : value.cityId
    ? clusters.filter(c => filteredZones.some(z => z.id === c.zoneId))
    : clusters;

  const isActive = value.cityId !== "" || value.zoneId !== "" || value.clusterId !== "";

  const handleCityChange = (cityId: string) => {
    onChange({ cityId, zoneId: "", clusterId: "" });
  };

  const handleZoneChange = (zoneId: string) => {
    onChange({ ...value, zoneId, clusterId: "" });
  };

  const handleClusterChange = (clusterId: string) => {
    onChange({ ...value, clusterId });
  };

  const handleClear = () => {
    onChange({ cityId: "", zoneId: "", clusterId: "" });
  };

  if (zones.length === 0 && clusters.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      {multipleCities && (
        <select
          value={value.cityId}
          onChange={e => handleCityChange(e.target.value)}
          className={`${selectClass} ${value.cityId ? "border-sky-400 text-sky-700 bg-sky-50" : ""}`}
        >
          <option value="">All cities</option>
          {cities.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}

      <select
        value={value.zoneId}
        onChange={e => handleZoneChange(e.target.value)}
        className={`${selectClass} ${value.zoneId ? "border-sky-400 text-sky-700 bg-sky-50" : ""}`}
      >
        <option value="">All zones</option>
        {filteredZones.map(z => (
          <option key={z.id} value={z.id}>
            {z.name}{!value.cityId && multipleCities && z.cityName ? ` (${z.cityName})` : ""}
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
