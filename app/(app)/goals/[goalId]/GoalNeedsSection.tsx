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

type GeoScope = "settlement" | "cluster" | "zone";

interface GeoItem { id: string; name: string; parentName?: string }
interface AllGeo {
  zones: GeoItem[];
  clusters: (GeoItem & { zoneName?: string })[];
  settlements: (GeoItem & { clusterName?: string })[];
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

export default function GoalNeedsSection({ goalId }: { goalId: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<NeedsState | null>(null);
  const [allGeo, setAllGeo] = useState<AllGeo | null>(null);
  const [geoScope, setGeoScope] = useState<GeoScope>("settlement");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open || state) return;

    Promise.all([
      fetch(`/api/goals/${goalId}/needs`).then(r => r.json()),
      fetch("/api/geography").then(r => r.json()),
    ]).then(([needs, geo]) => {
      setState(needs);
      // Determine initial scope from existing links
      if (needs.needsSettlementId) setGeoScope("settlement");
      else if (needs.needsClusterId) setGeoScope("cluster");
      else if (needs.needsZoneId) setGeoScope("zone");

      setAllGeo({
        zones: (geo.zones ?? []).map((z: { id: string; name: string }) => ({ id: z.id, name: z.name })),
        clusters: (geo.clusters ?? []).map((cl: { id: string; name: string; zoneId?: string }) => {
          const zone = (geo.zones ?? []).find((z: { id: string; name: string }) => z.id === cl.zoneId);
          return { id: cl.id, name: cl.name, zoneName: zone?.name };
        }),
        settlements: (geo.settlements ?? []).map((s: { id: string; name: string; clusterId?: string }) => {
          const cluster = (geo.clusters ?? []).find((cl: { id: string }) => cl.id === s.clusterId);
          return { id: s.id, name: s.name, clusterName: cluster?.name };
        }),
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patch = async (update: Partial<NeedsState>) => {
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

  const handleGeoSelect = (id: string, name: string, type: GeoScope) => {
    if (type === "settlement") {
      patch({ needsSettlementId: id, needsClusterId: null, needsZoneId: null });
    } else if (type === "cluster") {
      patch({ needsClusterId: id, needsSettlementId: null, needsZoneId: null });
    } else {
      patch({ needsZoneId: id, needsSettlementId: null, needsClusterId: null });
    }
    setPickerOpen(false);
    setSearch("");
  };

  const handleGeoClear = () => {
    patch({ needsSettlementId: null, needsClusterId: null, needsZoneId: null });
  };

  const currentGeoName =
    state?.needsSettlement?.name ?? state?.needsCluster?.name ?? state?.needsZone?.name ?? null;
  const currentGeoType = state?.needsSettlementId
    ? "settlement" : state?.needsClusterId ? "cluster" : state?.needsZoneId ? "zone" : null;

  const pickerItems = (): (GeoItem & { sub?: string })[] => {
    if (!allGeo) return [];
    const q = search.toLowerCase();
    if (geoScope === "zone") return allGeo.zones.filter(z => z.name.toLowerCase().includes(q));
    if (geoScope === "cluster") return allGeo.clusters
      .filter(cl => cl.name.toLowerCase().includes(q) || cl.zoneName?.toLowerCase().includes(q))
      .map(cl => ({ ...cl, sub: cl.zoneName }));
    return allGeo.settlements
      .filter(s => s.name.toLowerCase().includes(q) || s.clusterName?.toLowerCase().includes(q))
      .map(s => ({ ...s, sub: s.clusterName }));
  };

  const hasNeeds = state && (state.needsDomain || state.needsSettlementId || state.needsClusterId || state.needsZoneId);
  const domainColor = state?.needsDomain ? DOMAIN_COLORS[state.needsDomain] : undefined;

  return (
    <div className="pt-4 border-t border-stone-100">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-700 mb-2"
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
        <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-3 pl-0.5">
          {!state ? (
            <p className="text-xs text-stone-400">Loading…</p>
          ) : (
            <>
              {/* Domain picker */}
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

              {/* Parameter */}
              {state.needsDomain && (
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-stone-400 mb-1">
                    Quantity (units completed / targeted)
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
                    Counted toward actuals when goal status is Active (in-progress) or Complete (done).
                  </p>
                </div>
              )}

              {/* Geography scope for needs */}
              {state.needsDomain && (
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-stone-400 mb-1">
                    Counts toward needs of
                  </label>

                  {/* Current link */}
                  {currentGeoName ? (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex items-center gap-1.5 px-2 py-1 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-700">
                        <span className="text-[10px] text-stone-400 capitalize">{currentGeoType}</span>
                        {currentGeoName}
                      </span>
                      <button onClick={handleGeoClear} className="text-stone-300 hover:text-red-400 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-[10px] text-stone-400 mb-2">No geography linked — actuals won't show on the map.</p>
                  )}

                  {/* Scope tabs + picker */}
                  <div className="flex gap-1 mb-2">
                    {(["settlement", "cluster", "zone"] as const).map(scope => (
                      <button
                        key={scope}
                        onClick={() => { setGeoScope(scope); setPickerOpen(true); setSearch(""); }}
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors capitalize ${
                          geoScope === scope && pickerOpen
                            ? "border-sky-400 bg-sky-50 text-sky-600 font-semibold"
                            : "border-stone-200 text-stone-500 hover:border-stone-300"
                        }`}
                      >
                        {scope === "settlement" ? "Settlement" : scope === "cluster" ? "Cluster" : "Zone"}
                      </button>
                    ))}
                  </div>

                  {pickerOpen && (
                    <div className="border border-stone-200 rounded-lg bg-white shadow-sm">
                      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-stone-100">
                        <input
                          autoFocus
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          placeholder={`Search ${geoScope}s…`}
                          className="flex-1 text-xs outline-none text-stone-700 placeholder:text-stone-300"
                        />
                        <button onClick={() => setPickerOpen(false)} className="text-stone-300 hover:text-stone-500">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="max-h-40 overflow-y-auto">
                        {pickerItems().length === 0 ? (
                          <p className="px-3 py-3 text-xs text-stone-400">No matches</p>
                        ) : (
                          pickerItems().map(item => (
                            <button
                              key={item.id}
                              onClick={() => handleGeoSelect(item.id, item.name, geoScope)}
                              className="w-full text-left px-3 py-2 text-xs text-stone-700 hover:bg-sky-50 hover:text-sky-700 transition-colors flex items-center justify-between gap-2"
                            >
                              <span>{item.name}</span>
                              {item.sub && <span className="text-[10px] text-stone-400 shrink-0">{item.sub}</span>}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Save state */}
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
