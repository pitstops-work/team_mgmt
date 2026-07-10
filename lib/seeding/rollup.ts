import type { SeedingTaskStatus } from "@/app/generated/prisma/client";

type Sub = {
  status: SeedingTaskStatus;
  ownerRole?: string | null;
  supportRoles?: string | null;
  startWeek?: number | null;
  dueWeek?: number | null;
};

/** Aggregate status of a set of sub-tasks: all done → done; any blocked →
 *  blocked; any progress/done → in_progress; else not_started. */
export function rollupStatus(subs: { status: SeedingTaskStatus }[]): SeedingTaskStatus {
  if (subs.length === 0) return "not_started";
  if (subs.every((s) => s.status === "done")) return "done";
  if (subs.some((s) => s.status === "blocked")) return "blocked";
  if (subs.some((s) => s.status === "in_progress" || s.status === "done")) return "in_progress";
  return "not_started";
}

function joinDistinct(vals: (string | null | undefined)[]): string | null {
  const set = [...new Set(vals.map((v) => v?.trim()).filter((v): v is string => !!v))];
  return set.length ? set.join(" / ") : null;
}

/** The full set of task-level fields derived from its sub-tasks. */
export function rollupTaskFields(subs: Sub[]): {
  status: SeedingTaskStatus; ownerRole: string | null; supportRoles: string | null;
  startWeek: number | null; dueWeek: number | null;
} {
  const starts = subs.map((s) => s.startWeek).filter((v): v is number => v != null);
  const dues = subs.map((s) => s.dueWeek).filter((v): v is number => v != null);
  return {
    status: rollupStatus(subs),
    ownerRole: joinDistinct(subs.map((s) => s.ownerRole)),
    supportRoles: joinDistinct(subs.map((s) => s.supportRoles)),
    startWeek: starts.length ? Math.min(...starts) : null,
    dueWeek: dues.length ? Math.max(...dues) : null,
  };
}
