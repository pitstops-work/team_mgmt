"use client";

import { useState, useTransition } from "react";
import { createLaunchMilestone, renameLaunchMilestone, deleteLaunchMilestone, reorderLaunchMilestone, assignPhaseMilestone } from "../../actions";

type Milestone = { id: string; title: string; phaseCount: number };
type Phase = { id: string; label: string; milestoneId: string | null; workstreamLabel: string; color: string };

export default function MilestonesClient({ milestones, phases }: { milestones: Milestone[]; phases: Phase[] }) {
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<void>) => start(async () => { setErr(null); try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } });

  // group phases by workstream for the assignment table
  const byWs = phases.reduce<Record<string, Phase[]>>((acc, p) => { (acc[p.workstreamLabel] ??= []).push(p); return acc; }, {});

  return (
    <div className="space-y-6">
      <div>
        <a href="/seeding" className="text-xs text-stone-400 hover:text-stone-600">← Dashboard</a>
        <h1 className="text-xl font-semibold text-stone-900 mt-1">Road-to-launch milestones</h1>
        <p className="text-sm text-stone-500 mt-0.5">Curate the gates shown on the dashboard. Each milestone rolls up the phases you assign to it; its date is the latest sub-task due across those phases.</p>
      </div>
      {err && <div className="text-xs text-rose-600">{err}</div>}

      {/* Milestone list */}
      <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100 overflow-hidden">
        {milestones.map((m, i) => (
          <div key={m.id} className="px-4 py-2.5 flex items-center gap-2">
            <div className="flex flex-col shrink-0">
              <button disabled={pending || i === 0} onClick={() => run(() => reorderLaunchMilestone(m.id, "up"))} className="text-[10px] text-stone-400 hover:text-stone-700 disabled:opacity-30 leading-none">▲</button>
              <button disabled={pending || i === milestones.length - 1} onClick={() => run(() => reorderLaunchMilestone(m.id, "down"))} className="text-[10px] text-stone-400 hover:text-stone-700 disabled:opacity-30 leading-none">▼</button>
            </div>
            <span className="text-xs text-stone-400 w-5 shrink-0">{i + 1}</span>
            <input defaultValue={m.title} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== m.title) run(() => renameLaunchMilestone(m.id, e.target.value)); }} className="flex-1 text-sm rounded border border-transparent hover:border-stone-200 focus:border-stone-300 px-2 py-1" />
            <span className="text-[11px] text-stone-400 shrink-0">{m.phaseCount} phases</span>
            <button disabled={pending} onClick={() => { if (confirm("Delete this milestone? Its phases stay but detach.")) run(() => deleteLaunchMilestone(m.id)); }} className="text-[11px] text-rose-400 hover:text-rose-600 shrink-0">Delete</button>
          </div>
        ))}
        <div className="px-4 py-2.5 flex items-center gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New milestone title" className="flex-1 rounded border border-stone-300 px-2 py-1.5 text-sm" />
          <button disabled={pending || !title.trim()} onClick={() => run(async () => { await createLaunchMilestone(title); setTitle(""); })} className="text-sm bg-sky-600 text-white px-3 py-1.5 rounded-lg hover:bg-sky-700 disabled:opacity-50">Add</button>
        </div>
      </div>

      {/* Phase → milestone assignment */}
      <div>
        <h2 className="text-sm font-semibold text-stone-700 mb-2">Assign phases to milestones</h2>
        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
          {Object.entries(byWs).map(([wsLabel, ps]) => (
            <div key={wsLabel}>
              <div className="px-4 py-1.5 bg-stone-50 border-y border-stone-100 text-[11px] font-medium text-stone-500 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ps[0].color }} />{wsLabel}
              </div>
              {ps.map((p) => (
                <div key={p.id} className="px-4 py-2 flex items-center gap-3">
                  <span className="text-sm text-stone-700 flex-1 truncate">{p.label}</span>
                  <select value={p.milestoneId ?? ""} disabled={pending} onChange={(e) => run(() => assignPhaseMilestone(p.id, e.target.value || null))} className="text-xs rounded border border-stone-300 px-2 py-1 text-stone-600">
                    <option value="">— none —</option>
                    {milestones.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                  </select>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
