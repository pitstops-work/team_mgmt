/**
 * Shared bucketing + late-day math for the Accountability tab (Home → Leader)
 * and its drill-down endpoints. Both the top-level /api/team-accountability
 * route and the per-entity tree endpoints (goal/pitstop/activity drill) emit
 * rows in the same shape and bucket them with the same rules — so the UI
 * doesn't have to special-case anything.
 *
 * Canonical due field per entity is documented on the top-level route; this
 * file only owns the post-query bucketing.
 */

export type AccountabilityEntity = "goal" | "pitstop" | "checklist" | "activity" | "followup";

export type StatusBucket = "done_on_time" | "done_late" | "open_past_due" | "open";

/** Done semantics differ per entity. Centralised so drill endpoints agree. */
export function isDoneStatus(entity: AccountabilityEntity, raw: string): boolean {
  if (entity === "goal")     return raw === "Complete";
  if (entity === "followup") return raw === "done";
  return raw === "Done";
}

export function startOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Days the row is late (done after due) or overdue (still open past due). */
export function computeDaysLate(bucket: StatusBucket, dueAt: Date, completedAt: Date | null, now: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  if (bucket === "done_late" && completedAt) {
    return Math.max(0, Math.floor((completedAt.getTime() - dueAt.getTime()) / MS));
  }
  if (bucket === "open_past_due") {
    return Math.max(0, Math.floor((startOfToday(now).getTime() - dueAt.getTime()) / MS));
  }
  return 0;
}

export function bucketize(args: {
  entity: AccountabilityEntity;
  rawStatus: string;
  dueAt: Date;
  completedAt: Date | null;
  now?: Date;
}): { status: StatusBucket; daysLate: number } {
  const now = args.now ?? new Date();
  const done = isDoneStatus(args.entity, args.rawStatus);
  let status: StatusBucket;
  if (done && args.completedAt) {
    status = args.completedAt.getTime() <= args.dueAt.getTime() ? "done_on_time" : "done_late";
  } else {
    status = args.dueAt.getTime() < startOfToday(now).getTime() ? "open_past_due" : "open";
  }
  return { status, daysLate: computeDaysLate(status, args.dueAt, args.completedAt, now) };
}
