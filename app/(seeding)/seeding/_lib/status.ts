import type { SeedingTaskStatus } from "@/app/generated/prisma/client";

export const STATUS_META: Record<SeedingTaskStatus, { label: string; chip: string; dot: string }> = {
  not_started: { label: "Not started", chip: "bg-stone-100 text-stone-500", dot: "bg-stone-300" },
  in_progress: { label: "In progress", chip: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  blocked:     { label: "Blocked",     chip: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
  done:        { label: "Done",        chip: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
};

export const STATUS_ORDER: SeedingTaskStatus[] = ["not_started", "in_progress", "blocked", "done"];

export function progressPct(counts: Partial<Record<SeedingTaskStatus, number>>): number {
  const total = STATUS_ORDER.reduce((s, k) => s + (counts[k] ?? 0), 0);
  if (!total) return 0;
  return Math.round(((counts.done ?? 0) / total) * 100);
}
