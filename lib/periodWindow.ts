/**
 * Shared period-window math for the Team Report (single window) and the
 * Operations Progress (current + prior comparison) views.
 *
 * The "window" is a named span over which to count completions. For
 * comparison views (ops-progress) we also derive a prior window of equal
 * duration immediately preceding the current one, so deltas are honest.
 *
 * All math runs in the server's local TZ — the app is deployed to a single
 * region and field ops are scheduled in IST. Day-boundary semantics intentionally
 * follow `new Date()` (system tz). If we ever multi-region, swap to luxon/dayjs
 * with explicit Asia/Kolkata.
 */

export type WindowKey =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "last_7d"
  | "last_15d"
  | "last_30d"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "custom";

export type WindowRange = {
  /** ISO start, inclusive. */
  from: Date;
  /** ISO end, exclusive (… < to). */
  to: Date;
  /** Label suitable for UI. */
  label: string;
};

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function startOfWeekMon(d: Date): Date {
  // Mon-anchored ISO week (matches the visits planner & cluster-day rules).
  const r = startOfDay(d);
  const dow = (r.getDay() + 6) % 7; // 0=Mon ... 6=Sun
  return addDays(r, -dow);
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1, 0, 0, 0, 0);
}

/**
 * Parse a window key + optional explicit range into a `WindowRange`.
 * `custom` requires both `customFrom` and `customTo` (YYYY-MM-DD); both are
 * inclusive day boundaries.
 */
export function resolveWindow(opts: {
  key: WindowKey;
  customFrom?: string | null;
  customTo?: string | null;
  /** Inject "now" for tests; defaults to new Date(). */
  now?: Date;
}): WindowRange {
  const now = opts.now ?? new Date();
  switch (opts.key) {
    case "today": {
      const from = startOfDay(now);
      const to = endOfDay(now);
      return { from, to, label: "Today" };
    }
    case "yesterday": {
      const y = addDays(now, -1);
      return { from: startOfDay(y), to: endOfDay(y), label: "Yesterday" };
    }
    case "this_week": {
      const from = startOfWeekMon(now);
      return { from, to: endOfDay(now), label: "This week" };
    }
    case "last_week": {
      const thisWeek = startOfWeekMon(now);
      const from = addDays(thisWeek, -7);
      const to = new Date(thisWeek.getTime() - 1);
      return { from, to, label: "Last week" };
    }
    case "last_7d": {
      const to = endOfDay(now);
      const from = startOfDay(addDays(now, -6));
      return { from, to, label: "Last 7 days" };
    }
    case "last_15d": {
      const to = endOfDay(now);
      const from = startOfDay(addDays(now, -14));
      return { from, to, label: "Last 15 days" };
    }
    case "last_30d": {
      const to = endOfDay(now);
      const from = startOfDay(addDays(now, -29));
      return { from, to, label: "Last 30 days" };
    }
    case "this_month": {
      const from = startOfMonth(now);
      return { from, to: endOfDay(now), label: "This month" };
    }
    case "last_month": {
      const thisMo = startOfMonth(now);
      const lastMo = new Date(thisMo.getFullYear(), thisMo.getMonth() - 1, 1);
      const lastMoEnd = new Date(thisMo.getTime() - 1);
      return { from: lastMo, to: lastMoEnd, label: "Last month" };
    }
    case "this_quarter": {
      const from = startOfQuarter(now);
      return { from, to: endOfDay(now), label: "This quarter" };
    }
    case "custom": {
      if (!opts.customFrom || !opts.customTo) {
        throw new Error("`custom` window requires customFrom + customTo (YYYY-MM-DD)");
      }
      const [fy, fm, fd] = opts.customFrom.split("-").map(Number);
      const [ty, tm, td] = opts.customTo.split("-").map(Number);
      const from = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
      const to = new Date(ty, tm - 1, td, 23, 59, 59, 999);
      return { from, to, label: `${opts.customFrom} → ${opts.customTo}` };
    }
  }
}

/**
 * Build the immediately-preceding window of equal duration. For "this_week"
 * the prior is "last_week"; for "last_7d" the prior is the 7 days before that.
 * For named monthly/quarterly windows we prefer prior named period (more
 * intuitive than "last_30d" math). For custom: same duration before.
 */
export function priorWindow(current: WindowRange, key: WindowKey, opts?: { now?: Date }): WindowRange {
  const now = opts?.now ?? new Date();
  switch (key) {
    case "today":       { const y = addDays(now, -1); return { from: startOfDay(y), to: endOfDay(y), label: "Yesterday" }; }
    case "yesterday":   { const dby = addDays(now, -2); return { from: startOfDay(dby), to: endOfDay(dby), label: "Day before" }; }
    case "this_week":   return resolveWindow({ key: "last_week", now });
    case "last_week":   {
      const lastWk = startOfWeekMon(addDays(now, -7));
      const from = addDays(lastWk, -7);
      const to = new Date(lastWk.getTime() - 1);
      return { from, to, label: "Week before last" };
    }
    case "this_month":  return resolveWindow({ key: "last_month", now });
    case "last_month":  {
      const lastMo = new Date(startOfMonth(now).getFullYear(), startOfMonth(now).getMonth() - 1, 1);
      const monthBefore = new Date(lastMo.getFullYear(), lastMo.getMonth() - 1, 1);
      const monthBeforeEnd = new Date(lastMo.getTime() - 1);
      return { from: monthBefore, to: monthBeforeEnd, label: "Month before last" };
    }
    case "this_quarter": {
      const thisQ = startOfQuarter(now);
      const prevQ = new Date(thisQ.getFullYear(), thisQ.getMonth() - 3, 1);
      const prevQEnd = new Date(thisQ.getTime() - 1);
      return { from: prevQ, to: prevQEnd, label: "Last quarter" };
    }
    // Trailing windows + custom: same duration immediately before `from`.
    case "last_7d":
    case "last_15d":
    case "last_30d":
    case "custom": {
      const span = current.to.getTime() - current.from.getTime();
      const to = new Date(current.from.getTime() - 1);
      const from = new Date(to.getTime() - span);
      return { from, to, label: "Prior window" };
    }
  }
}

/**
 * Split a window into N roughly-equal buckets for sparkline rendering.
 * Default 7 buckets keeps the spark short and readable. Returns the bucket
 * boundaries as `{ from, to }` ranges — caller does the counting.
 */
export function bucketWindow(range: WindowRange, n = 7): WindowRange[] {
  const total = range.to.getTime() - range.from.getTime();
  const size = total / n;
  const out: WindowRange[] = [];
  for (let i = 0; i < n; i++) {
    const from = new Date(range.from.getTime() + i * size);
    const to = new Date(range.from.getTime() + (i + 1) * size - 1);
    out.push({ from, to, label: "" });
  }
  return out;
}

export const ALL_WINDOW_KEYS: WindowKey[] = [
  "today", "yesterday",
  "this_week", "last_week",
  "last_7d", "last_15d", "last_30d",
  "this_month", "last_month",
  "this_quarter",
  "custom",
];
