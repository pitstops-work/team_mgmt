"use client";

import { useState, useTransition } from "react";
import { setStepStatus, setStepOwner, setStepDueDate } from "../../actions";
import { StepChip } from "../../_shared";
import type { SchoolPlanStepStatusValue } from "@/lib/schoolPlan/types";

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
};

export default function StepsClient({
  steps,
  users,
  canEdit,
}: {
  steps: Step[];
  users: { id: string; label: string }[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [blockingOpen, setBlockingOpen] = useState<string | null>(null);
  const [blockingText, setBlockingText] = useState("");

  return (
    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-stone-50 text-stone-500 text-[10px] uppercase tracking-widest">
          <tr>
            <th className="text-left px-3 py-2 font-medium">#</th>
            <th className="text-left px-3 py-2 font-medium">Step</th>
            <th className="text-left px-3 py-2 font-medium">Owner</th>
            <th className="text-left px-3 py-2 font-medium">Due</th>
            <th className="text-left px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s) => (
            <tr key={s.id} className="border-t border-stone-100 align-top">
              <td className="px-3 py-2 text-stone-500 whitespace-nowrap">
                {s.stepNo}
                {s.planSection && <span className="ml-1 text-[9px] text-stone-400">§{s.planSection}</span>}
              </td>
              <td className="px-3 py-2">
                <div className="font-medium text-stone-800">{s.title}</div>
                <div className="text-[11px] text-stone-500 mt-0.5">{s.description}</div>
                {s.requiredArtifactType && (
                  <div className="text-[10px] text-stone-400 mt-0.5">requires artefact · {s.requiredArtifactType}</div>
                )}
                {s.blockingNote && (
                  <div className="text-[11px] text-rose-700 mt-1 bg-rose-50 border border-rose-200 rounded px-2 py-1">
                    ⚠ {s.blockingNote}
                  </div>
                )}
              </td>
              <td className="px-3 py-2">
                {canEdit ? (
                  <select
                    className="text-[11px] rounded-lg border border-stone-200 bg-white px-2 py-1"
                    value={s.ownerUserId ?? ""}
                    onChange={(e) => startTransition(() => {
                      void setStepOwner(s.id, e.target.value || null);
                    })}
                    disabled={pending}
                  >
                    <option value="">—</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.label}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-stone-500">{s.ownerLabel ?? "—"}</span>
                )}
              </td>
              <td className="px-3 py-2">
                {canEdit ? (
                  <input
                    type="date"
                    className="text-[11px] rounded-lg border border-stone-200 bg-white px-2 py-1"
                    defaultValue={s.dueDate ? s.dueDate.slice(0, 10) : ""}
                    onBlur={(e) => startTransition(() => {
                      void setStepDueDate(s.id, e.target.value || null);
                    })}
                    disabled={pending}
                  />
                ) : (
                  <span className="text-stone-500">{s.dueDate ? s.dueDate.slice(0, 10) : "—"}</span>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <StepChip status={s.status} />
                  {canEdit && (
                    <select
                      className="text-[11px] rounded-lg border border-stone-200 bg-white px-2 py-1"
                      value={s.status}
                      onChange={(e) => {
                        const next = e.target.value as SchoolPlanStepStatusValue;
                        if (next === "blocked") {
                          setBlockingOpen(s.id);
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
                </div>
                {blockingOpen === s.id && (
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
