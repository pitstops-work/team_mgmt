"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Home, TrendingUp, TrendingDown, Minus, Clock } from "lucide-react";
import dynamic from "next/dynamic";

const ImpactChart = dynamic(() => import("./ImpactChart"), { ssr: false });

type StalenessStatus = "green" | "yellow" | "red" | "none";
type TimeRange = "3m" | "6m" | "1y" | "all";

type TSPoint = {
  date: string;
  cumulativeDone: number;
  remaining: number;
  goalTitle: string;
  settlementName: string | null;
};

type DomainData = {
  label: string;
  color: string;
  baseline: number;
  totalDone: number;
  remaining: number;
  pctDone: number;
  lastDeliveryDate: string | null;
  stalenessStatus: StalenessStatus;
  timeSeries: TSPoint[];
};

type BreakdownItem = {
  id: string;
  name: string;
  domains: Record<string, { baseline: number; done: number; remaining: number; pctDone: number; stalenessStatus: StalenessStatus }>;
};

type ApiResponse = {
  geography: { id: string; name: string; level: string };
  domains: Record<string, DomainData>;
  breakdown: BreakdownItem[];
};

type GeoItem = { id: string; name: string };

type Props = {
  cities: GeoItem[];
};

const LEVEL_ORDER = ["city", "zone", "cluster", "settlement"] as const;
type Level = typeof LEVEL_ORDER[number];

const LEVEL_LABELS: Record<Level, string> = {
  city: "City",
  zone: "Zone",
  cluster: "Cluster",
  settlement: "Settlement",
};

function StalenessIndicator({ status }: { status: StalenessStatus }) {
  if (status === "none") return <span className="flex items-center gap-1 text-[10px] text-stone-400"><span className="w-1.5 h-1.5 rounded-full bg-stone-300" />No data</span>;
  if (status === "green") return <span className="flex items-center gap-1 text-[10px] text-emerald-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Active</span>;
  if (status === "yellow") return <span className="flex items-center gap-1 text-[10px] text-amber-600"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Slowing</span>;
  return <span className="flex items-center gap-1 text-[10px] text-red-600"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Stalled</span>;
}

function StalenessChip({ status }: { status: StalenessStatus }) {
  const base = "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium";
  if (status === "none") return <span className={`${base} bg-stone-100 text-stone-400`}><span className="w-1.5 h-1.5 rounded-full bg-stone-300" />—</span>;
  if (status === "green") return <span className={`${base} bg-emerald-50 text-emerald-700`}><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Active</span>;
  if (status === "yellow") return <span className={`${base} bg-amber-50 text-amber-700`}><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Slowing</span>;
  return <span className={`${base} bg-red-50 text-red-700`}><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Stalled</span>;
}

export default function ImpactDashboard({ cities }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const level = (searchParams.get("level") as Level) ?? "city";
  const geoId = searchParams.get("id") ?? cities[0]?.id ?? "";
  const selectedDomain = searchParams.get("domain") ?? null;

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [breadcrumb, setBreadcrumb] = useState<{ level: Level; id: string; name: string }[]>([]);

  const setParams = useCallback((params: Record<string, string | null>) => {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    router.push(`/impact?${sp.toString()}`);
  }, [router, searchParams]);

  useEffect(() => {
    if (!geoId) return;
    setLoading(true);
    const params = new URLSearchParams({ level, id: geoId });
    if (selectedDomain) params.set("domain", selectedDomain);
    fetch(`/api/impact/needs-progress?${params}`)
      .then(r => r.json())
      .then((d: ApiResponse) => {
        setData(d);
        setBreadcrumb(prev => {
          const existing = prev.findIndex(b => b.level === level && b.id === geoId);
          if (existing >= 0) return prev.slice(0, existing + 1);
          return [...prev, { level, id: geoId, name: d.geography.name }];
        });
      })
      .finally(() => setLoading(false));
  }, [level, geoId, selectedDomain]);

  const domainList = data ? Object.entries(data.domains).filter(([, d]) => d.baseline > 0 || d.totalDone > 0) : [];
  const filteredDomains = selectedDomain ? domainList.filter(([k]) => k === selectedDomain) : domainList;

  const nextLevel = LEVEL_ORDER[LEVEL_ORDER.indexOf(level) + 1] as Level | undefined;

  function drillInto(itemId: string) {
    if (!nextLevel) return;
    setParams({ level: nextLevel, id: itemId, domain: selectedDomain });
  }

  const chartSeries = domainList.map(([domain, d]) => ({
    domain,
    label: d.label,
    color: d.color,
    baseline: d.baseline,
    timeSeries: d.timeSeries,
  }));

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-stone-900">Community Needs Progress</h1>
          <p className="text-xs text-stone-500 mt-0.5">How gaps have changed as programme goals complete</p>
        </div>
        {/* Time range picker */}
        <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-0.5 flex-shrink-0">
          {(["3m", "6m", "1y", "all"] as TimeRange[]).map(r => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${timeRange === r ? "bg-white text-stone-800 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
            >
              {r === "all" ? "All" : r}
            </button>
          ))}
        </div>
      </div>

      {/* Geography selector + breadcrumb */}
      <div className="flex flex-wrap items-center gap-2">
        {/* City picker if at city level */}
        {level === "city" && cities.length > 1 && (
          <select
            value={geoId}
            onChange={e => setParams({ level: "city", id: e.target.value, domain: selectedDomain })}
            className="text-xs border border-stone-200 rounded-lg px-2.5 py-1.5 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-200"
          >
            {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {/* Breadcrumb */}
        {breadcrumb.length > 0 && (
          <nav className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setBreadcrumb([])}
              className="p-1 rounded text-stone-400 hover:text-stone-600 hover:bg-stone-100"
            >
              <Home className="w-3.5 h-3.5" />
            </button>
            {breadcrumb.map((b, i) => (
              <span key={`${b.level}-${b.id}`} className="flex items-center gap-1">
                <ChevronRight className="w-3 h-3 text-stone-300" />
                <button
                  onClick={() => setParams({ level: b.level, id: b.id, domain: selectedDomain })}
                  className={`px-1.5 py-0.5 rounded font-medium transition-colors ${i === breadcrumb.length - 1 ? "text-stone-800" : "text-sky-600 hover:text-sky-700 hover:bg-sky-50"}`}
                >
                  {b.name}
                  <span className="ml-1 text-stone-400 font-normal">({LEVEL_LABELS[b.level]})</span>
                </button>
              </span>
            ))}
          </nav>
        )}
      </div>

      {/* Domain pills */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setParams({ domain: null })}
          className={`px-3 py-1 text-xs rounded-full border transition-colors ${!selectedDomain ? "bg-stone-800 text-white border-stone-800" : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50"}`}
        >
          All domains
        </button>
        {domainList.map(([domain, d]) => (
          <button
            key={domain}
            onClick={() => setParams({ domain: selectedDomain === domain ? null : domain })}
            className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${selectedDomain === domain ? "text-white border-transparent" : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50"}`}
            style={selectedDomain === domain ? { background: d.color, borderColor: d.color } : {}}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: selectedDomain === domain ? "white" : d.color }} />
            {d.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
          <div className="h-full bg-sky-400 rounded-full animate-pulse" style={{ width: "60%" }} />
        </div>
      )}

      {/* Summary cards */}
      {filteredDomains.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredDomains.map(([domain, d]) => {
            const pct = d.pctDone;
            return (
              <button
                key={domain}
                onClick={() => setParams({ domain: selectedDomain === domain ? null : domain })}
                className={`text-left rounded-xl border p-3 space-y-2 transition-all hover:shadow-sm ${selectedDomain === domain ? "border-stone-300 shadow-sm bg-white" : "border-stone-100 hover:border-stone-200"}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="text-xs font-semibold text-stone-700 truncate">{d.label}</span>
                  </div>
                  <StalenessIndicator status={d.stalenessStatus} />
                </div>
                <div className="grid grid-cols-3 text-center gap-1">
                  <div>
                    <p className="text-sm font-bold text-stone-500">{d.baseline}</p>
                    <p className="text-[9px] text-stone-400">baseline</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-emerald-600">{d.totalDone}</p>
                    <p className="text-[9px] text-stone-400">done</p>
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${d.remaining > 0 ? "text-red-500" : "text-emerald-500"}`}>
                      {d.remaining > 0 ? d.remaining : "✓"}
                    </p>
                    <p className="text-[9px] text-stone-400">left</p>
                  </div>
                </div>
                <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: d.color }} />
                </div>
                <div className="flex justify-between items-center text-[9px] text-stone-400">
                  {d.lastDeliveryDate && (
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(d.lastDeliveryDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  )}
                  <span className="ml-auto">{pct}%</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Time-series chart */}
      {chartSeries.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-stone-800">
                {selectedDomain ? (data?.domains[selectedDomain]?.label ?? selectedDomain) : "Needs Remaining"} over time
              </p>
              <p className="text-[10px] text-stone-400">Each step = a goal completed</p>
            </div>
            {selectedDomain && data?.domains[selectedDomain] && (
              <div className="flex items-center gap-1.5">
                {data.domains[selectedDomain].pctDone > 0
                  ? <TrendingDown className="w-4 h-4 text-emerald-500" />
                  : <Minus className="w-4 h-4 text-stone-400" />
                }
                <span className="text-xs font-semibold text-stone-700">
                  {data.domains[selectedDomain].pctDone}% addressed
                </span>
              </div>
            )}
          </div>
          <ImpactChart
            series={chartSeries}
            selectedDomain={selectedDomain}
            timeRange={timeRange}
          />
        </div>
      )}

      {/* Breakdown table */}
      {data?.breakdown && data.breakdown.length > 0 && nextLevel && (
        <div className="bg-white rounded-xl border border-stone-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-stone-800">
              By {LEVEL_LABELS[nextLevel]}
            </p>
            <p className="text-xs text-stone-400">{data.breakdown.length} {LEVEL_LABELS[nextLevel].toLowerCase()}{data.breakdown.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-100">
                  <th className="text-left px-4 py-2 font-medium text-stone-500">Name</th>
                  {(selectedDomain ? [selectedDomain] : Object.keys(data.domains).slice(0, 4)).map(d => (
                    <th key={d} className="text-right px-3 py-2 font-medium text-stone-500 hidden sm:table-cell">
                      <span className="flex items-center justify-end gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: data.domains[d]?.color }} />
                        {data.domains[d]?.label ?? d}
                      </span>
                    </th>
                  ))}
                  <th className="text-right px-4 py-2 font-medium text-stone-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {data.breakdown.map(item => {
                  const domainKeys = selectedDomain ? [selectedDomain] : Object.keys(data.domains).slice(0, 4);
                  const overallStatus = domainKeys.reduce<StalenessStatus>((worst, dk) => {
                    const s = item.domains[dk]?.stalenessStatus ?? "none";
                    const order: StalenessStatus[] = ["none", "green", "yellow", "red"];
                    return order.indexOf(s) > order.indexOf(worst) ? s : worst;
                  }, "none");
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-stone-50 cursor-pointer transition-colors"
                      onClick={() => drillInto(item.id)}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-stone-700">{item.name}</span>
                          {nextLevel !== "settlement" && <ChevronRight className="w-3 h-3 text-stone-300" />}
                        </div>
                      </td>
                      {domainKeys.map(dk => {
                        const dd = item.domains[dk];
                        if (!dd) return <td key={dk} className="px-3 py-2.5 text-right text-stone-300 hidden sm:table-cell">—</td>;
                        return (
                          <td key={dk} className="px-3 py-2.5 text-right hidden sm:table-cell">
                            <span className={`font-medium ${dd.remaining > 0 ? "text-stone-700" : "text-emerald-600"}`}>
                              {dd.remaining > 0 ? `${dd.done}/${dd.baseline}` : "✓"}
                            </span>
                            {dd.baseline > 0 && (
                              <span className="text-stone-400 ml-1">({dd.pctDone}%)</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 text-right">
                        <StalenessChip status={overallStatus} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && data && domainList.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <TrendingUp className="w-8 h-8 text-stone-300 mb-3" />
          <p className="text-sm font-medium text-stone-500">No needs data yet</p>
          <p className="text-xs text-stone-400 mt-1">Complete goals with domain targets to see progress here</p>
        </div>
      )}
    </div>
  );
}
