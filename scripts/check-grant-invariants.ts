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
import { splitYearAmount, buildTrancheSchedule } from "../lib/budget/tranches";
import { canTransition } from "../lib/budget/proposals";
import { sharePct } from "../lib/budget/orgFinancials";
import { diffAgainstSnapshot, type BudgetSnapshot, type SnapshotLine } from "../lib/budget/baselineDiff";
import {
  AGREEMENT_TRANSITIONS,
  canTransitionAgreement,
  termsAreFrozen,
} from "../lib/budget/agreement";
import { PERIODS_PER_YEAR, TRANCHE_FREQUENCY_LABELS } from "../lib/budget/trancheFrequency";
import { GrantDocumentKind, GrantExitDecision } from "../app/generated/prisma/enums";
import { SETTLEMENT_MODES } from "../lib/budget/closure";
import {
  ASSET_DISPOSITIONS,
  ASSET_DISPOSITION_LABELS,
  DISPOSITIONS_NEEDING_NOTE,
  EXIT_DECISIONS,
  EXIT_DECISION_LABELS,
  SETTLEMENT_MODES_UI,
  SETTLEMENT_MODE_LABELS,
  isAssetDisposition,
} from "../lib/budget/closureVocabulary";
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LIST,
  DOCUMENT_STAGE_LABELS,
  GRANTEE_UPLOADABLE_KINDS,
  INTERNAL_ONLY_KINDS,
  STAGE_ORDER_FOR_DOCUMENTS,
  granteeMaySee,
  granteeMayUpload,
} from "../lib/budget/documentKinds";
import { documentHref, documentPathname, isExternalUrl } from "../lib/budget/documents";
import {
  buildStageStates,
  currentStage,
  PARTNER_VISIBLE,
  STAGE_LABELS,
  STAGE_ORDER,
  type StageSignals,
} from "../lib/budget/stageRules";

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

// ── Dependency ratio ────────────────────────────────────────────────────────
//
// The error this guards: a multi-year grant compared against ONE year of the
// grantee's spending. The raw number looks precise and is wrong by the number
// of years.

eq("a one-year grant at half their annual spend", sharePct(50_00_000, 1_00_00_000), 50);
eq("a grant larger than their annual spend", sharePct(1_50_00_000, 1_00_00_000), 150);
// Same money, spread over three years: 50%, not 150%.
eq("three years annualises to a third", sharePct(1_50_00_000, 1_00_00_000, 36), 50);
eq("18 months annualises correctly", sharePct(1_50_00_000, 1_00_00_000, 18), 100);
eq("months of zero is ignored, not divided by", sharePct(50_00_000, 1_00_00_000, 0), 50);
eq("no expenditure yields no ratio, not Infinity", sharePct(50_00_000, 0), null);
eq("rounds to one decimal", sharePct(33_33_333, 1_00_00_000), 33.3);


// ── Stage rules ─────────────────────────────────────────────────────────────
//
// These decide what the pipeline board and every grant page say about where a
// grant stands, and — in PARTNER_VISIBLE — which modules a grantee can see at
// all. The second is an access decision, so it is checked by name rather than
// by shape: a new stage that defaults to visible would otherwise ship an
// internal judgement to the organisation it is about.

const INTERNAL_ONLY = ["appraisal", "review", "assessment"] as const;

eq(
  "exactly three stages are internal-only",
  STAGE_ORDER.filter((k) => !PARTNER_VISIBLE[k]).join(","),
  INTERNAL_ONLY.join(","),
);
check(
  "every stage has a visibility decision",
  STAGE_ORDER.every((k) => typeof PARTNER_VISIBLE[k] === "boolean"),
);
check("every stage has a label", STAGE_ORDER.every((k) => Boolean(STAGE_LABELS[k])));
eq("no stage is listed twice", new Set(STAGE_ORDER).size, STAGE_ORDER.length);

/** A grant at its very beginning: nothing done, nothing known. */
function signals(over: Partial<StageSignals> = {}): StageSignals {
  return {
    hasGrantee: true,
    hasProposal: false,
    proposalDecided: false,
    reviewReachable: true,
    granteeMirrored: true,
    ddSectionsComplete: null,
    lineCount: 0,
    budgetApproved: false,
    budgetClosed: false,
    hasAssembly: false,
    assemblyRendered: false,
    judgementRecorded: false,
    hasDecision: false,
    openPreDisbursementConditions: 0,
    hasAgreement: false,
    agreementExecuted: false,
    documentCount: 0,
    trancheCount: 0,
    tranchesReleased: 0,
    slotCount: 0,
    slotsSubmitted: 0,
    slotsOverdue: 0,
    hasAssessment: false,
    closureStatus: null,
    ...over,
  };
}

// An unreachable second database must not be reported as an unstarted step.
// This is the one that would read as a fact while being a lie.
const offline = buildStageStates(signals({ reviewReachable: false }));
eq("unreachable review db: due diligence is unknown", offline.due_diligence.state, "unknown");
eq("unreachable review db: appraisal is unknown", offline.appraisal.state, "unknown");
eq("unreachable review db: review is unknown", offline.review.state, "unknown");
// And it must not take out the stages that live in this database.
eq("unreachable review db: budget still resolves", offline.budget.state, "pending");

// A grantee org that exists but has no due-diligence row IS a real "not
// started"; one we could not look up at all is not.
eq(
  "no dd record is pending, not unknown",
  buildStageStates(signals({ ddSectionsComplete: 0 })).due_diligence.state,
  "pending",
);
eq(
  "part-done dd is active",
  buildStageStates(signals({ ddSectionsComplete: 3 })).due_diligence.state,
  "active",
);
eq(
  "all eight sections is done",
  buildStageStates(signals({ ddSectionsComplete: 8 })).due_diligence.state,
  "done",
);
// An org nobody mirrored is a setup gap, not an appraiser's backlog, and it
// says so rather than reading as work not yet done. 17 of 18 funded orgs were
// in this state when the board first ran, and nothing had ever surfaced it.
const unmirrored = buildStageStates(signals({ granteeMirrored: false }));
eq("an unmirrored grantee is pending", unmirrored.due_diligence.state, "pending");
check(
  "and says no record can be started",
  unmirrored.due_diligence.blockers.some((b) => b.includes("not linked")),
);
check(
  "a mirrored grantee with nothing done carries no blocker",
  buildStageStates(signals({ ddSectionsComplete: 0 })).due_diligence.blockers.length === 0,
);

eq(
  "no grantee blocks due diligence",
  buildStageStates(signals({ hasGrantee: false })).due_diligence.state,
  "blocked",
);

// The state every pre-existing grant is in. Reporting it as done is what made
// the whole lifecycle look finished when nothing behind it existed.
const legacy = buildStageStates(signals({ budgetApproved: true, lineCount: 40 }));
eq("approved with no decision is blocked", legacy.decision.state, "blocked");
check("and says why", legacy.decision.blockers.length > 0);
eq("the budget itself is done", legacy.budget.state, "done");
// With no decision there is nothing to draft an agreement from, and nothing to
// release — stated as blockers rather than as an unexplained grey.
eq("no decision blocks the agreement", legacy.agreement.state, "blocked");
eq("no decision blocks releases", legacy.releases.state, "blocked");
check(
  "the release blocker names the decision",
  legacy.releases.blockers.some((b) => b.toLowerCase().includes("decision")),
);

// A legacy grant has no proposal and never will. `pending` would park every
// historic grant permanently at the first stage.
eq("no proposal is skipped", legacy.proposal.state, "skipped");
check(
  "and a skipped first stage is not where the grant sits",
  currentStage(legacy) !== "proposal",
);

// The release gate, blocker by blocker.
const unexecuted = buildStageStates(
  signals({ hasDecision: true, hasAgreement: true, agreementExecuted: false, trancheCount: 4 }),
);
eq("a drafted-but-unexecuted agreement blocks releases", unexecuted.releases.state, "blocked");
check(
  "and names the agreement",
  unexecuted.releases.blockers.some((b) => b.toLowerCase().includes("agreement")),
);

const conditioned = buildStageStates(
  signals({
    hasDecision: true,
    hasAgreement: true,
    agreementExecuted: true,
    trancheCount: 4,
    openPreDisbursementConditions: 2,
  }),
);
eq("an open pre-disbursement condition blocks releases", conditioned.releases.state, "blocked");
check(
  "and counts them",
  conditioned.releases.blockers.some((b) => b.includes("2 pre-disbursement conditions")),
);

const releasable = buildStageStates(
  signals({ hasDecision: true, hasAgreement: true, agreementExecuted: true, trancheCount: 4 }),
);
eq("a clear gate is active, not blocked", releasable.releases.state, "active");
eq("with no blockers", releasable.releases.blockers.length, 0);

// Zero tranches is not "all released". Treating an empty schedule as complete
// would mark an unfunded grant fully paid.
const noSchedule = buildStageStates(
  signals({ hasDecision: true, hasAgreement: true, agreementExecuted: true, trancheCount: 0 }),
);
eq("an empty schedule is pending, not done", noSchedule.releases.state, "pending");

eq(
  "every tranche released is done",
  buildStageStates(
    signals({
      hasDecision: true,
      hasAgreement: true,
      agreementExecuted: true,
      trancheCount: 4,
      tranchesReleased: 4,
    }),
  ).releases.state,
  "done",
);

// Reporting.
eq(
  "an overdue report blocks reporting",
  buildStageStates(signals({ slotCount: 4, slotsSubmitted: 1, slotsOverdue: 1 })).reporting.state,
  "blocked",
);
eq(
  "no schedule is pending, not done",
  buildStageStates(signals({ slotCount: 0 })).reporting.state,
  "pending",
);

// Nothing to assess until there is a period to assess against, so a grant with
// no schedule is skipped rather than permanently overdue.
eq("no reporting schedule means no assessment is owed", buildStageStates(signals()).assessment.state, "skipped");
eq(
  "a schedule makes an assessment owed",
  buildStageStates(signals({ slotCount: 2 })).assessment.state,
  "pending",
);

eq(
  "closed with no closure record is blocked",
  buildStageStates(signals({ budgetClosed: true })).closure.state,
  "blocked",
);
eq(
  "a closed closure is done",
  buildStageStates(signals({ closureStatus: "closed" })).closure.state,
  "done",
);
eq(
  "closed with exception is still closed",
  buildStageStates(signals({ closureStatus: "closed_with_exception" })).closure.state,
  "done",
);

// ── Which stage a person is sent to ─────────────────────────────────────────

// Earliest live or stuck stage wins over an earlier merely-pending one: a
// pending stage late in the lifecycle is not "now", it is simply not its turn.
const midGrant = buildStageStates(
  signals({
    ddSectionsComplete: 8,
    lineCount: 30,
    budgetApproved: true,
    hasAssembly: true,
    assemblyRendered: true,
    judgementRecorded: true,
    hasDecision: true,
    hasAgreement: true,
    agreementExecuted: true,
    documentCount: 3,
    trancheCount: 4,
    tranchesReleased: 1,
    slotCount: 4,
    slotsSubmitted: 1,
  }),
);
eq("a grant mid-release sits at releases", currentStage(midGrant), "releases");

// A grantee must never be pointed at a stage they cannot see. If this fails,
// the grantee's own "where does my grant stand" line names the appraisal note.
for (const states of [buildStageStates(signals()), legacy, midGrant, offline]) {
  const key = currentStage(states, { audience: "partner" });
  check(
    `a grantee is never sent to an internal-only stage (got ${key})`,
    key === null || PARTNER_VISIBLE[key],
  );
}

// A grant with nothing outstanding has no current stage at all — which is what
// puts it in the board's "nothing outstanding" column rather than at stage one.
const finished = buildStageStates(
  signals({
    hasProposal: true,
    proposalDecided: true,
    ddSectionsComplete: 8,
    lineCount: 30,
    budgetClosed: true,
    hasAssembly: true,
    assemblyRendered: true,
    judgementRecorded: true,
    hasDecision: true,
    hasAgreement: true,
    agreementExecuted: true,
    documentCount: 5,
    trancheCount: 4,
    tranchesReleased: 4,
    slotCount: 4,
    slotsSubmitted: 4,
    hasAssessment: true,
    closureStatus: "closed",
  }),
);
eq("a finished grant has no outstanding stage", currentStage(finished), null);
check(
  "and every stage of it reads done",
  STAGE_ORDER.every((k) => finished[k].state === "done"),
);


// ── Agreement status machine ────────────────────────────────────────────────
//
// The agreement is the release gate: releaseGate() refuses every tranche whose
// agreement is not `executed`. So these transitions are the shortest path
// between a committee saying yes and money leaving the organisation, and the
// one rule that matters most is what CANNOT happen.

// A contract both sides have signed is not editable. The only way out is
// termination; varying it means a fresh decision and re-execution.
eq("executed goes only to terminated", AGREEMENT_TRANSITIONS.executed.join(","), "terminated");
eq("terminated is terminal", AGREEMENT_TRANSITIONS.terminated.length, 0);
eq("an executed agreement cannot go back to drafting", canTransitionAgreement("executed", "drafting"), false);
eq("an executed agreement cannot be re-executed", canTransitionAgreement("executed", "executed"), false);
eq("a terminated agreement cannot be executed", canTransitionAgreement("terminated", "executed"), false);

// Execution cannot be reached without the draft having gone out for signature,
// which is what forces the internal sign-off to happen first.
eq("drafting cannot jump to executed", canTransitionAgreement("drafting", "executed"), false);
eq("drafting goes out for signature", canTransitionAgreement("drafting", "sent_for_signature"), true);
eq("and from there is executed", canTransitionAgreement("sent_for_signature", "executed"), true);
// A draft does come back for redrafting; pretending otherwise makes people work
// around the status rather than in it.
eq("sent can come back to drafting", canTransitionAgreement("sent_for_signature", "drafting"), true);

check(
  "every status has a transition list",
  (["drafting", "sent_for_signature", "executed", "terminated"] as const).every(
    (k) => Array.isArray(AGREEMENT_TRANSITIONS[k]),
  ),
);
check(
  "no status transitions to itself",
  (["drafting", "sent_for_signature", "executed", "terminated"] as const).every(
    (k) => !AGREEMENT_TRANSITIONS[k].includes(k),
  ),
);
// Termination is always available from a live agreement — grants do end early.
check(
  "a live agreement can always be terminated",
  (["drafting", "sent_for_signature", "executed"] as const).every((k) =>
    AGREEMENT_TRANSITIONS[k].includes("terminated"),
  ),
);

eq("executed terms are frozen", termsAreFrozen("executed"), true);
eq("terminated terms are frozen", termsAreFrozen("terminated"), true);
eq("a draft is editable", termsAreFrozen("drafting"), false);
eq("one out for signature is still editable", termsAreFrozen("sent_for_signature"), false);

// Every frequency the database accepts can be split into periods AND shown in
// a picker. A frequency with no label would be missing from the agreement
// screen while still being storable; one with no period count would divide a
// year's money by undefined.
eq(
  "every frequency has a period count and a label",
  Object.keys(PERIODS_PER_YEAR).sort().join(","),
  Object.keys(TRANCHE_FREQUENCY_LABELS).sort().join(","),
);


// ── Document kinds: who may see and send what ───────────────────────────────
//
// This table IS the access decision for the document repository, which holds
// audited accounts, FCRA returns, bank statements, a signed contract and the
// committee's own minutes. "Attached to this grant" is not permission to read:
// the appraisal note hangs off the same budget as the grantee's own utilisation
// certificate.

// The one that matters most. A kind added to the enum by a migration without a
// visibility decision would otherwise reach the screen with whatever the
// lookup happened to return.
eq(
  "every document kind in the enum has a rule",
  Object.keys(GrantDocumentKind).sort().join(","),
  DOCUMENT_KIND_LIST.slice().sort().join(","),
);

// Internal-only kinds, checked BY NAME rather than by count: a change here is
// a policy change and should have to be made deliberately in two places.
eq(
  "exactly the appraisal note and committee minutes are internal-only",
  INTERNAL_ONLY_KINDS.slice().sort().join(","),
  "appraisal_note,board_minutes",
);
eq("a grantee cannot see the appraisal note", granteeMaySee("appraisal_note"), false);
eq("a grantee cannot see committee minutes", granteeMaySee("board_minutes"), false);
// Nor attach one — that would write into our internal record, in a kind they
// cannot read back.
eq("a grantee cannot upload an appraisal note", granteeMayUpload("appraisal_note"), false);
eq("a grantee cannot upload committee minutes", granteeMayUpload("board_minutes"), false);

// You must be able to read back what you were asked to send. A kind that is
// uploadable but invisible would let a grantee file a document and then be
// told it does not exist.
check(
  "nothing is grantee-uploadable without being grantee-visible",
  GRANTEE_UPLOADABLE_KINDS.every((k) => granteeMaySee(k)),
);

// The things a grantee actually provides, spot-checked: these are what the
// reporting and closure stages chase them for.
for (const k of [
  "utilisation_certificate",
  "financial_report",
  "narrative_report",
  "audited_accounts",
  "fcra_return",
  "condition_evidence",
] as const) {
  check(`a grantee can send their ${k.replace(/_/g, " ")}`, granteeMayUpload(k));
}
// And the things we issue, which they may read but not replace.
for (const k of ["agreement_executed", "agreement_draft", "disbursement_advice"] as const) {
  check(`a grantee cannot overwrite the ${k.replace(/_/g, " ")}`, !granteeMayUpload(k));
  check(`but can read the ${k.replace(/_/g, " ")}`, granteeMaySee(k));
}

check(
  "every kind is grouped under a stage that has a label",
  DOCUMENT_KIND_LIST.every(
    (k) =>
      STAGE_ORDER_FOR_DOCUMENTS.includes(DOCUMENT_KINDS[k].stage) &&
      Boolean(DOCUMENT_STAGE_LABELS[DOCUMENT_KINDS[k].stage]),
  ),
);

// ── Storage convention ──────────────────────────────────────────────────────
//
// `GrantDocument.fileUrl` holds a blob PATHNAME for privately stored documents
// and a URL for external ones. Misreading one as the other is the whole failure
// mode: a pathname treated as a URL redirects the browser nowhere, and a URL
// treated as a pathname is fetched from the blob store and 404s.

eq("an https url is external", isExternalUrl("https://example.com/a.pdf"), true);
eq("an http url is external", isExternalUrl("http://example.com/a.pdf"), true);
eq("a blob pathname is not", isExternalUrl("grant-documents/proposal/abc/x.pdf"), false);
// A pathname that merely mentions http is still a pathname.
eq("a pathname containing 'http' is not a url", isExternalUrl("grant-documents/other/id/http-notes.pdf"), false);

eq(
  "a private document is served through our route",
  documentHref({ id: "doc1", fileUrl: "grant-documents/proposal/abc/x.pdf" }),
  "/api/grants/documents/doc1/file",
);
eq(
  "an external document is linked straight through",
  documentHref({ id: "doc1", fileUrl: "https://example.com/a.pdf" }),
  "https://example.com/a.pdf",
);

// The pathname must not announce whose grant it is: private blobs are only
// reachable through our route, but pathnames appear in store listings and logs.
const path1 = documentPathname("audited_accounts", "APSA accounts FY24.pdf");
check("the pathname is namespaced", path1.startsWith("grant-documents/audited_accounts/"));
check("and carries no spaces", !path1.includes(" "));
check("and sanitises the original name", path1.endsWith("APSA_accounts_FY24.pdf"));
check(
  "two uploads of the same file do not collide",
  documentPathname("audited_accounts", "a.pdf") !== documentPathname("audited_accounts", "a.pdf"),
);
// A traversal attempt in a filename must not escape the namespace.
const nasty = documentPathname("other", "../../etc/passwd");
check("a path traversal in the filename is neutralised", !nasty.includes(".."));
check("and it stays inside the namespace", nasty.startsWith("grant-documents/other/"));
check(
  "no separator from the original name survives",
  nasty.split("/").length === documentPathname("other", "plain.pdf").split("/").length,
);
// An empty or dots-only name must still produce a usable object name rather
// than a pathname that ends in a slash.
check("a dots-only filename still yields a name", documentPathname("other", "...").endsWith("/file"));
check("an empty filename still yields a name", documentPathname("other", "").endsWith("/file"));


// ── Closure vocabulary ──────────────────────────────────────────────────────
//
// Closure freezes a grant's figures for good, and the settlement mode is the
// financial position the organisation takes on money it gave away and did not
// get spent. Both lists therefore exist twice — once where the value is
// written to the database, once where a form renders it — because the screen
// is a client component and the writer imports prisma. Twice means they can
// drift, so this is the check that says they have not.

eq(
  "the settlement modes the form offers are the ones the database stores",
  SETTLEMENT_MODES_UI.slice().sort().join(","),
  SETTLEMENT_MODES.slice().sort().join(","),
);
check(
  "every settlement mode has a label",
  SETTLEMENT_MODES_UI.every((m) => Boolean(SETTLEMENT_MODE_LABELS[m])),
);

// The exit decision is a Prisma enum, so a value added there without a label
// would render as a raw identifier in a closed grant's record.
eq(
  "every exit decision in the enum can be offered",
  Object.keys(GrantExitDecision).sort().join(","),
  EXIT_DECISIONS.slice().sort().join(","),
);
check(
  "every exit decision has a label",
  EXIT_DECISIONS.every((d) => Boolean(EXIT_DECISION_LABELS[d])),
);
// `undecided` is the column default, so it has to be a choosable value rather
// than a state only the database can be in.
check("undecided is an offerable exit decision", EXIT_DECISIONS.includes("undecided"));

// GrantAsset.disposition is a free String in the schema — nothing stops a typo
// becoming a category — so this list and its validator are the only thing
// keeping the asset register answerable across a portfolio.
check(
  "every disposition has a label",
  ASSET_DISPOSITIONS.every((d) => Boolean(ASSET_DISPOSITION_LABELS[d])),
);
check("the validator accepts every disposition", ASSET_DISPOSITIONS.every((d) => isAssetDisposition(d)));
eq("and rejects anything else", isAssetDisposition("given_away"), false);
eq("including an empty string", isAssetDisposition(""), false);
check(
  "dispositions needing a note are real dispositions",
  DISPOSITIONS_NEEDING_NOTE.every((d) => (ASSET_DISPOSITIONS as readonly string[]).includes(d)),
);
// "Sold" without saying for how much, and "written off" without saying why,
// are the two that record nothing at all on their own. So is "undecided",
// which otherwise sits in the register for ever with no owner.
for (const d of ["sold", "written_off", "undecided"] as const) {
  check(`${d.replace(/_/g, " ")} requires a note`, DISPOSITIONS_NEEDING_NOTE.includes(d));
}
check(
  "retention by the grantee needs no note",
  !DISPOSITIONS_NEEDING_NOTE.includes("retained_by_grantee"),
);

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
