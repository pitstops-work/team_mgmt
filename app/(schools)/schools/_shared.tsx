// Shared presentation bits (server-safe — no client state).

import type { SchoolPlanStepStatusValue, SchoolPlanStatusValue } from "@/lib/schoolPlan/types";

const STEP_STATUS_META: Record<SchoolPlanStepStatusValue, { label: string; className: string }> = {
  pending:        { label: "Pending",     className: "bg-stone-100 text-stone-700 border-stone-200" },
  in_progress:    { label: "In progress", className: "bg-amber-50 text-amber-800 border-amber-200" },
  done:           { label: "Done",        className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  blocked:        { label: "Blocked",     className: "bg-rose-50 text-rose-800 border-rose-200" },
  not_applicable: { label: "N/A",         className: "bg-stone-50 text-stone-400 border-stone-200" },
};

export function StepChip({ status }: { status: SchoolPlanStepStatusValue }) {
  const m = STEP_STATUS_META[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${m.className}`}>
      {m.label}
    </span>
  );
}

const PLAN_STATUS_META: Record<SchoolPlanStatusValue, { label: string; className: string }> = {
  draft:      { label: "Draft",     className: "bg-stone-100 text-stone-700 border-stone-200" },
  for_review: { label: "For review", className: "bg-amber-50 text-amber-800 border-amber-200" },
  approved:   { label: "Approved",  className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
};

export function PlanStatusChip({ status }: { status: SchoolPlanStatusValue }) {
  const m = PLAN_STATUS_META[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${m.className}`}>
      {m.label}
    </span>
  );
}

export function ProgressBar({ pct, colorClass = "bg-sky-500" }: { pct: number; colorClass?: string }) {
  const w = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
      <div className={`h-full ${colorClass}`} style={{ width: `${w}%` }} />
    </div>
  );
}

export function DeviationChip({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-[10px] text-stone-400">— no standard —</span>;
  }
  const abs = Math.abs(pct);
  const over = abs > 10;
  const cls = over
    ? "bg-amber-50 text-amber-800 border-amber-200"
    : "bg-emerald-50 text-emerald-800 border-emerald-200";
  const sign = pct >= 0 ? "+" : "";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {over && <span className="text-amber-600" aria-hidden>⚠</span>}
      {sign}{pct.toFixed(1)}% vs standard
    </span>
  );
}

/** ₹ formatting with lakh/Cr Indian convention. */
export function inr(rupees: number): string {
  const abs = Math.abs(rupees);
  if (abs >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000)   return `₹${(rupees / 1_00_000).toFixed(2)} L`;
  return `₹${rupees.toLocaleString("en-IN")}`;
}

export function Placeholder({ label }: { label: string }) {
  return <span className="italic text-stone-400 text-xs">— {label} —</span>;
}
