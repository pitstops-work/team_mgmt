"use client";

// A list of tasks (setup items, session items or follow-ups) that can be worked:
// complete through the task's own check, reopen / skip / reschedule with a
// reason, raise a follow-up. Every action goes to a server action that
// re-checks permission and validates (app/(urban)/urban/work-actions.ts).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, X } from "lucide-react";
import type { CheckContext, TaskView } from "@/lib/urban/queries";
import type { CompleteInput } from "@/lib/urban/work";
import { CHECK_LABEL, type CheckType } from "@/lib/urban/settings";
import { addDays, formatDay, isOverdue, relativeDue } from "@/lib/urban/time";
import { completeTaskAction, undoTaskAction, skipTaskAction, rescheduleTaskAction, addFollowupAction } from "../work-actions";
import { CheckPanel, EvidenceList } from "./CheckPanels";

const DO_LABEL: Record<string, string> = {
  tick: "Mark done", note: "Add note", number: "Enter figures", rating: "Rate", observation: "Observe", voice: "Record", photo: "Add photo",
};

type Modal =
  | { kind: "complete"; task: TaskView }
  | { kind: "reschedule"; task: TaskView }
  | { kind: "skip"; task: TaskView }
  | { kind: "reopen"; task: TaskView }
  | { kind: "followup"; task: TaskView | null };

export function TaskList({ tasks, check, canWork, today, effortId, empty }: {
  tasks: TaskView[]; check: CheckContext; canWork: boolean; today: string; effortId: string; empty?: string;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal | null>(null);
  // Re-resolve the open task from fresh props, so a just-uploaded voice note shows up.
  const live = modal && "task" in modal && modal.task ? tasks.find((t) => t.id === modal.task!.id) ?? modal.task : null;

  if (!tasks.length) return empty ? <p className="px-4 py-3 text-sm text-stone-500">{empty}</p> : null;
  return (
    <>
      <ul className="divide-y divide-stone-50">
        {tasks.map((t) => <Row key={t.id} t={t} today={today} canWork={canWork} check={check} open={setModal} />)}
      </ul>
      {modal && (
        <Sheet title={modalTitle(modal, live)} onClose={() => setModal(null)}>
          {modal.kind === "complete" && live && <Complete task={live} check={check} onDone={() => { setModal(null); router.refresh(); }} onEvidence={() => router.refresh()} />}
          {modal.kind === "reschedule" && live && <Reason task={live} label="Move to" withDate today={today} action={(r, d) => rescheduleTaskAction(live.id, d!, r)} onDone={() => { setModal(null); router.refresh(); }} />}
          {modal.kind === "skip" && live && <Reason task={live} label="Skip" action={(r) => skipTaskAction(live.id, r)} onDone={() => { setModal(null); router.refresh(); }} />}
          {modal.kind === "reopen" && live && <Reason task={live} label="Reopen" action={(r) => undoTaskAction(live.id, r)} onDone={() => { setModal(null); router.refresh(); }} />}
          {modal.kind === "followup" && <FollowupForm effortId={effortId} source={live} today={today} onDone={() => { setModal(null); router.refresh(); }} />}
        </Sheet>
      )}
    </>
  );
}

function modalTitle(m: Modal, t: TaskView | null): string {
  if (m.kind === "followup") return t ? `Follow-up from: ${t.title}` : "New follow-up";
  const verb = { complete: "", reschedule: "Reschedule: ", skip: "Skip: ", reopen: "Reopen: " }[m.kind];
  return `${verb}${t?.title ?? ""}`;
}

function Row({ t, today, canWork, check, open }: { t: TaskView; today: string; canWork: boolean; check: CheckContext; open: (m: Modal) => void }) {
  const [menu, setMenu] = useState(false);
  const isOpen = t.status === "open";
  const overdue = isOpen && isOverdue(t.due, today);
  return (
    <li className="px-4 py-2.5">
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${t.status === "done" ? "bg-emerald-500" : t.status === "skipped" ? "bg-stone-300" : overdue ? "bg-red-500" : "border border-stone-400"}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${isOpen ? "text-stone-800" : "text-stone-400"} ${t.status === "skipped" ? "line-through" : ""}`}>
            {t.title}
            {!t.required && <span className="ml-1.5 text-[10px] text-stone-400">optional</span>}
            {t.who === "partner" && <span className="ml-1.5 rounded bg-violet-50 px-1 py-0.5 text-[10px] font-medium text-violet-700">partner</span>}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600">{CHECK_LABEL[t.checkType as CheckType] ?? t.checkType}</span>
            {isOpen && t.due && <span className={overdue ? "font-medium text-red-600" : "text-stone-500"}>{formatDay(t.due, today)} · {relativeDue(t.due, today)}{t.dueSource === "manual" ? " · rescheduled" : ""}</span>}
            {t.status === "done" && <span className="text-stone-400">done{t.doneBy ? ` by ${t.doneBy}` : ""}{t.doneAt ? ` · ${new Date(t.doneAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}` : ""}</span>}
            {t.status === "skipped" && <span className="text-stone-400">skipped</span>}
            {t.sourceTitle && <span className="text-stone-400">from “{t.sourceTitle}”</span>}
          </div>
          {!isOpen && <ResultSummary t={t} check={check} />}
          {isOpen && t.evidence.length > 0 && <div className="mt-1"><EvidenceList evidence={t.evidence} /></div>}
        </div>
        {canWork && (
          <div className="relative flex shrink-0 items-center gap-1">
            {isOpen ? (
              <button onClick={() => open({ kind: "complete", task: t })} className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50">{DO_LABEL[t.checkType] ?? "Do"}</button>
            ) : (
              <button onClick={() => open({ kind: "reopen", task: t })} className="text-xs text-stone-400 hover:text-stone-700">Reopen</button>
            )}
            <button onClick={() => setMenu((m) => !m)} aria-label="More" className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"><MoreHorizontal size={15} /></button>
            {menu && (
              <div className="absolute right-0 top-7 z-20 w-44 rounded-lg border border-stone-200 bg-white py-1 text-sm shadow-lg" onMouseLeave={() => setMenu(false)}>
                {isOpen && <MenuItem onClick={() => { setMenu(false); open({ kind: "reschedule", task: t }); }}>Reschedule…</MenuItem>}
                {isOpen && <MenuItem onClick={() => { setMenu(false); open({ kind: "skip", task: t }); }}>Skip…</MenuItem>}
                <MenuItem onClick={() => { setMenu(false); open({ kind: "followup", task: t }); }}>Raise a follow-up…</MenuItem>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="block w-full px-3 py-1.5 text-left text-stone-700 hover:bg-stone-50">{children}</button>;
}

/** What was recorded, shown under a done task. */
function ResultSummary({ t, check }: { t: TaskView; check: CheckContext }) {
  const r = (t.result ?? {}) as { note?: string; values?: Record<string, number>; score?: { ok: number; rated: number; total: number }; marks?: Record<string, string>; gaps?: number; escalated?: number; reading?: string };
  const bits: React.ReactNode[] = [];
  if (r.values) {
    const per = t.checkConfig?.per ? check.dimensions[t.checkConfig.per] ?? [] : [];
    const label = (k: string) => (k === "_" ? "" : per.find((d) => d.key === k)?.label ?? k);
    bits.push(<span key="v">{Object.entries(r.values).map(([k, v]) => (label(k) ? `${label(k)}: ${v}` : String(v))).join(" · ")}{r.reading && check.readings[r.reading]?.unit ? ` ${check.readings[r.reading].unit}` : ""}</span>);
  }
  if (r.score) {
    const fails = Object.values(r.marks ?? {}).filter((m) => m === "fail").length;
    bits.push(<span key="s">{r.score.ok}/{r.score.total} OK{fails ? <b className="ml-1 font-medium text-red-600">{fails} not OK</b> : null}</span>);
  }
  if (r.gaps !== undefined) bits.push(<span key="o">{r.gaps || r.escalated ? `${r.gaps} gap${r.gaps === 1 ? "" : "s"}, ${r.escalated} escalated` : "all practices fine"}</span>);
  if (r.note) bits.push(<span key="n" className="italic">“{r.note}”</span>);
  if (!bits.length && !t.evidence.length) return null;
  return (
    <div className="mt-1 space-y-1 text-xs text-stone-600">
      {bits.length > 0 && <p className="flex flex-wrap gap-x-3">{bits}</p>}
      <EvidenceList evidence={t.evidence} />
    </div>
  );
}

// ── Modals ─────────────────────────────────────────────────────────────────

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-stone-900">{title}</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600" aria-label="Close"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null;
}

function Complete({ task, check, onDone, onEvidence }: { task: TaskView; check: CheckContext; onDone: () => void; onEvidence: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submit = (input: CompleteInput) => start(async () => {
    const r = await completeTaskAction(task.id, input);
    if (!r.ok) return setError(r.error);
    onDone();
  });
  return (
    <div>
      {task.checkConfig?.hint && <p className="mb-2 text-xs text-stone-500">{task.checkConfig.hint}</p>}
      <CheckPanel task={task} check={check} pending={pending} onSubmit={submit} onEvidenceAdded={onEvidence} />
      <ErrorLine error={error} />
    </div>
  );
}

function Reason({ task, label, withDate, today, action, onDone }: {
  task: TaskView; label: string; withDate?: boolean; today?: string;
  action: (reason: string, date?: string) => Promise<{ ok: boolean; error?: string }>; onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  // A week after whichever is later — the current due date or today — so the default is always a real move.
  const [date, setDate] = useState(today ? addDays(task.due && task.due > today ? task.due : today, 7) : "");
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await action(reason, withDate ? date : undefined); if (!r.ok) return setError(r.error ?? "Failed"); onDone(); }); }} className="space-y-3">
      {withDate && (
        <label className="block text-sm text-stone-700">
          New due date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        </label>
      )}
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required — it goes in the history)" rows={3} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500" />
      <div className="flex justify-end">
        <button disabled={pending || !reason.trim() || (withDate && !date)} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{pending ? "Saving…" : label}</button>
      </div>
      <ErrorLine error={error} />
    </form>
  );
}

export function FollowupForm({ effortId, source, today, onDone }: { effortId: string; source: TaskView | null; today: string; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [who, setWho] = useState<"us" | "partner">("partner");
  const [due, setDue] = useState(addDays(today, 7));
  return (
    <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await addFollowupAction(effortId, { title, who, due, sourceTaskId: source?.id ?? null }); if (!r.ok) return setError(r.error); onDone(); }); }} className="space-y-3">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to happen?" autoFocus className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500" />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-stone-300 text-sm">
          {(["partner", "us"] as const).map((w) => (
            <button key={w} type="button" onClick={() => setWho(w)} className={`px-3 py-1.5 ${who === w ? "bg-stone-900 text-white" : "bg-white text-stone-600"}`}>{w === "partner" ? "Partner's action" : "Our action"}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-600">Due <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded-lg border border-stone-300 px-2 py-1.5 text-sm" /></label>
      </div>
      <div className="flex justify-end">
        <button disabled={pending || !title.trim()} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{pending ? "Saving…" : "Raise follow-up"}</button>
      </div>
      <ErrorLine error={error} />
    </form>
  );
}

/** "Raise a follow-up" button for an effort's follow-ups section. */
export function NewFollowupButton({ effortId, today }: { effortId: string; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50">+ Follow-up</button>
      {open && (
        <Sheet title="New follow-up" onClose={() => setOpen(false)}>
          <FollowupForm effortId={effortId} source={null} today={today} onDone={() => { setOpen(false); router.refresh(); }} />
        </Sheet>
      )}
    </>
  );
}
