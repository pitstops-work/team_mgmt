// SLA performance helpers used by /api/team-sla and /api/team-overdue.
//
// SLA model:
//   activity  target = scheduledAt   - pitstop.startDate
//   activity  actual = completedAt   - pitstop.startDate
//   checklist target = (earliest-by-createdAt linked activity).scheduledAt
//                                    - pitstop.startDate
//   checklist actual = completedAt   - pitstop.startDate
//   pitstop   target = targetDate    - startDate
//   pitstop   actual = completedAt   - startDate
//   goal      target = targetDate    - startDate
//   goal      actual = closedAt      - startDate
//
// Co-owners are credited equally — a single completion contributes one sample
// to each credited user's average.

export const ROLLING_WINDOW_DAYS = 90;
export const SMALL_N_THRESHOLD = 3;

export type SlaEntity = "goal" | "pitstop" | "checklist" | "activity";
export type SlaMode = "rolling" | "allTime";

export type SlaRow = {
  userId: string;
  userName: string | null;
  designation: string;
  domain: string | null;
  entity: SlaEntity;
  actualAvgDays: number;
  targetAvgDays: number;
  breachDays: number; // actual - target; positive = late
  n: number;
};

export type SlaResponse = {
  mode: SlaMode;
  windowDays: number | null; // null for allTime
  rows: SlaRow[];
};

export function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return ms / 86_400_000;
}

export function creditedUserIds(input: {
  ownerId: string | null;
  coOwnerIds: string[];
}): string[] {
  const set = new Set<string>();
  if (input.ownerId) set.add(input.ownerId);
  for (const id of input.coOwnerIds) set.add(id);
  return [...set];
}

export function rollingCutoff(now = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - ROLLING_WINDOW_DAYS);
  return d;
}

// Two-decimal round, returning 0 for NaN/non-finite to keep clients simple.
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
