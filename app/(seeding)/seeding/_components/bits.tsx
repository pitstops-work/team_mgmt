import type { SeedingTaskStatus } from "@/app/generated/prisma/client";
import { STATUS_META } from "../_lib/status";

export function StatusChip({ status }: { status: SeedingTaskStatus }) {
  const m = STATUS_META[status];
  return <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${m.chip}`}>{m.label}</span>;
}

export function ProgressBar({ pct, color = "bg-emerald-500", hex }: { pct: number; color?: string; hex?: string }) {
  const width = `${Math.max(0, Math.min(100, pct))}%`;
  return (
    <div className="h-1.5 w-full rounded-full bg-stone-100 overflow-hidden">
      {hex
        ? <div className="h-full rounded-full" style={{ width, backgroundColor: hex }} />
        : <div className={`h-full rounded-full ${color}`} style={{ width }} />}
    </div>
  );
}

/** Small labelled stat used on the dashboard. */
export function Stat({ label, value, sub, tone = "stone" }: { label: string; value: string; sub?: string; tone?: "stone" | "sky" | "emerald" | "amber" | "rose" }) {
  const tones: Record<string, string> = {
    stone: "text-stone-900", sky: "text-sky-700", emerald: "text-emerald-700", amber: "text-amber-700", rose: "text-rose-700",
  };
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-stone-400">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-stone-400 mt-0.5">{sub}</div>}
    </div>
  );
}
