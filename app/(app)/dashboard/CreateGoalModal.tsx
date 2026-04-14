"use client";

import { useState, useEffect } from "react";
import { X, Target, ChevronDown } from "lucide-react";

type NeedsDomain = "Creche" | "ChildrenCentre" | "YouthGroup" | "ElderlyKitchen" | "PalliativeSupport" | "CommunityToilet" | "WaterATM";
const DOMAIN_LABELS: Record<NeedsDomain, string> = {
  Creche: "Creche", ChildrenCentre: "Children Centre", YouthGroup: "Youth Group",
  ElderlyKitchen: "Elderly Kitchen", PalliativeSupport: "Palliative Support",
  CommunityToilet: "Community Toilet", WaterATM: "Water ATM",
};
type GeoScope = "settlement" | "cluster" | "zone";
interface GeoItem { id: string; name: string; sub?: string }

interface Props {
  onClose: () => void;
  onCreated: (goal: unknown) => void;
}

export default function CreateGoalModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("Active");
  const [targetDate, setTargetDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Needs section
  const [showNeeds, setShowNeeds] = useState(false);
  const [needsDomain, setNeedsDomain] = useState<NeedsDomain | "">("");
  const [parameter, setParameter] = useState("");
  const [geoScope, setGeoScope] = useState<GeoScope>("settlement");
  const [geoId, setGeoId] = useState("");
  const [geoItems, setGeoItems] = useState<{ zones: GeoItem[]; clusters: GeoItem[]; settlements: GeoItem[] } | null>(null);

  useEffect(() => {
    if (showNeeds && !geoItems) {
      fetch("/api/geography").then(r => r.json()).then(geo => {
        setGeoItems({
          zones: (geo.zones ?? []).map((z: { id: string; name: string }) => ({ id: z.id, name: z.name })),
          clusters: (geo.clusters ?? []).map((cl: { id: string; name: string; zoneId?: string }) => {
            const zone = (geo.zones ?? []).find((z: { id: string; name: string }) => z.id === cl.zoneId);
            return { id: cl.id, name: cl.name, sub: zone?.name };
          }),
          settlements: (geo.settlements ?? []).map((s: { id: string; name: string; clusterId?: string }) => {
            const cluster = (geo.clusters ?? []).find((cl: { id: string }) => cl.id === s.clusterId);
            return { id: s.id, name: s.name, sub: cluster?.name };
          }),
        });
      });
    }
  }, [showNeeds, geoItems]);

  const currentGeoItems = geoItems
    ? (geoScope === "zone" ? geoItems.zones : geoScope === "cluster" ? geoItems.clusters : geoItems.settlements)
    : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !targetDate) return;
    setLoading(true);
    setError("");

    const needsPayload = showNeeds && needsDomain ? {
      needsDomain,
      ...(parameter && { parameter: parseFloat(parameter) }),
      ...(geoId && geoScope === "settlement" && { needsSettlementId: geoId }),
      ...(geoId && geoScope === "cluster" && { needsClusterId: geoId }),
      ...(geoId && geoScope === "zone" && { needsZoneId: geoId }),
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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
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
              <div className="px-3 pb-3 pt-1 space-y-3 border-t border-stone-100">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-stone-400 mb-1">Domain</label>
                  <select value={needsDomain} onChange={e => { setNeedsDomain(e.target.value as NeedsDomain | ""); setGeoId(""); }}
                    className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                    <option value="">— not linked —</option>
                    {(Object.entries(DOMAIN_LABELS) as [NeedsDomain, string][]).map(([k, l]) => (
                      <option key={k} value={k}>{l}</option>
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
                      <div className="flex gap-1 mb-2">
                        {(["settlement", "cluster", "zone"] as const).map(scope => (
                          <button key={scope} type="button"
                            onClick={() => { setGeoScope(scope); setGeoId(""); }}
                            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors capitalize ${geoScope === scope ? "border-sky-400 bg-sky-50 text-sky-600 font-semibold" : "border-stone-200 text-stone-500"}`}>
                            {scope}
                          </button>
                        ))}
                      </div>
                      <select value={geoId} onChange={e => setGeoId(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                        <option value="">— select {geoScope} —</option>
                        {currentGeoItems.map(item => (
                          <option key={item.id} value={item.id}>{item.name}{item.sub ? ` (${item.sub})` : ""}</option>
                        ))}
                      </select>
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
