"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ChevronDown, ClipboardList, MapPin, Building2, Layers, CheckCircle2, Clock } from "lucide-react";
import type { CityStats, DomainSummary } from "./page";

type Assessment = { id: string; assessmentYear: number; assessedAt: string; totalHouseholds: number };
type Settlement = { id: string; name: string; assessments: Assessment[] };
type Cluster = { id: string; name: string; settlements: Settlement[] };
type Zone = { id: string; name: string; clusters: Cluster[] };
type City = { id: string; name: string; zones: Zone[] };

const DOMAINS: { key: keyof CityStats["domains"]; label: string; color: string }[] = [
  { key: "Creche",            label: "Creches",        color: "#ec4899" },
  { key: "ChildrenCentre",    label: "Children Ctr",   color: "#f97316" },
  { key: "YouthGroup",        label: "Youth Groups",   color: "#8b5cf6" },
  { key: "ElderlyKitchen",    label: "Elderly Kitchen",color: "#10b981" },
  { key: "PalliativeSupport", label: "Palliative",     color: "#6366f1" },
  { key: "CommunityToilet",   label: "Toilets",        color: "#0ea5e9" },
  { key: "WaterATM",          label: "Water ATMs",     color: "#14b8a6" },
];

function DomainCard({ label, color, d }: { label: string; color: string; d: DomainSummary }) {
  const pct = d.apfTarget > 0 ? Math.min(100, Math.round((d.done / d.apfTarget) * 100)) : d.done > 0 ? 100 : 0;
  return (
    <div className="rounded-xl border border-stone-100 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-xs font-semibold text-stone-700 truncate">{label}</span>
      </div>
      <div className="grid grid-cols-3 text-center gap-1">
        <div>
          <p className="text-sm font-bold text-stone-800">{d.apfTarget}</p>
          <p className="text-[9px] text-stone-400">APF target</p>
        </div>
        <div>
          <p className="text-sm font-bold text-emerald-600">{d.done}</p>
          <p className="text-[9px] text-stone-400">done</p>
        </div>
        <div>
          <p className={`text-sm font-bold ${d.gap > 0 ? "text-red-500" : "text-emerald-500"}`}>
            {d.gap > 0 ? `-${d.gap}` : "✓"}
          </p>
          <p className="text-[9px] text-stone-400">gap</p>
        </div>
      </div>
      <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="flex justify-between text-[9px] text-stone-400">
        <span>ex:{d.existing}</span>
        {d.inProgress > 0 && <span className="text-amber-500">+{d.inProgress} active</span>}
        <span>{pct}%</span>
      </div>
    </div>
  );
}

export default function NeedsDashboard({ cities, totalSettlements, cityStats }: {
  cities: City[];
  currentUserId: string;
  totalSettlements: number;
  cityStats: CityStats;
}) {
  const [openZones, setOpenZones] = useState<Set<string>>(new Set());
  const [openClusters, setOpenClusters] = useState<Set<string>>(new Set());
  const [showOverview, setShowOverview] = useState(true);

  const toggleZone = (id: string) => setOpenZones(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleCluster = (id: string) => setOpenClusters(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const assessed = cityStats.assessedCount;
  const coveragePct = totalSettlements > 0 ? Math.round((assessed / totalSettlements) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-stone-900 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-sky-500" />
          Needs Assessment
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          Settlement-level baseline survey — population, civic amenities, entitlements
        </p>
        <div className="flex items-center gap-4 mt-3">
          <span className="text-xs text-stone-500">{assessed} / {totalSettlements} settlements assessed ({coveragePct}%)</span>
          <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full bg-sky-400 rounded-full transition-all" style={{ width: `${coveragePct}%` }} />
          </div>
        </div>
        {cityStats.totalHH > 0 && (
          <p className="text-xs text-stone-400 mt-1">{cityStats.totalHH.toLocaleString()} total households across assessed settlements</p>
        )}
      </div>

      {/* City-wide overview */}
      {cityStats.assessedCount > 0 && (
        <div className="mb-6 border border-stone-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowOverview(o => !o)}
            className="w-full flex items-center gap-2 px-4 py-3 bg-stone-50 hover:bg-stone-100 transition-colors text-left"
          >
            {showOverview ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />}
            <span className="text-sm font-semibold text-stone-700">City-wide Needs Overview</span>
            <span className="ml-auto text-xs text-stone-400">across {assessed} assessed settlements</span>
          </button>
          {showOverview && (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {DOMAINS.map(({ key, label, color }) => (
                <DomainCard key={key} label={label} color={color} d={cityStats.domains[key]} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Hierarchy */}
      <div className="space-y-3">
        {cities.map(city => (
          <div key={city.id} className="border border-stone-200 rounded-xl overflow-hidden">
            {/* City header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-stone-50 border-b border-stone-100">
              <MapPin className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-stone-700">{city.name}</span>
              <span className="ml-auto text-xs text-stone-400">
                {city.zones.flatMap(z => z.clusters.flatMap(c => c.settlements)).length} settlements
              </span>
            </div>

            {/* Zones */}
            <div className="divide-y divide-stone-100">
              {city.zones.map(zone => {
                const zoneSettlements = zone.clusters.flatMap(c => c.settlements);
                const zoneAssessed = zoneSettlements.filter(s => s.assessments.length > 0).length;
                return (
                  <div key={zone.id}>
                    <button
                      onClick={() => toggleZone(zone.id)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
                    >
                      {openZones.has(zone.id) ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />}
                      <Layers className="w-3.5 h-3.5 text-violet-400" />
                      <span className="text-sm font-medium text-stone-700">{zone.name}</span>
                      <span className="ml-auto text-xs text-stone-400">{zoneAssessed}/{zoneSettlements.length}</span>
                    </button>

                    {openZones.has(zone.id) && (
                      <div className="bg-stone-50/50 divide-y divide-stone-100">
                        {zone.clusters.map(cluster => {
                          const clAssessed = cluster.settlements.filter(s => s.assessments.length > 0).length;
                          return (
                            <div key={cluster.id}>
                              <button
                                onClick={() => toggleCluster(cluster.id)}
                                className="w-full flex items-center gap-2 px-6 py-2 hover:bg-stone-100/60 transition-colors text-left"
                              >
                                {openClusters.has(cluster.id) ? <ChevronDown className="w-3 h-3 text-stone-400" /> : <ChevronRight className="w-3 h-3 text-stone-400" />}
                                <Building2 className="w-3 h-3 text-emerald-500" />
                                <span className="text-xs font-medium text-stone-600">{cluster.name}</span>
                                <span className="ml-auto text-xs text-stone-400">{clAssessed}/{cluster.settlements.length}</span>
                              </button>

                              {openClusters.has(cluster.id) && (
                                <div className="divide-y divide-stone-100">
                                  {cluster.settlements.map(settlement => {
                                    const latest = settlement.assessments[0];
                                    return (
                                      <Link
                                        key={settlement.id}
                                        href={`/needs/settlement/${settlement.id}`}
                                        className="flex items-center gap-3 px-8 py-2.5 hover:bg-sky-50 transition-colors group"
                                      >
                                        <div className="w-1.5 h-1.5 rounded-full bg-stone-300 flex-shrink-0" />
                                        <span className="text-xs text-stone-700 group-hover:text-sky-700 flex-1">{settlement.name}</span>
                                        {latest ? (
                                          <div className="flex items-center gap-1.5">
                                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                            <span className="text-[10px] text-stone-400">{latest.assessmentYear} · {latest.totalHouseholds} HH</span>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-1">
                                            <Clock className="w-3 h-3 text-amber-400" />
                                            <span className="text-[10px] text-amber-500">Not assessed</span>
                                          </div>
                                        )}
                                      </Link>
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
              })}
            </div>
          </div>
        ))}
      </div>

      {cities.length === 0 && (
        <div className="text-center py-16 text-stone-400 text-sm">
          No geography configured yet. Add cities, zones, clusters and settlements in Geography settings.
        </div>
      )}
    </div>
  );
}
