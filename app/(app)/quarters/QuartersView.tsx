"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarRange, ChevronDown, ChevronRight, AlertTriangle,
  CheckCircle2, Calendar, Users, Layers, Building2, MapPin,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActivityData = {
  id: string; title: string; status: string; scheduledAt: string; type: string;
};
type ChecklistItemData = {
  id: string; text: string; status: string; completionType: string; order: number;
  activities: ActivityData[];
};
type PitstopData = {
  id: string; title: string; status: string;
  targetDate: string | null; startDate: string | null; progressTag: string | null;
  checklistTotal: number; checklistDone: number;
  activityCount: number; activityDoneCount: number;
  checklistItems: ChecklistItemData[];
};
type GeoRef = { id: string; name: string };
type GoalData = {
  id: string; title: string; status: string; targetDate: string | null;
  needsDomain: string | null;
  owner: { id: string; name: string | null };
  needsCity: GeoRef | null; needsZone: GeoRef | null; needsCluster: GeoRef | null;
  pitstops: PitstopData[];
};

// ── Indian FY quarter helpers ─────────────────────────────────────────────────

function fyQuarter(date: Date): { fyYear: number; q: number } {
  const m = date.getMonth();
  if (m >= 3 && m <= 5) return { fyYear: date.getFullYear(), q: 1 };
  if (m >= 6 && m <= 8) return { fyYear: date.getFullYear(), q: 2 };
  if (m >= 9)           return { fyYear: date.getFullYear(), q: 3 };
  return { fyYear: date.getFullYear() - 1, q: 4 };
}
function quarterBounds(fyYear: number, q: number): { start: Date; end: Date } {
  if (q === 1) return { start: new Date(fyYear, 3, 1),     end: new Date(fyYear, 5, 30, 23, 59, 59) };
  if (q === 2) return { start: new Date(fyYear, 6, 1),     end: new Date(fyYear, 8, 30, 23, 59, 59) };
  if (q === 3) return { start: new Date(fyYear, 9, 1),     end: new Date(fyYear, 11, 31, 23, 59, 59) };
  return       { start: new Date(fyYear + 1, 0, 1),        end: new Date(fyYear + 1, 2, 31, 23, 59, 59) };
}
const Q_LABELS = ["Apr–Jun", "Jul–Sep", "Oct–Dec", "Jan–Mar"];
function qKey(fyYear: number, q: number)     { return `${fyYear}-${q}`; }
function qSortKey(fyYear: number, q: number) { return q === 4 ? (fyYear + 1) * 10 : fyYear * 10 + q; }

const PHASE_COLORS: Record<string, string> = {
  Planning:    "bg-sky-50 text-sky-600 border-sky-100",
  Mobilisation:"bg-violet-50 text-violet-600 border-violet-100",
  Setup:       "bg-amber-50 text-amber-600 border-amber-100",
  Capacity:    "bg-orange-50 text-orange-600 border-orange-100",
  Engagement:  "bg-emerald-50 text-emerald-600 border-emerald-100",
  Delivery:    "bg-teal-50 text-teal-600 border-teal-100",
  Monitoring:  "bg-stone-50 text-stone-600 border-stone-100",
};

type GroupBy = "none" | "city" | "zone" | "cluster" | "user";

// ── Activity row ──────────────────────────────────────────────────────────────

function ActivityRow({ a }: { a: ActivityData }) {
  const isDone = a.status === "Done";
  const isCancelled = a.status === "Cancelled";
  return (
    <div className={`flex items-center gap-2 py-0.5 pl-2 text-[9px] ${isCancelled ? "opacity-40" : ""}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        isDone ? "bg-emerald-400" : a.status === "Flagged" ? "bg-red-400" : "bg-stone-300"
      }`} />
      <span className={`flex-1 truncate ${isDone ? "text-stone-400 line-through" : "text-stone-600"}`}>{a.title}</span>
      <span className="text-stone-300 flex-shrink-0">{a.type}</span>
      <span className={`flex-shrink-0 tabular-nums ${isDone ? "text-emerald-500" : "text-stone-400"}`}>
        {new Date(a.scheduledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
      </span>
    </div>
  );
}

// ── Checklist row (expandable to activities) ──────────────────────────────────

function ChecklistRow({ item }: { item: ChecklistItemData }) {
  const [open, setOpen] = useState(false);
  const isDone = item.status === "Done";
  const hasActivities = item.activities.length > 0;
  const actDone = item.activities.filter(a => a.status === "Done").length;

  return (
    <div>
      <div
        className={`flex items-start gap-1.5 py-1 px-1 rounded text-[10px] ${hasActivities ? "cursor-pointer hover:bg-stone-50" : ""}`}
        onClick={hasActivities ? () => setOpen(o => !o) : undefined}
      >
        {hasActivities
          ? (open ? <ChevronDown className="w-3 h-3 text-stone-300 mt-0.5 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-stone-300 mt-0.5 flex-shrink-0" />)
          : <span className="w-3 flex-shrink-0" />
        }
        <span className={`w-2 h-2 mt-0.5 rounded-sm flex-shrink-0 border ${
          isDone ? "bg-emerald-400 border-emerald-400" : item.status === "InProgress" ? "border-sky-400 bg-sky-50" : "border-stone-300"
        }`} />
        <span className={`flex-1 leading-snug ${isDone ? "line-through text-stone-400" : "text-stone-600"}`}>{item.text}</span>
        {item.completionType !== "Activity" && (
          <span className="text-[9px] text-violet-400 flex-shrink-0 ml-1">{item.completionType}</span>
        )}
        {hasActivities && (
          <span className="text-[9px] text-stone-400 flex-shrink-0 ml-1">{actDone}/{item.activities.length}</span>
        )}
      </div>
      {open && hasActivities && (
        <div className="ml-7 mt-0.5 mb-1 border-l border-stone-100 pl-2 space-y-0.5">
          {item.activities.map(a => <ActivityRow key={a.id} a={a} />)}
        </div>
      )}
    </div>
  );
}

// ── Pitstop card (expandable to checklist → activities) ───────────────────────

function PitstopCard({ p, today, goalId }: { p: PitstopData; today: Date; goalId: string }) {
  const [open, setOpen] = useState(false);
  const isDone = p.status === "Done";
  const isOverdue = !isDone && !!p.targetDate && new Date(p.targetDate) < today;
  const clPct = p.checklistTotal > 0 ? Math.round((p.checklistDone / p.checklistTotal) * 100) : null;

  return (
    <div className={`rounded-lg border ${isDone ? "border-emerald-100 bg-emerald-50/40" : isOverdue ? "border-red-100 bg-red-50/30" : "border-stone-100 bg-stone-50/40"}`}>
      <button
        className="w-full flex items-start gap-2 px-2.5 py-2 text-left hover:bg-black/[.02] rounded-lg transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        {p.checklistItems.length > 0
          ? (open ? <ChevronDown className="w-3.5 h-3.5 text-stone-300 flex-shrink-0 mt-0.5" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-300 flex-shrink-0 mt-0.5" />)
          : <span className="w-3.5 flex-shrink-0" />
        }
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${isDone ? "bg-emerald-400" : isOverdue ? "bg-red-400" : "bg-stone-300"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[11px] font-medium flex-1 truncate ${isDone ? "text-stone-400 line-through" : "text-stone-700"}`}>{p.title}</span>
            {p.progressTag && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded border flex-shrink-0 ${PHASE_COLORS[p.progressTag] ?? "bg-stone-50 text-stone-400 border-stone-100"}`}>
                {p.progressTag}
              </span>
            )}
            {p.targetDate && (
              <span className={`text-[9px] flex-shrink-0 ${isOverdue ? "text-red-500 font-semibold" : "text-stone-400"}`}>
                {new Date(p.targetDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </span>
            )}
          </div>
          {(clPct !== null || p.activityCount > 0) && (
            <div className="flex items-center gap-2 mt-1">
              {clPct !== null && (
                <>
                  <div className="flex-1 h-1 bg-white rounded-full overflow-hidden border border-stone-100">
                    <div className="h-full bg-sky-400 rounded-full transition-all" style={{ width: `${clPct}%` }} />
                  </div>
                  <span className="text-[9px] text-stone-400 tabular-nums">{p.checklistDone}/{p.checklistTotal}</span>
                </>
              )}
              {p.activityCount > 0 && (
                <span className="text-[9px] text-violet-400 flex-shrink-0">{p.activityDoneCount}/{p.activityCount} act.</span>
              )}
            </div>
          )}
        </div>
      </button>

      {open && p.checklistItems.length > 0 && (
        <div className="px-2.5 pb-2.5 pt-0.5 border-t border-stone-100/60 space-y-0.5 ml-6">
          {p.checklistItems.map(ci => <ChecklistRow key={ci.id} item={ci} />)}
        </div>
      )}
    </div>
  );
}

// ── Goal row (expandable to pitstops → checklist → activities) ────────────────

function GoalRow({ goal, pitstops, today }: { goal: GoalData; pitstops: PitstopData[]; today: Date }) {
  const [open, setOpen] = useState(false);
  const ptDone    = pitstops.filter(p => p.status === "Done").length;
  const ptOverdue = pitstops.filter(p => p.status !== "Done" && p.targetDate && new Date(p.targetDate) < today).length;

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-2.5 flex items-center gap-2.5 hover:bg-stone-50 transition-colors text-left group"
      >
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-stone-300 flex-shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-stone-300 flex-shrink-0" />}
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          goal.status === "Complete" ? "bg-emerald-400" : goal.status === "Active" ? "bg-sky-400" : "bg-amber-400"
        }`} />
        <Link
          href={`/goals/${goal.id}`}
          onClick={e => e.stopPropagation()}
          className="flex-1 text-xs font-medium text-stone-700 hover:text-sky-600 transition-colors truncate"
        >
          {goal.title}
        </Link>
        {goal.needsDomain && (
          <span className="text-[9px] text-stone-400 flex-shrink-0">{goal.needsDomain}</span>
        )}
        {ptOverdue > 0 && (
          <span className="text-[10px] text-red-500 flex-shrink-0 flex items-center gap-0.5 font-medium">
            <AlertTriangle className="w-2.5 h-2.5" />{ptOverdue}
          </span>
        )}
        {ptDone === pitstops.length && pitstops.length > 0 && (
          <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
        )}
        <span className="text-[10px] text-stone-400 flex-shrink-0 tabular-nums">{ptDone}/{pitstops.length}</span>
      </button>

      {open && (
        <div className="px-4 pb-3 pl-10 space-y-1.5">
          {pitstops.length === 0
            ? <p className="text-[10px] text-stone-300">No pitstops this quarter.</p>
            : pitstops.map(p => <PitstopCard key={p.id} p={p} today={today} goalId={goal.id} />)
          }
        </div>
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function QuartersView({ goals }: { goals: GoalData[] }) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const currentQ = useMemo(() => fyQuarter(today), [today]);

  const [groupBy,       setGroupBy]       = useState<GroupBy>("none");
  const [filterDomains, setFilterDomains] = useState<string[]>([]);

  // All unique domains across all goals
  const allDomains = useMemo(() =>
    [...new Set(goals.map(g => g.needsDomain).filter(Boolean) as string[])].sort(),
    [goals]
  );

  // Apply domain filter
  const filteredGoals = useMemo(() =>
    filterDomains.length === 0
      ? goals
      : goals.filter(g => filterDomains.includes(g.needsDomain ?? "")),
    [goals, filterDomains]
  );

  // Build quarter map from pitstop targetDates
  const quarterMap = useMemo(() => {
    const map = new Map<string, {
      fyYear: number; q: number;
      goalsMap: Map<string, { goal: GoalData; pitstops: PitstopData[] }>;
    }>();
    // Always include current quarter
    map.set(qKey(currentQ.fyYear, currentQ.q), { fyYear: currentQ.fyYear, q: currentQ.q, goalsMap: new Map() });

    for (const goal of filteredGoals) {
      for (const pitstop of goal.pitstops) {
        if (!pitstop.targetDate) continue;
        const { fyYear, q } = fyQuarter(new Date(pitstop.targetDate));
        const key = qKey(fyYear, q);
        if (!map.has(key)) map.set(key, { fyYear, q, goalsMap: new Map() });
        const qData = map.get(key)!;
        if (!qData.goalsMap.has(goal.id)) qData.goalsMap.set(goal.id, { goal, pitstops: [] });
        qData.goalsMap.get(goal.id)!.pitstops.push(pitstop);
      }
    }
    return map;
  }, [filteredGoals, currentQ.fyYear, currentQ.q]);

  const quarters = useMemo(() =>
    [...quarterMap.values()].sort((a, b) => qSortKey(b.fyYear, b.q) - qSortKey(a.fyYear, a.q)),
    [quarterMap]
  );

  // Group goal list within a quarter
  function groupGoals(goalList: { goal: GoalData; pitstops: PitstopData[] }[]) {
    if (groupBy === "none") return [{ key: "all", label: null as string | null, items: goalList }];
    const groups = new Map<string, { label: string; items: typeof goalList }>();
    for (const item of goalList) {
      const g = item.goal;
      let key: string, label: string;
      if      (groupBy === "city")    { key = g.needsCity?.id    ?? "none"; label = g.needsCity?.name    ?? "No city"; }
      else if (groupBy === "zone")    { key = g.needsZone?.id    ?? "none"; label = g.needsZone?.name    ?? "No zone"; }
      else if (groupBy === "cluster") { key = g.needsCluster?.id ?? "none"; label = g.needsCluster?.name ?? "No cluster"; }
      else                            { key = g.owner.id;                   label = g.owner.name ?? "Unknown"; }
      if (!groups.has(key)) groups.set(key, { label, items: [] });
      groups.get(key)!.items.push(item);
    }
    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  const GROUP_OPTIONS: { value: GroupBy; label: string; icon: React.ReactNode }[] = [
    { value: "none",    label: "All goals", icon: <CalendarRange className="w-3 h-3" /> },
    { value: "city",    label: "City",      icon: <Building2 className="w-3 h-3" /> },
    { value: "zone",    label: "Zone",      icon: <Layers className="w-3 h-3" /> },
    { value: "cluster", label: "Cluster",   icon: <MapPin className="w-3 h-3" /> },
    { value: "user",    label: "User",      icon: <Users className="w-3 h-3" /> },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <CalendarRange className="w-5 h-5 text-stone-400" />
        <h1 className="text-lg font-semibold text-stone-900">Quarterly Planning</h1>
        <span className="text-xs text-stone-400 ml-1">· Indian FY (Apr–Mar)</span>
      </div>

      {/* Filter + Group-by bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6 pb-5 border-b border-stone-100">
        {/* Group by */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-stone-400 font-medium uppercase tracking-wide">Group</span>
          <div className="flex gap-1">
            {GROUP_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setGroupBy(opt.value)}
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

        {/* Domain filter */}
        {allDomains.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-stone-400 font-medium uppercase tracking-wide">Domain</span>
            <div className="flex flex-wrap gap-1">
              {allDomains.map(d => {
                const active = filterDomains.includes(d);
                return (
                  <button
                    key={d}
                    onClick={() => setFilterDomains(prev => active ? prev.filter(x => x !== d) : [...prev, d])}
                    className={`px-2 py-1 text-[10px] rounded-md border transition-all ${
                      active
                        ? "bg-sky-500 text-white border-sky-500"
                        : "bg-white text-stone-500 border-stone-200 hover:border-sky-300"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
              {filterDomains.length > 0 && (
                <button onClick={() => setFilterDomains([])} className="text-[10px] text-stone-400 hover:text-stone-600 underline px-1">
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quarters */}
      <div className="space-y-5">
        {quarters.map(({ fyYear, q, goalsMap }) => {
          const isCurrent = fyYear === currentQ.fyYear && q === currentQ.q;
          const isPast    = qSortKey(fyYear, q) < qSortKey(currentQ.fyYear, currentQ.q);
          const { start, end } = quarterBounds(fyYear, q);
          const goalList = [...goalsMap.values()];
          const groups = groupGoals(goalList);

          let totalPitstops = 0, donePitstops = 0, overduePitstops = 0, totalAct = 0, doneAct = 0;
          for (const { pitstops } of goalList) {
            for (const p of pitstops) {
              totalPitstops++;
              if (p.status === "Done") donePitstops++;
              else if (p.targetDate && new Date(p.targetDate) < today) overduePitstops++;
              totalAct += p.activityCount;
              doneAct  += p.activityDoneCount;
            }
          }
          const donePct = totalPitstops > 0 ? Math.round((donePitstops / totalPitstops) * 100) : 0;

          return (
            <div key={qKey(fyYear, q)} className={`rounded-xl border overflow-hidden ${
              isCurrent ? "border-sky-300 shadow-sm" : isPast ? "border-stone-100" : "border-stone-200"
            }`}>
              {/* Quarter header */}
              <div className={`px-4 py-3 ${isCurrent ? "bg-sky-50" : isPast ? "bg-stone-50/60" : "bg-stone-50"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-bold ${isCurrent ? "text-sky-800" : isPast ? "text-stone-400" : "text-stone-800"}`}>
                        Q{q} FY{fyYear}–{String(fyYear + 1).slice(2)}
                      </span>
                      <span className={`text-xs ${isPast ? "text-stone-300" : "text-stone-400"}`}>{Q_LABELS[q - 1]}</span>
                      {isCurrent && <span className="text-[10px] font-semibold bg-sky-500 text-white px-1.5 py-0.5 rounded-full">Current</span>}
                      {isPast && goalList.length > 0 && <span className="text-[10px] text-stone-300">Past</span>}
                    </div>
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      {start.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      {" – "}
                      {end.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] flex-shrink-0">
                    <span className={isPast ? "text-stone-400" : "text-stone-600"}>{goalList.length} goal{goalList.length !== 1 ? "s" : ""}</span>
                    {totalPitstops > 0 && (
                      <span className={overduePitstops > 0 ? "text-red-500 font-semibold" : isPast ? "text-stone-400" : "text-stone-600"}>
                        {overduePitstops > 0 && <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />}
                        {donePitstops}/{totalPitstops} pitstops
                      </span>
                    )}
                    {totalAct > 0 && (
                      <span className={isPast ? "text-stone-400" : "text-violet-500"}>{doneAct}/{totalAct} act.</span>
                    )}
                  </div>
                </div>
                {totalPitstops > 0 && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${donePct === 100 ? "bg-emerald-400" : overduePitstops > 0 ? "bg-red-400" : "bg-sky-400"}`}
                        style={{ width: `${donePct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-stone-400 w-7 text-right">{donePct}%</span>
                  </div>
                )}
              </div>

              {/* Goals (grouped or flat) */}
              {goalList.length === 0 ? (
                <div className="px-4 py-4 bg-white flex items-center gap-2 text-xs text-stone-300">
                  <Calendar className="w-3.5 h-3.5" />
                  No pitstops scheduled this quarter.
                </div>
              ) : (
                <div className="bg-white">
                  {groups.map((group, gi) => (
                    <div key={gi}>
                      {group.label !== null && (
                        <div className="px-4 py-1.5 bg-stone-50/80 border-t border-b border-stone-100 flex items-center gap-1.5">
                          {groupBy === "city"    && <Building2 className="w-3 h-3 text-stone-300" />}
                          {groupBy === "zone"    && <Layers    className="w-3 h-3 text-violet-300" />}
                          {groupBy === "cluster" && <MapPin    className="w-3 h-3 text-emerald-400" />}
                          {groupBy === "user"    && <Users     className="w-3 h-3 text-sky-400" />}
                          <span className="text-[10px] font-semibold text-stone-600">{group.label}</span>
                          <span className="text-[10px] text-stone-400">· {group.items.length} goal{group.items.length !== 1 ? "s" : ""}</span>
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
        })}

        {quarters.length === 0 && (
          <div className="text-center py-16 border border-dashed border-stone-200 rounded-xl">
            <CalendarRange className="w-8 h-8 text-stone-200 mx-auto mb-2" />
            <p className="text-sm text-stone-400">No goals with scheduled pitstops yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
