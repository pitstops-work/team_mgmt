"use client";

import { useMemo, useState } from "react";
import { Building2, Layers, MapPin, Home, Users, Target, AlertTriangle, ListFilter, X, ChevronDown, ChevronRight } from "lucide-react";
import type { GoalData, PitstopData } from "./lib";
import { pitstopSla } from "./lib";

export type GroupBy = "none" | "city" | "zone" | "cluster" | "owner" | "domain" | "sla";

export type FilterState = {
  city: string[];        // GeoRef ids
  zone: string[];
  cluster: string[];
  settlement: string[];
  domain: string[];      // raw domain strings
  owner: string[];       // user ids
  sla: ("red" | "amber" | "green")[];
};

export const EMPTY_FILTERS: FilterState = {
  city: [], zone: [], cluster: [], settlement: [], domain: [], owner: [], sla: [],
};

export function filterCount(f: FilterState): number {
  return f.city.length + f.zone.length + f.cluster.length + f.settlement.length +
    f.domain.length + f.owner.length + f.sla.length;
}

type OptionList = { id: string; name: string }[];

function uniqOptions(values: ({ id: string; name: string } | null)[]): OptionList {
  const seen = new Map<string, string>();
  for (const v of values) {
    if (v && !seen.has(v.id)) seen.set(v.id, v.name);
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

function buildOptions(goals: GoalData[]) {
  return {
    city:       uniqOptions(goals.map(g => g.needsCity)),
    zone:       uniqOptions(goals.map(g => g.needsZone)),
    cluster:    uniqOptions(goals.map(g => g.needsCluster)),
    settlement: uniqOptions(goals.map(g => g.needsSettlement)),
    domain:     [...new Set(goals.map(g => g.needsDomain).filter(Boolean) as string[])].sort()
                  .map(d => ({ id: d, name: d })),
    owner:      uniqOptions(goals.map(g => g.owner.name ? { id: g.owner.id, name: g.owner.name } : null)),
  };
}

const GROUP_OPTIONS: { value: GroupBy; label: string; icon: React.ReactNode }[] = [
  { value: "none",    label: "None",       icon: null },
  { value: "city",    label: "City",       icon: <Building2 className="w-3 h-3" /> },
  { value: "zone",    label: "Zone",       icon: <Layers className="w-3 h-3" /> },
  { value: "cluster", label: "Cluster",    icon: <MapPin className="w-3 h-3" /> },
  { value: "owner",   label: "Owner",      icon: <Users className="w-3 h-3" /> },
  { value: "domain",  label: "Domain",     icon: <Target className="w-3 h-3" /> },
  { value: "sla",     label: "SLA",        icon: <AlertTriangle className="w-3 h-3" /> },
];

const SLA_OPTIONS: { value: "red" | "amber" | "green"; label: string; cls: string }[] = [
  { value: "red",   label: "Overdue",      cls: "bg-red-500 text-white border-red-500" },
  { value: "amber", label: "Due 7d / late", cls: "bg-amber-500 text-white border-amber-500" },
  { value: "green", label: "On track / done", cls: "bg-emerald-500 text-white border-emerald-500" },
];

function Chip({
  active, onClick, children, activeClass,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  activeClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-[10px] rounded-md border transition-all ${
        active
          ? (activeClass ?? "bg-sky-500 text-white border-sky-500")
          : "bg-white text-stone-500 border-stone-200 hover:border-stone-300"
      }`}
    >
      {children}
    </button>
  );
}

function Dimension<T extends string>({
  label, icon, options, selected, onToggle,
}: {
  label: string;
  icon: React.ReactNode;
  options: { id: T; name: string }[];
  selected: T[];
  onToggle: (id: T) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="flex items-start gap-2">
      <div className="flex items-center gap-1 pt-1 min-w-[70px]">
        {icon}
        <span className="text-[10px] uppercase tracking-wide text-stone-400 font-medium">{label}</span>
      </div>
      <div className="flex flex-wrap gap-1 flex-1">
        {options.map(opt => (
          <Chip key={opt.id} active={selected.includes(opt.id)} onClick={() => onToggle(opt.id)}>
            {opt.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}

export default function FilterBar({
  goals,
  groupBy,
  onGroupByChange,
  filters,
  onFiltersChange,
}: {
  goals: GoalData[];
  groupBy: GroupBy;
  onGroupByChange: (g: GroupBy) => void;
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const options = useMemo(() => buildOptions(goals), [goals]);
  const count = filterCount(filters);

  const toggle = <K extends keyof FilterState>(dim: K, id: FilterState[K][number]) => {
    const cur = filters[dim] as string[];
    const next = cur.includes(id as string)
      ? cur.filter(x => x !== id)
      : [...cur, id as string];
    onFiltersChange({ ...filters, [dim]: next } as FilterState);
  };

  return (
    <div className="rounded-lg border border-stone-200 bg-white">
      {/* Top row: group-by + filter toggle */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-stone-100">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-stone-400 font-medium uppercase tracking-wide">Group</span>
          <div className="flex gap-1 flex-wrap">
            {GROUP_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => onGroupByChange(opt.value)}
                className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded-md border transition-all ${
                  groupBy === opt.value
                    ? "bg-stone-800 text-white border-stone-800"
                    : "bg-white text-stone-500 border-stone-200 hover:border-stone-300"
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {count > 0 && (
            <button
              onClick={() => onFiltersChange(EMPTY_FILTERS)}
              className="flex items-center gap-1 text-[10px] text-stone-400 hover:text-stone-700"
            >
              <X className="w-2.5 h-2.5" /> Clear ({count})
            </button>
          )}
          <button
            onClick={() => setExpanded(e => !e)}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded-md border transition-all ${
              expanded || count > 0
                ? "bg-stone-800 text-white border-stone-800"
                : "bg-white text-stone-500 border-stone-200 hover:border-stone-300"
            }`}
          >
            <ListFilter className="w-3 h-3" />
            Filters
            {expanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-3 py-3 space-y-3 bg-stone-50/30">
          {/* SLA — most useful for reviews, surface first */}
          <div className="flex items-start gap-2">
            <div className="flex items-center gap-1 pt-1 min-w-[70px]">
              <AlertTriangle className="w-3 h-3 text-stone-400" />
              <span className="text-[10px] uppercase tracking-wide text-stone-400 font-medium">SLA</span>
            </div>
            <div className="flex flex-wrap gap-1 flex-1">
              {SLA_OPTIONS.map(opt => (
                <Chip
                  key={opt.value}
                  active={filters.sla.includes(opt.value)}
                  activeClass={opt.cls}
                  onClick={() => toggle("sla", opt.value)}
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>

          <Dimension label="Domain"     icon={<Target    className="w-3 h-3 text-stone-400" />} options={options.domain}     selected={filters.domain}     onToggle={(id) => toggle("domain", id)} />
          <Dimension label="Owner"      icon={<Users     className="w-3 h-3 text-stone-400" />} options={options.owner}      selected={filters.owner}      onToggle={(id) => toggle("owner", id)} />
          <Dimension label="City"       icon={<Building2 className="w-3 h-3 text-stone-400" />} options={options.city}       selected={filters.city}       onToggle={(id) => toggle("city", id)} />
          <Dimension label="Zone"       icon={<Layers    className="w-3 h-3 text-stone-400" />} options={options.zone}       selected={filters.zone}       onToggle={(id) => toggle("zone", id)} />
          <Dimension label="Cluster"    icon={<MapPin    className="w-3 h-3 text-stone-400" />} options={options.cluster}    selected={filters.cluster}    onToggle={(id) => toggle("cluster", id)} />
          <Dimension label="Settlement" icon={<Home      className="w-3 h-3 text-stone-400" />} options={options.settlement} selected={filters.settlement} onToggle={(id) => toggle("settlement", id)} />
        </div>
      )}
    </div>
  );
}

// Apply filters to a list of (goal, pitstops) pairs. AND across dimensions,
// OR within a dimension. SLA filter is computed from pitstop targetDates.
export function applyFilters(
  items: { goal: GoalData; pitstops: PitstopData[] }[],
  filters: FilterState,
  today: Date,
): { goal: GoalData; pitstops: PitstopData[] }[] {
  const matchGoal = (g: GoalData) => {
    if (filters.city.length       && !filters.city.includes(g.needsCity?.id ?? "__none__")) return false;
    if (filters.zone.length       && !filters.zone.includes(g.needsZone?.id ?? "__none__")) return false;
    if (filters.cluster.length    && !filters.cluster.includes(g.needsCluster?.id ?? "__none__")) return false;
    if (filters.settlement.length && !filters.settlement.includes(g.needsSettlement?.id ?? "__none__")) return false;
    if (filters.domain.length     && !filters.domain.includes(g.needsDomain ?? "__none__")) return false;
    if (filters.owner.length      && !filters.owner.includes(g.owner.id)) return false;
    return true;
  };

  const out: { goal: GoalData; pitstops: PitstopData[] }[] = [];
  for (const item of items) {
    if (!matchGoal(item.goal)) continue;
    const ps = filters.sla.length === 0
      ? item.pitstops
      : item.pitstops.filter(p => filters.sla.includes(pitstopSla(p, today)));
    if (ps.length === 0) continue;
    out.push({ goal: item.goal, pitstops: ps });
  }
  return out;
}
