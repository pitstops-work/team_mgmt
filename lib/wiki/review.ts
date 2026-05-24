export const REVIEW_CADENCE_DAYS = 90;
export const OWNER_TERM_MONTHS = 6;

const DAY_MS = 24 * 60 * 60 * 1000;

export function nextReviewFromNow(from: Date = new Date()): Date {
  return new Date(from.getTime() + REVIEW_CADENCE_DAYS * DAY_MS);
}

export function daysOverdue(nextReviewDue: Date | null, now: Date = new Date()): number {
  if (!nextReviewDue) return 0;
  const diff = now.getTime() - new Date(nextReviewDue).getTime();
  return diff <= 0 ? 0 : Math.floor(diff / DAY_MS);
}

export function nextOwnerTermEnd(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + OWNER_TERM_MONTHS);
  return d;
}

export function daysUntil(target: Date | null, now: Date = new Date()): number {
  if (!target) return Infinity;
  const diff = new Date(target).getTime() - now.getTime();
  return Math.ceil(diff / DAY_MS);
}
