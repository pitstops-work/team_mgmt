"use client";

import { useState, useEffect } from "react";
import { Download, RefreshCw, AlertTriangle, CheckCircle2, Clock, TrendingUp } from "lucide-react";

// Zone-level summary from /api/zones/summary
type ZoneSummary = {
  id: string;
  name: string;
  city: { id: string; name: string } | null;
  totalSettlements: number;
  withActiveGoals: number;
  population: {
    totalHouseholds: number;
    children6m3yr: number;
    children4to14: number;
    youth15to21: number;
    elderly60plus: number;
  };
  activeGoals: number;
  overdueCount: number;
  lastSurveyed: string | null;
};

// Per-zone goal breakdown from /api/map/geo-goals
type GeoGoal = {
  id: string;
  title: string;
  status: string;
  pitstops: { id: string; title: string; status: string; targetDate: string | null }[];
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function StatusChip({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Active: "bg-emerald-100 text-emerald-700",
    Paused: "bg-amber-100 text-amber-700",
    Complete: "bg-stone-100 text-stone-500",
    Upcoming: "bg-indigo-100 text-indigo-700",
    InProgress: "bg-amber-100 text-amber-700",
    Done: "bg-stone-100 text-stone-500",
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${colors[status] ?? "bg-stone-100 text-stone-500"}`}>
      {status}
    </span>
  );
}

export default function ReportDashboard() {
  const [zones, setZones] = useState<ZoneSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [zoneGoals, setZoneGoals] = useState<GeoGoal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [generatedAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    fetch("/api/zones/summary")
      .then((r) => r.json())
      .then((d) => { setZones(d.zones ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedZone) { setZoneGoals([]); return; }
    const zone = zones.find((z) => z.id === selectedZone);
    if (!zone) return;
    setGoalsLoading(true);
    fetch(`/api/map/geo-goals?zone=${encodeURIComponent(zone.name)}`)
      .then((r) => r.json())
      .then((d) => { setZoneGoals(Array.isArray(d) ? d : []); setGoalsLoading(false); })
      .catch(() => setGoalsLoading(false));
  }, [selectedZone, zones]);

  const totals = zones.reduce(
    (acc, z) => ({
      settlements: acc.settlements + z.totalSettlements,
      households: acc.households + z.population.totalHouseholds,
      goals: acc.goals + z.activeGoals,
      overdue: acc.overdue + z.overdueCount,
    }),
    { settlements: 0, households: 0, goals: 0, overdue: 0 }
  );

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 flex items-center gap-2 text-stone-400">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Loading report data…
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-800">Programme Report</h1>
          <p className="text-sm text-stone-500 mt-1">
            Zone-level summary · Generated {fmt(generatedAt)}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Print / PDF
        </button>
      </div>

      {/* Programme-wide summary */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-3">Programme Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Zones", value: zones.length, icon: TrendingUp, color: "text-indigo-600" },
            { label: "Settlements", value: totals.settlements, icon: CheckCircle2, color: "text-sky-600" },
            { label: "Households", value: totals.households.toLocaleString(), icon: TrendingUp, color: "text-emerald-600" },
            { label: "Active Goals", value: totals.goals, icon: totals.overdue > 0 ? AlertTriangle : CheckCircle2, color: totals.overdue > 0 ? "text-red-500" : "text-emerald-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-stone-50 rounded-xl px-4 py-3 flex items-center gap-3">
              <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
              <div>
                <p className="text-xs text-stone-400">{label}</p>
                <p className="text-xl font-bold text-stone-800">{value}</p>
              </div>
            </div>
          ))}
        </div>
        {totals.overdue > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {totals.overdue} overdue pitstop{totals.overdue !== 1 ? "s" : ""} across all zones
          </div>
        )}
      </section>

      {/* Zone-by-zone table */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-3">Zone Breakdown</h2>
        <div className="rounded-xl border border-stone-100 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-100">
                <th className="text-left px-4 py-2.5 font-semibold text-stone-500">Zone</th>
                <th className="text-right px-3 py-2.5 font-semibold text-stone-500">Settlements</th>
                <th className="text-right px-3 py-2.5 font-semibold text-stone-500">Households</th>
                <th className="text-right px-3 py-2.5 font-semibold text-stone-500">With Goals</th>
                <th className="text-right px-3 py-2.5 font-semibold text-stone-500">Active Goals</th>
                <th className="text-right px-3 py-2.5 font-semibold text-stone-500">Overdue</th>
                <th className="text-right px-3 py-2.5 font-semibold text-stone-500">Last Survey</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {zones.map((z) => {
                const goalPct = z.totalSettlements > 0
                  ? Math.round((z.withActiveGoals / z.totalSettlements) * 100)
                  : 0;
                return (
                  <tr
                    key={z.id}
                    className={`hover:bg-stone-50 cursor-pointer transition-colors ${selectedZone === z.id ? "bg-sky-50" : ""}`}
                    onClick={() => setSelectedZone((prev) => prev === z.id ? null : z.id)}
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-stone-700">{z.name}</span>
                      {z.city && <span className="ml-1.5 text-[10px] text-stone-400">{z.city.name}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-stone-600">{z.totalSettlements}</td>
                    <td className="px-3 py-2.5 text-right text-stone-600">{z.population.totalHouseholds.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={goalPct >= 80 ? "text-emerald-600" : goalPct >= 50 ? "text-amber-600" : "text-red-500"}>
                        {z.withActiveGoals} / {z.totalSettlements}
                      </span>
                      <span className="text-stone-400 ml-1">({goalPct}%)</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-stone-600">{z.activeGoals}</td>
                    <td className="px-3 py-2.5 text-right">
                      {z.overdueCount > 0 ? (
                        <span className="text-red-500 font-semibold">{z.overdueCount}</span>
                      ) : (
                        <span className="text-emerald-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-stone-400">
                      {z.lastSurveyed
                        ? new Date(z.lastSurveyed).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {zones.length === 0 && (
          <p className="text-sm text-stone-400 text-center py-6">No zones found.</p>
        )}
      </section>

      {/* Selected zone drill-down */}
      {selectedZone && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-3">
            Goals — {zones.find((z) => z.id === selectedZone)?.name}
          </h2>
          {goalsLoading && (
            <div className="flex items-center gap-2 text-stone-400 text-sm py-4">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Loading goals…
            </div>
          )}
          {!goalsLoading && zoneGoals.length === 0 && (
            <p className="text-sm text-stone-400 italic">No goals assigned to this zone.</p>
          )}
          {!goalsLoading && zoneGoals.length > 0 && (
            <div className="space-y-3">
              {zoneGoals.map((goal) => {
                const today = new Date();
                const overduePitstops = goal.pitstops.filter(
                  (p) => p.status !== "Done" && p.targetDate && new Date(p.targetDate) < today
                ).length;
                return (
                  <div key={goal.id} className="rounded-xl border border-stone-100 overflow-hidden">
                    <div className="px-4 py-2.5 bg-stone-50 flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-stone-700">{goal.title}</span>
                      <div className="flex items-center gap-2">
                        {overduePitstops > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-red-500 font-semibold">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {overduePitstops} overdue
                          </span>
                        )}
                        <StatusChip status={goal.status} />
                      </div>
                    </div>
                    {goal.pitstops.length > 0 && (
                      <div className="divide-y divide-stone-50">
                        {goal.pitstops.map((p) => {
                          const isOverdue = p.status !== "Done" && p.targetDate && new Date(p.targetDate) < new Date();
                          return (
                            <div key={p.id} className="px-4 py-2 flex items-center gap-2.5">
                              <span
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{
                                  background: p.status === "Done" ? "#94a3b8" : isOverdue ? "#ef4444" : p.status === "InProgress" ? "#f59e0b" : "#6366f1",
                                }}
                              />
                              <span className="text-xs text-stone-600 flex-1 truncate">
                                {p.title}
                                {isOverdue && <span className="ml-1 text-red-500 font-semibold">⚠</span>}
                              </span>
                              <StatusChip status={p.status} />
                              {p.targetDate && (
                                <span className="text-[10px] text-stone-400 flex-shrink-0">
                                  {new Date(p.targetDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                </span>
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
          )}
        </section>
      )}

      {/* Population breakdown */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-3">Population by Zone</h2>
        <div className="rounded-xl border border-stone-100 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-100">
                <th className="text-left px-4 py-2.5 font-semibold text-stone-500">Zone</th>
                <th className="text-right px-3 py-2.5 font-semibold text-stone-500">Households</th>
                <th className="text-right px-3 py-2.5 font-semibold text-stone-500">Children 0–3</th>
                <th className="text-right px-3 py-2.5 font-semibold text-stone-500">Children 4–14</th>
                <th className="text-right px-3 py-2.5 font-semibold text-stone-500">Youth 15–21</th>
                <th className="text-right px-3 py-2.5 font-semibold text-stone-500">Elderly 60+</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {zones.map((z) => (
                <tr key={z.id} className="hover:bg-stone-50">
                  <td className="px-4 py-2.5 font-medium text-stone-700">{z.name}</td>
                  <td className="px-3 py-2.5 text-right text-stone-600">{z.population.totalHouseholds.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-stone-600">{z.population.children6m3yr.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-stone-600">{z.population.children4to14.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-stone-600">{z.population.youth15to21.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-stone-600">{z.population.elderly60plus.toLocaleString()}</td>
                </tr>
              ))}
              {zones.length > 1 && (
                <tr className="bg-stone-50 font-semibold">
                  <td className="px-4 py-2.5 text-stone-700">Total</td>
                  <td className="px-3 py-2.5 text-right text-stone-700">{zones.reduce((a, z) => a + z.population.totalHouseholds, 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-stone-700">{zones.reduce((a, z) => a + z.population.children6m3yr, 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-stone-700">{zones.reduce((a, z) => a + z.population.children4to14, 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-stone-700">{zones.reduce((a, z) => a + z.population.youth15to21, 0).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-stone-700">{zones.reduce((a, z) => a + z.population.elderly60plus, 0).toLocaleString()}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
