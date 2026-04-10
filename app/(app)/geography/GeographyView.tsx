"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin, Plus, ChevronDown, ChevronRight } from "lucide-react";

type GoalStub = { id: string; title: string };
type Settlement = { id: string; name: string; clusterId: string; goals: { goal: GoalStub }[] };
type Cluster = { id: string; name: string; zoneId: string; settlements: Settlement[]; goals: { goal: GoalStub }[] };
type Zone = { id: string; name: string; clusters: Cluster[]; goals: { goal: GoalStub }[] };

export default function GeographyView({
  initialZones,
}: {
  initialZones: Zone[];
  initialClusters: Cluster[];
  initialSettlements: Settlement[];
  currentUserId: string;
}) {
  const [zones, setZones] = useState<Zone[]>(initialZones);
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");
  const [showClusterForm, setShowClusterForm] = useState<string | null>(null);
  const [newClusterName, setNewClusterName] = useState("");
  const [showSettlementForm, setShowSettlementForm] = useState<string | null>(null);
  const [newSettlementName, setNewSettlementName] = useState("");
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const createZone = async () => {
    if (!newZoneName.trim()) return;
    setSaving(true);
    const res = await fetch("/api/geography/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newZoneName.trim() }),
    });
    if (res.ok) {
      const z = await res.json();
      setZones((prev) => [...prev, { ...z, clusters: [], goals: [] }]);
      setNewZoneName(""); setShowZoneForm(false);
    }
    setSaving(false);
  };

  const createCluster = async (zoneId: string) => {
    if (!newClusterName.trim()) return;
    setSaving(true);
    const res = await fetch("/api/geography/clusters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newClusterName.trim(), zoneId }),
    });
    if (res.ok) {
      const c = await res.json();
      setZones((prev) => prev.map((z) =>
        z.id === zoneId ? { ...z, clusters: [...z.clusters, { ...c, settlements: [], goals: [] }] } : z
      ));
      setNewClusterName(""); setShowClusterForm(null);
    }
    setSaving(false);
  };

  const createSettlement = async (clusterId: string, zoneId: string) => {
    if (!newSettlementName.trim()) return;
    setSaving(true);
    const res = await fetch("/api/geography/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSettlementName.trim(), clusterId }),
    });
    if (res.ok) {
      const s = await res.json();
      setZones((prev) => prev.map((z) =>
        z.id === zoneId ? {
          ...z,
          clusters: z.clusters.map((cl) =>
            cl.id === clusterId ? { ...cl, settlements: [...cl.settlements, { ...s, goals: [] }] } : cl
          )
        } : z
      ));
      setNewSettlementName(""); setShowSettlementForm(null);
    }
    setSaving(false);
  };

  const toggleZone = (id: string) => setExpandedZones((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleCluster = (id: string) => setExpandedClusters((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-stone-400" />
          <h1 className="text-lg font-semibold text-stone-900">Geography</h1>
        </div>
        <button onClick={() => setShowZoneForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" />
          Add Zone
        </button>
      </div>

      {showZoneForm && (
        <div className="mb-4 flex gap-2">
          <input autoFocus value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createZone(); if (e.key === "Escape") { setShowZoneForm(false); setNewZoneName(""); } }}
            placeholder="Zone name…"
            className="flex-1 px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
          <button onClick={createZone} disabled={!newZoneName.trim() || saving}
            className="px-3 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors">Add</button>
          <button onClick={() => { setShowZoneForm(false); setNewZoneName(""); }} className="px-3 py-2 text-sm text-stone-400">Cancel</button>
        </div>
      )}

      {zones.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-stone-200 rounded-xl">
          <p className="text-stone-400 text-sm">No zones yet. Add a zone to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {zones.map((zone) => (
            <div key={zone.id} className="border border-stone-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-stone-50">
                <button onClick={() => toggleZone(zone.id)} className="flex items-center gap-2 flex-1 text-left">
                  {expandedZones.has(zone.id) ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
                  <span className="text-sm font-semibold text-stone-800">{zone.name}</span>
                  <span className="text-xs text-stone-400">{zone.clusters.length} clusters · {zone.goals.length} goals</span>
                </button>
                <button onClick={() => setShowClusterForm(zone.id)}
                  className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700">
                  <Plus className="w-3.5 h-3.5" />
                  Cluster
                </button>
              </div>

              {showClusterForm === zone.id && (
                <div className="px-4 py-2 border-t border-stone-100 flex gap-2">
                  <input autoFocus value={newClusterName} onChange={(e) => setNewClusterName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") createCluster(zone.id); if (e.key === "Escape") { setShowClusterForm(null); setNewClusterName(""); } }}
                    placeholder="Cluster name…"
                    className="flex-1 px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400" />
                  <button onClick={() => createCluster(zone.id)} disabled={!newClusterName.trim() || saving}
                    className="px-2.5 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs rounded-md transition-colors">Add</button>
                  <button onClick={() => { setShowClusterForm(null); setNewClusterName(""); }} className="px-2 py-1 text-xs text-stone-400">Cancel</button>
                </div>
              )}

              {expandedZones.has(zone.id) && zone.clusters.map((cluster) => (
                <div key={cluster.id} className="border-t border-stone-100">
                  <div className="flex items-center justify-between px-6 py-2 bg-white">
                    <button onClick={() => toggleCluster(cluster.id)} className="flex items-center gap-2 flex-1 text-left">
                      {expandedClusters.has(cluster.id) ? <ChevronDown className="w-3.5 h-3.5 text-stone-300" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-300" />}
                      <span className="text-sm font-medium text-stone-700">{cluster.name}</span>
                      <span className="text-xs text-stone-400">{cluster.settlements.length} settlements</span>
                    </button>
                    <button onClick={() => setShowSettlementForm(cluster.id)}
                      className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700">
                      <Plus className="w-3 h-3" />
                      Settlement
                    </button>
                  </div>

                  {showSettlementForm === cluster.id && (
                    <div className="px-6 py-2 border-t border-stone-100 flex gap-2">
                      <input autoFocus value={newSettlementName} onChange={(e) => setNewSettlementName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") createSettlement(cluster.id, zone.id); if (e.key === "Escape") { setShowSettlementForm(null); setNewSettlementName(""); } }}
                        placeholder="Settlement name…"
                        className="flex-1 px-2.5 py-1.5 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-400" />
                      <button onClick={() => createSettlement(cluster.id, zone.id)} disabled={!newSettlementName.trim() || saving}
                        className="px-2.5 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-xs rounded-md">Add</button>
                      <button onClick={() => { setShowSettlementForm(null); setNewSettlementName(""); }} className="px-2 py-1 text-xs text-stone-400">Cancel</button>
                    </div>
                  )}

                  {expandedClusters.has(cluster.id) && cluster.settlements.map((s) => (
                    <div key={s.id} className="px-10 py-1.5 border-t border-stone-50">
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-stone-300 flex-shrink-0" />
                        <span className="text-xs text-stone-600">{s.name}</span>
                        {s.goals.length > 0 && <span className="text-[10px] text-stone-400">({s.goals.length} goals)</span>}
                      </div>
                      {s.goals.length > 0 && (
                        <div className="ml-3 mt-1 space-y-0.5">
                          {s.goals.map(({ goal }) => (
                            <Link key={goal.id} href={`/goals/${goal.id}`}
                              className="block text-[10px] text-sky-600 hover:text-sky-700 truncate">{goal.title}</Link>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
