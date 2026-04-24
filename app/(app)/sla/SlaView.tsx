"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Clock, Circle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SlaStatus = "within" | "late" | "overdue" | "ontrack";

export type SlaItem = {
  id: string;
  text: string;
  slaStatus: SlaStatus;
  daysOverdue: number;
  goal: { id: string; title: string };
  pitstop: { id: string; title: string; targetDate: string };
  person: { id: string; name: string | null; designation: string | null } | null;
  geo: {
    settlement: { id: string; name: string } | null;
    cluster:    { id: string; name: string } | null;
    zone:       { id: string; name: string } | null;
    city:       { id: string; name: string } | null;
  };
};

// ── Stat helpers ──────────────────────────────────────────────────────────────

type Stats = { total: number; within: number; late: number; overdue: number; ontrack: number };

function stats(items: SlaItem[]): Stats {
  let within = 0, late = 0, overdue = 0, ontrack = 0;
  for (const i of items) {
    if (i.slaStatus === "within")       within++;
    else if (i.slaStatus === "late")    late++;
    else if (i.slaStatus === "overdue") overdue++;
    else                                ontrack++;
  }
  return { total: items.length, within, late, overdue, ontrack };
}

function rate(s: Stats): number {
  const closed = s.within + s.late + s.overdue;
  return closed > 0 ? Math.round((s.within / closed) * 100) : 0;
}

function rateColor(pct: number) {
  if (pct >= 80) return "text-emerald-600";
  if (pct >= 50) return "text-amber-600";
  return "text-red-500";
}

function rateBg(pct: number) {
  if (pct >= 80) return "bg-emerald-400";
  if (pct >= 50) return "bg-amber-400";
  return "bg-red-400";
}

// ── Layout constants (must match between header and data rows) ────────────────

const COL = {
  total:   "w-10 text-right",
  stat:    "w-12 flex items-center gap-1",
  rate:    "w-24 flex items-center gap-1.5",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatTile({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 px-4 py-3.5">
      <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? "text-stone-800"}`}>{value}</p>
      {sub && <p className="text-[11px] text-stone-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function TableHeader({ nameLabel = "Name" }: { nameLabel?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-stone-200 bg-stone-50">
      <span className="flex-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wide">{nameLabel}</span>
      <div className="flex items-center gap-2 flex-shrink-0 text-[10px] font-semibold text-stone-400 uppercase tracking-wide">
        <span className={COL.total}>Total</span>
        <span className={COL.stat}><CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />SLA</span>
        <span className={COL.stat}><Clock className="w-3 h-3 text-amber-400 flex-shrink-0" />Late</span>
        <span className={COL.stat}><AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />Over</span>
        <span className={COL.stat}><Circle className="w-3 h-3 text-sky-300 flex-shrink-0" />Track</span>
        <span className={COL.rate}>Rate</span>
      </div>
    </div>
  );
}

function StatsRow({ s }: { s: Stats }) {
  const pct = rate(s);
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <span className={`text-[11px] text-stone-500 ${COL.total}`}>{s.total}</span>
      <span className={`text-[11px] text-emerald-600 font-medium ${COL.stat}`}>
        <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />{s.within}
      </span>
      <span className={`text-[11px] text-amber-600 ${COL.stat}`}>
        <Clock className="w-3 h-3 text-amber-400 flex-shrink-0" />{s.late}
      </span>
      <span className={`text-[11px] text-red-500 font-medium ${COL.stat}`}>
        <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />{s.overdue}
      </span>
      <span className={`text-[11px] text-stone-400 ${COL.stat}`}>
        <Circle className="w-3 h-3 text-sky-300 flex-shrink-0" />{s.ontrack}
      </span>
      <div className={COL.rate}>
        <div className="flex-1 bg-stone-100 rounded-full h-1.5 overflow-hidden">
          <div className={`h-full rounded-full ${rateBg(pct)}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`text-[11px] font-semibold w-8 text-right flex-shrink-0 ${rateColor(pct)}`}>{pct}%</span>
      </div>
    </div>
  );
}

// ── Drill-down list (shared by person and geo) ─────────────────────────────────

function DrillDownList({ items }: { items: SlaItem[] }) {
  const delayed = items.filter(i => i.slaStatus === "overdue" || i.slaStatus === "late");
  if (delayed.length === 0) return (
    <div className="px-4 py-2 text-[11px] text-stone-400 italic">No delayed items.</div>
  );

  // Group by goal → pitstop
  const byGoal = new Map<string, { goalTitle: string; byPitstop: Map<string, { pitstopTitle: string; items: SlaItem[] }> }>();
  for (const item of delayed) {
    if (!byGoal.has(item.goal.id)) {
      byGoal.set(item.goal.id, { goalTitle: item.goal.title, byPitstop: new Map() });
    }
    const g = byGoal.get(item.goal.id)!;
    if (!g.byPitstop.has(item.pitstop.id)) {
      g.byPitstop.set(item.pitstop.id, { pitstopTitle: item.pitstop.title, items: [] });
    }
    g.byPitstop.get(item.pitstop.id)!.items.push(item);
  }

  return (
    <div className="border-t border-stone-100 bg-stone-50/60">
      {Array.from(byGoal.values()).map(({ goalTitle, byPitstop }) => (
        <div key={goalTitle} className="px-4 pt-2 pb-1">
          <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide mb-1">{goalTitle}</p>
          {Array.from(byPitstop.values()).map(({ pitstopTitle, items: pItems }) => (
            <div key={pitstopTitle} className="mb-2 pl-2 border-l-2 border-stone-200">
              <p className="text-[11px] font-medium text-stone-700 mb-1">
                {pitstopTitle}
                <span className="ml-1.5 text-[10px] text-stone-400 font-normal">
                  target: {new Date(pItems[0].pitstop.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </p>
              <div className="space-y-0.5">
                {pItems.map(ci => (
                  <div key={ci.id} className="flex items-center gap-2 pl-2">
                    {ci.slaStatus === "overdue"
                      ? <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />
                      : <Clock className="w-3 h-3 text-amber-400 flex-shrink-0" />
                    }
                    <span className="text-[11px] text-stone-600 flex-1 truncate">{ci.text}</span>
                    {ci.daysOverdue > 0 && (
                      <span className={`text-[10px] font-semibold flex-shrink-0 ${ci.slaStatus === "overdue" ? "text-red-500" : "text-amber-600"}`}>
                        {ci.slaStatus === "overdue" ? `${ci.daysOverdue}d overdue` : `${ci.daysOverdue}d late`}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── By Person ─────────────────────────────────────────────────────────────────

const DESIG_COLOR: Record<string, string> = {
  Leader: "bg-amber-100 text-amber-700",
  PM:     "bg-violet-100 text-violet-700",
  ZL:     "bg-sky-100 text-sky-700",
  RP:     "bg-emerald-100 text-emerald-700",
  Other:  "bg-stone-100 text-stone-600",
};

function ByPerson({ items }: { items: SlaItem[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const byPerson = useMemo(() => {
    const map = new Map<string, { person: SlaItem["person"]; items: SlaItem[] }>();
    for (const item of items) {
      const key = item.person?.id ?? "__none__";
      if (!map.has(key)) map.set(key, { person: item.person, items: [] });
      map.get(key)!.items.push(item);
    }
    return Array.from(map.values())
      .map(({ person, items: pItems }) => ({ person, items: pItems, s: stats(pItems) }))
      .sort((a, b) => rate(a.s) - rate(b.s));
  }, [items]);

  if (byPerson.length === 0) return <p className="text-sm text-stone-400 py-6 px-1">No data.</p>;

  const toggle = (key: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <div className="rounded-lg border border-stone-200 overflow-hidden overflow-x-auto">
      <div className="min-w-[600px]">
        <TableHeader />
        <div className="divide-y divide-stone-100">
          {byPerson.map(({ person, items: pItems, s }) => {
            const key = person?.id ?? "__none__";
            const isOpen = expanded.has(key);
            const hasDelayed = pItems.some(i => i.slaStatus === "overdue" || i.slaStatus === "late");
            return (
              <div key={key}>
                <button
                  onClick={() => hasDelayed && toggle(key)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 bg-white text-left transition-colors ${hasDelayed ? "hover:bg-stone-50 cursor-pointer" : "cursor-default"}`}
                >
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    {hasDelayed
                      ? (isOpen ? <ChevronUp className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />)
                      : <span className="w-3.5 flex-shrink-0" />
                    }
                    <span className="text-sm text-stone-800 font-medium truncate">{person?.name ?? "Unassigned"}</span>
                    {person?.designation && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${DESIG_COLOR[person.designation] ?? "bg-stone-100 text-stone-600"}`}>
                        {person.designation}
                      </span>
                    )}
                  </div>
                  <StatsRow s={s} />
                </button>
                {isOpen && <DrillDownList items={pItems} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── By Geography ──────────────────────────────────────────────────────────────

type GeoNode = {
  id: string;
  name: string;
  level: "city" | "zone" | "cluster" | "settlement";
  items: SlaItem[];
  children: GeoNode[];
};

function buildTree(items: SlaItem[]): GeoNode[] {
  const cityMap = new Map<string, GeoNode>();

  for (const item of items) {
    const { city, zone, cluster, settlement } = item.geo;
    const cityId   = city?.id       ?? "__nocity__";
    const cityName = city?.name     ?? "No city";
    const zoneId   = zone?.id       ?? "__nozone__";
    const zoneName = zone?.name     ?? "No zone";
    const clustId  = cluster?.id    ?? "__nocluster__";
    const clustName= cluster?.name  ?? "No cluster";

    if (!cityMap.has(cityId)) {
      cityMap.set(cityId, { id: cityId, name: cityName, level: "city", items: [], children: [] });
    }
    const cityNode = cityMap.get(cityId)!;
    cityNode.items.push(item);

    let zoneNode = cityNode.children.find(n => n.id === zoneId);
    if (!zoneNode) {
      zoneNode = { id: zoneId, name: zoneName, level: "zone", items: [], children: [] };
      cityNode.children.push(zoneNode);
    }
    zoneNode.items.push(item);

    let clustNode = zoneNode.children.find(n => n.id === clustId);
    if (!clustNode) {
      clustNode = { id: clustId, name: clustName, level: "cluster", items: [], children: [] };
      zoneNode.children.push(clustNode);
    }
    clustNode.items.push(item);

    if (settlement) {
      let settlNode = clustNode.children.find(n => n.id === settlement.id);
      if (!settlNode) {
        settlNode = { id: settlement.id, name: settlement.name, level: "settlement", items: [], children: [] };
        clustNode.children.push(settlNode);
      }
      settlNode.items.push(item);
    }
  }

  return Array.from(cityMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

const LEVEL_INDENT: Record<string, string> = {
  city: "pl-3",
  zone: "pl-8",
  cluster: "pl-13",
  settlement: "pl-18",
};
const LEVEL_COLOR: Record<string, string> = {
  city:       "bg-stone-100 text-stone-600",
  zone:       "bg-sky-50 text-sky-700",
  cluster:    "bg-violet-50 text-violet-700",
  settlement: "bg-emerald-50 text-emerald-700",
};

function GeoTree({ nodes, depth = 0 }: { nodes: GeoNode[]; depth?: number }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(nodes.map(n => n.id)));
  const [drillOpen, setDrillOpen] = useState<Set<string>>(new Set());

  return (
    <div>
      {nodes.map(node => {
        const s = stats(node.items);
        const isOpen = open.has(node.id);
        const isDrillOpen = drillOpen.has(node.id);
        const hasChildren = node.children.length > 0;
        const hasDelayed = node.items.some(i => i.slaStatus === "overdue" || i.slaStatus === "late");
        const indent = LEVEL_INDENT[node.level] ?? "pl-3";
        const isLeaf = !hasChildren;

        return (
          <div key={node.id}>
            <div
              className={`flex items-center gap-2 py-2.5 pr-3 border-b border-stone-100 ${indent} ${node.level === "city" ? "bg-stone-50" : "bg-white"}`}
            >
              <div className="flex-1 min-w-0 flex items-center gap-2">
                {hasChildren ? (
                  <button
                    onClick={() => setOpen(prev => {
                      const next = new Set(prev);
                      if (next.has(node.id)) next.delete(node.id);
                      else next.add(node.id);
                      return next;
                    })}
                    className="flex-shrink-0"
                  >
                    {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                  </button>
                ) : hasDelayed ? (
                  <button
                    onClick={() => setDrillOpen(prev => {
                      const next = new Set(prev);
                      if (next.has(node.id)) next.delete(node.id);
                      else next.add(node.id);
                      return next;
                    })}
                    className="flex-shrink-0"
                  >
                    {isDrillOpen ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                  </button>
                ) : (
                  <span className="w-3.5 flex-shrink-0" />
                )}
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${LEVEL_COLOR[node.level]}`}>
                  {node.level}
                </span>
                <span className={`text-sm truncate ${node.level === "city" ? "font-semibold text-stone-800" : "text-stone-700"}`}>
                  {node.name}
                </span>
              </div>
              <StatsRow s={s} />
            </div>
            {isLeaf && isDrillOpen && <DrillDownList items={node.items} />}
            {isOpen && hasChildren && (
              <GeoTree nodes={node.children} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ByGeography({ items }: { items: SlaItem[] }) {
  const tree = useMemo(() => buildTree(items), [items]);
  if (tree.length === 0) return <p className="text-sm text-stone-400 py-6 px-1">No geography-scoped data.</p>;

  return (
    <div className="rounded-lg border border-stone-200 overflow-hidden overflow-x-auto">
      <div className="min-w-[600px]">
        <TableHeader nameLabel="Location" />
        <GeoTree nodes={tree} />
      </div>
    </div>
  );
}

// ── Main SlaView ──────────────────────────────────────────────────────────────

export default function SlaView({ items, showCityFilter = false }: { items: SlaItem[]; showCityFilter?: boolean }) {
  const [cityFilter, setCityFilter] = useState<string>("All");
  const [tab, setTab] = useState<"person" | "geo">("person");

  const cities = useMemo(() => {
    const cs = new Set(items.map(i => i.geo.city?.name).filter(Boolean) as string[]);
    return Array.from(cs).sort();
  }, [items]);

  const filtered = useMemo(() => {
    if (!showCityFilter || cityFilter === "All") return items;
    return items.filter(i => i.geo.city?.name === cityFilter);
  }, [items, cityFilter, showCityFilter]);

  const s = stats(filtered);
  const pct = rate(s);
  const closed = s.within + s.late + s.overdue;

  return (
    <div className="space-y-6">

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Total with SLA" value={s.total} sub="checklist items" />
        <StatTile
          label="Within SLA"
          value={`${pct}%`}
          sub={`${s.within} of ${closed} closed`}
          accent={pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-500"}
        />
        <StatTile label="Overdue" value={s.overdue} sub="past deadline, incomplete" accent={s.overdue > 0 ? "text-red-500" : undefined} />
        <StatTile label="On Track" value={s.ontrack} sub="SLA not yet expired" accent="text-sky-600" />
      </div>

      {/* Breakdown strip */}
      {s.total > 0 && (
        <div className="flex gap-0.5 rounded-lg overflow-hidden h-2">
          {s.within  > 0 && <div className="bg-emerald-400 transition-all" style={{ flex: s.within }} title={`Within SLA: ${s.within}`} />}
          {s.late    > 0 && <div className="bg-amber-400  transition-all" style={{ flex: s.late }}   title={`Done late: ${s.late}`} />}
          {s.overdue > 0 && <div className="bg-red-400    transition-all" style={{ flex: s.overdue }} title={`Overdue: ${s.overdue}`} />}
          {s.ontrack > 0 && <div className="bg-sky-200    transition-all" style={{ flex: s.ontrack }} title={`On track: ${s.ontrack}`} />}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-[11px] text-stone-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />Within SLA</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400  inline-block" />Done late</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400    inline-block" />Overdue (incomplete)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-200   inline-block" />On track</span>
      </div>

      {/* City filter — super admin only */}
      {showCityFilter && cities.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {["All", ...cities].map(c => (
            <button
              key={c}
              onClick={() => setCityFilter(c)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                cityFilter === c
                  ? "bg-sky-500 text-white border-sky-500"
                  : "border-stone-200 text-stone-600 hover:border-sky-300 hover:text-sky-600"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-stone-200 gap-0">
        {([["person", "By Person"], ["geo", "By Geography"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === key ? "border-sky-500 text-sky-700" : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "person" && <ByPerson items={filtered} />}
      {tab === "geo"    && <ByGeography items={filtered} />}
    </div>
  );
}
