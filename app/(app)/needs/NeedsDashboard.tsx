"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ChevronDown, ClipboardList, MapPin, Building2, Layers, CheckCircle2, Clock, Home } from "lucide-react";
import type { LevelStats, DomainStats, DomainConfig } from "./page";

type Assessment = { id: string; assessmentYear: number; assessedAt: string; totalHouseholds: number };
type Settlement = { id: string; name: string; assessments: Assessment[] };
type Cluster = { id: string; name: string; settlements: Settlement[] };
type Zone = { id: string; name: string; clusters: Cluster[] };
type City = { id: string; name: string; zones: Zone[] };

type ViewLevel = "city" | "zone" | "cluster" | "settlement";

// ── Domain card for overview grid ─────────────────────────────────────────────

function DomainCard({ label, color, d }: { label: string; color: string; d: LevelStats["domains"][string] }) {
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

// ── Compact gap chip for table rows ──────────────────────────────────────────

function GapChip({ d }: { d: LevelStats["domains"][string] | undefined }) {
  if (!d || (d.apfTarget === 0 && d.done === 0)) {
    return <span className="text-[10px] text-stone-300">—</span>;
  }
  if (d.gap > 0) return <span className="text-[10px] font-medium text-red-500">-{d.gap}</span>;
  return <span className="text-[10px] font-medium text-emerald-500">✓</span>;
}

// ── Domain table: domain rows with target/done/gap columns ───────────────────

function DomainTable({ domains, domainConfigs }: { domains: DomainStats; domainConfigs: DomainConfig[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-stone-100">
            <th className="text-left py-1.5 pr-3 font-medium text-stone-400 text-[10px] uppercase tracking-wide">Domain</th>
            <th className="text-right py-1.5 px-2 font-medium text-stone-400 text-[10px]">Existing</th>
            <th className="text-right py-1.5 px-2 font-medium text-stone-400 text-[10px]">APF target</th>
            <th className="text-right py-1.5 px-2 font-medium text-stone-400 text-[10px]">Done</th>
            <th className="text-right py-1.5 px-2 font-medium text-stone-400 text-[10px]">Active</th>
            <th className="text-right py-1.5 pl-2 font-medium text-stone-400 text-[10px]">Gap</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-50">
          {domainConfigs.map(({ domain, label, color }) => {
            const d = domains[domain];
            if (!d) return null;
            const pct = d.apfTarget > 0 ? Math.min(100, Math.round((d.done / d.apfTarget) * 100)) : d.done > 0 ? 100 : 0;
            return (
              <tr key={domain}>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="text-stone-700 font-medium">{label}</span>
                  </div>
                </td>
                <td className="py-2 px-2 text-right text-stone-500">{d.existing}</td>
                <td className="py-2 px-2 text-right font-medium text-stone-800">{d.apfTarget}</td>
                <td className="py-2 px-2 text-right font-medium text-emerald-600">{d.done}</td>
                <td className="py-2 px-2 text-right text-amber-500">{d.inProgress > 0 ? `+${d.inProgress}` : "–"}</td>
                <td className="py-2 pl-2">
                  <div className="flex items-center gap-2 justify-end">
                    <div className="w-16 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <span className={`w-8 text-right font-bold ${d.gap > 0 ? "text-red-500" : "text-emerald-600"}`}>
                      {d.gap > 0 ? `-${d.gap}` : "✓"}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Scrollable grid for zone / cluster rows ───────────────────────────────────
// cols: [chevron 20px] [icon 16px] [name flex] [assessed 72px] [HH 56px] [domains × 30px]

function rowCols(n: number) {
  return `20px 16px 1fr 72px 56px repeat(${n}, 30px)`;
}

function DomainHeaderRow({ domainConfigs }: { domainConfigs: DomainConfig[] }) {
  return (
    <div
      className="grid items-center gap-x-2 px-3 py-1.5 bg-white border-b border-stone-200 text-[9px] font-semibold text-stone-400 uppercase tracking-wide"
      style={{ gridTemplateColumns: rowCols(domainConfigs.length) }}
    >
      <span />
      <span />
      <span>Name</span>
      <span className="text-right">Assessed</span>
      <span className="text-right">HH</span>
      {domainConfigs.map(d => (
        <span key={d.domain} className="text-center leading-tight" style={{ color: d.color }} title={d.label}>
          {d.label.replace(/([A-Z])/g, ' $1').trim().split(' ').map(w => w[0]).join('').slice(0, 3)}
        </span>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function NeedsDashboard({
  cities, totalSettlements, domainConfigs, cityStats, cityStatsMap, zoneStats, clusterStats, settlementStats,
}: {
  cities: City[];
  currentUserId: string;
  totalSettlements: number;
  domainConfigs: DomainConfig[];
  cityStats: LevelStats;
  cityStatsMap: Record<string, { name: string; stats: LevelStats }>;
  zoneStats: Record<string, { name: string; cityName: string; stats: LevelStats }>;
  clusterStats: Record<string, { name: string; zoneName: string; cityName: string; stats: LevelStats }>;
  settlementStats: Record<string, { name: string; clusterName: string; zoneName: string; stats: LevelStats }>;
}) {
  const [view, setView]             = useState<ViewLevel>("city");
  const [openZones, setOpenZones]   = useState<Set<string>>(new Set());
  const [openClusters, setOpenClusters] = useState<Set<string>>(new Set());
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);

  const toggleZone    = (id: string) => setOpenZones(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleCluster = (id: string) => setOpenClusters(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // City view: show combined or selected-city stats
  const activeCityStats = selectedCityId ? cityStatsMap[selectedCityId]?.stats : cityStats;

  const assessed     = cityStats.assessedCount;
  const coveragePct  = totalSettlements > 0 ? Math.round((assessed / totalSettlements) * 100) : 0;

  const LEVELS: { value: ViewLevel; label: string }[] = [
    { value: "city",       label: "City" },
    { value: "zone",       label: "Zone" },
    { value: "cluster",    label: "Cluster" },
    { value: "settlement", label: "Settlement" },
  ];

  const multiCity = cities.length > 1;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-stone-900 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-sky-500" />
          Needs Assessment
        </h1>
        <p className="text-sm text-stone-500 mt-1">Settlement-level baseline — population, civic amenities, entitlements</p>
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

      {/* Level toggle */}
      <div className="flex items-center gap-1 mb-6 bg-stone-100 rounded-xl p-1 w-fit">
        {LEVELS.map(l => (
          <button
            key={l.value}
            onClick={() => setView(l.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              view === l.value
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {/* ── City view ── */}
      {view === "city" && (
        <div className="space-y-4">
          {/* City selector (only when multiple cities) */}
          {multiCity && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setSelectedCityId(null)}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                  selectedCityId === null
                    ? "bg-stone-800 text-white border-stone-800"
                    : "text-stone-500 border-stone-200 hover:border-stone-400"
                }`}
              >
                All cities
              </button>
              {cities.map(city => (
                <button
                  key={city.id}
                  onClick={() => setSelectedCityId(city.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                    selectedCityId === city.id
                      ? "bg-sky-600 text-white border-sky-600"
                      : "text-stone-500 border-stone-200 hover:border-stone-400"
                  }`}
                >
                  {city.name}
                </button>
              ))}
            </div>
          )}

          {activeCityStats && activeCityStats.assessedCount > 0 && (
            <>
              {/* Summary line for selected city */}
              {selectedCityId && cityStatsMap[selectedCityId] && (
                <p className="text-xs text-stone-500">
                  {cityStatsMap[selectedCityId].stats.assessedCount} settlements assessed ·{" "}
                  {cityStatsMap[selectedCityId].stats.totalHH.toLocaleString()} households
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {domainConfigs.map(({ domain, label, color }) => (
                  <DomainCard key={domain} label={label} color={color} d={activeCityStats.domains[domain]} />
                ))}
              </div>
              <div className="border border-stone-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Full breakdown</p>
                <DomainTable domains={activeCityStats.domains} domainConfigs={domainConfigs} />
              </div>
            </>
          )}
          {(!activeCityStats || activeCityStats.assessedCount === 0) && (
            <p className="text-sm text-stone-400 text-center py-12">No assessments recorded yet. Open a settlement to start.</p>
          )}
        </div>
      )}

      {/* ── Zone view ── */}
      {view === "zone" && (
        <div className="border border-stone-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: `${480 + domainConfigs.length * 32}px` }}>
              <DomainHeaderRow domainConfigs={domainConfigs} />
              <div className="divide-y divide-stone-100">
                {cities.flatMap(city => city.zones).map(zone => {
                  const z = zoneStats[zone.id];
                  if (!z) return null;
                  const isOpen = openZones.has(zone.id);
                  return (
                    <div key={zone.id}>
                      <button
                        onClick={() => toggleZone(zone.id)}
                        className="w-full grid items-center gap-x-2 px-3 py-3 bg-stone-50 hover:bg-stone-100 transition-colors text-left"
                        style={{ gridTemplateColumns: rowCols(domainConfigs.length) }}
                      >
                        {isOpen
                          ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
                          : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                        }
                        <Layers className="w-3.5 h-3.5 text-violet-400" />
                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-stone-700 truncate block">{z.name}</span>
                          <span className="text-[10px] text-stone-400">{z.cityName}</span>
                        </div>
                        <span className="text-right text-xs text-stone-500 tabular-nums">
                          {z.stats.assessedCount}/{z.stats.totalCount}
                        </span>
                        <span className="text-right text-xs text-stone-500 tabular-nums">
                          {z.stats.totalHH > 0 ? z.stats.totalHH.toLocaleString() : "—"}
                        </span>
                        {domainConfigs.map(({ domain }) => (
                          <div key={domain} className="flex justify-center">
                            <GapChip d={z.stats.domains[domain]} />
                          </div>
                        ))}
                      </button>
                      {isOpen && z.stats.assessedCount > 0 && (
                        <div className="px-4 py-4 border-t border-stone-100 bg-white">
                          <DomainTable domains={z.stats.domains} domainConfigs={domainConfigs} />
                        </div>
                      )}
                      {isOpen && z.stats.assessedCount === 0 && (
                        <div className="px-4 py-3 border-t border-stone-100 text-xs text-stone-400">
                          No assessments in this zone yet.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Cluster view ── */}
      {view === "cluster" && (
        <div className="border border-stone-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: `${480 + domainConfigs.length * 32}px` }}>
              <DomainHeaderRow domainConfigs={domainConfigs} />
              <div className="divide-y divide-stone-100">
                {cities.flatMap(city => city.zones.flatMap(zone => zone.clusters)).map(cluster => {
                  const cl = clusterStats[cluster.id];
                  if (!cl) return null;
                  const isOpen = openClusters.has(cluster.id);
                  return (
                    <div key={cluster.id}>
                      <button
                        onClick={() => toggleCluster(cluster.id)}
                        className="w-full grid items-center gap-x-2 px-3 py-3 bg-stone-50 hover:bg-stone-100 transition-colors text-left"
                        style={{ gridTemplateColumns: rowCols(domainConfigs.length) }}
                      >
                        {isOpen
                          ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
                          : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                        }
                        <Building2 className="w-3.5 h-3.5 text-emerald-500" />
                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-stone-700 truncate block">{cl.name}</span>
                          <span className="text-[10px] text-stone-400">{cl.zoneName} · {cl.cityName}</span>
                        </div>
                        <span className="text-right text-xs text-stone-500 tabular-nums">
                          {cl.stats.assessedCount}/{cl.stats.totalCount}
                        </span>
                        <span className="text-right text-xs text-stone-500 tabular-nums">
                          {cl.stats.totalHH > 0 ? cl.stats.totalHH.toLocaleString() : "—"}
                        </span>
                        {domainConfigs.map(({ domain }) => (
                          <div key={domain} className="flex justify-center">
                            <GapChip d={cl.stats.domains[domain]} />
                          </div>
                        ))}
                      </button>
                      {isOpen && cl.stats.assessedCount > 0 && (
                        <div className="px-4 py-4 border-t border-stone-100 bg-white">
                          <DomainTable domains={cl.stats.domains} domainConfigs={domainConfigs} />
                        </div>
                      )}
                      {isOpen && cl.stats.assessedCount === 0 && (
                        <div className="px-4 py-3 border-t border-stone-100 text-xs text-stone-400">
                          No assessments in this cluster yet.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Settlement view ── */}
      {view === "settlement" && (
        <div className="border border-stone-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: `${380 + domainConfigs.length * 32}px` }}>
              {/* Table header */}
              <div
                className="grid items-center gap-x-2 px-3 py-1.5 bg-white border-b border-stone-200 text-[9px] font-semibold text-stone-400 uppercase tracking-wide"
                style={{ gridTemplateColumns: `1fr 80px repeat(${domainConfigs.length}, 30px)` }}
              >
                <span>Settlement</span>
                <span className="text-right">HH</span>
                {domainConfigs.map(d => (
                  <span key={d.domain} className="text-center leading-tight" style={{ color: d.color }} title={d.label}>
                    {d.label.replace(/([A-Z])/g, ' $1').trim().split(' ').map(w => w[0]).join('').slice(0, 3)}
                  </span>
                ))}
              </div>

              <div className="divide-y divide-stone-100">
                {cities.flatMap(city =>
                  city.zones.flatMap(zone =>
                    zone.clusters.flatMap(cluster =>
                      cluster.settlements.map(s => {
                        const ss = settlementStats[s.id];
                        const isAssessed = s.assessments.length > 0;
                        return (
                          <Link
                            key={s.id}
                            href={`/needs/settlement/${s.id}`}
                            className="grid items-center gap-x-2 px-3 py-2.5 hover:bg-sky-50 transition-colors group"
                            style={{ gridTemplateColumns: `1fr 80px repeat(${domainConfigs.length}, 30px)` }}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <Home className="w-3 h-3 text-stone-300 flex-shrink-0" />
                                <span className="text-xs font-medium text-stone-700 group-hover:text-sky-700 truncate">{s.name}</span>
                              </div>
                              <span className="text-[10px] text-stone-400 ml-4">{cluster.name} · {zone.name}</span>
                            </div>
                            <div className="flex justify-end items-center gap-1">
                              {isAssessed ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                                  <span className="text-[10px] text-stone-500 tabular-nums">{ss?.stats.totalHH.toLocaleString()}</span>
                                </>
                              ) : (
                                <Clock className="w-3 h-3 text-amber-400" />
                              )}
                            </div>
                            {domainConfigs.map(({ domain }) => (
                              <div key={domain} className="flex justify-center">
                                {isAssessed && ss
                                  ? <GapChip d={ss.stats.domains[domain]} />
                                  : <span className="text-[10px] text-stone-200">·</span>
                                }
                              </div>
                            ))}
                          </Link>
                        );
                      })
                    )
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Browse hierarchy (below the level views) ── */}
      {view !== "settlement" && (
        <div className="mt-8 border-t border-stone-100 pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-3">Browse by geography</h2>
          <div className="space-y-2">
            {cities.map(city => (
              <div key={city.id} className="border border-stone-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-stone-50 border-b border-stone-100">
                  <MapPin className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                  <span className="text-sm font-semibold text-stone-700">{city.name}</span>
                  <span className="ml-auto text-xs text-stone-400">
                    {city.zones.flatMap(z => z.clusters.flatMap(c => c.settlements)).length} settlements
                  </span>
                </div>
                <div className="divide-y divide-stone-100">
                  {city.zones.map(zone => {
                    const zoneSettlements = zone.clusters.flatMap(c => c.settlements);
                    const zoneAssessed = zoneSettlements.filter(s => s.assessments.length > 0).length;
                    const zIsOpen = openZones.has(`browse-${zone.id}`);
                    const toggleBrowseZone = () => setOpenZones(prev => {
                      const n = new Set(prev);
                      n.has(`browse-${zone.id}`) ? n.delete(`browse-${zone.id}`) : n.add(`browse-${zone.id}`);
                      return n;
                    });
                    return (
                      <div key={zone.id}>
                        <button
                          onClick={toggleBrowseZone}
                          className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
                        >
                          {zIsOpen ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />}
                          <Layers className="w-3.5 h-3.5 text-violet-400" />
                          <span className="text-sm font-medium text-stone-700">{zone.name}</span>
                          <span className="ml-auto text-xs text-stone-400">{zoneAssessed}/{zoneSettlements.length}</span>
                        </button>
                        {zIsOpen && (
                          <div className="bg-stone-50/50 divide-y divide-stone-100">
                            {zone.clusters.map(cluster => {
                              const clAssessed = cluster.settlements.filter(s => s.assessments.length > 0).length;
                              const clIsOpen = openClusters.has(`browse-${cluster.id}`);
                              const toggleBrowseCluster = () => setOpenClusters(prev => {
                                const n = new Set(prev);
                                n.has(`browse-${cluster.id}`) ? n.delete(`browse-${cluster.id}`) : n.add(`browse-${cluster.id}`);
                                return n;
                              });
                              return (
                                <div key={cluster.id}>
                                  <button
                                    onClick={toggleBrowseCluster}
                                    className="w-full flex items-center gap-2 px-6 py-2 hover:bg-stone-100/60 transition-colors text-left"
                                  >
                                    {clIsOpen ? <ChevronDown className="w-3 h-3 text-stone-400" /> : <ChevronRight className="w-3 h-3 text-stone-400" />}
                                    <Building2 className="w-3 h-3 text-emerald-500" />
                                    <span className="text-xs font-medium text-stone-600">{cluster.name}</span>
                                    <span className="ml-auto text-xs text-stone-400">{clAssessed}/{cluster.settlements.length}</span>
                                  </button>
                                  {clIsOpen && (
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
        </div>
      )}

      {cities.length === 0 && (
        <div className="text-center py-16 text-stone-400 text-sm">
          No geography configured yet. Add cities, zones, clusters and settlements in Geography settings.
        </div>
      )}
    </div>
  );
}
