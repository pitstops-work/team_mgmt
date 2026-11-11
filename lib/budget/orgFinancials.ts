/**
 * The grantee's own finances, and what share of them we would be.
 *
 * The dependency ratio — this grant as a percentage of what the organisation
 * spends in a year — is a real appraisal measure and could not be computed from
 * anything we held. It cuts two ways, which is why it is worth having rather
 * than just interesting: a very high share means the organisation depends on us
 * to a degree that makes exit harmful and governance awkward; a very low one
 * can mean the grant is too small to get their attention.
 *
 * It also feeds the "average annual expenditure" and dependency lines the
 * approvals wizard already renders, which until now had to be typed by hand
 * into the note.
 */

import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { toDecimal, moneyToString, sumMoney, type MoneyInput } from "./money";
import { logGrant } from "./audit";

type SessionLike = { user?: { id?: string | null } | null } | null;

/** The conventional window: three years, as every funder's form asks for. */
export const AVERAGE_YEARS = 3;

export async function recordFinancialYear(
  session: SessionLike,
  input: {
    orgId: string;
    yearEnding: number;
    expenditure: MoneyInput;
    income?: MoneyInput;
    isAudited?: boolean;
    source?: string;
  },
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const thisYear = new Date().getUTCFullYear();
  // A typo here silently distorts every ratio computed from it, and the figure
  // is rarely looked at again once entered.
  if (input.yearEnding < 1950 || input.yearEnding > thisYear + 1) {
    throw new Error(`${input.yearEnding} is not a plausible financial year.`);
  }

  const before = await prisma.orgFinancialYear.findUnique({
    where: { orgId_yearEnding: { orgId: input.orgId, yearEnding: input.yearEnding } },
    select: { expenditure: true },
  });

  const row = await prisma.orgFinancialYear.upsert({
    where: { orgId_yearEnding: { orgId: input.orgId, yearEnding: input.yearEnding } },
    create: {
      orgId: input.orgId,
      yearEnding: input.yearEnding,
      expenditure: toDecimal(input.expenditure),
      income: input.income === undefined ? null : toDecimal(input.income),
      isAudited: input.isAudited ?? false,
      source: input.source ?? null,
      recordedById: userId,
    },
    update: {
      expenditure: toDecimal(input.expenditure),
      income: input.income === undefined ? undefined : toDecimal(input.income),
      isAudited: input.isAudited ?? undefined,
      source: input.source ?? undefined,
      recordedById: userId,
    },
    select: { id: true },
  });

  logGrant("Compliance", row.id, userId, "org_financials_recorded", {
    field: `FY ending ${input.yearEnding}${input.isAudited ? " (audited)" : " (unaudited)"}`,
    from: before ? moneyToString(before.expenditure) : null,
    to: moneyToString(input.expenditure),
  });

  return row;
}

export type DependencyRatio =
  | { available: false; reason: "no_financials" | "no_amount"; yearsHeld: number }
  | {
      available: true;
      averageExpenditure: string;
      yearsUsed: number;
      /** False when any year used came from a declaration rather than accounts. */
      allAudited: boolean;
      grantAmount: string;
      /** Grant as a percentage of average annual expenditure, one decimal. */
      ratioPct: number;
      /** Per year of the grant, which is the comparable figure for a multi-year grant. */
      annualisedRatioPct: number | null;
      band: "low" | "moderate" | "high" | "very_high";
    };

/**
 * Bands, as a starting point for conversation rather than a rule.
 *
 * Deliberately coarse. The thresholds below are not policy — they are not
 * written down anywhere yet — so they are labelled as a prompt to look, and
 * should be replaced once someone decides what the organisation actually
 * thinks. The point is that nobody has to compute the ratio in their head.
 */
function bandFor(pct: number): "low" | "moderate" | "high" | "very_high" {
  if (pct >= 75) return "very_high";
  if (pct >= 40) return "high";
  if (pct >= 15) return "moderate";
  return "low";
}

/**
 * The ratio arithmetic, pure and exported so it can be checked without a
 * database.
 *
 * `months` is what makes this non-obvious: a ₹3 Cr grant over three years
 * against a ₹2 Cr annual spend is NOT a 150% dependency, it is 50%. Reporting
 * the raw ratio for a multi-year grant would wrongly disqualify sound partners,
 * and is the kind of error nobody catches because the number looks precise.
 */
export function sharePct(
  amount: MoneyInput,
  averageExpenditure: MoneyInput,
  months?: number | null,
): number | null {
  const avg = toDecimal(averageExpenditure);
  if (avg.isZero()) return null;
  const amt = toDecimal(amount);
  const perYear =
    months && months > 0 ? amt.dividedBy(new Prisma.Decimal(months).dividedBy(12)) : amt;
  return Math.round(perYear.dividedBy(avg).times(100).toNumber() * 10) / 10;
}

/**
 * How large would this grant be against what the organisation spends?
 *
 * `annualisedRatioPct` is the one to read for a multi-year grant: a ₹3 Cr grant
 * over three years against a ₹2 Cr annual spend is not a 150% dependency, it is
 * 50% — and reporting the former would wrongly disqualify sound partners.
 */
export async function dependencyRatio(
  orgId: string,
  grantAmount: MoneyInput,
  opts: { months?: number } = {},
): Promise<DependencyRatio> {
  const years = await prisma.orgFinancialYear.findMany({
    where: { orgId },
    select: { yearEnding: true, expenditure: true, isAudited: true },
    orderBy: { yearEnding: "desc" },
    take: AVERAGE_YEARS,
  });

  if (!years.length) return { available: false, reason: "no_financials", yearsHeld: 0 };

  const amount = toDecimal(grantAmount);
  if (amount.isZero()) {
    return { available: false, reason: "no_amount", yearsHeld: years.length };
  }

  const total = sumMoney(years.map((y) => y.expenditure));
  const average = total.dividedBy(years.length);
  if (average.isZero()) {
    return { available: false, reason: "no_financials", yearsHeld: years.length };
  }

  const ratioPct = sharePct(amount, average)!;
  const annualised = opts.months ? sharePct(amount, average, opts.months) : null;

  return {
    available: true,
    averageExpenditure: moneyToString(average),
    yearsUsed: years.length,
    allAudited: years.every((y) => y.isAudited),
    grantAmount: moneyToString(amount),
    ratioPct,
    annualisedRatioPct: annualised,
    band: bandFor(annualised ?? ratioPct),
  };
}

/** The grantee's financial history, newest first, for the appraisal panel. */
export async function financialHistory(orgId: string) {
  const years = await prisma.orgFinancialYear.findMany({
    where: { orgId },
    select: {
      id: true,
      yearEnding: true,
      expenditure: true,
      income: true,
      isAudited: true,
      source: true,
    },
    orderBy: { yearEnding: "desc" },
  });

  return years.map((y) => ({
    ...y,
    expenditure: moneyToString(y.expenditure),
    income: y.income ? moneyToString(y.income) : null,
  }));
}

/**
 * Partners whose financial history is missing or stale.
 *
 * A ratio computed from four-year-old accounts is worse than no ratio, because
 * it looks like a fact. Scoped to orgs with a live grant.
 */
export async function staleFinancials(opts: { asOfYear?: number } = {}) {
  const currentYear = opts.asOfYear ?? new Date().getUTCFullYear();

  const orgs = await prisma.org.findMany({
    where: {
      kind: "partner",
      grantRelationships: { some: { budgets: { some: { status: "approved" } } } },
    },
    select: {
      id: true,
      name: true,
      financialYears: {
        select: { yearEnding: true, isAudited: true },
        orderBy: { yearEnding: "desc" },
        take: 1,
      },
    },
  });

  return orgs
    .map((o) => {
      const latest = o.financialYears[0] ?? null;
      // One year behind is normal — accounts take time to audit. Two is a gap.
      const yearsBehind = latest ? currentYear - latest.yearEnding : null;
      return {
        orgId: o.id,
        orgName: o.name,
        latestYear: latest?.yearEnding ?? null,
        isAudited: latest?.isAudited ?? null,
        yearsBehind,
        state: latest === null ? ("missing" as const) : yearsBehind! >= 2 ? ("stale" as const) : ("current" as const),
      };
    })
    .filter((o) => o.state !== "current");
}
