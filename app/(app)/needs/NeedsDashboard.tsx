"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ChevronDown, ClipboardList, MapPin, Building2, Layers, CheckCircle2, Clock } from "lucide-react";

type Assessment = { id: string; assessmentYear: number; assessedAt: string; totalHouseholds: number };
type Settlement = { id: string; name: string; assessments: Assessment[] };
type Cluster = { id: string; name: string; settlements: Settlement[] };
type Zone = { id: string; name: string; clusters: Cluster[] };
type City = { id: string; name: string; zones: Zone[] };

export default function NeedsDashboard({ cities }: { cities: City[]; currentUserId: string }) {
  const [openZones, setOpenZones] = useState<Set<string>>(new Set());
  const [openClusters, setOpenClusters] = useState<Set<string>>(new Set());

  const toggleZone = (id: string) => setOpenZones(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleCluster = (id: string) => setOpenClusters(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const totalSettlements = cities.flatMap(c => c.zones.flatMap(z => z.clusters.flatMap(cl => cl.settlements))).length;
  const assessed = cities.flatMap(c => c.zones.flatMap(z => z.clusters.flatMap(cl => cl.settlements.filter(s => s.assessments.length > 0)))).length;

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
          <span className="text-xs text-stone-500">{assessed} / {totalSettlements} settlements assessed</span>
          <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full bg-sky-400 rounded-full transition-all" style={{ width: totalSettlements > 0 ? `${(assessed / totalSettlements) * 100}%` : "0%" }} />
          </div>
        </div>
      </div>

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
