"use client";

import { useState, useTransition } from "react";
import type { SeedingTaskStatus } from "@/app/generated/prisma/client";
import { STATUS_META, STATUS_ORDER } from "../../_lib/status";
import { weekLabel } from "@/lib/seeding/weeks";
import {
  createSeedingTask, updateSeedingTask, setSeedingTaskStatus, deleteSeedingTask,
  createSeedingPhase, renameSeedingPhase, deleteSeedingPhase, type TaskInput,
} from "../../actions";

type Task = {
  id: string; code: string | null; title: string; detail: string | null; ownerRole: string | null;
  supportRoles: string | null; startWeek: number | null; dueWeek: number | null; dependsOn: string | null;
  doneMetric: string | null; status: SeedingTaskStatus; notes: string | null; phaseId: string | null;
};
type Phase = { id: string; label: string };

export default function WorkstreamBoard({
  workstreamId, label, color, phases, tasks, canEdit, canManageStructure, week0ISO, roleOptions,
}: {
  workstreamId: string; workstreamKey: string; label: string; color: string;
  phases: Phase[]; tasks: Task[]; canEdit: boolean; canManageStructure: boolean;
  week0ISO: string; roleOptions: string[];
}) {
  const week0 = new Date(week0ISO);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | "none" | null>(null); // phaseId | "none" | null
  const [addingPhase, setAddingPhase] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) => start(async () => { setErr(null); try { await fn(); setEditing(null); setAdding(null); setAddingPhase(false); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } });

  const done = tasks.filter((t) => t.status === "done").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const groups: { phase: Phase | null; items: Task[] }[] = [
    ...phases.map((p) => ({ phase: p, items: tasks.filter((t) => t.phaseId === p.id) })),
    { phase: null, items: tasks.filter((t) => !t.phaseId) },
  ].filter((g) => g.items.length > 0 || g.phase);

  return (
    <div className="space-y-5">
      <div>
        <a href="/seeding/workstreams" className="text-xs text-stone-400 hover:text-stone-600">← All workstreams</a>
        <div className="flex items-center gap-2 mt-1">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
          <h1 className="text-xl font-semibold text-stone-900">{label}</h1>
        </div>
        <p className="text-sm text-stone-500 mt-0.5">{done}/{tasks.length} done · {pct}%</p>
      </div>

      {err && <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-2">{err}</div>}

      {groups.map((g) => (
        <section key={g.phase?.id ?? "none"} className="rounded-xl border border-stone-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 flex items-center gap-2">
            <h2 className="text-sm font-medium text-stone-700 flex-1">{g.phase?.label ?? "Unphased"}</h2>
            {canManageStructure && g.phase && (
              <>
                <button onClick={() => { const l = prompt("Rename phase", g.phase!.label); if (l) run(() => renameSeedingPhase(g.phase!.id, l)); }} className="text-[11px] text-stone-400 hover:text-stone-700">Rename</button>
                {g.items.length === 0 && <button onClick={() => { if (confirm("Delete this phase?")) run(() => deleteSeedingPhase(g.phase!.id)); }} className="text-[11px] text-rose-400 hover:text-rose-600">Delete</button>}
              </>
            )}
          </div>
          <div className="divide-y divide-stone-100">
            {g.items.map((t) => (
              <TaskRow key={t.id} t={t} week0={week0} canEdit={canEdit} pending={pending}
                expanded={editing === t.id} onToggle={() => setEditing(editing === t.id ? null : t.id)}
                roleOptions={roleOptions} phases={phases}
                onStatus={(s) => run(() => setSeedingTaskStatus(t.id, s))}
                onSave={(input) => run(() => updateSeedingTask(t.id, input))}
                onDelete={() => { if (confirm("Delete this task?")) run(() => deleteSeedingTask(t.id)); }}
              />
            ))}
            {canEdit && (
              adding === (g.phase?.id ?? "none")
                ? <div className="px-4 py-3"><TaskForm phases={phases} roleOptions={roleOptions} defaultPhaseId={g.phase?.id ?? null} pending={pending} onCancel={() => setAdding(null)} onSubmit={(input) => run(() => createSeedingTask(workstreamId, input))} /></div>
                : <button onClick={() => setAdding(g.phase?.id ?? "none")} className="w-full text-left px-4 py-2 text-xs text-sky-600 hover:bg-sky-50">+ Add task</button>
            )}
          </div>
        </section>
      ))}

      {canManageStructure && (
        addingPhase
          ? <div className="rounded-xl border border-stone-200 bg-white p-4 flex items-end gap-2">
              <PhaseAdder pending={pending} onCancel={() => setAddingPhase(false)} onSubmit={(l) => run(() => createSeedingPhase(workstreamId, l))} />
            </div>
          : <button onClick={() => setAddingPhase(true)} className="text-xs text-stone-500 hover:text-stone-800">+ Add phase</button>
      )}
    </div>
  );
}

function TaskRow({ t, week0, canEdit, pending, expanded, onToggle, roleOptions, phases, onStatus, onSave, onDelete }: {
  t: Task; week0: Date; canEdit: boolean; pending: boolean; expanded: boolean; onToggle: () => void;
  roleOptions: string[]; phases: Phase[];
  onStatus: (s: SeedingTaskStatus) => void; onSave: (input: TaskInput) => void; onDelete: () => void;
}) {
  const m = STATUS_META[t.status];
  return (
    <div className={t.status === "blocked" ? "bg-rose-50/40" : ""}>
      <div className="px-4 py-2.5 flex items-center gap-3">
        <span className={`w-2 h-2 rounded-full shrink-0 ${m.dot}`} />
        <button onClick={onToggle} className="flex-1 min-w-0 text-left">
          <div className="text-sm text-stone-800 truncate">{t.title}</div>
          <div className="text-[11px] text-stone-400 mt-0.5 truncate">
            {t.ownerRole ?? "—"}{t.dueWeek != null && <> · due {weekLabel(week0, t.dueWeek)}</>}{t.dependsOn && t.dependsOn !== "-" && <> · needs: {t.dependsOn}</>}
          </div>
        </button>
        {canEdit ? (
          <select value={t.status} disabled={pending} onChange={(e) => onStatus(e.target.value as SeedingTaskStatus)}
            className={`shrink-0 text-[11px] rounded-full px-2 py-1 border-0 ${m.chip} cursor-pointer`}>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        ) : <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${m.chip}`}>{m.label}</span>}
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-1">
          {canEdit
            ? <TaskForm phases={phases} roleOptions={roleOptions} task={t} defaultPhaseId={t.phaseId} pending={pending} onCancel={onToggle} onSubmit={onSave} onDelete={onDelete} />
            : <TaskDetail t={t} week0={week0} />}
        </div>
      )}
    </div>
  );
}

function TaskDetail({ t, week0 }: { t: Task; week0: Date }) {
  return (
    <dl className="text-xs text-stone-600 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
      {t.detail && <div className="sm:col-span-2"><dt className="text-stone-400">Sub-task</dt><dd>{t.detail}</dd></div>}
      {t.doneMetric && <div className="sm:col-span-2"><dt className="text-stone-400">Done = </dt><dd>{t.doneMetric}</dd></div>}
      <div><dt className="text-stone-400">Owner</dt><dd>{t.ownerRole ?? "—"}{t.supportRoles ? ` (support: ${t.supportRoles})` : ""}</dd></div>
      <div><dt className="text-stone-400">Window</dt><dd>{t.startWeek != null ? weekLabel(week0, t.startWeek) : "—"} → {t.dueWeek != null ? weekLabel(week0, t.dueWeek) : "—"}</dd></div>
      {t.notes && <div className="sm:col-span-2"><dt className="text-stone-400">Notes</dt><dd className="text-rose-600">{t.notes}</dd></div>}
    </dl>
  );
}

function TaskForm({ task, phases, roleOptions, defaultPhaseId, pending, onSubmit, onCancel, onDelete }: {
  task?: Task; phases: Phase[]; roleOptions: string[]; defaultPhaseId: string | null; pending: boolean;
  onSubmit: (input: TaskInput) => void; onCancel: () => void; onDelete?: () => void;
}) {
  const [f, setF] = useState<TaskInput>({
    title: task?.title ?? "", detail: task?.detail ?? "", ownerRole: task?.ownerRole ?? "",
    supportRoles: task?.supportRoles ?? "", startWeek: task?.startWeek ?? null, dueWeek: task?.dueWeek ?? null,
    dependsOn: task?.dependsOn ?? "", doneMetric: task?.doneMetric ?? "", status: task?.status ?? "not_started",
    notes: task?.notes ?? "", phaseId: defaultPhaseId, code: task?.code ?? "",
  });
  const set = (k: keyof TaskInput, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const inp = "w-full rounded border border-stone-300 px-2 py-1.5 text-sm";
  const lbl = "text-[11px] text-stone-500";
  const numOrNull = (v: string) => (v === "" ? null : parseInt(v, 10));

  return (
    <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
      <input className={inp} placeholder="Task title" value={f.title} onChange={(e) => set("title", e.target.value)} />
      <textarea className={inp} rows={2} placeholder="Sub-task (detailed)" value={f.detail ?? ""} onChange={(e) => set("detail", e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <label className={lbl}>Owner
          <input className={inp} list="seeding-roles" value={f.ownerRole ?? ""} onChange={(e) => set("ownerRole", e.target.value)} />
          <datalist id="seeding-roles">{roleOptions.map((r) => <option key={r} value={r} />)}</datalist>
        </label>
        <label className={lbl}>Support<input className={inp} value={f.supportRoles ?? ""} onChange={(e) => set("supportRoles", e.target.value)} /></label>
        <label className={lbl}>Start week<input className={inp} type="number" value={f.startWeek ?? ""} onChange={(e) => set("startWeek", numOrNull(e.target.value))} /></label>
        <label className={lbl}>Due week<input className={inp} type="number" value={f.dueWeek ?? ""} onChange={(e) => set("dueWeek", numOrNull(e.target.value))} /></label>
        <label className={lbl}>Phase
          <select className={inp} value={f.phaseId ?? ""} onChange={(e) => set("phaseId", e.target.value || null)}>
            <option value="">Unphased</option>
            {phases.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className={lbl}>Status
          <select className={inp} value={f.status} onChange={(e) => set("status", e.target.value)}>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </label>
      </div>
      <label className={lbl}>Done = (metric / proof)<input className={inp} value={f.doneMetric ?? ""} onChange={(e) => set("doneMetric", e.target.value)} /></label>
      <label className={lbl}>Depends on<input className={inp} value={f.dependsOn ?? ""} onChange={(e) => set("dependsOn", e.target.value)} /></label>
      <label className={lbl}>Notes / blocker<input className={inp} value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></label>
      <div className="flex items-center gap-2 pt-1">
        <button disabled={pending || !f.title.trim()} onClick={() => onSubmit(f)} className="text-sm bg-sky-600 text-white px-3 py-1.5 rounded-lg hover:bg-sky-700 disabled:opacity-50">Save</button>
        <button onClick={onCancel} className="text-sm text-stone-500 px-2">Cancel</button>
        {onDelete && <button disabled={pending} onClick={onDelete} className="ml-auto text-xs text-rose-500 hover:text-rose-700">Delete task</button>}
      </div>
    </div>
  );
}

function PhaseAdder({ pending, onSubmit, onCancel }: { pending: boolean; onSubmit: (label: string) => void; onCancel: () => void }) {
  const [v, setV] = useState("");
  return (
    <>
      <label className="text-[11px] text-stone-500 flex-1">New phase name
        <input autoFocus className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm" placeholder="e.g. C6 Partnerships" value={v} onChange={(e) => setV(e.target.value)} />
      </label>
      <button disabled={pending || !v.trim()} onClick={() => onSubmit(v)} className="text-sm bg-sky-600 text-white px-3 py-1.5 rounded-lg hover:bg-sky-700 disabled:opacity-50">Add</button>
      <button onClick={onCancel} className="text-sm text-stone-500 px-2 py-1.5">Cancel</button>
    </>
  );
}
