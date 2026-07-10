"use client";

import { useState } from "react";
import type { SeedingTaskStatus } from "@/app/generated/prisma/client";
import { STATUS_META } from "../_lib/status";
import { ProgressBar } from "./bits";

export type PhaseNode = {
  id: string; label: string; color: string; workstreamLabel: string; workstreamKey: string;
  dueWeek: number | null; subDone: number; subTotal: number; blocked: number;
  tasks: { id: string; title: string; status: SeedingTaskStatus; subDone: number; subTotal: number }[];
};

export default function RoadToLaunch({ phases, postCount, week0ISO, launchWeek, nowWeek }: {
  phases: PhaseNode[]; postCount: number; week0ISO: string; launchWeek: number; nowWeek: number;
}) {
  const [open, setOpen] = useState<string | null>(phases[0]?.id ?? null);
  return (
    <div className="space-y-2">
      {phases.length === 0 && <div className="rounded-xl border border-stone-200 bg-white px-4 py-6 text-sm text-stone-400 text-center">No phases due before launch.</div>}
      {phases.map((p) => {
        const pct = p.subTotal ? Math.round((p.subDone / p.subTotal) * 100) : 0;
        const isOpen = open === p.id;
        const overdue = p.dueWeek != null && p.dueWeek < nowWeek && pct < 100;
        return (
          <div key={p.id} className="rounded-xl border border-stone-200 bg-white overflow-hidden">
            <button onClick={() => setOpen(isOpen ? null : p.id)} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-stone-50 text-left">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-stone-900 truncate">{isOpen ? "▾ " : "▸ "}{p.label}</div>
                <div className="text-[11px] text-stone-400">{p.workstreamLabel} · {p.tasks.length} tasks{p.blocked > 0 && <span className="text-rose-600"> · {p.blocked} blocked</span>}</div>
              </div>
              <div className="shrink-0 w-28">
                <div className="flex justify-between text-[11px] text-stone-400"><span>{p.subDone}/{p.subTotal}</span><span>{pct}%</span></div>
                <div className="mt-1"><ProgressBar pct={pct} hex={p.color} /></div>
              </div>
              <div className={`shrink-0 text-[11px] w-12 text-right ${overdue ? "text-rose-600 font-medium" : "text-stone-400"}`}>{p.dueWeek != null ? `W${p.dueWeek}` : "—"}</div>
            </button>
            {isOpen && (
              <div className="border-t border-stone-100 divide-y divide-stone-50">
                {p.tasks.map((t) => {
                  const m = STATUS_META[t.status];
                  return (
                    <a key={t.id} href={`/seeding/workstream/${p.workstreamKey}`} className="px-4 py-2 flex items-center gap-3 hover:bg-sky-50/50">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.dot}`} />
                      <span className="text-sm text-stone-700 flex-1 truncate">{t.title}</span>
                      <span className="text-[11px] text-stone-400">{t.subDone}/{t.subTotal}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${m.chip}`}>{m.label}</span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {postCount > 0 && (
        <div className="text-[11px] text-stone-400 pt-1">+ {postCount} more phases scheduled after launch (W{launchWeek}) — see the <a href="/seeding/timeline" className="text-sky-600 hover:underline">timeline</a>.</div>
      )}
    </div>
  );
}
