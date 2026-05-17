"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Activity, MapPin, Target, ChevronRight, Layers } from "lucide-react";

type JourneyListItem = {
  id: string;
  key: string;
  label: string;
  primaryDomain: string | null;
  settlementId: string;
  settlementName: string | null;
  clusterId: string | null;
  status: string;
  phaseCount: number;
  outcomeCount: number;
  activePhaseCount: number;
  donePhaseCount: number;
  latestOutcomeAt: string | null;
  updatedAt: string;
};

export default function ProgrammesPage() {
  const [items, setItems] = useState<JourneyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDomain, setFilterDomain] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("Active");
  const [filterText, setFilterText] = useState("");

  useEffect(() => {
    fetch("/api/programmes")
      .then(r => r.ok ? r.json() : [])
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  const domains = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => i.primaryDomain && set.add(i.primaryDomain));
    return Array.from(set).sort();
  }, [items]);

  const filtered = items.filter(i => {
    if (filterDomain && i.primaryDomain !== filterDomain) return false;
    if (filterStatus && i.status !== filterStatus) return false;
    if (filterText) {
      const t = filterText.toLowerCase();
      if (!i.label.toLowerCase().includes(t) && !(i.settlementName ?? "").toLowerCase().includes(t)) return false;
    }
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center gap-3 mb-2">
        <Layers className="w-5 h-5 text-stone-400" />
        <h1 className="text-xl font-semibold text-stone-900">Programme Journeys</h1>
      </div>
      <p className="text-xs text-stone-500 mb-5">
        Threads connecting multiple goals under a shared outcome objective. Auto-spawned when a goal with a settlement &amp; domain is created.
      </p>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          className="px-2.5 py-1.5 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white flex-1 min-w-[180px]"
          placeholder="Search by label or settlement…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
        <select
          className="px-2.5 py-1.5 text-xs border border-stone-200 rounded-lg bg-white"
          value={filterDomain}
          onChange={e => setFilterDomain(e.target.value)}
        >
          <option value="">All domains</option>
          {domains.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          className="px-2.5 py-1.5 text-xs border border-stone-200 rounded-lg bg-white"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="Active">Active</option>
          <option value="Paused">Paused</option>
          <option value="Closed">Closed</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-stone-400 text-center py-12">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-stone-400 text-center py-12 italic">
          {items.length === 0 ? "No journeys yet. Create a goal with a settlement & domain to seed one." : "No journeys match the filters."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map(j => (
            <Link
              key={j.id}
              href={`/programmes/${j.id}`}
              className="block bg-white border border-stone-200 rounded-xl px-4 py-3 hover:border-stone-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-stone-800">{j.label}</span>
                    {j.status !== "Active" && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500">
                        {j.status}
                      </span>
                    )}
                    {j.primaryDomain && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-50 text-stone-500">
                        {j.primaryDomain}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-stone-500 flex-wrap">
                    {j.settlementName && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {j.settlementName}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Activity className="w-3 h-3" /> {j.donePhaseCount}/{j.phaseCount} phase{j.phaseCount === 1 ? "" : "s"} done
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Target className="w-3 h-3" /> {j.outcomeCount} outcome{j.outcomeCount === 1 ? "" : "s"}
                    </span>
                    {j.latestOutcomeAt && (
                      <span className="text-stone-400">last captured {new Date(j.latestOutcomeAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-300 shrink-0 mt-1" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
