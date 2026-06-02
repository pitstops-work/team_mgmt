"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ActivityData, ChecklistItemData, PitstopData, GoalData } from "./lib";
import { fmtDayMonth } from "./lib";
import { progressTagColor } from "@/lib/progressTags";

export function ActivityRow({ a }: { a: ActivityData }) {
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
        {fmtDayMonth(new Date(a.scheduledAt))}
      </span>
    </div>
  );
}

export function ChecklistRow({ item }: { item: ChecklistItemData }) {
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

export function PitstopCard({ p, today }: { p: PitstopData; today: Date }) {
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
              <span className={`text-[9px] px-1.5 py-0.5 rounded border flex-shrink-0 ${progressTagColor(p.progressTag).pill}`}>
                {p.progressTag}
              </span>
            )}
            {p.targetDate && (
              <span className={`text-[9px] flex-shrink-0 ${isOverdue ? "text-red-500 font-semibold" : "text-stone-400"}`}>
                {fmtDayMonth(new Date(p.targetDate))}
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

export function GoalRow({ goal, pitstops, today }: { goal: GoalData; pitstops: PitstopData[]; today: Date }) {
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
            : pitstops.map(p => <PitstopCard key={p.id} p={p} today={today} />)
          }
        </div>
      )}
    </div>
  );
}
