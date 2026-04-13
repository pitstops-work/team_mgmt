"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, MapPin, Building2, Plus, X } from "lucide-react";
import { useGeoData, type GeoFeature } from "@/lib/useGeoData";
import { LAYERS, type LayerKey } from "@/lib/layers";

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

const builtInKeys: LayerKey[] = ["sangama", "cfar", "actionaid", "gubbachi", "sieds", "janasha", "maarga", "thamate"];

function groupByZoneCluster(features: GeoFeature[]): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  for (const f of features) {
    const name = f.properties.name ?? "Unnamed";
    const zone = f.properties.zone ?? "Unknown Zone";
    const cluster = (f.properties.cluster ?? "Unknown Cluster").replace(/_/g, " ");
    if (!out[zone]) out[zone] = {};
    if (!out[zone][cluster]) out[zone][cluster] = [];
    out[zone][cluster].push(name);
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
  grouped,
  customPolygons,
  color,
}: {
  grouped: Record<string, Record<string, string[]>>;
  customPolygons: CustomPolygon[];
  color: string;
}) {
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const toggleZone = (z: string) =>
    setExpandedZones((p) => { const s = new Set(p); s.has(z) ? s.delete(z) : s.add(z); return s; });

  const zones = Object.keys(grouped).sort();
  const totalSettlements = Object.values(grouped).flatMap(Object.values).flat().length;
  const totalClusters = Object.values(grouped).flatMap(Object.keys).length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-xs text-slate-500">
        <span className="font-semibold" style={{ color }}>{totalSettlements}</span> settlements ·{" "}
        <span className="font-semibold text-slate-700">{totalClusters}</span> clusters ·{" "}
        <span className="font-semibold text-slate-700">{zones.length}</span> zones
        {customPolygons.length > 0 && (
          <> · <span className="font-semibold text-slate-700">{customPolygons.length}</span> custom</>
        )}
      </div>

      <div className="space-y-1">
        {zones.map((zone) => {
          const clusters = grouped[zone];
          const clusterNames = Object.keys(clusters).sort();
          const settCount = Object.values(clusters).flat().length;
          const isOpen = expandedZones.has(zone);
          return (
            <div key={zone} className="rounded-lg overflow-hidden border border-slate-100">
              <button
                onClick={() => toggleZone(zone)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              >
                {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
                <span className="text-xs font-semibold text-slate-700">{zone}</span>
                <span className="ml-auto text-[10px] text-slate-400">{settCount} settlements · {clusterNames.length} clusters</span>
              </button>
              {isOpen && (
                <div className="px-3 py-2 space-y-2">
                  {clusterNames.map((cluster) => (
                    <div key={cluster}>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{cluster}</div>
                      <div className="flex flex-wrap gap-1">
                        {clusters[cluster].sort().map((s) => (
                          <span key={s} className="text-[11px] bg-white border border-slate-200 rounded-md px-2 py-0.5 text-slate-600 flex items-center gap-1">
                            <MapPin className="w-2.5 h-2.5 text-slate-300" />
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Custom polygons for this partner */}
        {customPolygons.length > 0 && (
          <div className="rounded-lg overflow-hidden border border-slate-100">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 text-left">
              <span className="text-xs font-semibold text-slate-700">Custom settlements</span>
              <span className="ml-auto text-[10px] text-slate-400">{customPolygons.length} drawn</span>
            </div>
            <div className="px-3 py-2">
              <div className="flex flex-wrap gap-1">
                {customPolygons.map((p) => (
                  <span key={p.id} className="text-[11px] bg-white border border-dashed border-slate-300 rounded-md px-2 py-0.5 text-slate-600 flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5 text-slate-300" />
                    {p.name}
                    {p.zone && <span className="text-slate-400">· {p.zone}</span>}
                  </span>
                ))}
              </div>
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
  onAddPartner,
}: {
  layerKey: string;
  label: string;
  color: string;
  features: GeoFeature[];
  centres: Array<{ name: string; type: string; zone?: string }>;
  customPolygons: CustomPolygon[];
  onAddPartner?: () => void;
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
            <SettlementTree grouped={grouped} customPolygons={customPolygons} color={color} />
          ) : (
            <div className="text-xs text-slate-400 italic py-2">
              No settlements mapped yet.
              {onAddPartner && (
                <button onClick={onAddPartner} className="ml-1 text-indigo-500 hover:underline">Add on map →</button>
              )}
            </div>
          )}
          <CentreList centres={centres} />
        </div>
      )}
    </div>
  );
}

export default function PartnersPage({ dbPartners: initialDbPartners, customPolygons }: PartnersPageProps) {
  const geoData = useGeoData();
  const [dbPartners, setDbPartners] = useState<DBPartner[]>(initialDbPartners);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ label: "", key: "", color: "#6366f1" });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

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

  const dbByKey = Object.fromEntries(dbPartners.map((p) => [p.key, p]));
  const customPolygonsByPartner = customPolygons.reduce<Record<string, CustomPolygon[]>>((acc, p) => {
    if (!acc[p.partnerKey]) acc[p.partnerKey] = [];
    acc[p.partnerKey].push(p);
    return acc;
  }, {});

  const customDbPartners = dbPartners.filter((p) => !p.isBuiltIn);

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
          {builtInKeys.map((key) => {
            const layer = LAYERS.find((l) => l.key === key)!;
            const db = dbByKey[key];
            const color = db?.color ?? layer.color;
            const features = geoData.settlements[key] ?? [];
            const centres = centresForPartner(layer.label);
            const customPoly = customPolygonsByPartner[key] ?? [];
            return (
              <PartnerCard
                key={key}
                layerKey={key}
                label={layer.label}
                color={color}
                features={features}
                centres={centres}
                customPolygons={customPoly}
              />
            );
          })}

          {customDbPartners.length > 0 && (
            <>
              <div className="pt-4 pb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Custom Partners</span>
              </div>
              {customDbPartners.map((partner) => {
                const features: GeoFeature[] = [];
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
