"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin, Plus, ChevronDown, ChevronRight, Trash2 } from "lucide-react";

type GoalStub = { id: string; title: string };
type Settlement = { id: string; name: string; clusterId: string; goals: { goal: GoalStub }[] };
type Cluster   = { id: string; name: string; zoneId: string; settlements: Settlement[]; goals: { goal: GoalStub }[] };
type Zone      = { id: string; name: string; cityId: string | null; clusters: Cluster[]; goals: { goal: GoalStub }[] };
type City      = { id: string; name: string; zones: Zone[]; goals: { goal: GoalStub }[] };

export default function GeographyView({
  initialCities,
  initialZones,
}: {
  initialCities: City[];
  initialZones: Zone[];
  currentUserId: string;
}) {
  const [cities, setCities] = useState<City[]>(initialCities);
  // Zones not attached to any city
  const [orphanZones, setOrphanZones] = useState<Zone[]>(initialZones.filter((z) => !z.cityId));

  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded((p) => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });

  // Forms
  const [cityForm, setCityForm] = useState(false);
  const [newCityName, setNewCityName] = useState("");
  const [zoneFormCityId, setZoneFormCityId] = useState<string | null>(null);
  const [newZoneName, setNewZoneName] = useState("");
  const [clusterFormZoneId, setClusterFormZoneId] = useState<string | null>(null);
  const [newClusterName, setNewClusterName] = useState("");
  const [settlementFormClusterId, setSettlementFormClusterId] = useState<string | null>(null);
  const [newSettlementName, setNewSettlementName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ type: string; id: string; name: string } | null>(null);

  const createCity = async () => {
    if (!newCityName.trim()) return;
    setSaving(true);
    const res = await fetch("/api/geography/cities", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCityName.trim() }),
    });
    if (res.ok) {
      const c = await res.json();
      setCities((p) => [...p, { ...c, zones: [], goals: [] }]);
      setNewCityName(""); setCityForm(false);
    }
    setSaving(false);
  };

  const createZone = async (cityId: string) => {
    if (!newZoneName.trim()) return;
    setSaving(true);
    const res = await fetch("/api/geography/zones", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newZoneName.trim(), cityId }),
    });
    if (res.ok) {
      const z = await res.json();
      setCities((p) => p.map((c) =>
        c.id === cityId ? { ...c, zones: [...c.zones, { ...z, clusters: [], goals: [] }] } : c
      ));
      setNewZoneName(""); setZoneFormCityId(null);
    }
    setSaving(false);
  };

  const createCluster = async (zoneId: string, cityId: string) => {
    if (!newClusterName.trim()) return;
    setSaving(true);
    const res = await fetch("/api/geography/clusters", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newClusterName.trim(), zoneId }),
    });
    if (res.ok) {
      const cl = await res.json();
      setCities((p) => p.map((c) =>
        c.id === cityId ? {
          ...c,
          zones: c.zones.map((z) =>
            z.id === zoneId ? { ...z, clusters: [...z.clusters, { ...cl, settlements: [], goals: [] }] } : z
          ),
        } : c
      ));
      setNewClusterName(""); setClusterFormZoneId(null);
    }
    setSaving(false);
  };

  const createSettlement = async (clusterId: string, zoneId: string, cityId: string) => {
    if (!newSettlementName.trim()) return;
    setSaving(true);
    const res = await fetch("/api/geography/settlements", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSettlementName.trim(), clusterId }),
    });
    if (res.ok) {
      const s = await res.json();
      setCities((p) => p.map((c) =>
        c.id === cityId ? {
          ...c,
          zones: c.zones.map((z) =>
            z.id === zoneId ? {
              ...z,
              clusters: z.clusters.map((cl) =>
                cl.id === clusterId ? { ...cl, settlements: [...cl.settlements, { ...s, goals: [] }] } : cl
              ),
            } : z
          ),
        } : c
      ));
      setNewSettlementName(""); setSettlementFormClusterId(null);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { type, id } = confirmDelete;
    const endpoint =
      type === "city" ? "/api/geography/cities" :
      type === "zone" ? "/api/geography/zones" :
      type === "cluster" ? "/api/geography/clusters" :
      "/api/geography/settlements";
    const res = await fetch(endpoint, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      if (type === "city") setCities((p) => p.filter((c) => c.id !== id));
      else if (type === "zone") {
        setCities((p) => p.map((c) => ({ ...c, zones: c.zones.filter((z) => z.id !== id) })));
        setOrphanZones((p) => p.filter((z) => z.id !== id));
      } else if (type === "cluster") {
        setCities((p) => p.map((c) => ({ ...c, zones: c.zones.map((z) => ({ ...z, clusters: z.clusters.filter((cl) => cl.id !== id) })) })));
      } else {
        setCities((p) => p.map((c) => ({ ...c, zones: c.zones.map((z) => ({ ...z, clusters: z.clusters.map((cl) => ({ ...cl, settlements: cl.settlements.filter((s) => s.id !== id) })) })) })));
      }
    }
    setConfirmDelete(null);
  };

  const inlineInput = (value: string, onChange: (v: string) => void, onEnter: () => void, onEsc: () => void, placeholder: string) => (
    <input
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") onEnter(); if (e.key === "Escape") onEsc(); }}
      placeholder={placeholder}
      className="flex-1 px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400"
    />
  );

  const addBtn = (label: string, onClick: () => void, disabled?: boolean) => (
    <button onClick={onClick} disabled={disabled}
      className="px-2.5 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs rounded-md transition-colors">
      {label}
    </button>
  );

  const cancelBtn = (onClick: () => void) => (
    <button onClick={onClick} className="px-2 py-1 text-xs text-stone-400 hover:text-stone-600">Cancel</button>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-24">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-stone-400" />
          <div>
            <h1 className="text-lg font-semibold text-stone-900">Geography</h1>
            <p className="text-xs text-stone-400">City → Zone → Cluster → Settlement</p>
          </div>
        </div>
        <button onClick={() => setCityForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add City
        </button>
      </div>

      {cityForm && (
        <div className="mb-4 flex gap-2">
          {inlineInput(newCityName, setNewCityName, createCity, () => { setCityForm(false); setNewCityName(""); }, "City name…")}
          {addBtn("Add", createCity, !newCityName.trim() || saving)}
          {cancelBtn(() => { setCityForm(false); setNewCityName(""); })}
        </div>
      )}

      {cities.length === 0 && orphanZones.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-stone-200 rounded-xl">
          <p className="text-stone-400 text-sm">No cities yet. Add a city to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cities.map((city) => (
            <div key={city.id} className="border border-stone-200 rounded-xl overflow-hidden">
              {/* City row */}
              <div className="flex items-center justify-between px-4 py-3 bg-stone-100 group/city">
                <button onClick={() => toggle(city.id)} className="flex items-center gap-2 flex-1 text-left">
                  {expanded.has(city.id) ? <ChevronDown className="w-4 h-4 text-stone-500" /> : <ChevronRight className="w-4 h-4 text-stone-500" />}
                  <span className="text-sm font-bold text-stone-800">{city.name}</span>
                  <span className="text-xs text-stone-400">{city.zones.length} zones</span>
                </button>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setZoneFormCityId(city.id); toggle(city.id); }}
                    className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700">
                    <Plus className="w-3.5 h-3.5" /> Zone
                  </button>
                  <button onClick={() => setConfirmDelete({ type: "city", id: city.id, name: city.name })}
                    className="opacity-0 group-hover/city:opacity-100 p-1 text-stone-300 hover:text-red-400 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {zoneFormCityId === city.id && (
                <div className="px-4 py-2 border-t border-stone-100 flex gap-2">
                  {inlineInput(newZoneName, setNewZoneName, () => createZone(city.id), () => { setZoneFormCityId(null); setNewZoneName(""); }, "Zone name…")}
                  {addBtn("Add", () => createZone(city.id), !newZoneName.trim() || saving)}
                  {cancelBtn(() => { setZoneFormCityId(null); setNewZoneName(""); })}
                </div>
              )}

              {expanded.has(city.id) && city.zones.map((zone) => (
                <div key={zone.id} className="border-t border-stone-100">
                  {/* Zone row */}
                  <div className="flex items-center justify-between px-6 py-2 bg-stone-50 group/zone">
                    <button onClick={() => toggle(`z-${zone.id}`)} className="flex items-center gap-2 flex-1 text-left">
                      {expanded.has(`z-${zone.id}`) ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />}
                      <span className="text-sm font-semibold text-stone-700">{zone.name}</span>
                      <span className="text-xs text-stone-400">{zone.clusters.length} clusters</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setClusterFormZoneId(zone.id)}
                        className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700">
                        <Plus className="w-3 h-3" /> Cluster
                      </button>
                      <button onClick={() => setConfirmDelete({ type: "zone", id: zone.id, name: zone.name })}
                        className="opacity-0 group-hover/zone:opacity-100 p-1 text-stone-300 hover:text-red-400 transition-all">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {clusterFormZoneId === zone.id && (
                    <div className="px-6 py-2 border-t border-stone-100 flex gap-2">
                      {inlineInput(newClusterName, setNewClusterName, () => createCluster(zone.id, city.id), () => { setClusterFormZoneId(null); setNewClusterName(""); }, "Cluster name…")}
                      {addBtn("Add", () => createCluster(zone.id, city.id), !newClusterName.trim() || saving)}
                      {cancelBtn(() => { setClusterFormZoneId(null); setNewClusterName(""); })}
                    </div>
                  )}

                  {expanded.has(`z-${zone.id}`) && zone.clusters.map((cluster) => (
                    <div key={cluster.id} className="border-t border-stone-100">
                      {/* Cluster row */}
                      <div className="flex items-center justify-between px-8 py-2 bg-white group/cluster">
                        <button onClick={() => toggle(`cl-${cluster.id}`)} className="flex items-center gap-2 flex-1 text-left">
                          {expanded.has(`cl-${cluster.id}`) ? <ChevronDown className="w-3 h-3 text-stone-300" /> : <ChevronRight className="w-3 h-3 text-stone-300" />}
                          <span className="text-xs font-medium text-stone-600">{cluster.name}</span>
                          <span className="text-[10px] text-stone-400">{cluster.settlements.length} settlements</span>
                        </button>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setSettlementFormClusterId(cluster.id)}
                            className="flex items-center gap-1 text-[10px] text-sky-600 hover:text-sky-700">
                            <Plus className="w-2.5 h-2.5" /> Settlement
                          </button>
                          <button onClick={() => setConfirmDelete({ type: "cluster", id: cluster.id, name: cluster.name })}
                            className="opacity-0 group-hover/cluster:opacity-100 p-1 text-stone-300 hover:text-red-400 transition-all">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {settlementFormClusterId === cluster.id && (
                        <div className="px-8 py-2 border-t border-stone-100 flex gap-2">
                          {inlineInput(newSettlementName, setNewSettlementName, () => createSettlement(cluster.id, zone.id, city.id), () => { setSettlementFormClusterId(null); setNewSettlementName(""); }, "Settlement name…")}
                          {addBtn("Add", () => createSettlement(cluster.id, zone.id, city.id), !newSettlementName.trim() || saving)}
                          {cancelBtn(() => { setSettlementFormClusterId(null); setNewSettlementName(""); })}
                        </div>
                      )}

                      {expanded.has(`cl-${cluster.id}`) && cluster.settlements.map((s) => (
                        <div key={s.id} className="px-12 py-1.5 border-t border-stone-50 flex items-center gap-2 group/settlement">
                          <span className="w-1 h-1 rounded-full bg-stone-300 flex-shrink-0" />
                          <span className="text-xs text-stone-600 flex-1">{s.name}</span>
                          {s.goals.length > 0 && (
                            <span className="text-[10px] text-stone-400">({s.goals.length} goal{s.goals.length !== 1 ? "s" : ""})</span>
                          )}
                          <button onClick={() => setConfirmDelete({ type: "settlement", id: s.id, name: s.name })}
                            className="opacity-0 group-hover/settlement:opacity-100 p-0.5 text-stone-300 hover:text-red-400 transition-all">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}

          {/* Orphan zones (no city assigned) */}
          {orphanZones.length > 0 && (
            <div className="border border-dashed border-stone-200 rounded-xl p-4">
              <p className="text-xs font-medium text-stone-400 mb-2">Zones without a city</p>
              <div className="space-y-1">
                {orphanZones.map((z) => (
                  <div key={z.id} className="flex items-center gap-2 group/orphan">
                    <span className="text-xs text-stone-600 flex-1">{z.name}</span>
                    <button onClick={() => setConfirmDelete({ type: "zone", id: z.id, name: z.name })}
                      className="opacity-0 group-hover/orphan:opacity-100 p-0.5 text-stone-300 hover:text-red-400 transition-all">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-5 max-w-sm w-full space-y-3">
            <p className="text-sm font-semibold text-stone-800">Delete {confirmDelete.type}?</p>
            <p className="text-xs text-stone-500">
              <span className="font-medium text-stone-700">{confirmDelete.name}</span> will be removed.
              This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setConfirmDelete(null)}
                className="px-3 py-2 text-sm text-stone-600 hover:text-stone-800">Cancel</button>
              <button onClick={handleDelete}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
