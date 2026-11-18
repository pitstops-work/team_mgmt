// The ONE date helper for Urban Operations (spec rule R2). Every "today",
// "this week", "this month" and due date in /urban goes through here, and the
// uo_effort_status view uses the same rule (IST calendar date).
//
// Dates are carried as "YYYY-MM-DD" strings in IST. A Postgres DATE column
// round-trips through Prisma as UTC midnight of that day, so `toDb` / `fromDb`
// convert at the boundary and nothing else ever touches a Date's time part.
//
// Pure and dependency-free: safe in client components.

export const TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 330 * 60 * 1000;

export type Ymd = string; // "2026-11-16"

/** The IST calendar date of an instant. */
export function istDate(at: Date = new Date()): Ymd {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Today, in IST. */
export function todayIST(now: Date = new Date()): Ymd {
  return istDate(now);
}

/** A Ymd → the value to store in a @db.Date column. */
export function toDb(ymd: Ymd): Date {
  assertYmd(ymd);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** A @db.Date column value → Ymd. */
export function fromDb(d: Date): Ymd {
  return d.toISOString().slice(0, 10);
}

export function addDays(ymd: Ymd, n: number): Ymd {
  const d = toDb(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDb(d);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: Ymd, b: Ymd): number {
  return Math.round((toDb(b).getTime() - toDb(a).getTime()) / 86_400_000);
}

export function isOverdue(due: Ymd | null, today: Ymd = todayIST()): boolean {
  return !!due && due < today;
}

// ── Routine periods (spec §4.1) ────────────────────────────────────────────

export type Cadence = "weekly" | "fortnightly" | "monthly";
export type Period = { key: string; start: Ymd; end: Ymd };

/** The period a date falls in. Weekly = ISO week (Mon–Sun); fortnightly = 1–15 / 16–end; monthly = calendar month. */
export function periodFor(cadence: Cadence, ymd: Ymd): Period {
  const [y, m, d] = ymd.split("-").map(Number);
  const ym = `${y}-${String(m).padStart(2, "0")}`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (cadence === "monthly") {
    return { key: ym, start: `${ym}-01`, end: `${ym}-${lastDay}` };
  }
  if (cadence === "fortnightly") {
    return d <= 15
      ? { key: `${ym}-A`, start: `${ym}-01`, end: `${ym}-15` }
      : { key: `${ym}-B`, start: `${ym}-16`, end: `${ym}-${lastDay}` };
  }
  // ISO week: Monday start; the week belongs to the year of its Thursday.
  const date = toDb(ymd);
  const dow = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const start = addDays(ymd, -dow);
  const end = addDays(start, 6);
  const thursday = toDb(addDays(start, 3));
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week1Monday = addDays(fromDb(jan4), -((jan4.getUTCDay() + 6) % 7));
  const week = Math.floor(daysBetween(week1Monday, start) / 7) + 1;
  return { key: `${isoYear}-W${String(week).padStart(2, "0")}`, start, end };
}

// ── Display ────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "16 Nov" — or "16 Nov 2027" when not this year. */
export function formatDay(ymd: Ymd, today: Ymd = todayIST()): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${String(y) === today.slice(0, 4) ? "" : ` ${y}`}`;
}

/** "in 3 days" / "today" / "2 days overdue". */
export function relativeDue(due: Ymd, today: Ymd = todayIST()): string {
  const n = daysBetween(today, due);
  if (n === 0) return "due today";
  if (n === 1) return "due tomorrow";
  if (n > 1) return `due in ${n} days`;
  return n === -1 ? "1 day overdue" : `${-n} days overdue`;
}

function assertYmd(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Not a YYYY-MM-DD date: ${s}`);
}
