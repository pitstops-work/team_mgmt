// Week ↔ calendar helpers. Week 0 = SeedingConfig.week0Date (22 Jun 2026).
// Everything time-based in the portal is a week number; dates derive from here.

const MS_PER_WEEK = 7 * 86400000;

export function weekToDate(week0: Date, week: number): Date {
  return new Date(week0.getTime() + week * MS_PER_WEEK);
}

/** Whole weeks elapsed since week0 (can be negative before kickoff). */
export function currentWeek(week0: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - week0.getTime()) / MS_PER_WEEK);
}

/** Short label like "W7 · 03 Aug". */
export function weekLabel(week0: Date, week: number | null | undefined): string {
  if (week === null || week === undefined) return "—";
  const d = weekToDate(week0, week);
  const day = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
  return `W${week} · ${day}`;
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Days between now and a target date (negative = past). */
export function daysUntil(target: Date, now: Date = new Date()): number {
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}
