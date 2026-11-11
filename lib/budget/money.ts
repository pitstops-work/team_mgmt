/**
 * Money, in one place.
 *
 * Every amount introduced by the grant-lifecycle work is `Decimal(14,2)`. The
 * legacy columns (`BudgetLine.y1Total…y5Total`, `BudgetReportLine.actualAmount`,
 * `CostRegistry` rates and friends) are still `Float` until the sweep in
 * prisma/migrations-pending/ runs, so for now the two live side by side and
 * every crossing point goes through here.
 *
 * Why not just use numbers: a disbursement that has to reconcile against a bank
 * statement cannot be binary floating point. `0.1 + 0.2 !== 0.3` is survivable
 * in a chart and unrecoverable in a ledger — the error is not detectable after
 * the fact, because nothing records what the true figure was.
 *
 * Why the API boundary still sees `number`: server actions serialise to the
 * client, and a Prisma `Decimal` crosses that boundary as a string. Rather than
 * let that leak into React state (where `+` on it would silently concatenate),
 * convert explicitly at the edge with `toNumber()` and keep `Decimal` on the
 * server side of the line.
 */

import { Prisma } from "@/app/generated/prisma/client";

export type MoneyInput = Prisma.Decimal | number | string | null | undefined;

/** Rupees, to the paisa. Every money column in the grant models uses this. */
export const MONEY_SCALE = 2;

/**
 * Coerce anything money-shaped to a Decimal. Null and undefined become zero —
 * callers that need to distinguish "no amount" from "zero amount" must check
 * before calling, because a ledger has no use for an undefined rupee.
 */
export function toDecimal(v: MoneyInput): Prisma.Decimal {
  if (v === null || v === undefined || v === "") return new Prisma.Decimal(0);
  if (v instanceof Prisma.Decimal) return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`Not a finite amount: ${v}`);
    return new Prisma.Decimal(v.toFixed(MONEY_SCALE));
  }
  const parsed = new Prisma.Decimal(v);
  if (!parsed.isFinite()) throw new Error(`Not a finite amount: ${v}`);
  return parsed;
}

/**
 * For the client boundary and for arithmetic against the legacy Float columns.
 * Returns a plain number — use it at the edge, not inside a calculation chain.
 */
export function toNumber(v: MoneyInput): number {
  return toDecimal(v).toNumber();
}

/** Sum, exactly. Skips null/undefined rather than treating them as zero-ish. */
export function sumMoney(values: MoneyInput[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>(
    (acc, v) => (v === null || v === undefined ? acc : acc.plus(toDecimal(v))),
    new Prisma.Decimal(0),
  );
}

export function addMoney(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  return toDecimal(a).plus(toDecimal(b));
}

export function subMoney(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  return toDecimal(a).minus(toDecimal(b));
}

/** Negative results floor at zero — for "unspent", which cannot be negative. */
export function subMoneyFloored(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  const d = subMoney(a, b);
  return d.isNegative() ? new Prisma.Decimal(0) : d;
}

/**
 * Compare two amounts that may come from different sides of the type line.
 *
 * `tolerance` is in rupees and defaults to **zero**: a comparison between two
 * `Decimal` columns must be exact, and a caller that knowingly compares against
 * a legacy `Float` total passes a tolerance explicitly so the slack is visible
 * at the call site rather than built into the helper. Once the sweep lands,
 * every remaining tolerance argument is a bug to delete.
 */
export function compareMoney(
  a: MoneyInput,
  b: MoneyInput,
  opts: { tolerance?: number } = {},
): -1 | 0 | 1 {
  const da = toDecimal(a);
  const db = toDecimal(b);
  const tol = toDecimal(opts.tolerance ?? 0).abs();
  const diff = da.minus(db);
  if (diff.abs().lessThanOrEqualTo(tol)) return 0;
  return diff.isNegative() ? -1 : 1;
}

export function moneyEquals(a: MoneyInput, b: MoneyInput, tolerance = 0): boolean {
  return compareMoney(a, b, { tolerance }) === 0;
}

/** True when `amount` exceeds `ceiling`. Null ceiling = unlimited. */
export function exceedsCeiling(amount: MoneyInput, ceiling: MoneyInput): boolean {
  if (ceiling === null || ceiling === undefined) return false;
  return compareMoney(amount, ceiling) > 0;
}

/**
 * Indian-format display. Server-side rendering only — never store this, never
 * log it, and never compare it: a locale-formatted number is not comparable.
 */
export function formatMoney(v: MoneyInput, opts: { paise?: boolean } = {}): string {
  const n = toNumber(v);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: opts.paise ? 2 : 0,
    maximumFractionDigits: opts.paise ? 2 : 0,
  }).format(n);
}

/** Lakh / crore shorthand for dashboards, where the full figure is noise. */
export function formatMoneyShort(v: MoneyInput): string {
  const n = toNumber(v);
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return formatMoney(n);
}

/**
 * A plain decimal string for the AuditLog text columns and for API responses
 * that must not lose precision. Never locale-formatted.
 */
export function moneyToString(v: MoneyInput): string {
  return toDecimal(v).toFixed(MONEY_SCALE);
}
