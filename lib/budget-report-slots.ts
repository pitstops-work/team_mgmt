import type { ReportFrequency, BudgetLineCadence } from "@/app/generated/prisma/client";

export type SlotSpec = {
  slotNumber: number;
  grantYear: number;
  periodFrom: Date;
  periodTo: Date;
  dueDate: Date;
};

function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

const PERIOD_MONTHS: Record<ReportFrequency, number> = {
  monthly: 1,
  bi_monthly: 2,
  quarterly: 3,
  half_yearly: 6,
  annual: 12,
};

export function generateSlots(
  grantStartDate: Date,
  grantEndDate: Date,
  frequency: ReportFrequency,
  dueAfterDays: number,
): SlotSpec[] {
  const periodMonths = PERIOD_MONTHS[frequency];
  const slots: SlotSpec[] = [];
  let slotNumber = 0;
  let cursor = new Date(Date.UTC(grantStartDate.getUTCFullYear(), grantStartDate.getUTCMonth(), 1));
  const yearStart = cursor;

  while (cursor <= grantEndDate) {
    slotNumber++;
    const periodFrom = slotNumber === 1
      ? new Date(Date.UTC(grantStartDate.getUTCFullYear(), grantStartDate.getUTCMonth(), grantStartDate.getUTCDate()))
      : new Date(cursor);

    const rawEnd = addMonths(cursor, periodMonths);
    const periodEndCandidate = new Date(Date.UTC(rawEnd.getUTCFullYear(), rawEnd.getUTCMonth(), 0, 23, 59, 59, 999));
    const periodTo = periodEndCandidate > grantEndDate ? grantEndDate : periodEndCandidate;

    const dueDate = new Date(periodTo);
    dueDate.setUTCDate(dueDate.getUTCDate() + dueAfterDays);

    // Grant year = how many full 12-month periods have elapsed since grant start
    const monthsFromStart = monthsBetween(yearStart, cursor);
    const grantYear = Math.floor(monthsFromStart / 12) + 1;

    slots.push({ slotNumber, grantYear, periodFrom, periodTo, dueDate });

    cursor = addMonths(cursor, periodMonths);
    if (cursor > grantEndDate) break;
  }

  return slots;
}

// Budget section → reporting budget head label
export const SECTION_TO_HEAD: Record<string, string> = {
  salary:      "Salary, Honorarium & Staff benefits",
  admin_salary:"Salary, Honorarium & Staff benefits",
  capex:       "Fixed assets / CAPEX",
  travel:      "Travel, Boarding & Lodging",
  programme:   "Program expenses",
  additional:  "Program expenses",
  admin_other: "Administration cost",
};

export const BUDGET_HEAD_ORDER = [
  "Salary, Honorarium & Staff benefits",
  "Fixed assets / CAPEX",
  "Travel, Boarding & Lodging",
  "Program expenses",
  "Administration cost",
];

/**
 * Apportionment input: the minimal line-shape needed to compute period budget.
 * `cadence` + `plannedMonths` together drive the timing curve:
 *   monthly  → straight-line yearTotal/12 × monthsInPeriod (the historical behaviour).
 *   one_time → full yearTotal lands in plannedMonths[0] of the grant year.
 *   seasonal → yearTotal split evenly across each entry in plannedMonths.
 * `plannedMonths` are 1..12 indices into the grant year (NOT calendar months).
 */
export type CadenceLine = {
  yearTotal: number;
  cadence: BudgetLineCadence;
  plannedMonths: number[];
};

/** Whether month `m` (1..12, of the grant year) falls inside [periodFrom..periodTo]. */
function plannedMonthInPeriod(
  m: number,
  yearStart: Date,
  periodFrom: Date,
  periodTo: Date,
): boolean {
  const plannedDate = new Date(Date.UTC(
    yearStart.getUTCFullYear(),
    yearStart.getUTCMonth() + (m - 1),
    1,
  ));
  const plannedKey = plannedDate.getUTCFullYear() * 12 + plannedDate.getUTCMonth();
  const fromKey    = periodFrom.getUTCFullYear()   * 12 + periodFrom.getUTCMonth();
  const toKey      = periodTo.getUTCFullYear()     * 12 + periodTo.getUTCMonth();
  return plannedKey >= fromKey && plannedKey <= toKey;
}

/** Pro-rated budget for a period. Cadence-aware: see CadenceLine. */
export function proratedBudget(
  line: CadenceLine,
  periodFrom: Date,
  periodTo: Date,
  yearStart: Date,
): number {
  if (line.cadence === "monthly" || line.plannedMonths.length === 0) {
    const months =
      (periodTo.getUTCFullYear() - periodFrom.getUTCFullYear()) * 12 +
      (periodTo.getUTCMonth() - periodFrom.getUTCMonth()) + 1;
    return (line.yearTotal / 12) * months;
  }
  const perPlanned = line.yearTotal / line.plannedMonths.length;
  const hits = line.plannedMonths.filter(m => plannedMonthInPeriod(m, yearStart, periodFrom, periodTo)).length;
  return perPlanned * hits;
}

/** Cumulative pro-rated budget from grant year start to periodTo. */
export function cumulativeProratedBudget(
  line: CadenceLine,
  yearStartMonth: Date,
  periodTo: Date,
): number {
  return proratedBudget(line, yearStartMonth, periodTo, yearStartMonth);
}

/**
 * True if the line is *expected* to spend within this period.
 * Monthly lines are always due. one_time/seasonal lines are due only when one
 * of their planned months falls in [periodFrom..periodTo]. Drives the
 * "Not due" chip — actuals remain editable either way (partner can book early).
 */
export function isDueInPeriod(
  line: CadenceLine,
  periodFrom: Date,
  periodTo: Date,
  yearStart: Date,
): boolean {
  if (line.cadence === "monthly" || line.plannedMonths.length === 0) return true;
  return line.plannedMonths.some(m => plannedMonthInPeriod(m, yearStart, periodFrom, periodTo));
}

export type VarianceFlag = "over" | "under" | null;

export function varianceFlag(actual: number, budget: number): VarianceFlag {
  if (budget === 0) return null;
  const pct = (actual - budget) / budget;
  if (pct > 0.1) return "over";
  if (pct < -0.1) return "under";
  return null;
}
