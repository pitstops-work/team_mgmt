/**
 * Self-checking verification of the grant lifecycle's pure logic.
 *
 * The repo has no test framework, so rather than adding one unasked this is a
 * script in the same idiom as the other scripts/ tools. It touches NO database:
 * every check is over a pure function, so it is safe to run anywhere, including
 * against an environment pointed at production.
 *
 * Run: npx tsx scripts/check-grant-invariants.ts
 *
 * What it covers is chosen by consequence, not by coverage: the arithmetic that
 * decides how much money a grantee is told they will receive, and the state
 * machines whose wrong answer is invisible.
 */

import { Prisma } from "../app/generated/prisma/client";
import {
  toDecimal,
  sumMoney,
  subMoneyFloored,
  compareMoney,
  moneyEquals,
  exceedsCeiling,
  moneyToString,
  formatMoneyShort,
} from "../lib/budget/money";
import { splitYearAmount, buildTrancheSchedule, PERIODS_PER_YEAR } from "../lib/budget/tranches";
import { canTransition } from "../lib/budget/proposals";
import { diffAgainstSnapshot, type BudgetSnapshot, type SnapshotLine } from "../lib/budget/baselineDiff";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function eq(name: string, actual: unknown, expected: unknown) {
  check(name, String(actual) === String(expected), `expected ${expected}, got ${actual}`);
}

// ── Money ───────────────────────────────────────────────────────────────────

// The reason Decimal exists here at all: this is false in binary floating point.
eq("0.1 + 0.2 === 0.3 exactly", moneyToString(sumMoney([0.1, 0.2])), "0.30");
eq("float would have failed", 0.1 + 0.2 === 0.3, false);

eq("sum of many paise", moneyToString(sumMoney(Array.from({ length: 3 }, () => 0.01))), "0.03");
eq("null and undefined are skipped, not zeroed", moneyToString(sumMoney([100, null, undefined, 50])), "150.00");
eq("string input parses", moneyToString(toDecimal("1234.56")), "1234.56");
eq("unspent floors at zero", moneyToString(subMoneyFloored(100, 250)), "0.00");
eq("unspent computes normally", moneyToString(subMoneyFloored(250, 100)), "150.00");

// Tolerance defaults to ZERO: two Decimal columns must match exactly, and any
// slack has to be asked for at the call site.
eq("exact comparison by default", compareMoney(100.0, 100.01), -1);
eq("tolerance only when requested", compareMoney(100.0, 100.01, { tolerance: 0.5 }), 0);
eq("equality is exact by default", moneyEquals(100, 100.01), false);

eq("null ceiling is unlimited", exceedsCeiling(99_99_99_999, null), false);
eq("ceiling is inclusive", exceedsCeiling(100, 100), false);
eq("over ceiling is caught", exceedsCeiling(100.01, 100), true);

eq("crore shorthand", formatMoneyShort(1_50_00_000), "₹1.50 Cr");
eq("lakh shorthand", formatMoneyShort(2_50_000), "₹2.50 L");

check(
  "a non-finite amount is refused rather than stored as NaN",
  (() => {
    try {
      toDecimal(Number.NaN);
      return false;
    } catch {
      return true;
    }
  })(),
);

// ── Tranche splitting ───────────────────────────────────────────────────────
//
// The invariant that matters: the parts must sum EXACTLY to the year total. A
// rounding loss here is money a grantee is promised and never paid.

for (const [freq, periods] of Object.entries(PERIODS_PER_YEAR)) {
  for (const total of [1_00_00_000, 33_33_333, 10, 0.03, 1_23_45_678.91]) {
    const parts = splitYearAmount(total, periods);
    eq(`${freq}: ${total} splits into ${periods}`, parts.length, periods);
    eq(
      `${freq}: parts of ${total} sum exactly`,
      moneyToString(sumMoney(parts)),
      moneyToString(toDecimal(total)),
    );
  }
}

// The remainder goes on the FIRST period, so a grantee is not short at the start
// of a year.
const thirds = splitYearAmount(100, 3);
eq("remainder lands on the first period", moneyToString(thirds[0]), "33.34");
eq("later periods take the floor", moneyToString(thirds[1]), "33.33");

// ── Schedule generation ─────────────────────────────────────────────────────

const yearTotals = [
  { grantYear: 1, total: toDecimal(12_00_000) },
  { grantYear: 2, total: toDecimal(12_00_000) },
];

const annual = buildTrancheSchedule({
  yearTotals,
  frequency: "annual",
  startOn: new Date(Date.UTC(2026, 3, 1)),
});
eq("annual: one tranche per year", annual.length, 2);
eq("annual: year 1 is committed", annual[0].isCommitted, true);
// The whole point of the indicative/committed split: year 2 is a projection off
// the budget, restated later from utilisation and reallocations.
eq("annual: year 2 is NOT committed", annual[1].isCommitted, false);

const quarterly = buildTrancheSchedule({
  yearTotals,
  frequency: "quarterly",
  startOn: new Date(Date.UTC(2026, 3, 1)),
});
eq("quarterly: four per year", quarterly.length, 8);
eq(
  "quarterly: year 1 sums to the budget year total",
  moneyToString(sumMoney(quarterly.filter((t) => t.grantYear === 1).map((t) => t.plannedAmount))),
  "1200000.00",
);
eq("quarterly: every year-1 tranche is committed", quarterly.slice(0, 4).every((t) => t.isCommitted), true);
eq("quarterly: no year-2 tranche is committed", quarterly.slice(4).some((t) => t.isCommitted), false);

// Dates are built in UTC. The cluster-day lesson: a release planned for 1 April
// must not land on 31 March for a reader in IST.
eq("first release is on the start date", quarterly[0].plannedOn.toISOString().slice(0, 10), "2026-04-01");
eq("second is a quarter later", quarterly[1].plannedOn.toISOString().slice(0, 10), "2026-07-01");
eq("year 2 begins twelve months on", quarterly[4].plannedOn.toISOString().slice(0, 10), "2027-04-01");
eq(
  "no date drifts to the previous day in UTC",
  quarterly.every((t) => t.plannedOn.toISOString().endsWith("T00:00:00.000Z")),
  true,
);

// A 31st-of-the-month start must not roll into the next month.
const monthEnd = buildTrancheSchedule({
  yearTotals: [{ grantYear: 1, total: toDecimal(4_00_000) }],
  frequency: "quarterly",
  startOn: new Date(Date.UTC(2026, 0, 31)),
});
eq(
  "a 31 Jan start does not become 3 May",
  monthEnd.map((t) => t.plannedOn.toISOString().slice(0, 10)).join(","),
  "2026-01-31,2026-04-30,2026-07-31,2026-10-31",
);

// ── Proposal stage machine ──────────────────────────────────────────────────

eq("received → screening", canTransition("received", "screening"), true);
eq("screening → eligible", canTransition("screening", "eligible"), true);
eq("anything live → ineligible", canTransition("due_diligence", "ineligible"), true);
// The refusals are the point: a pipeline whose stages can be set in any order
// makes every ageing figure meaningless.
eq("no skipping to decided", canTransition("received", "decided"), false);
eq("no going backwards", canTransition("appraisal", "screening"), false);
eq("terminal stays terminal", canTransition("decided", "appraisal"), false);
eq("ineligible is terminal", canTransition("ineligible", "screening"), false);

// ── Baseline diff ───────────────────────────────────────────────────────────

const line = (id: string, total: string, y1 = total, y2 = "0.00"): SnapshotLine => ({
  id,
  section: "Programme",
  description: `line ${id}`,
  domain: null,
  yearTotals: { "1": y1, "2": y2, "3": "0.00", "4": "0.00", "5": "0.00" },
  total,
});

const snapshot: BudgetSnapshot = {
  v: 1,
  takenAt: new Date().toISOString(),
  budgetId: "b1",
  horizonMonths: 24,
  lines: [line("a", "100000.00"), line("b", "50000.00")],
  total: "150000.00",
};

const same = diffAgainstSnapshot(snapshot, [line("a", "100000.00"), line("b", "50000.00")]);
eq("identical lines show no change", same.unchanged, true);
eq("delta is zero", same.delta, "0.00");

const changed = diffAgainstSnapshot(snapshot, [line("a", "120000.00"), line("b", "50000.00")]);
eq("an increase is detected", changed.changes.length, 1);
eq("the delta is signed", changed.delta, "20000.00");

const removed = diffAgainstSnapshot(snapshot, [line("a", "100000.00")]);
eq("a removed line is reported", removed.changes.filter((c) => c.kind === "removed").length, 1);
eq("removal shows as a negative delta", removed.delta, "-50000.00");

const added = diffAgainstSnapshot(snapshot, [
  line("a", "100000.00"),
  line("b", "50000.00"),
  line("c", "25000.00"),
]);
eq("an added line is reported", added.changes.filter((c) => c.kind === "added").length, 1);

// Money moved between years with the total unchanged is still a change: a
// reprofiling alters what is releasable this year even though the grant total
// is identical, and reporting it as "unchanged" would hide it entirely.
const reprofiled = diffAgainstSnapshot(snapshot, [
  line("a", "100000.00", "40000.00", "60000.00"),
  line("b", "50000.00"),
]);
eq("a reprofiling across years is caught", reprofiled.changes.length, 1);
eq("even though the total is unchanged", reprofiled.delta, "0.00");

// A decision recorded before the snapshot column existed has nothing to compare
// against; it must not be diffed against zero and reported as a whole new grant.
const emptySnapshot = { v: 1, takenAt: "", budgetId: "b1", horizonMonths: 12, lines: [], total: "0.00" } as BudgetSnapshot;
const vsEmpty = diffAgainstSnapshot(emptySnapshot, [line("a", "100000.00")]);
eq("an empty baseline reports additions, not a silent pass", vsEmpty.changes.length, 1);

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`\n[check-grant-invariants] ${passed} check(s) passed`);
if (failures.length) {
  console.error(`[check-grant-invariants] ${failures.length} FAILED:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("[check-grant-invariants] all good.\n");
// Deliberately no process.exit(0) in a finally: that pattern reports a crash as
// a success, which is how a broken script passes CI for a month.
