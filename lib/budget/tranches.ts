/**
 * The release schedule.
 *
 * Three facts from how grants actually run here drive this file, and each one
 * rules out the obvious implementation:
 *
 * 1. **The schedule comes from the BUDGET, not the agreement period.** Each
 *    grant year's releasable total is that year's budget total, so the
 *    generator reads `BudgetLine.y1Total…y5Total` rather than dividing an
 *    approved amount by a count of periods.
 *
 * 2. **Frequency varies by grant type.** Annual is the norm; creche and urban
 *    operational grants run quarterly or half-yearly. It lives on
 *    `GrantAgreement.trancheFrequency` and splits each year's total.
 *
 * 3. **Year 2+ is NOT a promise.** Next year's release depends on this year's
 *    utilisation and on approved reallocations, so later years are *indicative*
 *    until a year-boundary recompute restates and commits them. This is why
 *    `isCommitted` exists, why nothing may be requested against an indicative
 *    tranche, and why every rollup must keep committed and indicative money in
 *    separate columns. A pipeline figure that silently includes indicative
 *    years reports money that was never promised.
 *
 * Dates are built in **UTC** throughout. The cluster-day lesson: constructing
 * them locally and slicing an ISO string puts a release planned for 1 April on
 * 31 March for anyone in IST.
 */

import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import type { TrancheFrequency } from "@/app/generated/prisma/client";
import { toDecimal, moneyToString, sumMoney, type MoneyInput } from "./money";
import { logGrant } from "./audit";

/** How many releases a year holds at each frequency. */
export const PERIODS_PER_YEAR: Record<TrancheFrequency, number> = {
  annual: 1,
  half_yearly: 2,
  quarterly: 4,
};

export type PlannedTranche = {
  trancheNumber: number;
  grantYear: number;
  plannedOn: Date;
  plannedAmount: Prisma.Decimal;
  isCommitted: boolean;
};

/** Add whole months to a UTC date without drifting through local time. */
function addMonthsUTC(from: Date, months: number): Date {
  const d = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, from.getUTCDate(), 0, 0, 0, 0),
  );
  // Guard the 31st-of-a-short-month case: Date.UTC rolls over, so clamp back.
  if (d.getUTCDate() !== from.getUTCDate()) d.setUTCDate(0);
  return d;
}

/**
 * Split one year's total across the frequency's periods.
 *
 * The remainder goes on the FIRST period, not the last: a grantee needs the
 * larger instalment at the start of a year, and an underfunded first quarter is
 * the complaint this avoids. Paise never vanish — the parts sum exactly to the
 * year total, which a test asserts.
 */
export function splitYearAmount(yearTotal: MoneyInput, periods: number): Prisma.Decimal[] {
  const total = toDecimal(yearTotal);
  if (periods <= 1) return [total];
  const per = total.dividedBy(periods).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const parts = Array.from({ length: periods }, () => per);
  const remainder = total.minus(per.times(periods));
  parts[0] = parts[0].plus(remainder);
  return parts;
}

type YearTotals = { grantYear: number; total: Prisma.Decimal }[];

/** Per-year releasable totals, read off the budget's own lines. */
export async function budgetYearTotals(budgetId: string): Promise<YearTotals> {
  const agg = await prisma.budgetLine.aggregate({
    where: { budgetId },
    _sum: { y1Total: true, y2Total: true, y3Total: true, y4Total: true, y5Total: true },
  });
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    select: { horizonMonths: true },
  });
  const years = Math.max(1, Math.ceil((budget?.horizonMonths ?? 12) / 12));
  const sums = [
    agg._sum.y1Total,
    agg._sum.y2Total,
    agg._sum.y3Total,
    agg._sum.y4Total,
    agg._sum.y5Total,
  ];
  return sums
    .slice(0, years)
    .map((v, i) => ({ grantYear: i + 1, total: toDecimal(v ?? 0) }))
    // A year with no money in it gets no tranche at all, rather than a ₹0 row
    // that looks like a missed release on the dashboard.
    .filter((y) => !y.total.isZero());
}

/**
 * Build the schedule. Pure — it writes nothing, so it can be shown as a preview
 * before anyone commits to it.
 *
 * `onlyYearOneCommitted` is the default and the honest setting: year 1 is what
 * the decision approved, everything after it is a projection.
 */
export function buildTrancheSchedule(opts: {
  yearTotals: YearTotals;
  frequency: TrancheFrequency;
  /** Grant start — year 1, period 1 lands here. */
  startOn: Date;
  onlyYearOneCommitted?: boolean;
}): PlannedTranche[] {
  const periods = PERIODS_PER_YEAR[opts.frequency];
  const monthsPerPeriod = 12 / periods;
  const commitFirstYearOnly = opts.onlyYearOneCommitted ?? true;

  const out: PlannedTranche[] = [];
  let n = 1;
  for (const year of opts.yearTotals) {
    const parts = splitYearAmount(year.total, periods);
    for (let p = 0; p < periods; p++) {
      const offset = (year.grantYear - 1) * 12 + p * monthsPerPeriod;
      out.push({
        trancheNumber: n++,
        grantYear: year.grantYear,
        plannedOn: addMonthsUTC(opts.startOn, offset),
        plannedAmount: parts[p],
        isCommitted: commitFirstYearOnly ? year.grantYear === 1 : true,
      });
    }
  }
  return out;
}

/**
 * Generate and persist the schedule.
 *
 * Refuses to touch a tranche that has money against it: regenerating a schedule
 * after a release would either orphan a payment or silently restate a figure
 * someone has already been paid against.
 */
export async function generateTrancheSchedule(
  userId: string,
  budgetId: string,
  opts?: { startOn?: Date; frequency?: TrancheFrequency },
) {
  const [agreement, config] = await Promise.all([
    prisma.grantAgreement.findUnique({
      where: { budgetId },
      select: { trancheFrequency: true, effectiveFrom: true, status: true },
    }),
    prisma.budgetReportConfig.findUnique({
      where: { budgetId },
      select: { grantStartDate: true },
    }),
  ]);

  const frequency = opts?.frequency ?? agreement?.trancheFrequency ?? "annual";
  const startOn = opts?.startOn ?? agreement?.effectiveFrom ?? config?.grantStartDate ?? null;
  if (!startOn) {
    throw new Error(
      "No grant start date — set the agreement's effective date or the report config before generating a schedule.",
    );
  }

  const existing = await prisma.grantTranche.findMany({
    where: { budgetId },
    select: {
      id: true,
      trancheNumber: true,
      status: true,
      _count: { select: { disbursements: true, requests: true } },
    },
  });
  const locked = existing.filter(
    (t) => t._count.disbursements > 0 || t._count.requests > 0 || t.status === "released",
  );
  if (locked.length) {
    throw new Error(
      `${locked.length} tranche(s) already have requests or payments against them — adjust those individually rather than regenerating the schedule.`,
    );
  }

  const yearTotals = await budgetYearTotals(budgetId);
  if (!yearTotals.length) throw new Error("This budget has no costed lines to release against.");

  const planned = buildTrancheSchedule({ yearTotals, frequency, startOn: toUTCDate(startOn) });

  await prisma.$transaction([
    prisma.grantTranche.deleteMany({ where: { budgetId } }),
    ...planned.map((t) =>
      prisma.grantTranche.create({
        data: {
          budgetId,
          trancheNumber: t.trancheNumber,
          grantYear: t.grantYear,
          plannedOn: t.plannedOn,
          plannedAmount: t.plannedAmount,
          isCommitted: t.isCommitted,
          committedAt: t.isCommitted ? new Date() : null,
        },
      }),
    ),
  ]);

  logGrant("GrantTranche", budgetId, userId, "schedule_generated", {
    field: `${frequency}, ${planned.length} tranche(s)`,
    to: moneyToString(sumMoney(planned.map((t) => t.plannedAmount))),
  });

  return planned;
}

/** Midnight UTC on the same calendar day, for a @db.Date column. */
function toUTCDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export type YearRecompute = {
  grantYear: number;
  previousTotal: string;
  newTotal: string;
  carriedShortfall: string;
  reallocationAdjustment: string;
  note: string;
};

/**
 * Restate and commit a grant year.
 *
 * This is the step that makes an indicative year real. It reads what the prior
 * year actually absorbed and what reallocations were approved, restates this
 * year's tranches, and commits them.
 *
 * Two refusals worth noting:
 *  - A tranche that is already committed cannot be restated here. Once
 *    committed, a change to the figure is an AMENDMENT, which goes through
 *    `GrantDecision` so the approval history records it.
 *  - The previous figure is kept in `restatedFromAmount` with a note. A
 *    projection that changes without saying what it used to be is impossible to
 *    explain to a grantee six months later.
 */
export async function recomputeGrantYear(
  userId: string,
  budgetId: string,
  grantYear: number,
): Promise<YearRecompute> {
  if (grantYear <= 1) {
    throw new Error("Year 1 is committed at approval — there is nothing to recompute.");
  }

  const tranches = await prisma.grantTranche.findMany({
    where: { budgetId, grantYear },
    select: { id: true, trancheNumber: true, plannedAmount: true, isCommitted: true, status: true },
    orderBy: { trancheNumber: "asc" },
  });
  if (!tranches.length) throw new Error(`No year-${grantYear} tranches to recompute.`);

  const alreadyCommitted = tranches.filter((t) => t.isCommitted);
  if (alreadyCommitted.length) {
    throw new Error(
      `Year ${grantYear} is already committed. Changing a committed figure is an amendment — record a new decision instead.`,
    );
  }

  // What the prior year released vs what the grantee reported spending.
  const priorYear = grantYear - 1;
  const [priorTranches, priorSlots] = await Promise.all([
    prisma.grantTranche.findMany({
      where: { budgetId, grantYear: priorYear },
      select: { plannedAmount: true, disbursements: { select: { amount: true, status: true } } },
    }),
    prisma.budgetReportSlot.findMany({
      where: { budgetId, grantYear: priorYear, status: "approved" },
      select: { report: { select: { lines: { select: { actualAmount: true } } } } },
    }),
  ]);

  const priorReleased = sumMoney(
    priorTranches.flatMap((t) =>
      t.disbursements.filter((d) => d.status === "released").map((d) => d.amount),
    ),
  );
  const priorUtilised = sumMoney(
    priorSlots.flatMap((s) => s.report?.lines.map((l) => l.actualAmount) ?? []),
  );
  // Unspent money released last year reduces what needs releasing this year.
  const carriedShortfall = priorReleased.minus(priorUtilised);

  // Approved reallocations targeting this grant year move money into or out of
  // it. `targetGrantYear` is the column the reallocation flow already sets.
  const reallocations = await prisma.budgetReallocationRequest.findMany({
    where: {
      status: "approved",
      targetGrantYear: grantYear,
      report: { budgetId },
    },
    select: { approvedAmount: true },
  });
  const reallocationAdjustment = sumMoney(reallocations.map((r) => r.approvedAmount));

  const budgetYear = (await budgetYearTotals(budgetId)).find((y) => y.grantYear === grantYear);
  const baseTotal = budgetYear?.total ?? new Prisma.Decimal(0);
  const previousTotal = sumMoney(tranches.map((t) => t.plannedAmount));

  // Carried shortfall reduces the need; an approved reallocation into this year
  // increases it. Floored at zero: a year cannot release negative money.
  let newTotal = baseTotal.minus(carriedShortfall).plus(reallocationAdjustment);
  if (newTotal.isNegative()) newTotal = new Prisma.Decimal(0);

  const parts = splitYearAmount(newTotal, tranches.length);
  const note =
    `Restated from budget year total ${moneyToString(baseTotal)}; ` +
    `prior year released ${moneyToString(priorReleased)} against ${moneyToString(priorUtilised)} utilised ` +
    `(carry ${moneyToString(carriedShortfall)}); reallocations ${moneyToString(reallocationAdjustment)}.`;

  const now = new Date();
  await prisma.$transaction(
    tranches.map((t, i) =>
      prisma.grantTranche.update({
        where: { id: t.id },
        data: {
          restatedFromAmount: t.plannedAmount,
          plannedAmount: parts[i],
          restatedAt: now,
          restatementNote: note,
          isCommitted: true,
          committedAt: now,
        },
      }),
    ),
  );

  logGrant("GrantTranche", budgetId, userId, "year_recomputed", {
    field: `year ${grantYear}`,
    from: moneyToString(previousTotal),
    to: moneyToString(newTotal),
  });

  return {
    grantYear,
    previousTotal: moneyToString(previousTotal),
    newTotal: moneyToString(newTotal),
    carriedShortfall: moneyToString(carriedShortfall),
    reallocationAdjustment: moneyToString(reallocationAdjustment),
    note,
  };
}

/**
 * Committed and indicative money, kept apart.
 *
 * Deliberately returns two figures and no total. A caller that wants one number
 * has to decide which, in its own code, where a reader can see the choice.
 */
export async function trancheTotals(budgetId: string) {
  const tranches = await prisma.grantTranche.findMany({
    where: { budgetId, status: { not: "cancelled" } },
    select: { plannedAmount: true, isCommitted: true, grantYear: true },
  });
  return {
    committed: moneyToString(
      sumMoney(tranches.filter((t) => t.isCommitted).map((t) => t.plannedAmount)),
    ),
    indicative: moneyToString(
      sumMoney(tranches.filter((t) => !t.isCommitted).map((t) => t.plannedAmount)),
    ),
    years: [...new Set(tranches.map((t) => t.grantYear))].sort((a, b) => a - b),
  };
}
