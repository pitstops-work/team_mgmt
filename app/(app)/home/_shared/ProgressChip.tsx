"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Sticky header chip for the RP/ZL Today cockpit. Renders done-of-total and
 * an overdue badge when there's work running late. Compact enough to share
 * the header row with the Filter pill and Group-by select.
 */
export function ProgressChip({
  done, total, overdueCount,
}: {
  done: number;
  total: number;
  overdueCount: number;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && done === total;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-50 border border-stone-200">
        <CheckCircle2 className={`w-3.5 h-3.5 ${allDone ? "text-emerald-500" : "text-stone-400"}`} />
        <span className="text-xs font-semibold text-stone-700 tabular-nums">
          Today {done}/{total}
        </span>
        {total > 0 && (
          <div className="flex items-center gap-1 ml-1">
            <div className="w-16 h-1 bg-stone-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${allDone ? "bg-emerald-500" : "bg-sky-500"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>
      {overdueCount > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-amber-50 border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-xs font-semibold text-amber-700 tabular-nums">
            {overdueCount} overdue
          </span>
        </div>
      )}
    </div>
  );
}
