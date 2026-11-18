// Small shared presentational pieces for /urban. No data access here.
import type { EffortPhase } from "@/lib/urban/queries";
import { CHECK_LABEL, type CheckType } from "@/lib/urban/settings";

export const PHASE_LABEL: Record<EffortPhase, string> = {
  setting_up: "Setting up",
  running: "Running",
  ready_to_close: "Ready to close",
  closed: "Closed",
};

const PHASE_STYLE: Record<EffortPhase, string> = {
  setting_up: "bg-amber-50 text-amber-800 ring-amber-200",
  running: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  ready_to_close: "bg-sky-50 text-sky-800 ring-sky-200",
  closed: "bg-stone-100 text-stone-500 ring-stone-200",
};

export function PhaseChip({ phase }: { phase: EffortPhase }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${PHASE_STYLE[phase]}`}>{PHASE_LABEL[phase]}</span>;
}

export function CheckChip({ type }: { type: string }) {
  const label = CHECK_LABEL[type as CheckType] ?? type;
  return <span className="inline-flex shrink-0 items-center rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600">{label}</span>;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-stone-200 bg-white ${className}`}>{children}</div>;
}

export function PageTitle({ title, sub, action }: { title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-stone-500">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-stone-300 bg-white px-4 py-10 text-center text-sm text-stone-500">{children}</div>;
}
