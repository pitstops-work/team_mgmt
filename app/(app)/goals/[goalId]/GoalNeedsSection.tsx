"use client";

import { useEffect, useState } from "react";
import { Target, X, ChevronDown } from "lucide-react";

type NeedsDomain =
  | "Creche" | "ChildrenCentre" | "YouthGroup" | "ElderlyKitchen"
  | "PalliativeSupport" | "CommunityToilet" | "WaterATM";

const DOMAIN_LABELS: Record<NeedsDomain, string> = {
  Creche: "Creche",
  ChildrenCentre: "Children Centre",
  YouthGroup: "Youth Group",
  ElderlyKitchen: "Elderly Kitchen",
  PalliativeSupport: "Palliative Support",
  CommunityToilet: "Community Toilet",
  WaterATM: "Water ATM",
};

const DOMAIN_COLORS: Record<NeedsDomain, string> = {
  Creche: "#ec4899",
  ChildrenCentre: "#f97316",
  YouthGroup: "#8b5cf6",
  ElderlyKitchen: "#10b981",
  PalliativeSupport: "#6366f1",
  CommunityToilet: "#0ea5e9",
  WaterATM: "#14b8a6",
};

interface RawGeo {
  cities: { id: string; name: string }[];
  zones: { id: string; name: string; cityId: string }[];
  clusters: { id: string; name: string; zoneId: string }[];
  settlements: { id: string; name: string; clusterId: string }[];
}

interface NeedsState {
  needsDomain: NeedsDomain | null;
  parameter: number | null;
  needsSettlementId: string | null;
  needsClusterId: string | null;
  needsZoneId: string | null;
  needsSettlement: { id: string; name: string } | null;
  needsCluster: { id: string; name: string } | null;
  needsZone: { id: string; name: string } | null;
}

// ── Cascading geo picker ───────────────────────────────────────────────────────

function GeoPicker({
  geo,
  value, // { zoneId, clusterId, settlementId }
  onChange,
}: {
  geo: RawGeo;
  value: { zoneId: string; clusterId: string; settlementId: string };
  onChange: (update: { zoneId: string; clusterId: string; settlementId: string }) => void;
}) {
  const { zoneId, clusterId, settlementId } = value;

  // Derive city from selected zone
  const selectedZone = geo.zones.find(z => z.id === zoneId);
  const cityId = selectedZone?.cityId ?? "";

  const filteredZones = cityId
    ? geo.zones.filter(z => z.cityId === cityId)
    : geo.zones;
  const filteredClusters = zoneId
    ? geo.clusters.filter(cl => cl.zoneId === zoneId)
    : geo.clusters;
  const filteredSettlements = clusterId
    ? geo.settlements.filter(s => s.clusterId === clusterId)
    : geo.settlements;

  const handleCityChange = (newCityId: string) => {
    // Resetting city clears everything below
    onChange({ zoneId: "", clusterId: "", settlementId: "" });
    // If they picked a city, we just use it as a filter — don't store it
    // Keep city selection in local state via the zone's cityId
    void newCityId;
  };

  const handleZoneChange = (newZoneId: string) => {
    onChange({ zoneId: newZoneId, clusterId: "", settlementId: "" });
  };

  const handleClusterChange = (newClusterId: string) => {
    onChange({ zoneId, clusterId: newClusterId, settlementId: "" });
  };

  const handleSettlementChange = (newSettlementId: string) => {
    onChange({ zoneId, clusterId, settlementId: newSettlementId });
  };

  const sel = "w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white text-stone-800";

  return (
    <div className="space-y-1.5">
      {/* City (filter only) */}
      <div>
        <label className="block text-[10px] text-stone-400 mb-0.5">City</label>
        <select
          value={cityId}
          onChange={e => handleCityChange(e.target.value)}
          className={sel}
        >
          <option value="">All cities</option>
          {geo.cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Zone */}
      <div>
        <label className="block text-[10px] text-stone-400 mb-0.5">Zone <span className="text-stone-300">(assign here or go deeper)</span></label>
        <select value={zoneId} onChange={e => handleZoneChange(e.target.value)} className={sel}>
          <option value="">— select zone —</option>
          {filteredZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      </div>

      {/* Cluster — only shown once a zone is picked */}
      {zoneId && (
        <div>
          <label className="block text-[10px] text-stone-400 mb-0.5">Cluster <span className="text-stone-300">(optional — narrows down)</span></label>
          <select value={clusterId} onChange={e => handleClusterChange(e.target.value)} className={sel}>
            <option value="">— all clusters in zone —</option>
            {filteredClusters.map(cl => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
          </select>
        </div>
      )}

      {/* Settlement — only shown once a cluster is picked */}
      {clusterId && (
        <div>
          <label className="block text-[10px] text-stone-400 mb-0.5">Settlement <span className="text-stone-300">(optional — most specific)</span></label>
          <select value={settlementId} onChange={e => handleSettlementChange(e.target.value)} className={sel}>
            <option value="">— all settlements in cluster —</option>
            {filteredSettlements.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      {/* Assignment summary */}
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function GoalNeedsSection({ goalId }: { goalId: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<NeedsState | null>(null);
  const [geo, setGeo] = useState<RawGeo | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Local cascading picker state (derived from state on load, then controlled independently)
  const [pickerVal, setPickerVal] = useState({ zoneId: "", clusterId: "", settlementId: "" });

  useEffect(() => {
    if (!open || state) return;

    Promise.all([
      fetch(`/api/goals/${goalId}/needs`).then(r => r.json()),
      fetch("/api/geography").then(r => r.json()),
    ]).then(([needs, geoData]: [NeedsState, RawGeo]) => {
      setState(needs);
      setGeo(geoData);
      // Initialise picker from existing saved links
      setPickerVal({
        zoneId: needs.needsZoneId ?? needs.needsCluster
          ? (geoData.clusters.find(cl => cl.id === needs.needsClusterId)?.zoneId ?? "")
          : needs.needsSettlement
          ? (geoData.clusters.find(cl => cl.id === geoData.settlements.find(s => s.id === needs.needsSettlementId)?.clusterId)?.zoneId ?? "")
          : needs.needsZoneId ?? "",
        clusterId: needs.needsClusterId
          ?? geoData.settlements.find(s => s.id === needs.needsSettlementId)?.clusterId
          ?? "",
        settlementId: needs.needsSettlementId ?? "",
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patch = async (update: Partial<NeedsState & Record<string, unknown>>) => {
    setSaving(true);
    const res = await fetch(`/api/goals/${goalId}/needs`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    if (res.ok) {
      const updated = await res.json();
      setState(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  const handleDomainChange = (domain: NeedsDomain | "") => {
    patch({ needsDomain: domain || null });
  };

  const handleParameterBlur = (val: string) => {
    const num = val === "" ? null : parseFloat(val);
    if (num !== state?.parameter) patch({ parameter: num });
  };

  const handleGeoChange = (val: { zoneId: string; clusterId: string; settlementId: string }) => {
    setPickerVal(val);
    // Assign to the deepest non-empty level
    if (val.settlementId) {
      patch({ needsSettlementId: val.settlementId, needsClusterId: null, needsZoneId: null });
    } else if (val.clusterId) {
      patch({ needsClusterId: val.clusterId, needsSettlementId: null, needsZoneId: null });
    } else if (val.zoneId) {
      patch({ needsZoneId: val.zoneId, needsSettlementId: null, needsClusterId: null });
    } else {
      patch({ needsSettlementId: null, needsClusterId: null, needsZoneId: null });
    }
  };

  const handleGeoClear = () => {
    setPickerVal({ zoneId: "", clusterId: "", settlementId: "" });
    patch({ needsSettlementId: null, needsClusterId: null, needsZoneId: null });
  };

  const currentGeoName =
    state?.needsSettlement?.name ?? state?.needsCluster?.name ?? state?.needsZone?.name ?? null;
  const currentGeoType = state?.needsSettlementId
    ? "Settlement" : state?.needsClusterId ? "Cluster" : state?.needsZoneId ? "Zone" : null;

  const hasNeeds = state && (state.needsDomain || state.needsSettlementId || state.needsClusterId || state.needsZoneId);
  const domainColor = state?.needsDomain ? DOMAIN_COLORS[state.needsDomain] : undefined;

  return (
    <div className="pt-4 border-t border-stone-100">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-700 mb-2 w-full"
      >
        <Target className="w-3.5 h-3.5" />
        Needs Assessment
        {hasNeeds && state?.needsDomain && (
          <span
            className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white"
            style={{ background: DOMAIN_COLORS[state.needsDomain] }}
          >
            {DOMAIN_LABELS[state.needsDomain]}
          </span>
        )}
        {currentGeoName && (
          <span className="ml-1 text-[10px] text-stone-400 truncate max-w-[120px]">
            · {currentGeoType}: {currentGeoName}
          </span>
        )}
        <ChevronDown className={`w-3 h-3 ml-auto flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-3 pl-0.5">
          {!state || !geo ? (
            <p className="text-xs text-stone-400">Loading…</p>
          ) : (
            <>
              {/* Domain */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-stone-400 mb-1">
                  Needs Domain
                </label>
                <select
                  value={state.needsDomain ?? ""}
                  onChange={e => handleDomainChange(e.target.value as NeedsDomain | "")}
                  className="w-full px-3 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                  style={domainColor ? { borderColor: domainColor + "80", color: domainColor } : {}}
                >
                  <option value="">— not linked to a needs domain —</option>
                  {(Object.entries(DOMAIN_LABELS) as [NeedsDomain, string][]).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {state.needsDomain && (
                <>
                  {/* Parameter */}
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-stone-400 mb-1">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={state.parameter ?? ""}
                      placeholder="e.g. 2"
                      onBlur={e => handleParameterBlur(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      Counted toward actuals when Active (in-progress) or Complete (done).
                    </p>
                  </div>

                  {/* Geography */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                        Counts toward needs of
                      </label>
                      {currentGeoName && (
                        <button onClick={handleGeoClear} className="flex items-center gap-0.5 text-[10px] text-red-400 hover:text-red-600">
                          <X className="w-3 h-3" /> Clear
                        </button>
                      )}
                    </div>
                    <GeoPicker geo={geo} value={pickerVal} onChange={handleGeoChange} />
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 h-4">
                {saving && <span className="text-[10px] text-stone-400">Saving…</span>}
                {saved && <span className="text-[10px] text-emerald-600 font-semibold">Saved ✓</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
