"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, Building2, Layers, MapPin, Users, Target, AlertTriangle, CalendarRange } from "lucide-react";
import type { GoalData, PitstopData } from "./lib";
import { goalsInRange, slaMix, pitstopSla } from "./lib";
import { GoalRow } from "./atoms";
import FilterBar, { applyFilters, type FilterState, type GroupBy } from "./FilterBar";
import { SlaBar } from "./tiles";

type GoalGroup = { key: string; label: string | null; items: { goal: GoalData; pitstops: PitstopData[] }[] };

function groupItems(
  items: { goal: GoalData; pitstops: PitstopData[] }[],
  groupBy: GroupBy,
  today: Date,
): GoalGroup[] {
  if (groupBy === "none") {
    return [{ key: "all", label: null, items }];
  }
  const groups = new Map<string, { label: string; items: typeof items }>();
  for (const item of items) {
    const g = item.goal;
    let key = "__none__";
    let label = "—";
    if (groupBy === "city")    { key = g.needsCity?.id    ?? "__none__"; label = g.needsCity?.name    ?? "No city"; }
    else if (groupBy === "zone")    { key = g.needsZone?.id    ?? "__none__"; label = g.needsZone?.name    ?? "No zone"; }
    else if (groupBy === "cluster") { key = g.needsCluster?.id ?? "__none__"; label = g.needsCluster?.name ?? "No cluster"; }
    else if (groupBy === "owner")   { key = g.owner.id;                        label = g.owner.name ?? "Unknown"; }
    else if (groupBy === "domain")  { key = g.needsDomain ?? "__none__";       label = g.needsDomain ?? "No domain"; }
    else if (groupBy === "sla") {
      // Bucket the goal by its worst pitstop SLA in this window.
      const worst = item.pitstops.reduce<"red"|"amber"|"green">((acc, p) => {
        const b = pitstopSla(p, today);
        if (acc === "red" || b === "red") return "red";
        if (acc === "amber" || b === "amber") return "amber";
        return "green";
      }, "green");
      key = worst;
      label = worst === "red" ? "Overdue" : worst === "amber" ? "Due 7d / late" : "On track / done";
    }
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key)!.items.push(item);
  }
  const SLA_ORDER = { red: 0, amber: 1, green: 2 } as Record<string, number>;
  return [...groups.entries()].map(([key, v]) => ({ key, label: v.label, items: v.items })).sort((a, b) => {
    if (groupBy === "sla") return (SLA_ORDER[a.key] ?? 99) - (SLA_ORDER[b.key] ?? 99);
    return (a.label ?? "").localeCompare(b.label ?? "");
  });
}

function GroupIcon({ groupBy }: { groupBy: GroupBy }) {
  const cls = "w-3 h-3 text-stone-300";
  if (groupBy === "city")    return <Building2 className={cls} />;
  if (groupBy === "zone")    return <Layers    className={cls} />;
  if (groupBy === "cluster") return <MapPin    className={cls} />;
  if (groupBy === "owner")   return <Users     className={cls} />;
  if (groupBy === "domain")  return <Target    className={cls} />;
  if (groupBy === "sla")     return <AlertTriangle className={cls} />;
  return null;
}

export default function QuarterListView({
  goals,
  today,
  start,
  end,
  title,
  subtitle,
  backHref,
  groupBy,
  onGroupByChange,
  filters,
  onFiltersChange,
}: {
  goals: GoalData[];
  today: Date;
  start: Date;
  end: Date;
  title: string;
  subtitle: string;
  backHref: string;
  groupBy: GroupBy;
  onGroupByChange: (g: GroupBy) => void;
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
}) {
  const items = useMemo(() => goalsInRange(goals, start, end), [goals, start, end]);
  const filtered = useMemo(() => applyFilters(items, filters, today), [items, filters, today]);
  const mix = useMemo(() => slaMix(filtered.flatMap(i => i.pitstops), today), [filtered, today]);
  const groups = useMemo(() => groupItems(filtered, groupBy, today), [filtered, groupBy, today]);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Link
          href={backHref}
          className="flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-700"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back
        </Link>
      </div>
      <div className="flex items-center gap-2 mb-1 mt-2">
        <CalendarRange className="w-5 h-5 text-stone-400" />
        <h1 className="text-lg font-semibold text-stone-900">{title}</h1>
      </div>
      <p className="text-xs text-stone-400 mb-4">{subtitle}</p>

      {/* SLA summary bar */}
      <div className="mb-4">
        <SlaBar mix={mix} height={6} />
        <div className="mt-1.5 flex items-center gap-3 text-[10px] text-stone-500 tabular-nums">
          <span>{filtered.length} goal{filtered.length === 1 ? "" : "s"}</span>
          <span className="text-stone-300">·</span>
          <span>{mix.total} pitstop{mix.total === 1 ? "" : "s"}</span>
          {mix.red > 0   && <span className="text-red-500">· {mix.red} overdue</span>}
          {mix.amber > 0 && <span className="text-amber-600">· {mix.amber} due 7d / late</span>}
          {mix.green > 0 && <span className="text-emerald-600">· {mix.green} on track</span>}
        </div>
      </div>

      {/* Filter + group-by */}
      <div className="mb-4">
        <FilterBar
          goals={goals}
          groupBy={groupBy}
          onGroupByChange={onGroupByChange}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-stone-200 rounded-xl">
          <CalendarRange className="w-7 h-7 text-stone-200 mx-auto mb-2" />
          <p className="text-sm text-stone-400">No goals match the current filters.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
          {groups.map((group, gi) => (
            <div key={group.key + gi}>
              {group.label !== null && (
                <div className="px-4 py-1.5 bg-stone-50/80 border-t border-b border-stone-100 flex items-center gap-1.5">
                  <GroupIcon groupBy={groupBy} />
                  <span className="text-[10px] font-semibold text-stone-600">{group.label}</span>
                  <span className="text-[10px] text-stone-400">· {group.items.length} goal{group.items.length === 1 ? "" : "s"}</span>
                </div>
              )}
              <div className="divide-y divide-stone-100">
                {group.items.map(({ goal, pitstops }) => (
                  <GoalRow key={goal.id} goal={goal} pitstops={pitstops} today={today} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
