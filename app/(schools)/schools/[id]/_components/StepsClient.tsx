"use client";

import { useMemo, useState, useTransition } from "react";
import {
  setStepStatus, setStepOwner, setStepDueDate,
  addSubstep, updateSubstep, setSubstepStatus, deleteSubstep,
} from "../../actions";
import { StepChip } from "../../_shared";
import type { SchoolPlanStepStatusValue } from "@/lib/schoolPlan/types";

type Substep = {
  id: string;
  title: string;
  description: string | null;
  status: SchoolPlanStepStatusValue;
  ownerUserId: string | null;
  ownerLabel: string | null;
  dueDate: string | null;
  blockingNote: string | null;
};

type Step = {
  id: string;
  stepNo: number;
  title: string;
  description: string | null;
  planSection: string | null;
  requiredArtifactType: string | null;
  status: SchoolPlanStepStatusValue;
  ownerUserId: string | null;
  ownerLabel: string | null;
  dueDate: string | null;
  blockingNote: string | null;
  substeps: Substep[];
};

type UserOpt = { id: string; label: string };

function ownerUnionLabel(subs: Substep[], stepOwnerLabel: string | null): string {
  if (subs.length === 0) return stepOwnerLabel ?? "—";
  const names = [...new Set(subs.map(s => s.ownerLabel).filter((n): n is string => !!n))];
  if (names.length === 0) return "—";
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

function earliestDue(subs: Substep[], stepDue: string | null): string | null {
  if (subs.length === 0) return stepDue;
  const dues = subs.map(s => s.dueDate).filter((d): d is string => !!d);
  if (dues.length === 0) return null;
  return dues.sort()[0];
}

export default function StepsClient({
  steps,
  users,
  canEdit,
}: {
  steps: Step[];
  users: UserOpt[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [blockingOpen, setBlockingOpen] = useState<{ kind: "step" | "substep"; id: string } | null>(null);
  const [blockingText, setBlockingText] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Default-expand steps that already have substeps.
    return new Set(steps.filter(s => s.substeps.length > 0).map(s => s.id));
  });
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-stone-50 text-stone-500 text-[10px] uppercase tracking-widest">
          <tr>
            <th className="text-left px-3 py-2 font-medium w-6"></th>
            <th className="text-left px-3 py-2 font-medium">#</th>
            <th className="text-left px-3 py-2 font-medium">Step</th>
            <th className="text-left px-3 py-2 font-medium">Owner</th>
            <th className="text-left px-3 py-2 font-medium">Due</th>
            <th className="text-left px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s) => {
            const hasSubs = s.substeps.length > 0;
            const isOpen = expanded.has(s.id);
            const rolledDue = earliestDue(s.substeps, s.dueDate);
            const rolledOwner = ownerUnionLabel(s.substeps, s.ownerLabel);
            return (
              <>
                <tr key={s.id} className="border-t border-stone-100 align-top">
                  <td className="px-2 py-2 text-stone-400">
                    <button
                      type="button"
                      onClick={() => toggle(s.id)}
                      aria-label={isOpen ? "Collapse substeps" : "Expand substeps"}
                      className="hover:text-stone-700"
                    >
                      {isOpen ? "▾" : "▸"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-stone-500 whitespace-nowrap">
                    {s.stepNo}
                    {s.planSection && <span className="ml-1 text-[9px] text-stone-400">§{s.planSection}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-stone-800">
                      {s.title}
                      {hasSubs && <span className="ml-2 text-[10px] text-stone-400 font-normal">· {s.substeps.length} substep{s.substeps.length === 1 ? "" : "s"} (rolled up)</span>}
                    </div>
                    <div className="text-[11px] text-stone-500 mt-0.5">{s.description}</div>
                    {s.requiredArtifactType && (
                      <div className="text-[10px] text-stone-400 mt-0.5">requires artefact · {s.requiredArtifactType}</div>
                    )}
                    {s.blockingNote && !hasSubs && (
                      <div className="text-[11px] text-rose-700 mt-1 bg-rose-50 border border-rose-200 rounded px-2 py-1">
                        ⚠ {s.blockingNote}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {hasSubs ? (
                      <span className="text-stone-500" title="Rolled up from substeps">{rolledOwner}</span>
                    ) : canEdit ? (
                      <select
                        className="text-[11px] rounded-lg border border-stone-200 bg-white px-2 py-1"
                        value={s.ownerUserId ?? ""}
                        onChange={(e) => startTransition(() => { void setStepOwner(s.id, e.target.value || null); })}
                        disabled={pending}
                      >
                        <option value="">—</option>
                        {users.map((u) => (<option key={u.id} value={u.id}>{u.label}</option>))}
                      </select>
                    ) : (
                      <span className="text-stone-500">{s.ownerLabel ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {hasSubs ? (
                      <span className="text-stone-500" title="Earliest substep due">{rolledDue ? rolledDue.slice(0, 10) : "—"}</span>
                    ) : canEdit ? (
                      <input
                        type="date"
                        className="text-[11px] rounded-lg border border-stone-200 bg-white px-2 py-1"
                        defaultValue={s.dueDate ? s.dueDate.slice(0, 10) : ""}
                        onBlur={(e) => startTransition(() => { void setStepDueDate(s.id, e.target.value || null); })}
                        disabled={pending}
                      />
                    ) : (
                      <span className="text-stone-500">{s.dueDate ? s.dueDate.slice(0, 10) : "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <StepChip status={s.status} />
                      {canEdit && !hasSubs && (
                        <select
                          className="text-[11px] rounded-lg border border-stone-200 bg-white px-2 py-1"
                          value={s.status}
                          onChange={(e) => {
                            const next = e.target.value as SchoolPlanStepStatusValue;
                            if (next === "blocked") {
                              setBlockingOpen({ kind: "step", id: s.id });
                              setBlockingText(s.blockingNote ?? "");
                              return;
                            }
                            startTransition(() => { void setStepStatus(s.id, next); });
                          }}
                          disabled={pending}
                        >
                          <option value="pending">Pending</option>
                          <option value="in_progress">In progress</option>
                          <option value="done">Done</option>
                          <option value="blocked">Blocked…</option>
                          <option value="not_applicable">N/A</option>
                        </select>
                      )}
                      {hasSubs && <span className="text-[10px] text-stone-400">rolled up</span>}
                    </div>
                    {blockingOpen?.kind === "step" && blockingOpen.id === s.id && (
                      <div className="mt-2 space-y-1">
                        <textarea
                          className="w-full text-[11px] rounded border border-stone-200 px-2 py-1"
                          rows={2}
                          value={blockingText}
                          onChange={(e) => setBlockingText(e.target.value)}
                          placeholder="What's blocking?"
                        />
                        <div className="flex gap-2 text-[11px]">
                          <button
                            className="px-2 py-0.5 rounded bg-rose-600 text-white hover:bg-rose-700"
                            onClick={() => startTransition(() => {
                              void setStepStatus(s.id, "blocked", blockingText).then(() => setBlockingOpen(null));
                            })}
                          >Save block</button>
                          <button className="px-2 py-0.5 text-stone-500 hover:text-stone-800" onClick={() => setBlockingOpen(null)}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>

                {isOpen && (
                  <tr key={`${s.id}-subs`} className="bg-stone-50/50">
                    <td colSpan={6} className="px-3 py-3">
                      <SubstepsPanel
                        step={s}
                        users={users}
                        canEdit={canEdit}
                        pending={pending}
                        startTransition={startTransition}
                        blockingOpen={blockingOpen}
                        setBlockingOpen={setBlockingOpen}
                        blockingText={blockingText}
                        setBlockingText={setBlockingText}
                        addingFor={addingFor}
                        setAddingFor={setAddingFor}
                        newTitle={newTitle}
                        setNewTitle={setNewTitle}
                      />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── substeps panel ────────────────────────────────────────────────────────────

function SubstepsPanel({
  step, users, canEdit, pending, startTransition,
  blockingOpen, setBlockingOpen, blockingText, setBlockingText,
  addingFor, setAddingFor, newTitle, setNewTitle,
}: {
  step: Step;
  users: UserOpt[];
  canEdit: boolean;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
  blockingOpen: { kind: "step" | "substep"; id: string } | null;
  setBlockingOpen: (v: { kind: "step" | "substep"; id: string } | null) => void;
  blockingText: string;
  setBlockingText: (v: string) => void;
  addingFor: string | null;
  setAddingFor: (v: string | null) => void;
  newTitle: string;
  setNewTitle: (v: string) => void;
}) {
  const isAdding = addingFor === step.id;
  const empty = step.substeps.length === 0;
  const submitAdd = () => {
    const title = newTitle.trim();
    if (!title) return;
    startTransition(async () => {
      await addSubstep(step.id, { title });
      setNewTitle("");
      setAddingFor(null);
    });
  };

  return (
    <div className="ml-8 rounded-xl border border-stone-200 bg-white">
      {empty ? (
        <div className="px-3 py-2 text-[11px] text-stone-400 italic">
          No substeps yet.{canEdit && " Add one below to break this step down (parent status will then roll up)."}
        </div>
      ) : (
        <table className="w-full text-[11px]">
          <thead className="bg-stone-50 text-stone-500 text-[9px] uppercase tracking-widest">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium">Substep</th>
              <th className="text-left px-3 py-1.5 font-medium">Owner</th>
              <th className="text-left px-3 py-1.5 font-medium">Due</th>
              <th className="text-left px-3 py-1.5 font-medium">Status</th>
              {canEdit && <th className="px-2 py-1.5 w-6"></th>}
            </tr>
          </thead>
          <tbody>
            {step.substeps.map((ss) => (
              <tr key={ss.id} className="border-t border-stone-100 align-top">
                <td className="px-3 py-1.5">
                  <div className="font-medium text-stone-800">{ss.title}</div>
                  {ss.description && <div className="text-[10px] text-stone-500 mt-0.5">{ss.description}</div>}
                  {ss.blockingNote && (
                    <div className="text-[10px] text-rose-700 mt-1 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">
                      ⚠ {ss.blockingNote}
                    </div>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  {canEdit ? (
                    <select
                      className="text-[10px] rounded border border-stone-200 bg-white px-1.5 py-0.5"
                      value={ss.ownerUserId ?? ""}
                      onChange={(e) => startTransition(() => { void updateSubstep(ss.id, { ownerUserId: e.target.value || null }); })}
                      disabled={pending}
                    >
                      <option value="">—</option>
                      {users.map((u) => (<option key={u.id} value={u.id}>{u.label}</option>))}
                    </select>
                  ) : (
                    <span className="text-stone-500">{ss.ownerLabel ?? "—"}</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  {canEdit ? (
                    <input
                      type="date"
                      className="text-[10px] rounded border border-stone-200 bg-white px-1.5 py-0.5"
                      defaultValue={ss.dueDate ? ss.dueDate.slice(0, 10) : ""}
                      onBlur={(e) => startTransition(() => { void updateSubstep(ss.id, { dueDate: e.target.value || null }); })}
                      disabled={pending}
                    />
                  ) : (
                    <span className="text-stone-500">{ss.dueDate ? ss.dueDate.slice(0, 10) : "—"}</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <StepChip status={ss.status} />
                    {canEdit && (
                      <select
                        className="text-[10px] rounded border border-stone-200 bg-white px-1.5 py-0.5"
                        value={ss.status}
                        onChange={(e) => {
                          const next = e.target.value as SchoolPlanStepStatusValue;
                          if (next === "blocked") {
                            setBlockingOpen({ kind: "substep", id: ss.id });
                            setBlockingText(ss.blockingNote ?? "");
                            return;
                          }
                          startTransition(() => { void setSubstepStatus(ss.id, next); });
                        }}
                        disabled={pending}
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In progress</option>
                        <option value="done">Done</option>
                        <option value="blocked">Blocked…</option>
                        <option value="not_applicable">N/A</option>
                      </select>
                    )}
                  </div>
                  {blockingOpen?.kind === "substep" && blockingOpen.id === ss.id && (
                    <div className="mt-1.5 space-y-1">
                      <textarea
                        className="w-full text-[10px] rounded border border-stone-200 px-1.5 py-0.5"
                        rows={2}
                        value={blockingText}
                        onChange={(e) => setBlockingText(e.target.value)}
                        placeholder="What's blocking?"
                      />
                      <div className="flex gap-2 text-[10px]">
                        <button
                          className="px-2 py-0.5 rounded bg-rose-600 text-white hover:bg-rose-700"
                          onClick={() => startTransition(() => {
                            void setSubstepStatus(ss.id, "blocked", blockingText).then(() => setBlockingOpen(null));
                          })}
                        >Save block</button>
                        <button className="px-2 py-0.5 text-stone-500 hover:text-stone-800" onClick={() => setBlockingOpen(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </td>
                {canEdit && (
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      className="text-stone-400 hover:text-rose-600 disabled:opacity-50"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`Delete substep "${ss.title}"?`)) return;
                        startTransition(() => { void deleteSubstep(ss.id); });
                      }}
                      title="Delete substep"
                      aria-label={`Delete substep ${ss.title}`}
                    >✕</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canEdit && (
        <div className="border-t border-stone-100 px-3 py-2">
          {isAdding ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => { e.preventDefault(); submitAdd(); }}
            >
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Substep title"
                className="flex-1 text-[11px] rounded border border-stone-200 px-2 py-1"
                disabled={pending}
              />
              <button type="submit" disabled={pending || !newTitle.trim()} className="text-[11px] px-2 py-1 rounded bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50">Add</button>
              <button type="button" onClick={() => { setAddingFor(null); setNewTitle(""); }} className="text-[11px] px-2 py-1 text-stone-500 hover:text-stone-800">Cancel</button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAddingFor(step.id)}
              className="text-[11px] text-sky-700 hover:text-sky-800"
              disabled={pending}
            >
              + Add substep
            </button>
          )}
        </div>
      )}
    </div>
  );
}
