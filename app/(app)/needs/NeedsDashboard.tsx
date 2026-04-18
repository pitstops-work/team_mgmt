"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight, ChevronDown, ClipboardList, MapPin, Building2, Layers,
  CheckCircle2, Clock, Home, TrendingDown, TrendingUp, AlertTriangle, AlertCircle, Map,
} from "lucide-react";
import type { LevelStats, DomainStats, DomainConfig, ProgressSummary, MonthlyPoint, EntitlementSummary } from "./page";

type ZoneSummary = {
  id: string;
  name: string;
  totalSettlements: number;
  withActiveGoals: number;
  population: { totalHouseholds: number; children6m3yr: number; children4to14: number; youth15to21: number; elderly60plus: number };
  activeGoals: number;
  overdueCount: number;
  lastSurveyed: string | null;
};
type Assessment = { id: string; assessmentYear: number; assessedAt: string; totalHouseholds: number };
type Settlement = { id: string; name: string; assessments: Assessment[] };
type Cluster = { id: string; name: string; settlements: Settlement[] };
type Zone = { id: string; name: string; clusters: Cluster[] };
type City = { id: string; name: string; zones: Zone[] };

type ViewLevel = "city" | "zone" | "cluster" | "settlement";

// ── Coverage: Domain card for overview grid ───────────────────────────────────

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
          <p className="text-sm font-bold text-stone-800">{d.existing}</p>
          <p className="text-[9px] text-stone-400">exist.</p>
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
        {d.inProgress > 0 && <span className="text-amber-500">+{d.inProgress} active</span>}
        <span className="ml-auto">{pct}%</span>
      </div>
    </div>
  );
}

// ── Coverage: Compact gap chip for table rows ─────────────────────────────────

function GapChip({ d }: { d: LevelStats["domains"][string] | undefined }) {
  if (!d || (d.apfTarget === 0 && d.done === 0)) {
    return <span className="text-[10px] text-stone-300">—</span>;
  }
  if (d.gap > 0) return <span className="text-[10px] font-medium text-red-500">-{d.gap}</span>;
  return <span className="text-[10px] font-medium text-emerald-500">✓</span>;
}

// ── Coverage: Domain table ────────────────────────────────────────────────────

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

// ── Coverage: Scrollable grid header ─────────────────────────────────────────

function rowCols(n: number) {
  return `20px 16px 1fr 72px 56px 40px repeat(${n}, 30px)`;
}

function SaturationChip({ score }: { score: number }) {
  const color = score >= 80 ? "text-emerald-600" : score >= 40 ? "text-amber-600" : "text-red-500";
  return <span className={`text-[10px] font-bold tabular-nums ${color}`}>{score}%</span>;
}

function DomainHeaderRow({ domainConfigs }: { domainConfigs: DomainConfig[] }) {
  return (
    <div
      className="grid items-center gap-x-2 px-3 py-1.5 bg-white border-b border-stone-200 text-[9px] font-semibold text-stone-400 uppercase tracking-wide"
      style={{ gridTemplateColumns: rowCols(domainConfigs.length) }}
    >
      <span /><span />
      <span>Name</span>
      <span className="text-right">Assessed</span>
      <span className="text-right">HH</span>
      <span className="text-center" title="Saturation: delivered ÷ APF target">Sat</span>
      {domainConfigs.map(d => (
        <span key={d.domain} className="text-center leading-tight" style={{ color: d.color }} title={d.label}>
          {d.label.replace(/([A-Z])/g, ' $1').trim().split(' ').map((w: string) => w[0]).join('').slice(0, 3)}
        </span>
      ))}
    </div>
  );
}

// ── Progress: Traffic light dot ───────────────────────────────────────────────

function TrafficLight({ p }: { p: ProgressSummary }) {
  if (p.totalGoals === 0) return <span className="w-2.5 h-2.5 rounded-full bg-stone-200 flex-shrink-0" />;
  if (p.overdueGoals > 0) return <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />;
  if (p.atRiskGoals  > 0) return <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />;
  return <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />;
}

// ── Progress: Summary pills row ───────────────────────────────────────────────

function HealthSummary({ p }: { p: ProgressSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {p.doneGoals > 0 && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="w-3 h-3" />
          {p.doneGoals} done
        </span>
      )}
      {p.onTrackGoals > 0 && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200 text-xs font-medium text-sky-700">
          <TrendingUp className="w-3 h-3" />
          {p.onTrackGoals} on track
        </span>
      )}
      {p.atRiskGoals > 0 && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs font-medium text-amber-700">
          <AlertTriangle className="w-3 h-3" />
          {p.atRiskGoals} at risk
        </span>
      )}
      {p.overdueGoals > 0 && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-xs font-medium text-red-700">
          <AlertCircle className="w-3 h-3" />
          {p.overdueGoals} overdue
        </span>
      )}
      {p.totalGoals === 0 && (
        <span className="text-xs text-stone-400">No goals planned yet.</span>
      )}
    </div>
  );
}

// ── Progress: Deficit badge ───────────────────────────────────────────────────

function DeficitBadge({ deficit }: { deficit: number }) {
  if (deficit === 0) return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
      <TrendingUp className="w-3 h-3" /> On plan
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
      <TrendingDown className="w-3 h-3" /> {deficit} unit{deficit !== 1 ? "s" : ""} behind plan
    </span>
  );
}

// ── Progress: Domain-level deficit breakdown table ────────────────────────────

function ProgressDomainTable({ p, domainConfigs }: { p: ProgressSummary; domainConfigs: DomainConfig[] }) {
  const activeDomains = domainConfigs.filter(d => p.domains[d.domain] && (
    p.domains[d.domain].doneGoals + p.domains[d.domain].overdueGoals +
    p.domains[d.domain].atRiskGoals + p.domains[d.domain].onTrackGoals > 0
  ));
  if (activeDomains.length === 0) return <p className="text-xs text-stone-400 py-2">No goals for this geography.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-stone-100">
            <th className="text-left py-1.5 pr-3 font-medium text-stone-400 text-[10px] uppercase tracking-wide">Domain</th>
            <th className="text-right py-1.5 px-2 font-medium text-emerald-600 text-[10px]">Done</th>
            <th className="text-right py-1.5 px-2 font-medium text-sky-500 text-[10px]">On track</th>
            <th className="text-right py-1.5 px-2 font-medium text-amber-500 text-[10px]">At risk</th>
            <th className="text-right py-1.5 px-2 font-medium text-red-500 text-[10px]">Overdue</th>
            <th className="text-right py-1.5 px-2 font-medium text-stone-400 text-[10px]">Expected</th>
            <th className="text-right py-1.5 pl-2 font-medium text-stone-400 text-[10px]">Delivered</th>
            <th className="text-right py-1.5 pl-2 font-medium text-stone-400 text-[10px]">Deficit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-50">
          {activeDomains.map(({ domain, label, color }) => {
            const d = p.domains[domain];
            if (!d) return null;
            return (
              <tr key={domain}>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="text-stone-700 font-medium">{label}</span>
                  </div>
                </td>
                <td className="py-2 px-2 text-right font-medium text-emerald-600">{d.doneGoals || "–"}</td>
                <td className="py-2 px-2 text-right text-sky-600">{d.onTrackGoals || "–"}</td>
                <td className="py-2 px-2 text-right text-amber-500">{d.atRiskGoals || "–"}</td>
                <td className="py-2 px-2 text-right font-medium text-red-500">{d.overdueGoals || "–"}</td>
                <td className="py-2 px-2 text-right text-stone-500">{d.expectedByToday || "–"}</td>
                <td className="py-2 px-2 text-right font-medium text-stone-700">{d.actualDone || "–"}</td>
                <td className="py-2 pl-2 text-right">
                  {d.deficit > 0
                    ? <span className="font-bold text-red-500">-{d.deficit}</span>
                    : <span className="text-emerald-500">✓</span>
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Progress: Monthly trend chart ─────────────────────────────────────────────

function TrendChart({ points, currentMonth }: { points: MonthlyPoint[]; currentMonth: number }) {
  const maxVal = Math.max(...points.map(p => Math.max(p.planned, p.actual)), 1);
  const BAR_H = 72;

  return (
    <div>
      <div className="flex items-end gap-0.5" style={{ height: BAR_H + 24 }}>
        {points.map((pt, i) => {
          const isFuture = i > currentMonth;
          const plannedH = Math.round((pt.planned / maxVal) * BAR_H);
          const actualH  = Math.round((pt.actual  / maxVal) * BAR_H);
          return (
            <div key={pt.month} className="flex-1 flex flex-col items-center gap-0" style={{ height: BAR_H + 24 }}>
              {/* Bars */}
              <div className="w-full flex items-end justify-center gap-px" style={{ height: BAR_H }}>
                {/* Planned bar */}
                <div
                  className={`w-[45%] rounded-t-sm transition-all ${isFuture ? "bg-stone-100" : "bg-stone-200"}`}
                  style={{ height: plannedH }}
                  title={`Planned: ${pt.planned}`}
                />
                {/* Actual bar (only for past + current months) */}
                {!isFuture && (
                  <div
                    className="w-[45%] rounded-t-sm bg-sky-400 transition-all"
                    style={{ height: actualH }}
                    title={`Actual: ${pt.actual}`}
                  />
                )}
              </div>
              {/* Month label */}
              <div className={`text-[8px] mt-1 text-center leading-tight ${i === currentMonth ? "font-bold text-sky-600" : "text-stone-400"}`}>
                {pt.label}
              </div>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2.5 rounded-sm bg-stone-200" />
          <span className="text-[10px] text-stone-500">Planned</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2.5 rounded-sm bg-sky-400" />
          <span className="text-[10px] text-stone-500">Delivered</span>
        </div>
        <span className="text-[10px] text-stone-400 ml-auto">Cumulative units (all domains)</span>
      </div>
    </div>
  );
}

// ── Entitlements: scheme saturation bar ──────────────────────────────────────

const KEY_SCHEME_IDS = ["ration-card", "aadhaar", "pension-old-age", "bocw-card"];

function EntitlementBar({ scheme }: { scheme: EntitlementSummary }) {
  const total = scheme.ngoEnrolled + scheme.surveyEnrolled;
  const pct = scheme.eligible > 0 ? Math.min(100, Math.round((total / scheme.eligible) * 100)) : 0;
  const surveyPct = scheme.eligible > 0 ? Math.min(100, Math.round((scheme.surveyEnrolled / scheme.eligible) * 100)) : 0;
  const ngoPct = pct - surveyPct;
  return (
    <div className="py-2 border-b border-stone-50 last:border-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-stone-700">{scheme.name}</span>
        <span className={`text-xs font-bold tabular-nums ${pct >= 80 ? "text-emerald-600" : pct >= 40 ? "text-amber-600" : "text-red-500"}`}>{pct}%</span>
      </div>
      <div className="h-2 bg-stone-100 rounded-full overflow-hidden flex">
        {scheme.surveyEnrolled > 0 && (
          <div className="h-full bg-stone-400 rounded-l-full" style={{ width: `${surveyPct}%` }} title={`Survey baseline: ${scheme.surveyEnrolled}`} />
        )}
        {scheme.ngoEnrolled > 0 && (
          <div className="h-full bg-sky-400" style={{ width: `${ngoPct}%`, marginLeft: scheme.surveyEnrolled > 0 ? 0 : undefined }} title={`NGO-assisted: ${scheme.ngoEnrolled}`} />
        )}
      </div>
      <div className="flex items-center gap-3 mt-1 text-[9px] text-stone-400">
        <span>eligible: {scheme.eligible.toLocaleString()}</span>
        {scheme.surveyEnrolled > 0 && <span className="text-stone-400">survey: {scheme.surveyEnrolled.toLocaleString()}</span>}
        {scheme.ngoEnrolled > 0 && <span className="text-sky-500">NGO: {scheme.ngoEnrolled.toLocaleString()}</span>}
        <span className="ml-auto">total: {total.toLocaleString()}</span>
      </div>
    </div>
  );
}

function EntSchemeCell({ ents, schemeId }: { ents: EntitlementSummary[]; schemeId: string }) {
  const s = ents.find(e => e.id === schemeId);
  if (!s || s.eligible === 0) return <span className="text-[10px] text-stone-300">—</span>;
  const pct = Math.min(100, Math.round(((s.ngoEnrolled + s.surveyEnrolled) / s.eligible) * 100));
  return (
    <span className={`text-[10px] font-bold tabular-nums ${pct >= 80 ? "text-emerald-600" : pct >= 40 ? "text-amber-600" : "text-red-500"}`}>
      {pct}%
    </span>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function NeedsDashboard({
  cities, totalSettlements, domainConfigs,
  cityStats, cityStatsMap, zoneStats, clusterStats, settlementStats,
  cityProgress, cityProgressMap, zoneProgress, clusterProgress, settlementProgress,
  monthlyTrend, currentMonth,
  cityEntitlements, cityEntMap, zoneEntMap, clusterEntMap, settlementEntMap,
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
  cityProgress: ProgressSummary;
  cityProgressMap: Record<string, ProgressSummary>;
  zoneProgress: Record<string, ProgressSummary>;
  clusterProgress: Record<string, ProgressSummary>;
  settlementProgress: Record<string, ProgressSummary>;
  monthlyTrend: MonthlyPoint[];
  currentMonth: number;
  cityEntitlements: EntitlementSummary[];
  cityEntMap: Record<string, EntitlementSummary[]>;
  zoneEntMap: Record<string, EntitlementSummary[]>;
  clusterEntMap: Record<string, EntitlementSummary[]>;
  settlementEntMap: Record<string, EntitlementSummary[]>;
}) {
  const searchParams = useSearchParams();
  const initZoneId    = searchParams.get("zoneId");
  const initClusterId = searchParams.get("clusterId");

  const [mainTab, setMainTab]         = useState<"coverage" | "progress" | "entitlements" | "zones">("coverage");
  const [zoneSummary, setZoneSummary] = useState<ZoneSummary[] | null>(null);
  const [view, setView]               = useState<ViewLevel>(initClusterId ? "cluster" : initZoneId ? "zone" : "city");
  const [openZones, setOpenZones]     = useState<Set<string>>(initZoneId ? new Set([initZoneId]) : new Set());
  const [openClusters, setOpenClusters] = useState<Set<string>>(initClusterId ? new Set([initClusterId]) : new Set());
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);

  // Scroll the highlighted zone/cluster row into view on first render
  useEffect(() => {
    const id = initClusterId ?? initZoneId;
    if (!id) return;
    const el = document.getElementById(`geo-row-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleZone    = (id: string) => setOpenZones(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleCluster = (id: string) => setOpenClusters(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const activeCityStats    = selectedCityId ? cityStatsMap[selectedCityId]?.stats : cityStats;
  const activeCityProgress = selectedCityId ? cityProgressMap[selectedCityId] : cityProgress;

  const assessed    = cityStats.assessedCount;
  const coveragePct = totalSettlements > 0 ? Math.round((assessed / totalSettlements) * 100) : 0;
  const multiCity   = cities.length > 1;

  const LEVELS: { value: ViewLevel; label: string }[] = [
    { value: "city",       label: "City" },
    { value: "zone",       label: "Zone" },
    { value: "cluster",    label: "Cluster" },
    { value: "settlement", label: "Settlement" },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-stone-900 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-sky-500" />
          Field Coverage
        </h1>
        <p className="text-sm text-stone-500 mt-1">Settlement baseline, domain targets, and delivery progress</p>
        <div className="flex items-center gap-4 mt-3">
          <span className="text-xs text-stone-500">{assessed} / {totalSettlements} settlements assessed ({coveragePct}%)</span>
          <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full bg-sky-400 rounded-full transition-all" style={{ width: `${coveragePct}%` }} />
          </div>
          {cityStats.saturationScore > 0 && (
            <span className="flex-shrink-0 text-xs text-stone-500">
              Saturation: <SaturationChip score={cityStats.saturationScore} />
            </span>
          )}
        </div>
        {cityStats.totalHH > 0 && (
          <p className="text-xs text-stone-400 mt-1">{cityStats.totalHH.toLocaleString()} total households across assessed settlements</p>
        )}
      </div>

      {/* Main tab: Coverage / Progress */}
      <div className="flex items-center gap-1 mb-6 bg-stone-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setMainTab("coverage")}
          className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${mainTab === "coverage" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
        >
          Coverage
        </button>
        <button
          onClick={() => setMainTab("progress")}
          className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${mainTab === "progress" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
        >
          Progress
        </button>
        <button
          onClick={() => setMainTab("entitlements")}
          className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${mainTab === "entitlements" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
        >
          Entitlements
        </button>
        <button
          onClick={() => {
            setMainTab("zones");
            if (!zoneSummary) {
              fetch("/api/zones/summary")
                .then((r) => r.json())
                .then((d) => setZoneSummary(Array.isArray(d) ? d : []))
                .catch(() => setZoneSummary([]));
            }
          }}
          className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${mainTab === "zones" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
        >
          Zones
        </button>
      </div>

      {/* ══════════════════════ COVERAGE TAB ══════════════════════ */}
      {mainTab === "coverage" && (
        <>
          {/* Level toggle */}
          <div className="flex items-center gap-1 mb-6 bg-stone-100 rounded-xl p-1 w-fit">
            {LEVELS.map(l => (
              <button
                key={l.value}
                onClick={() => setView(l.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${view === l.value ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* City view */}
          {view === "city" && (
            <div className="space-y-4">
              {multiCity && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button onClick={() => setSelectedCityId(null)} className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${selectedCityId === null ? "bg-stone-800 text-white border-stone-800" : "text-stone-500 border-stone-200 hover:border-stone-400"}`}>
                    All cities
                  </button>
                  {cities.map(city => (
                    <button key={city.id} onClick={() => setSelectedCityId(city.id)} className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${selectedCityId === city.id ? "bg-sky-600 text-white border-sky-600" : "text-stone-500 border-stone-200 hover:border-stone-400"}`}>
                      {city.name}
                    </button>
                  ))}
                </div>
              )}
              {activeCityStats && activeCityStats.assessedCount > 0 && (
                <>
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
                <p className="text-sm text-stone-400 text-center py-12">No assessments recorded yet.</p>
              )}
            </div>
          )}

          {/* Zone view */}
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
                        <div key={zone.id} id={`geo-row-${zone.id}`}>
                          <button onClick={() => toggleZone(zone.id)} className={`w-full grid items-center gap-x-2 px-3 py-3 hover:bg-stone-100 transition-colors text-left ${initZoneId === zone.id ? "bg-emerald-50 ring-1 ring-inset ring-emerald-200" : "bg-stone-50"}`} style={{ gridTemplateColumns: rowCols(domainConfigs.length) }}>
                            {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />}
                            <Layers className="w-3.5 h-3.5 text-violet-400" />
                            <div className="min-w-0">
                              <span className="text-sm font-semibold text-stone-700 truncate block">{z.name}</span>
                              <span className="text-[10px] text-stone-400">{z.cityName}</span>
                            </div>
                            <span className="text-right text-xs text-stone-500 tabular-nums">{z.stats.assessedCount}/{z.stats.totalCount}</span>
                            <span className="text-right text-xs text-stone-500 tabular-nums">{z.stats.totalHH > 0 ? z.stats.totalHH.toLocaleString() : "—"}</span>
                            <div className="flex justify-center"><SaturationChip score={z.stats.saturationScore} /></div>
                            {domainConfigs.map(({ domain }) => (
                              <div key={domain} className="flex justify-center"><GapChip d={z.stats.domains[domain]} /></div>
                            ))}
                          </button>
                          {isOpen && z.stats.assessedCount > 0 && (
                            <div className="px-4 py-4 border-t border-stone-100 bg-white">
                              <DomainTable domains={z.stats.domains} domainConfigs={domainConfigs} />
                            </div>
                          )}
                          {isOpen && z.stats.assessedCount === 0 && (
                            <div className="px-4 py-3 border-t border-stone-100 text-xs text-stone-400">No assessments in this zone yet.</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cluster view */}
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
                        <div key={cluster.id} id={`geo-row-${cluster.id}`}>
                          <button onClick={() => toggleCluster(cluster.id)} className={`w-full grid items-center gap-x-2 px-3 py-3 hover:bg-stone-100 transition-colors text-left ${initClusterId === cluster.id ? "bg-emerald-50 ring-1 ring-inset ring-emerald-200" : "bg-stone-50"}`} style={{ gridTemplateColumns: rowCols(domainConfigs.length) }}>
                            {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />}
                            <Building2 className="w-3.5 h-3.5 text-emerald-500" />
                            <div className="min-w-0">
                              <span className="text-sm font-semibold text-stone-700 truncate block">{cl.name}</span>
                              <span className="text-[10px] text-stone-400">{cl.zoneName} · {cl.cityName}</span>
                            </div>
                            <span className="text-right text-xs text-stone-500 tabular-nums">{cl.stats.assessedCount}/{cl.stats.totalCount}</span>
                            <span className="text-right text-xs text-stone-500 tabular-nums">{cl.stats.totalHH > 0 ? cl.stats.totalHH.toLocaleString() : "—"}</span>
                            <div className="flex justify-center"><SaturationChip score={cl.stats.saturationScore} /></div>
                            {domainConfigs.map(({ domain }) => (
                              <div key={domain} className="flex justify-center"><GapChip d={cl.stats.domains[domain]} /></div>
                            ))}
                          </button>
                          {isOpen && cl.stats.assessedCount > 0 && (
                            <div className="px-4 py-4 border-t border-stone-100 bg-white">
                              <DomainTable domains={cl.stats.domains} domainConfigs={domainConfigs} />
                            </div>
                          )}
                          {isOpen && cl.stats.assessedCount === 0 && (
                            <div className="px-4 py-3 border-t border-stone-100 text-xs text-stone-400">No assessments in this cluster yet.</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Settlement view */}
          {view === "settlement" && (
            <div className="border border-stone-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <div style={{ minWidth: `${380 + domainConfigs.length * 32}px` }}>
                  <div className="grid items-center gap-x-2 px-3 py-1.5 bg-white border-b border-stone-200 text-[9px] font-semibold text-stone-400 uppercase tracking-wide" style={{ gridTemplateColumns: `1fr 80px 40px repeat(${domainConfigs.length}, 30px)` }}>
                    <span>Settlement</span>
                    <span className="text-right">HH</span>
                    <span className="text-center" title="Saturation">Sat</span>
                    {domainConfigs.map(d => (
                      <span key={d.domain} className="text-center leading-tight" style={{ color: d.color }} title={d.label}>
                        {d.label.replace(/([A-Z])/g, ' $1').trim().split(' ').map((w: string) => w[0]).join('').slice(0, 3)}
                      </span>
                    ))}
                  </div>
                  <div className="divide-y divide-stone-100">
                    {cities.flatMap(city => city.zones.flatMap(zone => zone.clusters.flatMap(cluster => cluster.settlements.map(s => {
                      const ss = settlementStats[s.id];
                      const isAssessed = s.assessments.length > 0;
                      return (
                        <div key={s.id} className="grid items-center gap-x-2 px-3 py-2.5 hover:bg-sky-50 transition-colors group" style={{ gridTemplateColumns: `1fr 80px 40px repeat(${domainConfigs.length}, 30px)` }}>
                          <div className="min-w-0 flex items-start gap-1">
                            <Link href={`/needs/settlement/${s.id}`} className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <Home className="w-3 h-3 text-stone-300 flex-shrink-0" />
                                <span className="text-xs font-medium text-stone-700 group-hover:text-sky-700 truncate">{s.name}</span>
                              </div>
                              <span className="text-[10px] text-stone-400 ml-4">{cluster.name} · {zone.name}</span>
                            </Link>
                            <Link href="/map" title="View on Programme Map" className="flex-shrink-0 p-0.5 mt-0.5 text-stone-300 hover:text-indigo-500 transition-colors">
                              <Map className="w-3 h-3" />
                            </Link>
                          </div>
                          <div className="flex justify-end items-center gap-1">
                            {isAssessed ? (
                              <><CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" /><span className="text-[10px] text-stone-500 tabular-nums">{ss?.stats.totalHH.toLocaleString()}</span></>
                            ) : (
                              <Clock className="w-3 h-3 text-amber-400" />
                            )}
                          </div>
                          <div className="flex justify-center">
                            {isAssessed && ss ? <SaturationChip score={ss.stats.saturationScore} /> : <span className="text-[10px] text-stone-200">·</span>}
                          </div>
                          {domainConfigs.map(({ domain }) => (
                            <div key={domain} className="flex justify-center">
                              {isAssessed && ss ? <GapChip d={ss.stats.domains[domain]} /> : <span className="text-[10px] text-stone-200">·</span>}
                            </div>
                          ))}
                        </div>
                      );
                    }))))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Browse hierarchy */}
          {view !== "settlement" && (
            <div className="mt-8 border-t border-stone-100 pt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-3">Browse by geography</h2>
              <div className="space-y-2">
                {cities.map(city => (
                  <div key={city.id} className="border border-stone-200 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-stone-50 border-b border-stone-100">
                      <MapPin className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                      <span className="text-sm font-semibold text-stone-700">{city.name}</span>
                      <span className="ml-auto text-xs text-stone-400">{city.zones.flatMap(z => z.clusters.flatMap(c => c.settlements)).length} settlements</span>
                    </div>
                    <div className="divide-y divide-stone-100">
                      {city.zones.map(zone => {
                        const zoneSettlements = zone.clusters.flatMap(c => c.settlements);
                        const zoneAssessed = zoneSettlements.filter(s => s.assessments.length > 0).length;
                        const zIsOpen = openZones.has(`browse-${zone.id}`);
                        const toggleBrowseZone = () => setOpenZones(prev => { const n = new Set(prev); n.has(`browse-${zone.id}`) ? n.delete(`browse-${zone.id}`) : n.add(`browse-${zone.id}`); return n; });
                        return (
                          <div key={zone.id}>
                            <button onClick={toggleBrowseZone} className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left">
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
                                  const toggleBrowseCluster = () => setOpenClusters(prev => { const n = new Set(prev); n.has(`browse-${cluster.id}`) ? n.delete(`browse-${cluster.id}`) : n.add(`browse-${cluster.id}`); return n; });
                                  return (
                                    <div key={cluster.id}>
                                      <button onClick={toggleBrowseCluster} className="w-full flex items-center gap-2 px-6 py-2 hover:bg-stone-100/60 transition-colors text-left">
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
                                              <Link key={settlement.id} href={`/needs/settlement/${settlement.id}`} className="flex items-center gap-3 px-8 py-2.5 hover:bg-sky-50 transition-colors group">
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
        </>
      )}

      {/* ══════════════════════ PROGRESS TAB ══════════════════════ */}
      {mainTab === "progress" && (
        <div className="space-y-6">
          {/* City filter */}
          {multiCity && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => setSelectedCityId(null)} className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${selectedCityId === null ? "bg-stone-800 text-white border-stone-800" : "text-stone-500 border-stone-200 hover:border-stone-400"}`}>
                All cities
              </button>
              {cities.map(city => (
                <button key={city.id} onClick={() => setSelectedCityId(city.id)} className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${selectedCityId === city.id ? "bg-sky-600 text-white border-sky-600" : "text-stone-500 border-stone-200 hover:border-stone-400"}`}>
                  {city.name}
                </button>
              ))}
            </div>
          )}

          {/* Summary: goal health + deficit */}
          {activeCityProgress && (
            <div className="rounded-xl border border-stone-200 p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Goal health</p>
                <DeficitBadge deficit={activeCityProgress.deficit} />
              </div>
              <HealthSummary p={activeCityProgress} />
            </div>
          )}

          {/* Monthly trend */}
          <div className="rounded-xl border border-stone-200 p-4">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-4">Delivery trend — {new Date().getFullYear()}</p>
            {monthlyTrend.some(p => p.planned > 0 || p.actual > 0) ? (
              <TrendChart points={monthlyTrend} currentMonth={currentMonth} />
            ) : (
              <p className="text-xs text-stone-400 text-center py-6">No goals with target dates set yet.</p>
            )}
          </div>

          {/* Zone → Cluster → Settlement drill-down */}
          <div className="border border-stone-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-stone-50 border-b border-stone-100 flex items-center gap-2">
              <p className="text-xs font-semibold text-stone-600 uppercase tracking-wide">By geography</p>
              <span className="text-[10px] text-stone-400">— click a row to expand domain detail</span>
            </div>
            <div className="divide-y divide-stone-100">
              {cities
                .filter(city => !selectedCityId || city.id === selectedCityId)
                .flatMap(city => city.zones).map(zone => {
                  const zp = zoneProgress[zone.id];
                  const zz = zoneStats[zone.id];
                  const isOpen = openZones.has(`prog-${zone.id}`);
                  if (!zp) return null;
                  return (
                    <div key={zone.id}>
                      <button
                        onClick={() => setOpenZones(prev => { const n = new Set(prev); n.has(`prog-${zone.id}`) ? n.delete(`prog-${zone.id}`) : n.add(`prog-${zone.id}`); return n; })}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-stone-50 hover:bg-stone-100 transition-colors text-left"
                      >
                        {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />}
                        <TrafficLight p={zp} />
                        <Layers className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-stone-700">{zz?.name ?? zone.id}</span>
                          {zp.totalGoals > 0 && (
                            <span className="ml-2 text-[10px] text-stone-400">
                              {zp.doneGoals}✓ {zp.onTrackGoals > 0 ? `${zp.onTrackGoals} on track` : ""} {zp.atRiskGoals > 0 ? `· ${zp.atRiskGoals} at risk` : ""} {zp.overdueGoals > 0 ? `· ${zp.overdueGoals} overdue` : ""}
                            </span>
                          )}
                        </div>
                        {zp.deficit > 0
                          ? <span className="text-xs font-medium text-red-500 flex-shrink-0">-{zp.deficit} units behind</span>
                          : zp.totalGoals > 0
                            ? <span className="text-xs font-medium text-emerald-500 flex-shrink-0">On plan</span>
                            : null
                        }
                      </button>
                      {isOpen && (
                        <div className="bg-white">
                          {/* Zone domain detail */}
                          <div className="px-6 py-3 border-b border-stone-100">
                            <ProgressDomainTable p={zp} domainConfigs={domainConfigs} />
                          </div>
                          {/* Clusters within this zone */}
                          {zone.clusters.map(cluster => {
                            const cp = clusterProgress[cluster.id];
                            const cc = clusterStats[cluster.id];
                            const clIsOpen = openClusters.has(`prog-${cluster.id}`);
                            if (!cp) return null;
                            return (
                              <div key={cluster.id} className="border-t border-stone-50">
                                <button
                                  onClick={() => setOpenClusters(prev => { const n = new Set(prev); n.has(`prog-${cluster.id}`) ? n.delete(`prog-${cluster.id}`) : n.add(`prog-${cluster.id}`); return n; })}
                                  className="w-full flex items-center gap-3 px-6 py-2.5 hover:bg-stone-50 transition-colors text-left"
                                >
                                  {clIsOpen ? <ChevronDown className="w-3 h-3 text-stone-400 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-stone-400 flex-shrink-0" />}
                                  <TrafficLight p={cp} />
                                  <Building2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <span className="text-xs font-semibold text-stone-700">{cc?.name ?? cluster.id}</span>
                                    {cp.totalGoals > 0 && (
                                      <span className="ml-2 text-[10px] text-stone-400">
                                        {cp.doneGoals}✓ {cp.atRiskGoals > 0 ? `${cp.atRiskGoals} at risk` : ""} {cp.overdueGoals > 0 ? `${cp.overdueGoals} overdue` : ""}
                                      </span>
                                    )}
                                  </div>
                                  {cp.deficit > 0
                                    ? <span className="text-[10px] font-medium text-red-500 flex-shrink-0">-{cp.deficit}</span>
                                    : cp.totalGoals > 0
                                      ? <span className="text-[10px] text-emerald-500 flex-shrink-0">✓</span>
                                      : null
                                  }
                                </button>
                                {clIsOpen && (
                                  <div className="bg-stone-50/50">
                                    <div className="px-8 py-3 border-b border-stone-100">
                                      <ProgressDomainTable p={cp} domainConfigs={domainConfigs} />
                                    </div>
                                    {/* Settlements within cluster */}
                                    <div className="divide-y divide-stone-50">
                                      {cluster.settlements.map(s => {
                                        const sp = settlementProgress[s.id];
                                        if (!sp || sp.totalGoals === 0) return null;
                                        return (
                                          <div key={s.id} className="flex items-center gap-3 px-10 py-2">
                                            <TrafficLight p={sp} />
                                            <Home className="w-3 h-3 text-stone-300 flex-shrink-0" />
                                            <span className="text-xs text-stone-600 flex-1">{s.name}</span>
                                            <span className="text-[10px] text-stone-400">
                                              {sp.doneGoals}✓ {sp.atRiskGoals > 0 ? `${sp.atRiskGoals} at risk` : ""} {sp.overdueGoals > 0 ? `${sp.overdueGoals} overdue` : ""}
                                            </span>
                                            {sp.deficit > 0
                                              ? <span className="text-[10px] font-medium text-red-500">-{sp.deficit}</span>
                                              : <span className="text-[10px] text-emerald-500">✓</span>
                                            }
                                          </div>
                                        );
                                      })}
                                    </div>
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
        </div>
      )}

      {/* ══════════════════════ ENTITLEMENTS TAB ══════════════════════ */}
      {mainTab === "entitlements" && (
        <>
          {/* Level toggle */}
          <div className="flex items-center gap-1 mb-6 bg-stone-100 rounded-xl p-1 w-fit">
            {LEVELS.map(l => (
              <button
                key={l.value}
                onClick={() => setView(l.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${view === l.value ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* City filter (multi-city) */}
          {multiCity && (
            <div className="flex items-center gap-1.5 flex-wrap mb-4">
              <button onClick={() => setSelectedCityId(null)} className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${selectedCityId === null ? "bg-stone-800 text-white border-stone-800" : "text-stone-500 border-stone-200 hover:border-stone-400"}`}>
                All cities
              </button>
              {cities.map(city => (
                <button key={city.id} onClick={() => setSelectedCityId(city.id)} className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${selectedCityId === city.id ? "bg-sky-600 text-white border-sky-600" : "text-stone-500 border-stone-200 hover:border-stone-400"}`}>
                  {city.name}
                </button>
              ))}
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 mb-4 text-[10px] text-stone-500">
            <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-stone-400 inline-block" /> Survey baseline</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-sky-400 inline-block" /> NGO-assisted</div>
          </div>

          {/* City view: scheme bars */}
          {view === "city" && (() => {
            const ents = selectedCityId ? (cityEntMap[selectedCityId] ?? []) : cityEntitlements;
            const parents = ents.filter(e => !e.parentId);
            const children = (pid: string) => ents.filter(e => e.parentId === pid);
            if (ents.length === 0) return <p className="text-sm text-stone-400 text-center py-8">No entitlement data recorded yet.</p>;
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {parents.map(parent => (
                  <div key={parent.id} className="rounded-xl border border-stone-100 p-4">
                    <EntitlementBar scheme={parent} />
                    {children(parent.id).map(child => (
                      <div key={child.id} className="pl-3 border-l-2 border-stone-100 mt-1">
                        <EntitlementBar scheme={child} />
                      </div>
                    ))}
                  </div>
                ))}
                {ents.filter(e => !e.parentId && !parents.find(p => p.id === e.id)).map(e => (
                  <div key={e.id} className="rounded-xl border border-stone-100 p-4">
                    <EntitlementBar scheme={e} />
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Zone view: table with key scheme columns per zone */}
          {view === "zone" && (
            <div className="overflow-x-auto rounded-xl border border-stone-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200">
                    <th className="text-left py-2 px-3 font-medium text-stone-500 text-[10px] uppercase">Zone</th>
                    <th className="text-right py-2 px-2 font-medium text-stone-500 text-[10px]">Eligible HH</th>
                    <th className="text-center py-2 px-2 font-medium text-stone-500 text-[10px]">Ration Card</th>
                    <th className="text-center py-2 px-2 font-medium text-stone-500 text-[10px]">Aadhaar</th>
                    <th className="text-center py-2 px-2 font-medium text-stone-500 text-[10px]">Old Age Pension</th>
                    <th className="text-center py-2 px-2 font-medium text-stone-500 text-[10px]">BoCW</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {cities.filter(c => !selectedCityId || c.id === selectedCityId).flatMap(c => c.zones).map(zone => {
                    const ents = zoneEntMap[zone.id] ?? [];
                    const eligible = ents.find(e => e.id === "ration-card")?.eligible ?? ents[0]?.eligible ?? 0;
                    return (
                      <tr key={zone.id} className="hover:bg-stone-50">
                        <td className="py-2 px-3 font-medium text-stone-700">{zoneStats[zone.id]?.name ?? zone.id}</td>
                        <td className="py-2 px-2 text-right text-stone-500">{eligible.toLocaleString()}</td>
                        {KEY_SCHEME_IDS.map(sid => (
                          <td key={sid} className="py-2 px-2 text-center"><EntSchemeCell ents={ents} schemeId={sid} /></td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Cluster view */}
          {view === "cluster" && (
            <div className="overflow-x-auto rounded-xl border border-stone-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200">
                    <th className="text-left py-2 px-3 font-medium text-stone-500 text-[10px] uppercase">Cluster</th>
                    <th className="text-left py-2 px-2 font-medium text-stone-400 text-[10px]">Zone</th>
                    <th className="text-right py-2 px-2 font-medium text-stone-500 text-[10px]">Eligible HH</th>
                    <th className="text-center py-2 px-2 font-medium text-stone-500 text-[10px]">Ration Card</th>
                    <th className="text-center py-2 px-2 font-medium text-stone-500 text-[10px]">Aadhaar</th>
                    <th className="text-center py-2 px-2 font-medium text-stone-500 text-[10px]">Old Age Pension</th>
                    <th className="text-center py-2 px-2 font-medium text-stone-500 text-[10px]">BoCW</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {cities.filter(c => !selectedCityId || c.id === selectedCityId).flatMap(c => c.zones.flatMap(z => z.clusters.map(cl => ({ cl, zoneName: zoneStats[z.id]?.name ?? z.id })))).map(({ cl, zoneName }) => {
                    const ents = clusterEntMap[cl.id] ?? [];
                    const eligible = ents.find(e => e.id === "ration-card")?.eligible ?? ents[0]?.eligible ?? 0;
                    return (
                      <tr key={cl.id} className="hover:bg-stone-50">
                        <td className="py-2 px-3 font-medium text-stone-700">{clusterStats[cl.id]?.name ?? cl.id}</td>
                        <td className="py-2 px-2 text-stone-400">{zoneName}</td>
                        <td className="py-2 px-2 text-right text-stone-500">{eligible.toLocaleString()}</td>
                        {KEY_SCHEME_IDS.map(sid => (
                          <td key={sid} className="py-2 px-2 text-center"><EntSchemeCell ents={ents} schemeId={sid} /></td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Settlement view */}
          {view === "settlement" && (
            <div className="overflow-x-auto rounded-xl border border-stone-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200">
                    <th className="text-left py-2 px-3 font-medium text-stone-500 text-[10px] uppercase">Settlement</th>
                    <th className="text-left py-2 px-2 font-medium text-stone-400 text-[10px]">Cluster</th>
                    <th className="text-right py-2 px-2 font-medium text-stone-500 text-[10px]">Eligible HH</th>
                    <th className="text-center py-2 px-2 font-medium text-stone-500 text-[10px]">Ration Card</th>
                    <th className="text-center py-2 px-2 font-medium text-stone-500 text-[10px]">Aadhaar</th>
                    <th className="text-center py-2 px-2 font-medium text-stone-500 text-[10px]">Old Age Pension</th>
                    <th className="text-center py-2 px-2 font-medium text-stone-500 text-[10px]">BoCW</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {cities.filter(c => !selectedCityId || c.id === selectedCityId).flatMap(c => c.zones.flatMap(z => z.clusters.flatMap(cl => cl.settlements.map(s => ({ s, clusterName: clusterStats[cl.id]?.name ?? cl.id }))))).map(({ s, clusterName }) => {
                    const ents = settlementEntMap[s.id] ?? [];
                    const eligible = ents.find(e => e.id === "ration-card")?.eligible ?? ents[0]?.eligible ?? 0;
                    if (ents.length === 0) return null;
                    return (
                      <tr key={s.id} className="hover:bg-stone-50">
                        <td className="py-2 px-3">
                          <Link href={`/needs/settlement/${s.id}`} className="font-medium text-stone-700 hover:text-sky-600">{settlementStats[s.id]?.name ?? s.id}</Link>
                        </td>
                        <td className="py-2 px-2 text-stone-400">{clusterName}</td>
                        <td className="py-2 px-2 text-right text-stone-500">{eligible.toLocaleString()}</td>
                        {KEY_SCHEME_IDS.map(sid => (
                          <td key={sid} className="py-2 px-2 text-center"><EntSchemeCell ents={ents} schemeId={sid} /></td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════ ZONES SUMMARY TAB ══════════════════════ */}
      {mainTab === "zones" && (
        <div>
          {zoneSummary === null && (
            <p className="text-sm text-stone-400 py-8 text-center">Loading zone summaries…</p>
          )}
          {zoneSummary !== null && zoneSummary.length === 0 && (
            <p className="text-sm text-stone-400 py-8 text-center">No zones found.</p>
          )}
          {zoneSummary !== null && zoneSummary.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {zoneSummary.map((z) => {
                const goalPct = z.totalSettlements > 0
                  ? Math.round((z.withActiveGoals / z.totalSettlements) * 100)
                  : 0;
                return (
                  <div key={z.id} className="rounded-xl border border-stone-100 p-4 space-y-3 bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-stone-800">{z.name}</h3>
                      {z.overdueCount > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-500">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          {z.overdueCount} overdue
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-stone-50 rounded-lg px-2 py-1.5">
                        <p className="text-base font-bold text-stone-800">{z.totalSettlements}</p>
                        <p className="text-[9px] text-stone-400 uppercase tracking-wide">Settlements</p>
                      </div>
                      <div className="bg-stone-50 rounded-lg px-2 py-1.5">
                        <p className="text-base font-bold text-stone-800">{z.population.totalHouseholds.toLocaleString()}</p>
                        <p className="text-[9px] text-stone-400 uppercase tracking-wide">Households</p>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] text-stone-500 mb-1">
                        <span>Settlements with active goals</span>
                        <span className="font-semibold">{z.withActiveGoals} / {z.totalSettlements}</span>
                      </div>
                      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-400 transition-all"
                          style={{ width: `${goalPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-stone-500">
                      <span>{z.activeGoals} active goal{z.activeGoals !== 1 ? "s" : ""}</span>
                      {z.lastSurveyed && (
                        <span>Last surveyed {new Date(z.lastSurveyed).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
