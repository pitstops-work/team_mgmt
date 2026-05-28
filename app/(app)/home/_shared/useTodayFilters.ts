"use client";

import { useCallback, useMemo, useState } from "react";
import type { Activity, ActivityGoal } from "../_lib/types";
import { fmtDomain } from "../_lib/helpers";

/**
 * State + derived data for the RP/ZL Today cockpit filter bar.
 *
 * Filters: zone / cluster / settlement (cascading by computed options),
 * goal (multi), type (multi). Grouping replaces the time-first sections when
 * `groupBy !== "none"`.
 *
 * Cascading is opportunistic: the option lists for cluster/settlement are
 * derived from the activities that survive *other* filters, so picking a
 * zone naturally narrows the cluster picker without needing zone→cluster
 * relations on the data type. Pickers that go empty still render so the
 * user can clear them.
 */

export type GroupBy =
  | "none"
  | "cluster"
  | "settlement"
  | "goal"
  | "domain"
  | "type"
  | "sla";

export type TodayFilters = {
  zoneId: string;
  clusterId: string;
  settlementId: string;
  goalIds: string[];
  types: string[];
};

const EMPTY_FILTERS: TodayFilters = {
  zoneId: "", clusterId: "", settlementId: "",
  goalIds: [], types: [],
};

type Option = { value: string; label: string };

function unique<T extends { id: string; name: string } | null | undefined>(items: T[]): Option[] {
  const seen = new Map<string, string>();
  for (const it of items) {
    if (!it) continue;
    if (!seen.has(it.id)) seen.set(it.id, it.name);
  }
  return [...seen.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function useTodayFilters(allActivities: Activity[]) {
  const [filters, setFilters] = useState<TodayFilters>(EMPTY_FILTERS);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  const setFilter = useCallback(<K extends keyof TodayFilters>(key: K, value: TodayFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const activeCount =
    (filters.zoneId       ? 1 : 0) +
    (filters.clusterId    ? 1 : 0) +
    (filters.settlementId ? 1 : 0) +
    (filters.goalIds.length > 0 ? 1 : 0) +
    (filters.types.length   > 0 ? 1 : 0);

  // Predicate factory — accepts "ignore" flags so option lists can compute
  // counts without trapping themselves in their own filter.
  const matches = useCallback((a: Activity, ignore: Partial<Record<keyof TodayFilters, true>> = {}) => {
    const goal = a.pitstops?.[0]?.pitstop.goal;
    if (!ignore.zoneId       && filters.zoneId       && goal?.needsZone?.id       !== filters.zoneId)       return false;
    if (!ignore.clusterId    && filters.clusterId    && goal?.needsCluster?.id    !== filters.clusterId)    return false;
    if (!ignore.settlementId && filters.settlementId && goal?.needsSettlement?.id !== filters.settlementId) return false;
    if (!ignore.goalIds && filters.goalIds.length > 0) {
      if (!goal || !filters.goalIds.includes(goal.id)) return false;
    }
    if (!ignore.types && filters.types.length > 0) {
      if (!filters.types.includes(a.type)) return false;
    }
    return true;
  }, [filters]);

  // Option universes — narrowed by *other* filters (cascading).
  const options = useMemo(() => {
    const goalsOf = (acts: Activity[]): ActivityGoal[] =>
      acts.map(a => a.pitstops?.[0]?.pitstop.goal).filter((g): g is ActivityGoal => g != null);
    const zoneActs       = allActivities.filter(a => matches(a, { zoneId: true }));
    const clusterActs    = allActivities.filter(a => matches(a, { clusterId: true }));
    const settlementActs = allActivities.filter(a => matches(a, { settlementId: true }));
    const goalActs       = allActivities.filter(a => matches(a, { goalIds: true }));
    const typeActs       = allActivities.filter(a => matches(a, { types: true }));

    return {
      zones:       unique(goalsOf(zoneActs).map(g => g.needsZone)),
      clusters:    unique(goalsOf(clusterActs).map(g => g.needsCluster)),
      settlements: unique(goalsOf(settlementActs).map(g => g.needsSettlement)),
      goals:       unique(goalsOf(goalActs).map(g => ({ id: g.id, name: g.title }))),
      types: Array.from(new Set(typeActs.map(a => a.type)))
        .filter(Boolean)
        .sort()
        .map(t => ({ value: t, label: t })),
    };
  }, [allActivities, matches]);

  // Group-key derivation.
  const groupKey = useCallback((a: Activity, nowMs: number): { key: string; label: string } => {
    const goal = a.pitstops?.[0]?.pitstop.goal;
    switch (groupBy) {
      case "cluster":    return { key: goal?.needsCluster?.id    ?? "_none", label: goal?.needsCluster?.name    ?? "No cluster" };
      case "settlement": return { key: goal?.needsSettlement?.id ?? "_none", label: goal?.needsSettlement?.name ?? "No settlement" };
      case "goal":       return { key: goal?.id                  ?? "_none", label: goal?.title                 ?? "No goal" };
      case "domain": {
        const d = goal?.needsDomain;
        return { key: d ?? "_none", label: d ? fmtDomain(d) : "No domain" };
      }
      case "type":       return { key: a.type ?? "_none", label: a.type ?? "Untyped" };
      case "sla": {
        const t = new Date(a.scheduledAt).getTime();
        const dayMs = 86_400_000;
        if (t < nowMs - dayMs) return { key: "0_overdue", label: "Overdue" };
        if (t < nowMs + dayMs) return { key: "1_today",   label: "Today" };
        return { key: "2_week", label: "This week" };
      }
      default: return { key: "_all", label: "" };
    }
  }, [groupBy]);

  return {
    filters, setFilter, clearFilters, activeCount,
    groupBy, setGroupBy,
    matches: (a: Activity) => matches(a),
    options,
    groupKey,
  };
}
