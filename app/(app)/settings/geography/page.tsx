"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronDown, ChevronRight, Check } from "lucide-react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────

interface SettlementRow {
  id: string;
  name: string;
  active: boolean;
  clusterId: string;
}

interface ClusterRow {
  id: string;
  name: string;
  zoneId: string;
  settlementCount: number;
  settlements: SettlementRow[];
}

interface ZoneRow {
  id: string;
  name: string;
  cityId: string | null;
  cityName: string | null;
  clusters: ClusterRow[];
}

interface CityOption {
  id: string;
  name: string;
}

// ── Toast ──────────────────────────────────────────────────────────────────

function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const show = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 2000);
  };
  return { message, show };
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function GeographyPage() {
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const toast = useToast();

  const startEdit = (id: string, currentName: string) => {
    setEditingId(id);
    setEditDraft(currentName);
  };

  const cancelEdit = () => { setEditingId(null); setEditDraft(""); };

  const commitEdit = async (type: "rename-zone" | "rename-cluster" | "rename-settlement", id: string) => {
    const name = editDraft.trim();
    if (!name) { cancelEdit(); return; }
    const res = await fetch("/api/admin/geography", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id, name }),
    });
    if (res.ok) {
      setZones(prev => prev.map(z => {
        if (type === "rename-zone" && z.id === id) return { ...z, name };
        return {
          ...z,
          clusters: z.clusters.map(c => {
            if (type === "rename-cluster" && c.id === id) return { ...c, name };
            return {
              ...c,
              settlements: c.settlements.map(s =>
                type === "rename-settlement" && s.id === id ? { ...s, name } : s
              ),
            };
          }),
        };
      }));
      toast.show("Renamed");
    }
    cancelEdit();
  };

  const load = (city?: string) => {
    setLoading(true);
    const url = city ? `/api/admin/geography?city=${encodeURIComponent(city)}` : "/api/admin/geography";
    fetch(url)
      .then(r => r.json())
      .then(data => {
        setZones(data.zones ?? []);
        setCities(data.cities ?? []);
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  const handleCityTab = (cityName: string | null) => {
    setSelectedCity(cityName);
    setExpandedZones(new Set());
    setExpandedClusters(new Set());
    load(cityName ?? undefined);
  };

  const handleZoneAssignment = async (clusterId: string, newZoneId: string) => {
    const res = await fetch("/api/admin/geography", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "cluster", id: clusterId, zoneId: newZoneId }),
    });
    if (res.ok) {
      setZones(prev => {
        // Remove cluster from old zone, add to new zone
        let moved: ClusterRow | undefined;
        const updated = prev.map(z => {
          const idx = z.clusters.findIndex(c => c.id === clusterId);
          if (idx === -1) return z;
          moved = { ...z.clusters[idx], zoneId: newZoneId };
          return { ...z, clusters: z.clusters.filter(c => c.id !== clusterId) };
        });
        return updated.map(z => {
          if (z.id !== newZoneId || !moved) return z;
          return { ...z, clusters: [...z.clusters, moved].sort((a, b) => a.name.localeCompare(b.name)) };
        });
      });
      toast.show("Cluster moved");
    }
  };

  const handleSettlementToggle = async (clusterId: string, settlementId: string, active: boolean) => {
    const res = await fetch("/api/admin/geography", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "settlement", id: settlementId, active: !active }),
    });
    if (res.ok) {
      setZones(prev =>
        prev.map(z => ({
          ...z,
          clusters: z.clusters.map(c => {
            if (c.id !== clusterId) return c;
            return {
              ...c,
              settlements: c.settlements.map(s =>
                s.id === settlementId ? { ...s, active: !active } : s
              ),
            };
          }),
        }))
      );
      toast.show(!active ? "Settlement activated" : "Settlement deactivated");
    }
  };

  const handleSettlementClusterChange = async (settlementId: string, oldClusterId: string, newClusterId: string) => {
    const res = await fetch("/api/admin/geography", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "settlement-cluster", id: settlementId, clusterId: newClusterId }),
    });
    if (res.ok) {
      setZones(prev => {
        let moved: SettlementRow | undefined;
        const updated = prev.map(z => ({
          ...z,
          clusters: z.clusters.map(c => {
            if (c.id !== oldClusterId) return c;
            const s = c.settlements.find(s => s.id === settlementId);
            if (!s) return c;
            moved = { ...s, clusterId: newClusterId };
            return { ...c, settlementCount: c.settlementCount - 1, settlements: c.settlements.filter(s => s.id !== settlementId) };
          }),
        }));
        return updated.map(z => ({
          ...z,
          clusters: z.clusters.map(c => {
            if (c.id !== newClusterId || !moved) return c;
            return { ...c, settlementCount: c.settlementCount + 1, settlements: [...c.settlements, moved].sort((a, b) => a.name.localeCompare(b.name)) };
          }),
        }));
      });
      toast.show("Settlement moved");
    }
  };

  const allZones = zones; // already filtered by city via API

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/settings" className="text-stone-400 hover:text-stone-700">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-stone-900">Geography</h1>
          <p className="text-xs text-stone-400">Manage zones, clusters, and settlements.</p>
        </div>
      </div>

      {/* City tabs */}
      {cities.length > 1 && (
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => handleCityTab(null)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              selectedCity === null
                ? "bg-sky-500 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            All cities
          </button>
          {cities.map(c => (
            <button
              key={c.id}
              onClick={() => handleCityTab(c.name)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                selectedCity === c.name
                  ? "bg-sky-500 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast.message && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-stone-900 text-white text-sm rounded-xl shadow-lg">
          <Check className="w-4 h-4 text-emerald-400" />
          {toast.message}
        </div>
      )}

      {loading && (
        <p className="text-xs text-stone-400 text-center py-12">Loading…</p>
      )}

      {/* Zones accordion */}
      {!loading && (
        <div className="space-y-2">
          {allZones.length === 0 && (
            <p className="text-xs text-stone-400 text-center py-12">No zones found.</p>
          )}
          {allZones.map(zone => {
            const isZoneOpen = expandedZones.has(zone.id);
            return (
              <div key={zone.id} className="rounded-xl border border-stone-200 overflow-hidden">
                {/* Zone header */}
                <button
                  onClick={() => setExpandedZones(prev => {
                    const next = new Set(prev);
                    if (next.has(zone.id)) next.delete(zone.id); else next.add(zone.id);
                    return next;
                  })}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-stone-50 hover:bg-stone-100 transition-colors text-left"
                >
                  {isZoneOpen
                    ? <ChevronDown className="w-4 h-4 text-stone-400 flex-shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-stone-400 flex-shrink-0" />
                  }
                  <div className="flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                    {editingId === zone.id ? (
                      <input
                        autoFocus
                        value={editDraft}
                        onChange={e => setEditDraft(e.target.value)}
                        onBlur={() => commitEdit("rename-zone", zone.id)}
                        onKeyDown={e => {
                          if (e.key === "Enter") commitEdit("rename-zone", zone.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        className="text-sm font-semibold border border-sky-300 rounded px-1.5 py-0.5 w-full outline-none focus:ring-2 focus:ring-sky-400"
                      />
                    ) : (
                      <p
                        className="text-sm font-semibold text-stone-800 hover:text-sky-600 cursor-text transition-colors"
                        title="Click to rename"
                        onClick={() => startEdit(zone.id, zone.name)}
                      >
                        {zone.name}
                      </p>
                    )}
                    {zone.cityName && (
                      <p className="text-[11px] text-stone-400">{zone.cityName}</p>
                    )}
                  </div>
                  <span className="text-xs text-stone-400 flex-shrink-0">
                    {zone.clusters.length} cluster{zone.clusters.length !== 1 ? "s" : ""}
                  </span>
                </button>

                {/* Clusters */}
                {isZoneOpen && (
                  <div className="divide-y divide-stone-100">
                    {zone.clusters.length === 0 && (
                      <p className="px-6 py-3 text-xs text-stone-400 italic">No clusters</p>
                    )}
                    {zone.clusters.map(cluster => {
                      const isClusterOpen = expandedClusters.has(cluster.id);
                      return (
                        <div key={cluster.id}>
                          {/* Cluster row */}
                          <div className="flex items-center gap-3 px-4 py-2.5 bg-white hover:bg-stone-50 transition-colors">
                            <button
                              onClick={() => setExpandedClusters(prev => {
                                const next = new Set(prev);
                                if (next.has(cluster.id)) next.delete(cluster.id); else next.add(cluster.id);
                                return next;
                              })}
                              className="text-stone-300 hover:text-stone-500 transition-colors flex-shrink-0"
                            >
                              {isClusterOpen
                                ? <ChevronDown className="w-3.5 h-3.5" />
                                : <ChevronRight className="w-3.5 h-3.5" />
                              }
                            </button>

                            <div className="flex-1 min-w-0">
                              {editingId === cluster.id ? (
                                <input
                                  autoFocus
                                  value={editDraft}
                                  onChange={e => setEditDraft(e.target.value)}
                                  onBlur={() => commitEdit("rename-cluster", cluster.id)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") commitEdit("rename-cluster", cluster.id);
                                    if (e.key === "Escape") cancelEdit();
                                  }}
                                  className="text-sm font-medium border border-sky-300 rounded px-1.5 py-0.5 w-full outline-none focus:ring-2 focus:ring-sky-400"
                                />
                              ) : (
                                <p
                                  className="text-sm font-medium text-stone-800 hover:text-sky-600 cursor-text transition-colors"
                                  title="Click to rename"
                                  onClick={() => startEdit(cluster.id, cluster.name)}
                                >
                                  {cluster.name}
                                </p>
                              )}
                            </div>

                            {/* Settlement count badge */}
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500 flex-shrink-0">
                              {cluster.settlementCount} settlement{cluster.settlementCount !== 1 ? "s" : ""}
                            </span>

                            {/* Zone assignment dropdown */}
                            <select
                              value={cluster.zoneId}
                              onChange={e => handleZoneAssignment(cluster.id, e.target.value)}
                              className="text-xs px-2 py-1 border border-stone-200 rounded-lg bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-400 flex-shrink-0"
                              title="Move to zone"
                            >
                              {allZones.map(z => (
                                <option key={z.id} value={z.id}>{z.name}</option>
                              ))}
                            </select>
                          </div>

                          {/* Settlements */}
                          {isClusterOpen && (
                            <div className="bg-stone-50 divide-y divide-stone-100 border-t border-stone-100">
                              {cluster.settlements.length === 0 && (
                                <p className="px-8 py-2 text-xs text-stone-400 italic">No settlements</p>
                              )}
                              {cluster.settlements.map(s => (
                                <div key={s.id} className="flex items-center gap-3 px-8 py-2">
                                  <div className="flex-1 min-w-0">
                                    {editingId === s.id ? (
                                      <input
                                        autoFocus
                                        value={editDraft}
                                        onChange={e => setEditDraft(e.target.value)}
                                        onBlur={() => commitEdit("rename-settlement", s.id)}
                                        onKeyDown={e => {
                                          if (e.key === "Enter") commitEdit("rename-settlement", s.id);
                                          if (e.key === "Escape") cancelEdit();
                                        }}
                                        className="text-xs border border-sky-300 rounded px-1.5 py-0.5 w-full outline-none focus:ring-2 focus:ring-sky-400"
                                      />
                                    ) : (
                                      <p
                                        className={`text-xs cursor-text transition-colors ${!s.active ? "line-through text-stone-400" : "text-stone-700 hover:text-sky-600"}`}
                                        title="Click to rename"
                                        onClick={() => startEdit(s.id, s.name)}
                                      >
                                        {s.name}
                                      </p>
                                    )}
                                  </div>
                                  {/* Cluster reassignment dropdown */}
                                  <select
                                    value={cluster.id}
                                    onChange={e => handleSettlementClusterChange(s.id, cluster.id, e.target.value)}
                                    className="text-xs px-2 py-1 border border-stone-200 rounded-lg bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-400 flex-shrink-0"
                                    title="Move to cluster"
                                  >
                                    {allZones.flatMap(z => z.clusters).map(c => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </select>

                                  <button
                                    onClick={() => handleSettlementToggle(cluster.id, s.id, s.active)}
                                    className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors flex-shrink-0 ${
                                      s.active
                                        ? "border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
                                        : "border-stone-200 text-stone-400 bg-stone-50 hover:bg-stone-100"
                                    }`}
                                  >
                                    {s.active ? "Active" : "Inactive"}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
