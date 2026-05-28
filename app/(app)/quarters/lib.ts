// Shared types + helpers for the Quarters dashboard.

export type ActivityData = {
  id: string; title: string; status: string; scheduledAt: string; type: string;
};
export type ChecklistItemData = {
  id: string; text: string; status: string; completionType: string; order: number;
  activities: ActivityData[];
};
export type PitstopData = {
  id: string; title: string; status: string;
  targetDate: string | null; startDate: string | null; progressTag: string | null;
  checklistTotal: number; checklistDone: number;
  activityCount: number; activityDoneCount: number;
  checklistItems: ChecklistItemData[];
};
export type GeoRef = { id: string; name: string };
export type GoalData = {
  id: string; title: string; status: string; targetDate: string | null;
  needsDomain: string | null;
  owner: { id: string; name: string | null };
  needsCity: GeoRef | null;
  needsZone: GeoRef | null;
  needsCluster: GeoRef | null;
  needsSettlement: GeoRef | null;
  pitstops: PitstopData[];
};

// ── Indian FY quarter helpers ──────────────────────────────────────────────

export function fyQuarter(date: Date): { fyYear: number; q: number } {
  const m = date.getMonth();
  if (m >= 3 && m <= 5) return { fyYear: date.getFullYear(), q: 1 };
  if (m >= 6 && m <= 8) return { fyYear: date.getFullYear(), q: 2 };
  if (m >= 9)           return { fyYear: date.getFullYear(), q: 3 };
  return { fyYear: date.getFullYear() - 1, q: 4 };
}

export function quarterBounds(fyYear: number, q: number): { start: Date; end: Date } {
  if (q === 1) return { start: new Date(fyYear, 3, 1),     end: new Date(fyYear, 5, 30, 23, 59, 59) };
  if (q === 2) return { start: new Date(fyYear, 6, 1),     end: new Date(fyYear, 8, 30, 23, 59, 59) };
  if (q === 3) return { start: new Date(fyYear, 9, 1),     end: new Date(fyYear, 11, 31, 23, 59, 59) };
  return       { start: new Date(fyYear + 1, 0, 1),        end: new Date(fyYear + 1, 2, 31, 23, 59, 59) };
}

// month index within a quarter (0/1/2 → first/second/third month of the quarter)
export function quarterMonths(fyYear: number, q: number): { idx: number; start: Date; end: Date; label: string }[] {
  const base = quarterBounds(fyYear, q).start;
  const out: { idx: number; start: Date; end: Date; label: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const start = new Date(base.getFullYear(), base.getMonth() + i, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);
    out.push({
      idx: i,
      start,
      end,
      label: start.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
    });
  }
  return out;
}

export const Q_LABELS = ["Apr–Jun", "Jul–Sep", "Oct–Dec", "Jan–Mar"];
export function qKey(fyYear: number, q: number)     { return `${fyYear}-${q}`; }
export function qSortKey(fyYear: number, q: number) { return q === 4 ? (fyYear + 1) * 10 : fyYear * 10 + q; }

// ── SLA bucketing ──────────────────────────────────────────────────────────

export type SlaBucket = "red" | "amber" | "green";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Red = overdue and not Done.
// Amber = due within next 7 days (not Done) OR completed late.
// Green = everything else (future + not-yet-due, or done on time).
export function pitstopSla(p: PitstopData, today: Date): SlaBucket {
  if (!p.targetDate) return "green";
  const t = new Date(p.targetDate).getTime();
  const isDone = p.status === "Done";
  if (isDone) {
    // We don't carry completedAt here, so use targetDate vs today as a proxy:
    // if it was Done after the targetDate passed, we can't tell from this payload.
    // Default Done → green; the list view drilldown surfaces real completion data.
    return "green";
  }
  if (t < today.getTime()) return "red";
  if (t - today.getTime() <= WEEK_MS) return "amber";
  return "green";
}

export type SlaMix = { red: number; amber: number; green: number; total: number };

export function slaMix(pitstops: PitstopData[], today: Date): SlaMix {
  const mix: SlaMix = { red: 0, amber: 0, green: 0, total: 0 };
  for (const p of pitstops) {
    mix[pitstopSla(p, today)]++;
    mix.total++;
  }
  return mix;
}

// ── Quarter/month bucketing ────────────────────────────────────────────────

// All pitstops whose targetDate falls in [start, end]
export function pitstopsInRange(goals: GoalData[], start: Date, end: Date): PitstopData[] {
  const out: PitstopData[] = [];
  const s = start.getTime(), e = end.getTime();
  for (const g of goals) {
    for (const p of g.pitstops) {
      if (!p.targetDate) continue;
      const t = new Date(p.targetDate).getTime();
      if (t >= s && t <= e) out.push(p);
    }
  }
  return out;
}

// Goal→pitstops map for a date window; used by the list view + tiles.
export function goalsInRange(goals: GoalData[], start: Date, end: Date): { goal: GoalData; pitstops: PitstopData[] }[] {
  const s = start.getTime(), e = end.getTime();
  const out: { goal: GoalData; pitstops: PitstopData[] }[] = [];
  for (const g of goals) {
    const ps = g.pitstops.filter(p => {
      if (!p.targetDate) return false;
      const t = new Date(p.targetDate).getTime();
      return t >= s && t <= e;
    });
    if (ps.length > 0) out.push({ goal: g, pitstops: ps });
  }
  return out;
}

// Goals whose own targetDate falls in [start, end] — secondary lane on L2.
export function goalsTargetingRange(goals: GoalData[], start: Date, end: Date): GoalData[] {
  const s = start.getTime(), e = end.getTime();
  return goals.filter(g => {
    if (!g.targetDate) return false;
    const t = new Date(g.targetDate).getTime();
    return t >= s && t <= e;
  });
}
