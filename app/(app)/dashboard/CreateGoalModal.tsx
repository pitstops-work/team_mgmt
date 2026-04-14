"use client";

import { useState, useEffect } from "react";
import { X, Target, ChevronDown } from "lucide-react";

interface DomainConfig { domain: string; label: string; color: string }

interface RawGeo {
  cities: { id: string; name: string }[];
  zones: { id: string; name: string; cityId: string }[];
  clusters: { id: string; name: string; zoneId: string }[];
  settlements: { id: string; name: string; clusterId: string }[];
}

type GeoVal = { cityId: string; zoneId: string; clusterId: string; settlementId: string };

interface Props {
  onClose: () => void;
  onCreated: (goal: unknown) => void;
}

// ── Cascading geo picker (same logic as GoalNeedsSection) ────────────────────

function GeoPicker({ geo, value, onChange }: { geo: RawGeo; value: GeoVal; onChange: (v: GeoVal) => void }) {
  const { cityId, zoneId, clusterId, settlementId } = value;
  const sel = "w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white";

  const filteredZones = cityId ? geo.zones.filter(z => z.cityId === cityId) : geo.zones;
  const filteredClusters = zoneId ? geo.clusters.filter(cl => cl.zoneId === zoneId) : geo.clusters;
  const filteredSettlements = clusterId ? geo.settlements.filter(s => s.clusterId === clusterId) : geo.settlements;

  return (
    <div className="space-y-1.5">
      <div>
        <label className="block text-[10px] text-stone-400 mb-0.5">City</label>
        <select value={cityId} onChange={e => onChange({ cityId: e.target.value, zoneId: "", clusterId: "", settlementId: "" })} className={sel}>
          <option value="">All cities</option>
          {geo.cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[10px] text-stone-400 mb-0.5">Zone <span className="text-stone-300">(assign here or go deeper)</span></label>
        <select value={zoneId} onChange={e => onChange({ cityId, zoneId: e.target.value, clusterId: "", settlementId: "" })} className={sel}>
          <option value="">— select zone —</option>
          {filteredZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      </div>
      {zoneId && (
        <div>
          <label className="block text-[10px] text-stone-400 mb-0.5">Cluster <span className="text-stone-300">(optional)</span></label>
          <select value={clusterId} onChange={e => onChange({ cityId, zoneId, clusterId: e.target.value, settlementId: "" })} className={sel}>
            <option value="">— all clusters in zone —</option>
            {filteredClusters.map(cl => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
          </select>
        </div>
      )}
      {clusterId && (
        <div>
          <label className="block text-[10px] text-stone-400 mb-0.5">Settlement <span className="text-stone-300">(optional)</span></label>
          <select value={settlementId} onChange={e => onChange({ cityId, zoneId, clusterId, settlementId: e.target.value })} className={sel}>
            <option value="">— all settlements in cluster —</option>
            {filteredSettlements.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      {(settlementId || clusterId || zoneId) && (
        <p className="text-[10px] text-sky-600 font-medium">
          Actuals will count toward:{" "}
          {settlementId
            ? `settlement — ${geo.settlements.find(s => s.id === settlementId)?.name}`
            : clusterId
            ? `cluster — ${geo.clusters.find(cl => cl.id === clusterId)?.name}`
            : `zone — ${geo.zones.find(z => z.id === zoneId)?.name}`}
        </p>
      )}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function CreateGoalModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("Active");
  const [targetDate, setTargetDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Needs section
  const [showNeeds, setShowNeeds] = useState(false);
  const [needsDomain, setNeedsDomain] = useState("");
  const [parameter, setParameter] = useState("");
  const [geoVal, setGeoVal] = useState<GeoVal>({ cityId: "", zoneId: "", clusterId: "", settlementId: "" });
  const [geo, setGeo] = useState<RawGeo | null>(null);
  const [domains, setDomains] = useState<DomainConfig[]>([]);

  useEffect(() => {
    if (showNeeds && !geo) {
      Promise.all([
        fetch("/api/geography").then(r => r.json()),
        fetch("/api/needs/formulas").then(r => r.json()),
      ]).then(([geoData, domainData]) => {
        setGeo(geoData);
        setDomains(domainData);
      });
    }
  }, [showNeeds, geo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !targetDate) return;
    setLoading(true);
    setError("");

    const needsPayload = showNeeds && needsDomain ? {
      needsDomain,
      ...(parameter && { parameter: parseFloat(parameter) }),
      ...(geoVal.settlementId && { needsSettlementId: geoVal.settlementId }),
      ...(geoVal.clusterId && !geoVal.settlementId && { needsClusterId: geoVal.clusterId }),
      ...(geoVal.zoneId && !geoVal.clusterId && !geoVal.settlementId && { needsZoneId: geoVal.zoneId }),
    } : {};

    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || null, status, targetDate, ...needsPayload }),
      });
      if (!res.ok) throw new Error("Failed to create goal");
      const goal = await res.json();
      onCreated(goal);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-stone-900">New Goal</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Title</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What are you working toward?"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional context or motivation..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent resize-none"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-stone-600 mb-1">
                Deadline <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-stone-600 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent bg-white"
              >
                <option value="Active">Active</option>
                <option value="Paused">Paused</option>
                <option value="Complete">Complete</option>
              </select>
            </div>
          </div>

          {/* Optional needs linking */}
          <div className="border border-stone-100 rounded-lg overflow-hidden">
            <button type="button" onClick={() => setShowNeeds(o => !o)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-stone-500 hover:bg-stone-50 transition-colors text-left">
              <Target className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-medium">Link to Needs domain</span>
              <span className="text-stone-300 text-[10px] ml-1">optional</span>
              <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${showNeeds ? "rotate-180" : ""}`} />
            </button>
            {showNeeds && (
              <div className="px-3 pb-3 pt-2 space-y-3 border-t border-stone-100">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-stone-400 mb-1">Domain</label>
                  <select value={needsDomain} onChange={e => { setNeedsDomain(e.target.value); setGeoVal({ cityId: "", zoneId: "", clusterId: "", settlementId: "" }); }}
                    className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                    <option value="">— not linked —</option>
                    {domains.map(d => (
                      <option key={d.domain} value={d.domain}>{d.label}</option>
                    ))}
                  </select>
                </div>
                {needsDomain && (
                  <>
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wide text-stone-400 mb-1">Quantity</label>
                      <input type="number" min={0} step={1} value={parameter}
                        onChange={e => setParameter(e.target.value)}
                        placeholder="e.g. 2"
                        className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wide text-stone-400 mb-1">Counts toward</label>
                      {!geo ? (
                        <p className="text-[10px] text-stone-400">Loading geography…</p>
                      ) : (
                        <GeoPicker geo={geo} value={geoVal} onChange={setGeoVal} />
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900 transition-colors">Cancel</button>
            <button
              type="submit"
              disabled={!title.trim() || !targetDate || loading}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? "Creating..." : "Create Goal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
