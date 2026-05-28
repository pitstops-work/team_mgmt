"use client";

import Link from "next/link";
import { Target, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { GoalData } from "./lib";

// Secondary lane on L2: goals whose own targetDate falls in the quarter.
// Different signal from "pitstops scheduled in the quarter" — these are
// the goals that are *supposed to ship* this quarter.
export default function GoalsThisQuarterStrip({
  goals,
  today,
}: {
  goals: GoalData[];
  today: Date;
}) {
  if (goals.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-stone-200 px-4 py-3 text-[11px] text-stone-400">
        No goals are targeting this quarter for completion.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-stone-100 bg-white overflow-hidden">
      <div className="px-3 py-2 bg-stone-50/60 border-b border-stone-100 flex items-center gap-1.5">
        <Target className="w-3 h-3 text-stone-400" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Goals targeting this quarter</span>
        <span className="text-[10px] text-stone-400">· {goals.length}</span>
      </div>
      <div className="divide-y divide-stone-100">
        {goals.map(g => {
          const overdue = g.targetDate && new Date(g.targetDate) < today && g.status !== "Complete";
          const done = g.status === "Complete";
          return (
            <Link
              key={g.id}
              href={`/goals/${g.id}`}
              className="flex items-center gap-2 px-3 py-2 hover:bg-stone-50 transition-colors"
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                done ? "bg-emerald-400" : g.status === "Active" ? "bg-sky-400" : "bg-amber-400"
              }`} />
              <span className="flex-1 text-xs font-medium text-stone-700 truncate">{g.title}</span>
              {g.needsDomain && (
                <span className="text-[9px] text-stone-400 flex-shrink-0">{g.needsDomain}</span>
              )}
              {g.owner.name && (
                <span className="text-[10px] text-stone-400 flex-shrink-0 truncate max-w-[120px]">{g.owner.name}</span>
              )}
              {g.targetDate && (
                <span className={`text-[10px] flex-shrink-0 tabular-nums ${overdue ? "text-red-500 font-semibold" : "text-stone-400"}`}>
                  {new Date(g.targetDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
              )}
              {overdue && <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />}
              {done && <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
