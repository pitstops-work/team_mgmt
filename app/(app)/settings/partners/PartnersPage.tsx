"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, MapPin, Building2, Plus, X } from "lucide-react";
import { useGeoData, type GeoFeature } from "@/lib/useGeoData";
import { LAYER_MAP } from "@/lib/layers";

interface DBPartner {
  id: string;
  key: string;
  label: string;
  color: string;
  isBuiltIn: boolean;
  createdAt: Date;
}

interface CustomPolygon {
  id: string;
  name: string;
  partnerKey: string;
  zone: string | null;
  cluster: string | null;
  description: string | null;
}

interface PartnersPageProps {
  dbPartners: DBPartner[];
  customPolygons: CustomPolygon[];
}

const PRESET_COLORS = [
  "#6366f1", "#10b981", "#ef4444", "#f59e0b",
  "#ec4899", "#8b5cf6", "#f97316", "#06b6d4",
  "#0ea5e9", "#84cc16", "#a855f7", "#14b8a6",
];

const CENTRE_LABELS: Record<string, string> = {
  resource: "Resource Centre",
  children: "Children Centre",
  youth: "Youth Centre",
  creches: "Creche",
};


type SettlementEntry = { id: string | null; name: string };
type ClusterEntry = { clusterId: string | null; settlements: SettlementEntry[] };
type ZoneEntry = { zoneId: string | null; clusters: Record<string, ClusterEntry> };
type GroupedData = Record<string, ZoneEntry>;

function groupByZoneCluster(features: GeoFeature[]): GroupedData {
  const out: GroupedData = {};
  for (const f of features) {
    const name = String(f.properties.name ?? "Unnamed");
    const zone = String(f.properties.zone ?? "Unknown Zone");
    const cluster = String(f.properties.cluster ?? "Unknown Cluster").replace(/_/g, " ");
    const id = (f.properties.id as string | undefined) ?? null;
    const clusterId = (f.properties.clusterId as string | undefined) ?? null;
    const zoneId = (f.properties.zoneId as string | undefined) ?? null;
    if (!out[zone]) out[zone] = { zoneId, clusters: {} };
    else if (zoneId && !out[zone].zoneId) out[zone].zoneId = zoneId;
    if (!out[zone].clusters[cluster]) out[zone].clusters[cluster] = { clusterId, settlements: [] };
    out[zone].clusters[cluster].settlements.push({ id, name });
  }
  return out;
}

function CentreList({ centres }: { centres: Array<{ name: string; type: string; zone?: string }> }) {
  if (!centres.length) return null;
  return (
    <div className="mt-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Centres</div>
      <div className="space-y-1">
        {centres.map((c, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
            <Building2 className="w-3 h-3 text-slate-400 flex-shrink-0" />
            <span>{c.name}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-400">{c.type}</span>
            {c.zone && <span className="text-slate-300">· {c.zone}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function SettlementTree({
  grouped: initialGrouped,
  customPolygons,
  color,
  allPartners,
  onReassign,
}: {
  grouped: GroupedData;
  customPolygons: CustomPolygon[];
  color: string;
  allPartners: { key: string; label: string }[];
  onReassign: (polygonId: string, newPartnerKey: string) => void;
}) {
  const [grouped, setGrouped] = useState<GroupedData>(initialGrouped);
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  // Settlement drag state (id can be null for static settlements)
  const [dragging, setDragging] = useState<{ id: string | null; name: string; fromClusterId: string } | null>(null);
  const [dragOverClusterId, setDragOverClusterId] = useState<string | null>(null);
  // Cluster drag state
  const [draggingCluster, setDraggingCluster] = useState<{ clusterId: string; clusterName: string; fromZone: string } | null>(null);
  const [dragOverZone, setDragOverZone] = useState<string | null>(null);

  const toggleZone = (z: string) =>
    setExpandedZones((p) => { const s = new Set(p); s.has(z) ? s.delete(z) : s.add(z); return s; });

  const zones = Object.keys(grouped).sort();
  const totalSettlements = Object.values(grouped).reduce(
    (s, ze) => s + Object.values(ze.clusters).reduce((cs, c) => cs + c.settlements.length, 0), 0
  );
  const totalClusters = Object.values(grouped).reduce((s, ze) => s + Object.keys(ze.clusters).length, 0);

  async function handleSettlementDrop(targetClusterId: string) {
    if (!dragging || dragging.fromClusterId === targetClusterId) {
      setDragging(null); setDragOverClusterId(null); return;
    }

    let resolvedId = dragging.id;

    if (!resolvedId) {
      // Static settlement — create a DB record in the target cluster
      const res = await fetch("/api/geography/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: dragging.name, clusterId: targetClusterId }),
      });
      if (!res.ok) { setDragging(null); setDragOverClusterId(null); return; }
      const created = await res.json() as { id: string };
      resolvedId = created.id;
    } else {
      // DB settlement — update its cluster
      const res = await fetch("/api/geography/settlements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: resolvedId, clusterId: targetClusterId }),
      });
      if (!res.ok) { setDragging(null); setDragOverClusterId(null); return; }
    }

    setGrouped(prev => {
      const next: GroupedData = JSON.parse(JSON.stringify(prev));
      // Remove from old cluster
      for (const ze of Object.values(next)) {
        for (const entry of Object.values(ze.clusters)) {
          if (entry.clusterId === dragging.fromClusterId) {
            entry.settlements = entry.settlements.filter(s => s.name !== dragging.name);
          }
        }
      }
      // Add to target cluster with resolved id
      for (const ze of Object.values(next)) {
        for (const entry of Object.values(ze.clusters)) {
          if (entry.clusterId === targetClusterId) {
            entry.settlements.push({ id: resolvedId, name: dragging.name });
          }
        }
      }
      return next;
    });
    setDragging(null); setDragOverClusterId(null);
  }

  async function handleClusterDrop(targetZoneName: string) {
    if (!draggingCluster || draggingCluster.fromZone === targetZoneName) {
      setDraggingCluster(null); setDragOverZone(null); return;
    }
    const targetZoneId = grouped[targetZoneName]?.zoneId;
    if (!targetZoneId) { setDraggingCluster(null); setDragOverZone(null); return; }

    const res = await fetch("/api/geography/clusters", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: draggingCluster.clusterId, zoneId: targetZoneId }),
    });
    if (res.ok) {
      setGrouped(prev => {
        const next: GroupedData = JSON.parse(JSON.stringify(prev));
        const clusterData = next[draggingCluster.fromZone]?.clusters[draggingCluster.clusterName];
        if (clusterData) {
          delete next[draggingCluster.fromZone].clusters[draggingCluster.clusterName];
          if (!next[targetZoneName]) next[targetZoneName] = { zoneId: targetZoneId, clusters: {} };
          next[targetZoneName].clusters[draggingCluster.clusterName] = clusterData;
        }
        return next;
      });
    }
    setDraggingCluster(null); setDragOverZone(null);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-xs text-slate-500 flex-wrap">
        <span className="font-semibold" style={{ color }}>{totalSettlements}</span> settlements ·{" "}
        <span className="font-semibold text-slate-700">{totalClusters}</span> clusters ·{" "}
        <span className="font-semibold text-slate-700">{zones.length}</span> zones
        {customPolygons.length > 0 && (
          <> · <span className="font-semibold text-slate-700">{customPolygons.length}</span> custom</>
        )}
        {dragging && <span className="text-indigo-500 italic">Moving settlement "{dragging.name}"…</span>}
        {draggingCluster && <span className="text-violet-500 italic">Moving cluster "{draggingCluster.clusterName}"…</span>}
      </div>

      <div className="space-y-1">
        {zones.map((zone) => {
          const zoneEntry = grouped[zone];
          const clusterNames = Object.keys(zoneEntry.clusters).sort();
          const settCount = Object.values(zoneEntry.clusters).reduce((s, c) => s + c.settlements.length, 0);
          const isOpen = expandedZones.has(zone);
          const isClusterDropTarget = !!draggingCluster && dragOverZone === zone && draggingCluster.fromZone !== zone;
          return (
            <div key={zone} className={`rounded-lg overflow-hidden border transition-colors ${isClusterDropTarget ? "border-violet-300 bg-violet-50" : "border-slate-100"}`}>
              <button
                onClick={() => toggleZone(zone)}
                onDragOver={e => { if (draggingCluster && zoneEntry.zoneId && draggingCluster.fromZone !== zone) { e.preventDefault(); setDragOverZone(zone); } }}
                onDragLeave={() => setDragOverZone(null)}
                onDrop={e => { e.preventDefault(); handleClusterDrop(zone); }}
                className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              >
                {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
                <span className="text-xs font-semibold text-slate-700">{zone}</span>
                {isClusterDropTarget && <span className="text-[9px] text-violet-500 italic">drop cluster here</span>}
                <span className="ml-auto text-[10px] text-slate-400">{settCount} settlements · {clusterNames.length} clusters</span>
              </button>
              {isOpen && (
                <div className="px-3 py-2 space-y-2">
                  {clusterNames.map((cluster) => {
                    const entry = zoneEntry.clusters[cluster];
                    const isSettDragTarget = dragging && entry.clusterId && dragOverClusterId === entry.clusterId;
                    return (
                      <div
                        key={cluster}
                        onDragOver={e => { if (dragging && entry.clusterId) { e.preventDefault(); setDragOverClusterId(entry.clusterId); } }}
                        onDragLeave={() => setDragOverClusterId(null)}
                        onDrop={e => { e.preventDefault(); if (entry.clusterId) handleSettlementDrop(entry.clusterId); }}
                        className={`rounded-md transition-colors ${isSettDragTarget ? "bg-indigo-50 ring-1 ring-indigo-300" : ""}`}
                      >
                        <div
                          className={`text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 px-1 py-1 flex items-center gap-1 rounded select-none
                            ${entry.clusterId ? "cursor-grab active:cursor-grabbing hover:text-violet-600" : ""}
                            ${draggingCluster?.clusterId === entry.clusterId ? "opacity-40" : ""}`}
                          draggable={!!entry.clusterId}
                          onDragStart={() => {
                            if (entry.clusterId) setDraggingCluster({ clusterId: entry.clusterId, clusterName: cluster, fromZone: zone });
                          }}
                          onDragEnd={() => { setDraggingCluster(null); setDragOverZone(null); }}
                        >
                          <span className="text-slate-300 mr-0.5 text-[8px]">⠿</span>
                          {cluster}
                          {isSettDragTarget && <span className="text-[9px] text-indigo-400 normal-case font-normal ml-1">drop settlement here</span>}
                        </div>
                        <div className="flex flex-wrap gap-1 px-1 pb-1 min-h-[24px]">
                          {entry.settlements
                            .slice()
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((s) => (
                              <span
                                key={s.id ?? s.name}
                                draggable={!!entry.clusterId}
                                onDragStart={() => {
                                  if (entry.clusterId) setDragging({ id: s.id, name: s.name, fromClusterId: entry.clusterId! });
                                }}
                                onDragEnd={() => { setDragging(null); setDragOverClusterId(null); }}
                                className={`text-[11px] bg-white border border-slate-200 rounded-md px-2 py-0.5 text-slate-600 flex items-center gap-1 select-none
                                  ${entry.clusterId ? "cursor-grab active:cursor-grabbing hover:border-indigo-300 hover:text-indigo-700" : ""}
                                  ${dragging?.name === s.name && dragging.fromClusterId === entry.clusterId ? "opacity-40" : ""}`}
                                title={s.id ? "Drag to move to another cluster" : "Drag to register in another cluster"}
                              >
                                <MapPin className="w-2.5 h-2.5 text-slate-300 flex-shrink-0" />
                                {s.name}
                                {!s.id && <span className="text-[8px] text-slate-300">*</span>}
                              </span>
                            ))}
                          {entry.settlements.length === 0 && (
                            <span className="text-[10px] text-slate-300 italic px-1">empty</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Custom polygons for this partner */}
        {customPolygons.length > 0 && (
          <div className="rounded-lg overflow-hidden border border-slate-100">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50">
              <span className="text-xs font-semibold text-slate-700">Custom settlements</span>
              <span className="ml-auto text-[10px] text-slate-400">{customPolygons.length} drawn</span>
            </div>
            <div className="px-3 py-2 space-y-1">
              {customPolygons.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <MapPin className="w-3 h-3 text-slate-300 flex-shrink-0" />
                  <span className="text-xs text-slate-600 flex-1">{p.name}</span>
                  {p.zone && <span className="text-[10px] text-slate-400">{p.zone}</span>}
                  <select
                    className="text-[10px] border border-slate-200 rounded px-1.5 py-0.5 text-slate-500 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    value=""
                    onChange={(e) => { if (e.target.value) onReassign(p.id, e.target.value); }}
                  >
                    <option value="">Move to…</option>
                    {allPartners.map((ap) => (
                      <option key={ap.key} value={ap.key}>{ap.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PartnerCard({
  layerKey,
  label,
  color,
  features,
  centres,
  customPolygons,
  allPartners,
  onReassign,
}: {
  layerKey: string;
  label: string;
  color: string;
  features: GeoFeature[];
  centres: Array<{ name: string; type: string; zone?: string }>;
  customPolygons: CustomPolygon[];
  allPartners: { key: string; label: string }[];
  onReassign: (polygonId: string, newPartnerKey: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const grouped = groupByZoneCluster(features);
  const totalSettlements = features.length + customPolygons.length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left"
      >
        <span className="w-4 h-4 rounded-sm flex-shrink-0" style={{ background: color }} />
        <span className="font-semibold text-slate-800 text-sm">{label}</span>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-400">
          <span>{totalSettlements} settlements</span>
          {centres.length > 0 && <span>{centres.length} centres</span>}
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
          {features.length > 0 || customPolygons.length > 0 ? (
            <SettlementTree grouped={grouped} customPolygons={customPolygons} color={color} allPartners={allPartners} onReassign={onReassign} />
          ) : (
            <div className="text-xs text-slate-400 italic py-2">No settlements mapped yet.</div>
          )}
          <CentreList centres={centres} />
        </div>
      )}
    </div>
  );
}

export default function PartnersPage({ dbPartners: initialDbPartners, customPolygons: initialCustomPolygons }: PartnersPageProps) {
  const geoData = useGeoData();
  const [dbPartners, setDbPartners] = useState<DBPartner[]>(initialDbPartners);
  const [customPolygons, setCustomPolygons] = useState<CustomPolygon[]>(initialCustomPolygons);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ label: "", key: "", color: "#6366f1" });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  async function handleReassign(polygonId: string, newPartnerKey: string) {
    const res = await fetch(`/api/map/polygons/${polygonId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerKey: newPartnerKey }),
    });
    if (res.ok) {
      setCustomPolygons((prev) =>
        prev.map((p) => p.id === polygonId ? { ...p, partnerKey: newPartnerKey } : p)
      );
    }
  }

  async function handleAddSave() {
    setAddError("");
    if (!addForm.label.trim() || !addForm.key.trim()) {
      setAddError("Name and key are required.");
      return;
    }
    setAddSaving(true);
    try {
      const res = await fetch("/api/map/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: addForm.key.trim(),
          label: addForm.label.trim(),
          color: addForm.color,
          isBuiltIn: false,
        }),
      });
      if (res.ok) {
        const created = await res.json() as DBPartner;
        setDbPartners((prev) => [...prev, created]);
        setAddForm({ label: "", key: "", color: "#6366f1" });
        setShowAddModal(false);
      } else {
        const data = await res.json() as { error?: string };
        setAddError(data.error ?? "Failed to create partner.");
      }
    } finally {
      setAddSaving(false);
    }
  }

  // Build centre list per partner key
  function centresForPartner(partnerLabel: string): Array<{ name: string; type: string; zone?: string }> {
    if (!geoData) return [];
    const results: Array<{ name: string; type: string; zone?: string }> = [];
    const centreKeys = ["resource", "children", "youth", "creches"] as const;
    for (const ck of centreKeys) {
      for (const f of geoData.centres[ck]) {
        const fp = f.properties.partner ?? "";
        if (fp.toLowerCase() === partnerLabel.toLowerCase()) {
          results.push({
            name: f.properties.name ?? "Unnamed",
            type: CENTRE_LABELS[ck],
            zone: f.properties.zone,
          });
        }
      }
    }
    return results;
  }

  const customPolygonsByPartner = customPolygons.reduce<Record<string, CustomPolygon[]>>((acc, p) => {
    if (!acc[p.partnerKey]) acc[p.partnerKey] = [];
    acc[p.partnerKey].push(p);
    return acc;
  }, {});

  // All partners from DB — single source of truth
  const allPartners = dbPartners.map(p => ({ key: p.key, label: p.label }));
  const customDbPartners = dbPartners.filter(p => !p.isBuiltIn);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Partners</h1>
          <p className="text-sm text-slate-500 mt-0.5">Programme partner NGOs — settlements, clusters, zones and centres</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Add Partner
        </button>
      </div>

      {!geoData && (
        <div className="text-center py-10 text-sm text-slate-400">Loading map data…</div>
      )}

      {geoData && (
        <div className="space-y-2">
          {/* Built-in partners — use LAYER_MAP only for GeoJSON file lookup */}
          {dbPartners.filter(p => p.isBuiltIn).map((partner) => {
            const layer = LAYER_MAP[partner.key as keyof typeof LAYER_MAP];
            const features = layer ? (geoData.settlements[partner.key as keyof typeof geoData.settlements] ?? []) : [];
            const centres = centresForPartner(partner.label);
            const customPoly = customPolygonsByPartner[partner.key] ?? [];
            return (
              <PartnerCard
                key={partner.id}
                layerKey={partner.key}
                label={partner.label}
                color={partner.color}
                features={features}
                centres={centres}
                customPolygons={customPoly}
                allPartners={allPartners}
                onReassign={handleReassign}
              />
            );
          })}

          {customDbPartners.length > 0 && (
            <>
              <div className="pt-4 pb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Custom Partners</span>
              </div>
              {customDbPartners.map((partner) => {
                const centres = centresForPartner(partner.label);
                const customPoly = customPolygonsByPartner[partner.key] ?? [];
                return (
                  <PartnerCard
                    key={partner.id}
                    layerKey={partner.key}
                    label={partner.label}
                    color={partner.color}
                    features={[]}
                    centres={centres}
                    customPolygons={customPoly}
                    allPartners={allPartners}
                    onReassign={handleReassign}
                  />
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Add Partner Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">Add Partner</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              {addError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{addError}</div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Partner Name *</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={addForm.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    setAddForm((f) => ({
                      ...f,
                      label,
                      key: f.key || label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
                    }));
                  }}
                  placeholder="e.g. Navodaya"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Key (unique slug) *</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={addForm.key}
                  onChange={(e) => setAddForm((f) => ({ ...f, key: e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") }))}
                  placeholder="e.g. navodaya"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Colour</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setAddForm((f) => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-md transition-transform ${addForm.color === c ? "ring-2 ring-offset-1 ring-slate-400 scale-110" : "hover:scale-105"}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleAddSave}
                  disabled={addSaving || !addForm.label.trim() || !addForm.key.trim()}
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                >
                  {addSaving ? "Saving…" : "Add Partner"}
                </button>
                <button onClick={() => setShowAddModal(false)} className="flex-1 border border-slate-200 rounded-lg py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
