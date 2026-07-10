"use client";

import { useTransition } from "react";
import type { SeedingTaskStatus } from "@/app/generated/prisma/client";
import { STATUS_META, STATUS_ORDER } from "../_lib/status";
import { weekLabel } from "@/lib/seeding/weeks";
import { setSeedingSubtaskStatus } from "../actions";

type T = {
  id: string; title: string; ownerRole: string | null; dueWeek: number | null; status: SeedingTaskStatus;
  workstreamLabel: string; workstreamKey: string; taskTitle: string; doneMetric: string | null;
};

export default function MyTasksList({ tasks, week0ISO, nowWeek, canEdit }: { tasks: T[]; week0ISO: string; nowWeek: number; canEdit: boolean }) {
  const week0 = new Date(week0ISO);
  const [pending, start] = useTransition();

  const active = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  const buckets: { title: string; items: T[]; tone: string }[] = [
    { title: "Overdue", tone: "text-rose-600", items: active.filter((t) => t.dueWeek != null && t.dueWeek < nowWeek) },
    { title: "This week", tone: "text-amber-600", items: active.filter((t) => t.dueWeek === nowWeek) },
    { title: "Upcoming", tone: "text-stone-500", items: active.filter((t) => t.dueWeek == null || t.dueWeek > nowWeek) },
    { title: "Done", tone: "text-emerald-600", items: done },
  ];

  if (tasks.length === 0) return <div className="rounded-xl border border-stone-200 bg-white px-4 py-10 text-center text-sm text-stone-400">No tasks match your role yet.</div>;

  return (
    <div className="space-y-5">
      {buckets.filter((b) => b.items.length > 0).map((b) => (
        <section key={b.title}>
          <h2 className={`text-xs uppercase tracking-wide mb-2 ${b.tone}`}>{b.title} ({b.items.length})</h2>
          <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100 overflow-hidden">
            {b.items.map((t) => {
              const m = STATUS_META[t.status];
              return (
                <div key={t.id} className={`px-4 py-2.5 flex items-center gap-3 ${t.status === "blocked" ? "bg-rose-50/40" : ""}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${m.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-stone-800">{t.title}</div>
                    <div className="text-[11px] text-stone-400 mt-0.5">
                      <a href={`/seeding/workstream/${t.workstreamKey}`} className="hover:underline">{t.workstreamLabel}</a> · {t.taskTitle}
                      {t.dueWeek != null && <> · due {weekLabel(week0, t.dueWeek)}</>}
                    </div>
                  </div>
                  {canEdit ? (
                    <select value={t.status} disabled={pending} onChange={(e) => start(() => setSeedingSubtaskStatus(t.id, e.target.value as SeedingTaskStatus))}
                      className={`shrink-0 text-[11px] rounded-full px-2 py-1 border-0 ${m.chip} cursor-pointer`}>
                      {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                    </select>
                  ) : <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${m.chip}`}>{m.label}</span>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
