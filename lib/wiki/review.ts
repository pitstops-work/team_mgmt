export const REVIEW_CADENCE_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export function nextReviewFromNow(from: Date = new Date()): Date {
  return new Date(from.getTime() + REVIEW_CADENCE_DAYS * DAY_MS);
}

export function daysOverdue(nextReviewDue: Date | null, now: Date = new Date()): number {
  if (!nextReviewDue) return 0;
  const diff = now.getTime() - new Date(nextReviewDue).getTime();
  return diff <= 0 ? 0 : Math.floor(diff / DAY_MS);
}
