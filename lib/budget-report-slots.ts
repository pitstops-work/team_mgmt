import type { ReportFrequency } from "@/app/generated/prisma/client";

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

// Pro-rated budget for a period: lineYearTotal / 12 * monthsInPeriod
export function proratedBudget(yearTotal: number, periodFrom: Date, periodTo: Date): number {
  const months =
    (periodTo.getUTCFullYear() - periodFrom.getUTCFullYear()) * 12 +
    (periodTo.getUTCMonth() - periodFrom.getUTCMonth()) + 1;
  return (yearTotal / 12) * months;
}

// Cumulative pro-rated budget from grant year start to periodTo
export function cumulativeProratedBudget(yearTotal: number, yearStartMonth: Date, periodTo: Date): number {
  const months =
    (periodTo.getUTCFullYear() - yearStartMonth.getUTCFullYear()) * 12 +
    (periodTo.getUTCMonth() - yearStartMonth.getUTCMonth()) + 1;
  return (yearTotal / 12) * months;
}

export type VarianceFlag = "over" | "under" | null;

export function varianceFlag(actual: number, budget: number): VarianceFlag {
  if (budget === 0) return null;
  const pct = (actual - budget) / budget;
  if (pct > 0.1) return "over";
  if (pct < -0.1) return "under";
  return null;
}
