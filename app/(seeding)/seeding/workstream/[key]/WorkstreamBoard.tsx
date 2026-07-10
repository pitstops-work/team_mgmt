"use client";

import { useState, useTransition } from "react";
import type { SeedingTaskStatus } from "@/app/generated/prisma/client";
import { STATUS_META, STATUS_ORDER } from "../../_lib/status";
import { weekLabel } from "@/lib/seeding/weeks";
import {
  createSeedingTask, updateSeedingTask, deleteSeedingTask,
  createSeedingSubtask, updateSeedingSubtask, setSeedingSubtaskStatus, deleteSeedingSubtask,
  createSeedingPhase, renameSeedingPhase, deleteSeedingPhase, type SubtaskInput,
} from "../../actions";

type Sub = {
  id: string; code: string | null; title: string; ownerRole: string | null; supportRoles: string | null;
  startWeek: number | null; dueWeek: number | null; dependsOn: string | null; doneMetric: string | null;
  status: SeedingTaskStatus; notes: string | null;
};
type Task = { id: string; code: string | null; title: string; status: SeedingTaskStatus; phaseId: string | null; subtasks: Sub[] };
type Phase = { id: string; label: string };

export default function WorkstreamBoard({
  workstreamId, label, color, phases, tasks, canEdit, canManageStructure, week0ISO, roleOptions,
}: {
  workstreamId: string; label: string; color: string; phases: Phase[]; tasks: Task[];
  canEdit: boolean; canManageStructure: boolean; week0ISO: string; roleOptions: string[];
}) {
  const week0 = new Date(week0ISO);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [addingTask, setAddingTask] = useState<string | "none" | null>(null);
  const [addingPhase, setAddingPhase] = useState(false);
  const run = (fn: () => Promise<void>) => start(async () => { setErr(null); try { await fn(); setAddingTask(null); setAddingPhase(false); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } });

  const allSubs = tasks.flatMap((t) => t.subtasks);
  const done = allSubs.filter((s) => s.status === "done").length;
  const pct = allSubs.length ? Math.round((done / allSubs.length) * 100) : 0;

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
        <p className="text-sm text-stone-500 mt-0.5">{tasks.length} tasks · {done}/{allSubs.length} sub-tasks done · {pct}%</p>
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
              <TaskCard key={t.id} t={t} week0={week0} canEdit={canEdit} pending={pending} phases={phases} roleOptions={roleOptions} run={run} />
            ))}
            {canEdit && (
              addingTask === (g.phase?.id ?? "none")
                ? <div className="px-4 py-3"><QuickAdd placeholder="New task title" pending={pending} onCancel={() => setAddingTask(null)} onSubmit={(title) => run(() => createSeedingTask(workstreamId, { title, phaseId: g.phase?.id ?? null }))} /></div>
                : <button onClick={() => setAddingTask(g.phase?.id ?? "none")} className="w-full text-left px-4 py-2 text-xs text-sky-600 hover:bg-sky-50">+ Add task</button>
            )}
          </div>
        </section>
      ))}

      {canManageStructure && (
        addingPhase
          ? <div className="rounded-xl border border-stone-200 bg-white p-4"><QuickAdd placeholder="New phase name (e.g. C6 Partnerships)" pending={pending} onCancel={() => setAddingPhase(false)} onSubmit={(l) => run(() => createSeedingPhase(workstreamId, l))} /></div>
          : <button onClick={() => setAddingPhase(true)} className="text-xs text-stone-500 hover:text-stone-800">+ Add phase</button>
      )}
    </div>
  );
}

function TaskCard({ t, week0, canEdit, pending, phases, roleOptions, run }: {
  t: Task; week0: Date; canEdit: boolean; pending: boolean; phases: Phase[]; roleOptions: string[];
  run: (fn: () => Promise<void>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingHeader, setEditingHeader] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [title, setTitle] = useState(t.title);
  const [phaseId, setPhaseId] = useState<string | null>(t.phaseId);
  const m = STATUS_META[t.status];
  const done = t.subtasks.filter((s) => s.status === "done").length;

  return (
    <div className={`group ${t.status === "blocked" ? "bg-rose-50/40" : ""}`}>
      <div className="px-4 py-2.5 flex items-center gap-3">
        <span className={`w-2 h-2 rounded-full shrink-0 ${m.dot}`} />
        <button onClick={() => setOpen(!open)} className="flex-1 min-w-0 text-left">
          <div className="text-sm font-medium text-stone-800 truncate">{open ? "▾ " : "▸ "}{t.title}</div>
        </button>
        <span className="shrink-0 text-[11px] text-stone-400">{done}/{t.subtasks.length}</span>
        <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${m.chip}`}>{m.label}</span>
        {canEdit && (
          <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button title="Rename / move" onClick={() => { setEditingHeader(!editingHeader); setOpen(true); }} className="text-[11px] text-stone-400 hover:text-stone-700 px-1">✎</button>
            <button title="Delete task" onClick={() => { if (confirm(`Delete task "${t.title}" and its ${t.subtasks.length} sub-tasks?`)) run(() => deleteSeedingTask(t.id)); }} className="text-[11px] text-rose-400 hover:text-rose-600 px-1">🗑</button>
          </div>
        )}
      </div>

      {open && (
        <div className="px-4 pb-3">
          {editingHeader && canEdit && (
            <div className="mb-2 flex flex-wrap items-end gap-2 rounded-lg border border-stone-200 bg-stone-50 p-2">
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 min-w-[12rem] rounded border border-stone-300 px-2 py-1 text-sm" />
              <select value={phaseId ?? ""} onChange={(e) => setPhaseId(e.target.value || null)} className="rounded border border-stone-300 px-2 py-1 text-sm">
                <option value="">Unphased</option>
                {phases.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <button disabled={pending || !title.trim()} onClick={() => run(async () => { await updateSeedingTask(t.id, { title, phaseId }); setEditingHeader(false); })} className="text-sm bg-sky-600 text-white px-3 py-1 rounded-lg hover:bg-sky-700 disabled:opacity-50">Save</button>
              <button onClick={() => setEditingHeader(false)} className="text-sm text-stone-500 px-2">Cancel</button>
            </div>
          )}

          <div className="rounded-lg border border-stone-100 divide-y divide-stone-100">
            {t.subtasks.length === 0 && <div className="px-3 py-3 text-xs text-stone-400">No sub-tasks yet.</div>}
            {t.subtasks.map((s) => (
              <SubtaskRow key={s.id} s={s} week0={week0} canEdit={canEdit} pending={pending} roleOptions={roleOptions} run={run} />
            ))}
          </div>

          {canEdit && (
            addingSub
              ? <div className="mt-2"><SubtaskForm roleOptions={roleOptions} pending={pending} onCancel={() => setAddingSub(false)} onSubmit={(input) => run(async () => { await createSeedingSubtask(t.id, input); setAddingSub(false); })} /></div>
              : <button onClick={() => setAddingSub(true)} className="mt-2 text-xs text-sky-600 hover:underline">+ Add sub-task</button>
          )}
        </div>
      )}
    </div>
  );
}

function SubtaskRow({ s, week0, canEdit, pending, roleOptions, run }: {
  s: Sub; week0: Date; canEdit: boolean; pending: boolean; roleOptions: string[];
  run: (fn: () => Promise<void>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const m = STATUS_META[s.status];
  return (
    <div className={s.status === "blocked" ? "bg-rose-50/40" : ""}>
      <div className="px-3 py-2 flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.dot}`} />
        <button onClick={() => setEditing(!editing)} className="flex-1 min-w-0 text-left">
          <div className="text-sm text-stone-700 truncate">{s.title}</div>
          <div className="text-[11px] text-stone-400 truncate">{s.ownerRole ?? "—"}{s.dueWeek != null && <> · due {weekLabel(week0, s.dueWeek)}</>}{s.dependsOn && s.dependsOn !== "-" && <> · needs: {s.dependsOn}</>}</div>
        </button>
        {canEdit ? (
          <select value={s.status} disabled={pending} onChange={(e) => run(() => setSeedingSubtaskStatus(s.id, e.target.value as SeedingTaskStatus))} className={`shrink-0 text-[11px] rounded-full px-2 py-1 border-0 ${m.chip} cursor-pointer`}>
            {STATUS_ORDER.map((st) => <option key={st} value={st}>{STATUS_META[st].label}</option>)}
          </select>
        ) : <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${m.chip}`}>{m.label}</span>}
      </div>
      {editing && (
        <div className="px-3 pb-3">
          {canEdit
            ? <SubtaskForm sub={s} roleOptions={roleOptions} pending={pending} onCancel={() => setEditing(false)} onSubmit={(input) => run(async () => { await updateSeedingSubtask(s.id, input); setEditing(false); })} onDelete={() => { if (confirm("Delete this sub-task?")) run(() => deleteSeedingSubtask(s.id)); }} />
            : <SubtaskDetail s={s} week0={week0} />}
        </div>
      )}
    </div>
  );
}

function SubtaskDetail({ s, week0 }: { s: Sub; week0: Date }) {
  return (
    <dl className="text-xs text-stone-600 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
      {s.doneMetric && <div className="sm:col-span-2"><dt className="text-stone-400">Done =</dt><dd>{s.doneMetric}</dd></div>}
      <div><dt className="text-stone-400">Owner</dt><dd>{s.ownerRole ?? "—"}{s.supportRoles ? ` (support: ${s.supportRoles})` : ""}</dd></div>
      <div><dt className="text-stone-400">Window</dt><dd>{s.startWeek != null ? weekLabel(week0, s.startWeek) : "—"} → {s.dueWeek != null ? weekLabel(week0, s.dueWeek) : "—"}</dd></div>
      {s.notes && <div className="sm:col-span-2"><dt className="text-stone-400">Notes</dt><dd className="text-rose-600">{s.notes}</dd></div>}
    </dl>
  );
}

function SubtaskForm({ sub, roleOptions, pending, onSubmit, onCancel, onDelete }: {
  sub?: Sub; roleOptions: string[]; pending: boolean;
  onSubmit: (input: SubtaskInput) => void; onCancel: () => void; onDelete?: () => void;
}) {
  const [f, setF] = useState<SubtaskInput>({
    title: sub?.title ?? "", ownerRole: sub?.ownerRole ?? "", supportRoles: sub?.supportRoles ?? "",
    startWeek: sub?.startWeek ?? null, dueWeek: sub?.dueWeek ?? null, dependsOn: sub?.dependsOn ?? "",
    doneMetric: sub?.doneMetric ?? "", status: sub?.status ?? "not_started", notes: sub?.notes ?? "", code: sub?.code ?? "",
  });
  const set = (k: keyof SubtaskInput, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const inp = "w-full rounded border border-stone-300 px-2 py-1.5 text-sm";
  const lbl = "text-[11px] text-stone-500";
  const numOrNull = (v: string) => (v === "" ? null : parseInt(v, 10));

  return (
    <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
      <input className={inp} placeholder="Sub-task" value={f.title} onChange={(e) => set("title", e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <label className={lbl}>Owner
          <input className={inp} list="seeding-roles" value={f.ownerRole ?? ""} onChange={(e) => set("ownerRole", e.target.value)} />
          <datalist id="seeding-roles">{roleOptions.map((r) => <option key={r} value={r} />)}</datalist>
        </label>
        <label className={lbl}>Support<input className={inp} value={f.supportRoles ?? ""} onChange={(e) => set("supportRoles", e.target.value)} /></label>
        <label className={lbl}>Start week<input className={inp} type="number" value={f.startWeek ?? ""} onChange={(e) => set("startWeek", numOrNull(e.target.value))} /></label>
        <label className={lbl}>Due week<input className={inp} type="number" value={f.dueWeek ?? ""} onChange={(e) => set("dueWeek", numOrNull(e.target.value))} /></label>
        <label className={lbl}>Status
          <select className={inp} value={f.status} onChange={(e) => set("status", e.target.value)}>
            {STATUS_ORDER.map((st) => <option key={st} value={st}>{STATUS_META[st].label}</option>)}
          </select>
        </label>
        <label className={lbl}>Depends on<input className={inp} value={f.dependsOn ?? ""} onChange={(e) => set("dependsOn", e.target.value)} /></label>
      </div>
      <label className={lbl}>Done = (metric / proof)<input className={inp} value={f.doneMetric ?? ""} onChange={(e) => set("doneMetric", e.target.value)} /></label>
      <label className={lbl}>Notes / blocker<input className={inp} value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></label>
      <div className="flex items-center gap-2 pt-1">
        <button disabled={pending || !f.title.trim()} onClick={() => onSubmit(f)} className="text-sm bg-sky-600 text-white px-3 py-1.5 rounded-lg hover:bg-sky-700 disabled:opacity-50">Save</button>
        <button onClick={onCancel} className="text-sm text-stone-500 px-2">Cancel</button>
        {onDelete && <button disabled={pending} onClick={onDelete} className="ml-auto text-xs text-rose-500 hover:text-rose-700">Delete sub-task</button>}
      </div>
    </div>
  );
}

function QuickAdd({ placeholder, pending, onSubmit, onCancel }: { placeholder: string; pending: boolean; onSubmit: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex items-end gap-2">
      <input autoFocus className="flex-1 rounded border border-stone-300 px-2 py-1.5 text-sm" placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) onSubmit(v); }} />
      <button disabled={pending || !v.trim()} onClick={() => onSubmit(v)} className="text-sm bg-sky-600 text-white px-3 py-1.5 rounded-lg hover:bg-sky-700 disabled:opacity-50">Add</button>
      <button onClick={onCancel} className="text-sm text-stone-500 px-2 py-1.5">Cancel</button>
    </div>
  );
}
