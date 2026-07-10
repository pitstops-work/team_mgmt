"use client";

import { useState } from "react";
import type { MilestoneNode } from "@/lib/seeding/milestones";
import { STATUS_META } from "../_lib/status";
import { weekToDate, fmtDate } from "@/lib/seeding/weeks";
import { ProgressBar } from "./bits";

export default function RoadToLaunch({ milestones, week0ISO, launchWeek, nowWeek }: {
  milestones: MilestoneNode[]; week0ISO: string; launchWeek: number; nowWeek: number;
}) {
  const week0 = new Date(week0ISO);
  const firstIncomplete = milestones.find((m) => m.subTotal === 0 || m.subDone < m.subTotal);
  const [open, setOpen] = useState<string | null>(firstIncomplete?.id ?? milestones[0]?.id ?? null);

  return (
    <div className="space-y-2">
      {milestones.length === 0 && <div className="rounded-xl border border-stone-200 bg-white px-4 py-6 text-sm text-stone-400 text-center">No milestones yet.</div>}
      {milestones.map((m, i) => {
        const pct = m.subTotal ? Math.round((m.subDone / m.subTotal) * 100) : 0;
        const isOpen = open === m.id;
        const isLaunch = m.key === "launch";
        const overdue = m.targetWeek != null && m.targetWeek < nowWeek && pct < 100;
        const date = m.targetWeek != null ? fmtDate(weekToDate(week0, m.targetWeek)) : null;
        return (
          <div key={m.id} className={`rounded-xl border bg-white overflow-hidden ${isLaunch ? "border-sky-300" : "border-stone-200"}`}>
            <button onClick={() => setOpen(isOpen ? null : m.id)} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-stone-50 text-left">
              <span className="shrink-0 w-6 h-6 rounded-full bg-stone-100 text-stone-500 text-xs font-medium flex items-center justify-center">{isLaunch ? "🚀" : i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-stone-900 truncate">{isOpen ? "▾ " : "▸ "}{m.title}</div>
                <div className="text-[11px] text-stone-400">
                  {date ? <span className={overdue ? "text-rose-600 font-medium" : ""}>by {date}{m.targetWeek != null && ` · W${m.targetWeek}`}</span> : "no dated work"}
                  {" · "}{m.tasks.length} tasks{m.blocked > 0 && <span className="text-rose-600"> · {m.blocked} blocked</span>}
                  {overdue && <span className="text-rose-600 font-medium"> · overdue</span>}
                </div>
              </div>
              <div className="shrink-0 w-28">
                <div className="flex justify-between text-[11px] text-stone-400"><span>{m.subDone}/{m.subTotal}</span><span>{pct}%</span></div>
                <div className="mt-1"><ProgressBar pct={pct} color={pct === 100 ? "bg-emerald-500" : overdue ? "bg-rose-500" : "bg-sky-500"} /></div>
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-stone-100 divide-y divide-stone-50">
                {m.tasks.length === 0 && <div className="px-4 py-3 text-xs text-stone-400">No tasks assigned to this milestone yet.</div>}
                {m.tasks.map((t) => {
                  const st = STATUS_META[t.status];
                  return (
                    <a key={t.id} href={`/seeding/workstream/${t.workstreamKey}`} className="px-4 py-2 flex items-center gap-3 hover:bg-sky-50/50">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                      <span className="text-sm text-stone-700 flex-1 truncate">{t.title}</span>
                      <span className="text-[11px] text-stone-400">{t.subDone}/{t.subTotal}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${st.chip}`}>{st.label}</span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
