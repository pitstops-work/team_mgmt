"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarRange, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Calendar } from "lucide-react";

type PitstopData = {
  id: string;
  title: string;
  status: string;
  targetDate: string | null;
  startDate: string | null;
  progressTag: string | null;
  checklistTotal: number;
  checklistDone: number;
  activityCount: number;
  activityDoneCount: number;
};

type GoalData = {
  id: string;
  title: string;
  status: string;
  targetDate: string | null;
  pitstops: PitstopData[];
};

// ── Indian FY quarter helpers ─────────────────────────────────────────────────

function fyQuarter(date: Date): { fyYear: number; q: number } {
  const m = date.getMonth(); // 0-indexed
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

function qKey(fyYear: number, q: number) { return `${fyYear}-${q}`; }
function qSortKey(fyYear: number, q: number) {
  // Q4 of FY year actually ends in fyYear+1, so needs correct chronological sort
  if (q === 4) return (fyYear + 1) * 10 + 0;
  return fyYear * 10 + q;
}

const PHASE_COLORS: Record<string, string> = {
  Planning:    "bg-sky-50 text-sky-600 border-sky-100",
  Mobilisation:"bg-violet-50 text-violet-600 border-violet-100",
  Setup:       "bg-amber-50 text-amber-600 border-amber-100",
  Capacity:    "bg-orange-50 text-orange-600 border-orange-100",
  Engagement:  "bg-emerald-50 text-emerald-600 border-emerald-100",
  Delivery:    "bg-teal-50 text-teal-600 border-teal-100",
  Monitoring:  "bg-stone-50 text-stone-600 border-stone-100",
};

export default function QuartersView({ goals }: { goals: GoalData[] }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const currentQ = fyQuarter(today);

  const quarterMap = useMemo(() => {
    const map = new Map<string, {
      fyYear: number; q: number;
      goalsMap: Map<string, { goal: GoalData; pitstops: PitstopData[] }>;
    }>();

    // Always include current quarter
    const cKey = qKey(currentQ.fyYear, currentQ.q);
    map.set(cKey, { fyYear: currentQ.fyYear, q: currentQ.q, goalsMap: new Map() });

    for (const goal of goals) {
      for (const pitstop of goal.pitstops) {
        if (!pitstop.targetDate) continue;
        const d = new Date(pitstop.targetDate);
        const { fyYear, q } = fyQuarter(d);
        const key = qKey(fyYear, q);
        if (!map.has(key)) map.set(key, { fyYear, q, goalsMap: new Map() });
        const qData = map.get(key)!;
        if (!qData.goalsMap.has(goal.id)) qData.goalsMap.set(goal.id, { goal, pitstops: [] });
        qData.goalsMap.get(goal.id)!.pitstops.push(pitstop);
      }
    }
    return map;
  }, [goals, currentQ.fyYear, currentQ.q]);

  // Sorted newest-first, current quarter always visible at top if applicable
  const quarters = useMemo(() =>
    [...quarterMap.values()].sort((a, b) => qSortKey(b.fyYear, b.q) - qSortKey(a.fyYear, a.q)),
    [quarterMap]
  );

  const [openGoals, setOpenGoals] = useState<Set<string>>(new Set());
  const toggleGoal = (key: string) =>
    setOpenGoals(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center gap-2 mb-6">
        <CalendarRange className="w-5 h-5 text-stone-400" />
        <h1 className="text-lg font-semibold text-stone-900">Quarterly Planning</h1>
        <span className="text-xs text-stone-400 ml-1">· Indian FY (Apr–Mar) · auto-computed</span>
      </div>

      <div className="space-y-5">
        {quarters.map(({ fyYear, q, goalsMap }) => {
          const isCurrent = fyYear === currentQ.fyYear && q === currentQ.q;
          const isPast = qSortKey(fyYear, q) < qSortKey(currentQ.fyYear, currentQ.q);
          const { start, end } = quarterBounds(fyYear, q);
          const goalList = [...goalsMap.values()];

          let totalPitstops = 0, donePitstops = 0, overduePitstops = 0, totalActivities = 0, doneActivities = 0;
          for (const { pitstops } of goalList) {
            for (const p of pitstops) {
              totalPitstops++;
              if (p.status === "Done") donePitstops++;
              else if (p.targetDate && new Date(p.targetDate) < today) overduePitstops++;
              totalActivities += p.activityCount;
              doneActivities += p.activityDoneCount;
            }
          }
          const donePct = totalPitstops > 0 ? Math.round((donePitstops / totalPitstops) * 100) : 0;

          return (
            <div key={qKey(fyYear, q)} className={`rounded-xl border overflow-hidden ${
              isCurrent ? "border-sky-300 shadow-sm" : isPast ? "border-stone-100" : "border-stone-200"
            }`}>
              {/* ── Quarter header ── */}
              <div className={`px-4 py-3 ${isCurrent ? "bg-sky-50" : isPast ? "bg-stone-50/60" : "bg-stone-50"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-bold ${isCurrent ? "text-sky-800" : isPast ? "text-stone-400" : "text-stone-800"}`}>
                        Q{q} FY{fyYear}–{String(fyYear + 1).slice(2)}
                      </span>
                      <span className={`text-xs ${isPast ? "text-stone-300" : "text-stone-400"}`}>{Q_LABELS[q - 1]}</span>
                      {isCurrent && (
                        <span className="text-[10px] font-semibold bg-sky-500 text-white px-1.5 py-0.5 rounded-full">Current</span>
                      )}
                      {isPast && goalList.length > 0 && (
                        <span className="text-[10px] text-stone-300">Past</span>
                      )}
                    </div>
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      {start.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      {" – "}
                      {end.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] flex-shrink-0">
                    <span className={isPast ? "text-stone-400" : "text-stone-600"}>
                      {goalList.length} goal{goalList.length !== 1 ? "s" : ""}
                    </span>
                    {totalPitstops > 0 && (
                      <span className={overduePitstops > 0 ? "text-red-500 font-semibold" : isPast ? "text-stone-400" : "text-stone-600"}>
                        {overduePitstops > 0 && <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />}
                        {donePitstops}/{totalPitstops} pitstops
                      </span>
                    )}
                    {totalActivities > 0 && (
                      <span className={isPast ? "text-stone-400" : "text-violet-500"}>
                        {doneActivities}/{totalActivities} act.
                      </span>
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

              {/* ── Goals list ── */}
              {goalList.length === 0 ? (
                <div className="px-4 py-4 bg-white flex items-center gap-2 text-xs text-stone-300">
                  <Calendar className="w-3.5 h-3.5" />
                  No pitstops scheduled this quarter.
                </div>
              ) : (
                <div className="divide-y divide-stone-100 bg-white">
                  {goalList.map(({ goal, pitstops }) => {
                    const goalKey = `${qKey(fyYear, q)}-${goal.id}`;
                    const isOpen = openGoals.has(goalKey);
                    const ptDone = pitstops.filter(p => p.status === "Done").length;
                    const ptOverdue = pitstops.filter(p => p.status !== "Done" && p.targetDate && new Date(p.targetDate) < today).length;

                    return (
                      <div key={goal.id}>
                        <button
                          onClick={() => toggleGoal(goalKey)}
                          className="w-full px-4 py-2.5 flex items-center gap-2.5 hover:bg-stone-50 transition-colors text-left group"
                        >
                          {isOpen
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
                          {ptOverdue > 0 && (
                            <span className="text-[10px] text-red-500 flex-shrink-0 flex items-center gap-0.5 font-medium">
                              <AlertTriangle className="w-2.5 h-2.5" />{ptOverdue}
                            </span>
                          )}
                          {ptDone === pitstops.length && pitstops.length > 0 && (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                          )}
                          <span className="text-[10px] text-stone-400 flex-shrink-0 tabular-nums">
                            {ptDone}/{pitstops.length}
                          </span>
                        </button>

                        {isOpen && (
                          <div className="pl-10 pr-4 pb-3 space-y-1">
                            {pitstops.map(p => {
                              const isOverdue = p.status !== "Done" && p.targetDate && new Date(p.targetDate) < today;
                              const isDone = p.status === "Done";
                              const clPct = p.checklistTotal > 0
                                ? Math.round((p.checklistDone / p.checklistTotal) * 100)
                                : null;

                              return (
                                <div key={p.id} className={`rounded-lg px-2.5 py-2 border ${
                                  isDone ? "border-emerald-100 bg-emerald-50/50" : isOverdue ? "border-red-100 bg-red-50/30" : "border-stone-100 bg-stone-50/50"
                                }`}>
                                  <div className="flex items-center gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                      isDone ? "bg-emerald-400" : isOverdue ? "bg-red-400" : "bg-stone-300"
                                    }`} />
                                    <span className={`flex-1 text-[11px] truncate ${isDone ? "text-stone-400 line-through" : "text-stone-700"}`}>
                                      {p.title}
                                    </span>
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
                                    <div className="flex items-center gap-2 mt-1.5 pl-3.5">
                                      {clPct !== null && (
                                        <>
                                          <div className="flex-1 h-1 bg-white rounded-full overflow-hidden border border-stone-100">
                                            <div className="h-full bg-sky-400 rounded-full" style={{ width: `${clPct}%` }} />
                                          </div>
                                          <span className="text-[9px] text-stone-400 tabular-nums">
                                            {p.checklistDone}/{p.checklistTotal} checklist
                                          </span>
                                        </>
                                      )}
                                      {p.activityCount > 0 && (
                                        <span className="text-[9px] text-violet-400 flex-shrink-0">
                                          {p.activityDoneCount}/{p.activityCount} act.
                                        </span>
                                      )}
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
              )}
            </div>
          );
        })}
      </div>

      {quarters.length === 0 && (
        <div className="text-center py-16 border border-dashed border-stone-200 rounded-xl">
          <CalendarRange className="w-8 h-8 text-stone-200 mx-auto mb-2" />
          <p className="text-sm text-stone-400">No goals with scheduled pitstops yet.</p>
        </div>
      )}
    </div>
  );
}
