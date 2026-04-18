"use client";

import { useState, useEffect } from "react";
import { MapPin, ChevronDown, X } from "lucide-react";

type Zone = { id: string; name: string };
type Cluster = { id: string; name: string; zoneId: string | null };
type Settlement = { id: string; name: string; clusterId: string | null };

type GeoState = {
  zoneId: string | null;
  clusterId: string | null;
  settlementId: string | null;
};

interface Props {
  pitstopId: string;
  initialZoneId?: string | null;
  initialClusterId?: string | null;
  initialSettlementId?: string | null;
}

export default function GeographySection({
  pitstopId,
  initialZoneId = null,
  initialClusterId = null,
  initialSettlementId = null,
}: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [geo, setGeo] = useState<GeoState>({
    zoneId: initialZoneId,
    clusterId: initialClusterId,
    settlementId: initialSettlementId,
  });

  const [zones, setZones] = useState<Zone[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load all geo options once when opened
  useEffect(() => {
    if (!open || loaded) return;
    fetch("/api/geography")
      .then((r) => r.json())
      .then((d) => {
        setZones(d.zones ?? []);
        setClusters(d.clusters ?? []);
        setSettlements(d.settlements ?? []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [open, loaded]);

  // Cascade clear on parent change
  const setZone = (zoneId: string | null) => {
    setGeo({ zoneId, clusterId: null, settlementId: null });
  };

  const setCluster = (clusterId: string | null) => {
    setGeo((g) => ({ ...g, clusterId, settlementId: null }));
  };

  const setSettlement = (settlementId: string | null) => {
    setGeo((g) => ({ ...g, settlementId }));
  };

  const save = async (next: GeoState) => {
    setSaving(true);
    try {
      await fetch(`/api/pitstops/${pitstopId}/needs-geo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          needsZoneId: next.zoneId,
          needsClusterId: next.clusterId,
          needsSettlementId: next.settlementId,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    const next: GeoState = { zoneId: null, clusterId: null, settlementId: null };
    setGeo(next);
    await save(next);
  };

  // Filtered options based on current selections
  const availableClusters = geo.zoneId
    ? clusters.filter((c) => c.zoneId === geo.zoneId)
    : clusters;

  const availableSettlements = geo.clusterId
    ? settlements.filter((s) => s.clusterId === geo.clusterId)
    : geo.zoneId
    ? settlements.filter((s) => {
        const cl = clusters.find((c) => c.id === s.clusterId);
        return cl?.zoneId === geo.zoneId;
      })
    : settlements;

  // Display labels
  const zoneName = geo.zoneId ? zones.find((z) => z.id === geo.zoneId)?.name ?? null : null;
  const clusterName = geo.clusterId ? clusters.find((c) => c.id === geo.clusterId)?.name ?? null : null;
  const settlementName = geo.settlementId ? settlements.find((s) => s.id === geo.settlementId)?.name ?? null : null;

  const hasGeo = geo.zoneId || geo.clusterId || geo.settlementId;

  return (
    <div className="px-4 py-3 border-b border-stone-100">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-700 w-full text-left"
      >
        <MapPin className="w-3.5 h-3.5" />
        Geography
        {hasGeo && (
          <span className="ml-1 text-sky-600 font-semibold">
            · {settlementName ?? clusterName ?? zoneName}
          </span>
        )}
        {saving && <span className="ml-auto text-stone-400 text-[10px]">Saving…</span>}
        {saved && <span className="ml-auto text-emerald-600 text-[10px] font-semibold">Saved ✓</span>}
        <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-2.5">
          {!loaded && <p className="text-xs text-stone-400">Loading…</p>}

          {loaded && (
            <>
              {/* Zone picker */}
              <div>
                <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Zone</label>
                <div className="flex items-center gap-1.5">
                  <select
                    value={geo.zoneId ?? ""}
                    onChange={(e) => {
                      const next: GeoState = { zoneId: e.target.value || null, clusterId: null, settlementId: null };
                      setGeo(next);
                    }}
                    className="flex-1 text-xs border border-stone-200 rounded-lg px-2 py-1.5 bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-sky-400"
                  >
                    <option value="">— None —</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                  {geo.zoneId && (
                    <button onClick={() => setZone(null)} className="text-stone-300 hover:text-red-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Cluster picker — only if zone selected */}
              {geo.zoneId && (
                <div>
                  <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Cluster</label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={geo.clusterId ?? ""}
                      onChange={(e) => {
                        const next: GeoState = { ...geo, clusterId: e.target.value || null, settlementId: null };
                        setGeo(next);
                      }}
                      className="flex-1 text-xs border border-stone-200 rounded-lg px-2 py-1.5 bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-sky-400"
                    >
                      <option value="">— None —</option>
                      {availableClusters.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    {geo.clusterId && (
                      <button onClick={() => setCluster(null)} className="text-stone-300 hover:text-red-400">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Settlement picker — only if cluster selected */}
              {geo.clusterId && (
                <div>
                  <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Settlement</label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={geo.settlementId ?? ""}
                      onChange={(e) => {
                        const next: GeoState = { ...geo, settlementId: e.target.value || null };
                        setGeo(next);
                      }}
                      className="flex-1 text-xs border border-stone-200 rounded-lg px-2 py-1.5 bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-sky-400"
                    >
                      <option value="">— None —</option>
                      {availableSettlements.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    {geo.settlementId && (
                      <button onClick={() => setSettlement(null)} className="text-stone-300 hover:text-red-400">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-1">
                {hasGeo ? (
                  <button
                    onClick={clear}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Clear all
                  </button>
                ) : (
                  <span />
                )}
                <button
                  onClick={() => save(geo)}
                  disabled={saving}
                  className="px-3 py-1 text-xs font-semibold rounded-lg bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
