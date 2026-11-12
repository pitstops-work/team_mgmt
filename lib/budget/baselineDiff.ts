/**
 * Approved baseline vs live budget.
 *
 * `GrantDecision.budgetSnapshot` freezes the lines exactly as approved. The
 * budget itself is then edited in place — an amendment does NOT clone the
 * Budget row, because eight models key to `budgetId` and two of them
 * (`BudgetInputs`, `BudgetReportConfig`) are `@unique`: a clone would split one
 * grant's reporting history across two rows and the grant could not hold a
 * single report config at all.
 *
 * So "what has changed since approval" is a snapshot-vs-live comparison, which
 * is what this file does. It reuses the shape of lib/budget/partnerDiff.ts (the
 * shared-draft review diff) rather than inventing a second diff vocabulary.
 *
 * The subtlety worth knowing: after a mid-grant amendment, a report filed
 * BEFORE the amendment must be read against the baseline that was live during
 * its slot period, not against today's lines. `baselineForDate()` is how a
 * report view gets the right one — reading the head decision for every report
 * would show historic reports as wildly over- or under-spent against figures
 * that did not exist when they were filed.
 */

import prisma from "@/lib/prisma";
import { toDecimal, compareMoney, moneyToString, type MoneyInput } from "./money";
import { Prisma } from "@/app/generated/prisma/client";

/** One line, as frozen into a decision snapshot. */
export type SnapshotLine = {
  id: string;
  section: string;
  description: string;
  domain: string | null;
  /** Per-year totals, 1-indexed by grant year. */
  yearTotals: Record<string, string>;
  total: string;
};

export type BudgetSnapshot = {
  /** Schema marker, so a future shape change can be detected rather than guessed. */
  v: 1;
  takenAt: string;
  budgetId: string;
  horizonMonths: number;
  lines: SnapshotLine[];
  total: string;
};

const LINE_SELECT = {
  id: true,
  section: true,
  description: true,
  domain: true,
  y1Total: true,
  y2Total: true,
  y3Total: true,
  y4Total: true,
  y5Total: true,
} as const;

type LineRow = Prisma.BudgetLineGetPayload<{ select: typeof LINE_SELECT }>;

function lineToSnapshot(l: LineRow): SnapshotLine {
  const years: Record<string, string> = {
    "1": moneyToString(l.y1Total),
    "2": moneyToString(l.y2Total),
    "3": moneyToString(l.y3Total),
    "4": moneyToString(l.y4Total),
    "5": moneyToString(l.y5Total),
  };
  const total = [l.y1Total, l.y2Total, l.y3Total, l.y4Total, l.y5Total].reduce(
    (acc, v) => acc.plus(toDecimal(v)),
    new Prisma.Decimal(0),
  );
  return {
    id: l.id,
    section: l.section,
    description: l.description,
    domain: l.domain ?? null,
    yearTotals: years,
    total: moneyToString(total),
  };
}

/**
 * Freeze the budget's lines as they stand. Called at the moment a decision is
 * recorded — never later, and never recomputed, which is the whole point.
 */
export async function takeBudgetSnapshot(budgetId: string): Promise<BudgetSnapshot> {
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    select: { horizonMonths: true, lines: { select: LINE_SELECT, orderBy: { position: "asc" } } },
  });
  if (!budget) throw new Error("Not found");

  const lines = budget.lines.map(lineToSnapshot);
  const total = lines.reduce((acc, l) => acc.plus(toDecimal(l.total)), new Prisma.Decimal(0));

  return {
    v: 1,
    takenAt: new Date().toISOString(),
    budgetId,
    horizonMonths: budget.horizonMonths,
    lines,
    total: moneyToString(total),
  };
}

export type BaselineChange =
  | { kind: "added"; line: SnapshotLine }
  | { kind: "removed"; line: SnapshotLine }
  | {
      kind: "changed";
      lineId: string;
      description: string;
      section: string;
      fromTotal: string;
      toTotal: string;
      /** Per-year movements, so a reprofiling across years is visible. */
      yearDeltas: { year: string; from: string; to: string }[];
    };

export type BaselineDiff = {
  changes: BaselineChange[];
  baselineTotal: string;
  liveTotal: string;
  /** live − baseline. Positive means the live budget is above what was approved. */
  delta: string;
  /** True when nothing has moved since approval. */
  unchanged: boolean;
};

/**
 * Compare a frozen snapshot against the live lines.
 *
 * Lines are matched on id. A line deleted and re-added appears as a removal
 * plus an addition rather than a change, which is correct: the figures are not
 * comparable, and silently pairing them on description would hide a
 * substitution behind what looks like an edit.
 */
export function diffAgainstSnapshot(
  snapshot: BudgetSnapshot,
  liveLines: SnapshotLine[],
): BaselineDiff {
  const byId = new Map(snapshot.lines.map((l) => [l.id, l]));
  const liveById = new Map(liveLines.map((l) => [l.id, l]));
  const changes: BaselineChange[] = [];

  for (const live of liveLines) {
    const base = byId.get(live.id);
    if (!base) {
      changes.push({ kind: "added", line: live });
      continue;
    }
    if (compareMoney(base.total, live.total) === 0) {
      // Totals equal, but the money may have moved between years.
      const yearDeltas = yearMovements(base, live);
      if (!yearDeltas.length) continue;
      changes.push({
        kind: "changed",
        lineId: live.id,
        description: live.description,
        section: live.section,
        fromTotal: base.total,
        toTotal: live.total,
        yearDeltas,
      });
      continue;
    }
    changes.push({
      kind: "changed",
      lineId: live.id,
      description: live.description,
      section: live.section,
      fromTotal: base.total,
      toTotal: live.total,
      yearDeltas: yearMovements(base, live),
    });
  }

  for (const base of snapshot.lines) {
    if (!liveById.has(base.id)) changes.push({ kind: "removed", line: base });
  }

  const liveTotal = liveLines.reduce((acc, l) => acc.plus(toDecimal(l.total)), new Prisma.Decimal(0));
  const baselineTotal = toDecimal(snapshot.total);

  return {
    changes,
    baselineTotal: moneyToString(baselineTotal),
    liveTotal: moneyToString(liveTotal),
    delta: moneyToString(liveTotal.minus(baselineTotal)),
    unchanged: changes.length === 0,
  };
}

function yearMovements(a: SnapshotLine, b: SnapshotLine) {
  const out: { year: string; from: string; to: string }[] = [];
  for (const year of ["1", "2", "3", "4", "5"]) {
    const from = a.yearTotals[year] ?? "0.00";
    const to = b.yearTotals[year] ?? "0.00";
    if (compareMoney(from, to) !== 0) out.push({ year, from, to });
  }
  return out;
}

/**
 * The live budget, in snapshot shape, for diffing.
 */
export async function liveSnapshotLines(budgetId: string): Promise<SnapshotLine[]> {
  const lines = await prisma.budgetLine.findMany({
    where: { budgetId },
    select: LINE_SELECT,
    orderBy: { position: "asc" },
  });
  return lines.map(lineToSnapshot);
}

function parseSnapshot(value: Prisma.JsonValue | null): BudgetSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snap = value as unknown as BudgetSnapshot;
  // An empty default ("{}") is not a snapshot — a decision recorded before the
  // snapshot column existed has nothing to compare against, and saying so is
  // better than diffing against zero and reporting the whole grant as added.
  if (snap.v !== 1 || !Array.isArray(snap.lines)) return null;
  return snap;
}

/** The head (non-superseded) decision for a budget, with its snapshot parsed. */
export async function activeBaseline(budgetId: string) {
  const decisions = await prisma.grantDecision.findMany({
    where: { budgetId, outcome: { in: ["approved", "approved_with_conditions"] } },
    select: {
      id: true,
      decidedOn: true,
      approvedAmount: true,
      budgetSnapshot: true,
      supersedesId: true,
      baselineIsReconstructed: true,
      reconstructionNote: true,
    },
    orderBy: { decidedOn: "desc" },
  });
  // The head is the one nothing supersedes.
  const supersededIds = new Set(decisions.map((d) => d.supersedesId).filter(Boolean) as string[]);
  const head = decisions.find((d) => !supersededIds.has(d.id)) ?? decisions[0] ?? null;
  if (!head) return null;
  return { ...head, snapshot: parseSnapshot(head.budgetSnapshot) };
}

/**
 * The baseline that was live on a given date.
 *
 * This is what a report view must use for a slot in the past: after an
 * amendment, comparing an old report against today's lines would make it look
 * like money appeared or vanished mid-period.
 */
export async function baselineForDate(budgetId: string, on: Date) {
  const decision = await prisma.grantDecision.findFirst({
    where: {
      budgetId,
      outcome: { in: ["approved", "approved_with_conditions"] },
      decidedOn: { lte: on },
    },
    select: { id: true, decidedOn: true, approvedAmount: true, budgetSnapshot: true },
    orderBy: { decidedOn: "desc" },
  });
  if (!decision) return null;
  return { ...decision, snapshot: parseSnapshot(decision.budgetSnapshot) };
}

/** The whole comparison for the current head decision, ready for a UI panel. */
export async function baselineVarianceFor(budgetId: string): Promise<
  | { status: "no_decision" }
  | { status: "no_snapshot"; decisionId: string }
  | { status: "reconstructed"; decisionId: string; approvedAmount: string; note: string | null }
  | { status: "ok"; decisionId: string; approvedAmount: string; diff: BaselineDiff }
> {
  const baseline = await activeBaseline(budgetId);
  if (!baseline) return { status: "no_decision" };
  if (!baseline.snapshot) return { status: "no_snapshot", decisionId: baseline.id };
  // Deliberately refuses to compute. A reconstructed baseline froze TODAY's
  // lines, so a diff against them would read as "nothing has changed since
  // approval" — the most misleading answer available, because it looks like
  // reassurance.
  if (baseline.baselineIsReconstructed) {
    return {
      status: "reconstructed",
      decisionId: baseline.id,
      approvedAmount: moneyToString(baseline.approvedAmount as MoneyInput),
      note: baseline.reconstructionNote,
    };
  }
  const live = await liveSnapshotLines(budgetId);
  return {
    status: "ok",
    decisionId: baseline.id,
    approvedAmount: moneyToString(baseline.approvedAmount as MoneyInput),
    diff: diffAgainstSnapshot(baseline.snapshot, live),
  };
}
