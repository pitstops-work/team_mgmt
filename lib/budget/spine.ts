/**
 * The grant spine — one lifecycle, resolved for one grant or for the whole
 * portfolio, in both audiences.
 *
 * Until this existed, a grant was not a thing you could open. It was an `Org`
 * in the review portal's due-diligence screens, an `assessment_assemblies` row
 * in the approvals wizard, and a `Budget` in the money side — three identities
 * for one grant, across two databases, with no view that showed where any of it
 * had got to. Every module existed; the chain did not. So the work read as a
 * budget tool with buttons bolted on, because that is exactly what it looked
 * like.
 *
 * This file is the chain. The RULES are not here — they are in
 * `lib/budget/stageRules.ts`, pure and shared, so the per-grant spine and the
 * portfolio board cannot drift into disagreeing about where a grant stands.
 * This file only gathers signals and decorates the verdicts with the things a
 * screen needs: a label, a line of fact, a link, a count.
 *
 * ── Honesty about what is not built ──────────────────────────────────────────
 *
 * `href: null` means there is no screen for that stage yet. The stage is still
 * shown, with its real state read from real tables, because a lifecycle with
 * half its stages quietly omitted is how you come to believe the system does
 * something it does not.
 *
 * ── Cross-database seam ──────────────────────────────────────────────────────
 *
 * Due diligence and the appraisal note live in REVIEW_DATABASE_URL with no
 * foreign keys to anything here. Those reads are best-effort and every failure
 * path degrades to `unknown`, never to `pending`. A reporting screen going
 * blank because a second database is down is not acceptable, and nor is
 * reporting an unreachable database as an unstarted step.
 */

import prisma from "@/lib/prisma";
import { sumMoney, formatMoneyShort } from "./money";
import { activeDecision } from "./decision";
import {
  buildStageStates,
  currentStage,
  DD_SECTION_COUNT,
  PARTNER_VISIBLE,
  STAGE_LABELS,
  STAGE_ORDER,
  type StageKey,
  type StageSignals,
  type StageState,
} from "./stageRules";
import { PUBLIC_STAGE_LABELS } from "./proposalVocabulary";

export type { StageKey, StageState } from "./stageRules";
export { STAGE_LABELS, STAGE_ORDER, PARTNER_VISIBLE } from "./stageRules";

export type SpineAudience = "internal" | "partner";

export type SpineStage = {
  key: StageKey;
  label: string;
  /** One line of fact, not encouragement. Null when there is nothing to say. */
  summary: string | null;
  state: StageState;
  /** Named reasons, when the state is blocked or merely stalled. */
  blockers: string[];
  /** Where to click. Null means no screen exists for this stage yet. */
  href: string | null;
  /** Whether a grantee login sees this stage at all. */
  partnerVisible: boolean;
  /** Count badge — open conditions, overdue reports, sections outstanding. */
  badge: number | null;
};

export type GrantSpine = {
  budgetId: string;
  name: string;
  granteeName: string | null;
  stages: SpineStage[];
  activeKey: StageKey | null;
  progress: { done: number; total: number };
};

// ── Review-database side ────────────────────────────────────────────────────

type AssemblyLite = {
  id: string;
  status: string;
  currentStep: string;
  judgementRecorded: boolean;
  rendered: boolean;
};

type ReviewSide = {
  reachable: boolean;
  /** The grantee org exists in the review database and can hold due diligence. */
  mirrored: boolean;
  reviewOrgId: string | null;
  /** Null when there is no due-diligence record at all. */
  ddSectionsComplete: number | null;
  assembly: AssemblyLite | null;
};

const UNREACHABLE: ReviewSide = {
  reachable: false,
  mirrored: false,
  reviewOrgId: null,
  ddSectionsComplete: null,
  assembly: null,
};

function toAssembly(row: Record<string, unknown>): AssemblyLite {
  return {
    id: String(row.id),
    status: String(row.status ?? ""),
    currentStep: String(row.current_step ?? ""),
    judgementRecorded: Boolean(row.judgement_submitted_at),
    rendered: Boolean(row.rendered_at),
  };
}

/**
 * Read the review database's half of the chain for one grant.
 *
 * The assembly keys on `budget_id` directly, so the appraisal note resolves
 * even for a grant whose grantee org was never mirrored into the review
 * database — which is the common case for older grants.
 */
async function loadReviewSide(appOrgId: string | null, budgetId: string): Promise<ReviewSide> {
  if (!process.env.REVIEW_DATABASE_URL) return UNREACHABLE;
  try {
    const { sql } = await import("@/lib/review/db");

    const assemblyRows = (await sql`
      SELECT id, status, current_step, judgement_submitted_at, rendered_at
      FROM assessment_assemblies
      WHERE budget_id = ${budgetId}
      ORDER BY updated_at DESC
      LIMIT 1
    `) as Record<string, unknown>[];
    const assembly = assemblyRows[0] ? toAssembly(assemblyRows[0]) : null;

    if (!appOrgId) return { ...UNREACHABLE, reachable: true, assembly };

    const ddRows = (await sql`
      SELECT o.id AS review_org_id, d.completed_stages
      FROM orgs o
      LEFT JOIN org_due_diligence d ON d.org_id = o.id
      WHERE o.app_org_id = ${appOrgId}
      LIMIT 1
    `) as Record<string, unknown>[];

    const dd = ddRows[0];
    return {
      reachable: true,
      mirrored: Boolean(dd),
      reviewOrgId: dd?.review_org_id ? String(dd.review_org_id) : null,
      // No org row at all → null (cannot establish). An org row with no due
      // diligence → 0 sections, which is a real "not started".
      ddSectionsComplete: !dd
        ? null
        : Array.isArray(dd.completed_stages)
          ? (dd.completed_stages as unknown[]).length
          : 0,
      assembly,
    };
  } catch {
    // Deliberately swallowed: the caller is told via `reachable`, and the page
    // must still render.
    return UNREACHABLE;
  }
}

/** The same read for many grants at once — two queries, not two per grant. */
async function loadReviewSideBatch(
  pairs: { budgetId: string; appOrgId: string | null }[],
): Promise<Map<string, ReviewSide>> {
  const out = new Map<string, ReviewSide>();
  for (const p of pairs) out.set(p.budgetId, UNREACHABLE);
  if (!pairs.length || !process.env.REVIEW_DATABASE_URL) return out;

  try {
    const { sql } = await import("@/lib/review/db");
    const budgetIds = pairs.map((p) => p.budgetId);
    const orgIds = [...new Set(pairs.map((p) => p.appOrgId).filter(Boolean) as string[])];

    const assemblyRows = (await sql`
      SELECT DISTINCT ON (budget_id)
             budget_id, id, status, current_step, judgement_submitted_at, rendered_at
      FROM assessment_assemblies
      WHERE budget_id = ANY(${budgetIds})
      ORDER BY budget_id, updated_at DESC
    `) as Record<string, unknown>[];
    const byBudget = new Map<string, AssemblyLite>();
    for (const r of assemblyRows) byBudget.set(String(r.budget_id), toAssembly(r));

    const ddRows = orgIds.length
      ? ((await sql`
          SELECT o.id AS review_org_id, o.app_org_id, d.completed_stages
          FROM orgs o
          LEFT JOIN org_due_diligence d ON d.org_id = o.id
          WHERE o.app_org_id = ANY(${orgIds})
        `) as Record<string, unknown>[])
      : [];
    const byOrg = new Map<string, { reviewOrgId: string; sections: number }>();
    for (const r of ddRows) {
      byOrg.set(String(r.app_org_id), {
        reviewOrgId: String(r.review_org_id),
        sections: Array.isArray(r.completed_stages)
          ? (r.completed_stages as unknown[]).length
          : 0,
      });
    }

    for (const p of pairs) {
      const dd = p.appOrgId ? byOrg.get(p.appOrgId) : undefined;
      out.set(p.budgetId, {
        reachable: true,
        mirrored: Boolean(dd),
        reviewOrgId: dd?.reviewOrgId ?? null,
        ddSectionsComplete: dd ? dd.sections : null,
        assembly: byBudget.get(p.budgetId) ?? null,
      });
    }
    return out;
  } catch {
    return out;
  }
}

// ── One grant ───────────────────────────────────────────────────────────────

/**
 * Resolve the whole lifecycle for one grant.
 *
 * Does NOT check access — callers have already done that per budget, and this
 * returning data is not permission to show it. `audience` only decides which
 * stages are included and where each one links.
 */
export async function resolveGrantSpine(
  budgetId: string,
  opts: { audience?: SpineAudience } = {},
): Promise<GrantSpine | null> {
  const audience = opts.audience ?? "internal";

  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    select: {
      id: true,
      name: true,
      status: true,
      partnerEditState: true,
      partnerSubmittedAt: true,
      approvedAt: true,
      grantPartner: { select: { name: true, orgId: true } },
      agreement: { select: { status: true, executedOn: true } },
      closure: { select: { status: true, unspentAmount: true, settlementMode: true } },
      proposal: { select: { id: true, publicRef: true, stage: true } },
      _count: { select: { lines: true, documents: true } },
    },
  });
  if (!budget) return null;

  const [review, decision, tranches, slots, conditions, assessments] = await Promise.all([
    loadReviewSide(budget.grantPartner?.orgId ?? null, budgetId),
    activeDecision(budgetId),
    prisma.grantTranche.findMany({
      where: { budgetId },
      select: { status: true, plannedAmount: true },
    }),
    prisma.budgetReportSlot.findMany({
      where: { budgetId },
      select: { dueDate: true, report: { select: { submittedAt: true } } },
    }),
    prisma.grantCondition.findMany({
      where: { decision: { budgetId } },
      select: { status: true, timing: true },
    }),
    prisma.grantAssessment.findMany({
      where: { budgetId },
      select: { overallRag: true, assessedOn: true },
      orderBy: { assessedOn: "desc" },
      take: 1,
    }),
  ]);

  const openConditions = conditions.filter((c) => c.status === "open");
  const released = tranches.filter((t) => t.status === "released");
  const submitted = slots.filter((s) => s.report?.submittedAt);
  const now = new Date();
  const overdue = slots.filter((s) => !s.report?.submittedAt && s.dueDate < now);
  const latestAssessment = assessments[0] ?? null;

  const signals: StageSignals = {
    hasGrantee: Boolean(budget.grantPartner),
    hasProposal: Boolean(budget.proposal),
    proposalDecided: budget.proposal?.stage === "decided",
    reviewReachable: review.reachable,
    granteeMirrored: review.mirrored,
    ddSectionsComplete: review.ddSectionsComplete,
    lineCount: budget._count.lines,
    budgetApproved: budget.status === "approved",
    budgetClosed: budget.status === "closed",
    hasAssembly: Boolean(review.assembly),
    assemblyRendered: Boolean(review.assembly?.rendered),
    judgementRecorded: Boolean(review.assembly?.judgementRecorded),
    hasDecision: Boolean(decision),
    openPreDisbursementConditions: openConditions.filter(
      (c) => c.timing === "pre_disbursement",
    ).length,
    hasAgreement: Boolean(budget.agreement),
    agreementExecuted: budget.agreement?.status === "executed",
    documentCount: budget._count.documents,
    trancheCount: tranches.length,
    tranchesReleased: released.length,
    slotCount: slots.length,
    slotsSubmitted: submitted.length,
    slotsOverdue: overdue.length,
    hasAssessment: Boolean(latestAssessment),
    closureStatus: budget.closure?.status ?? null,
  };

  const states = buildStageStates(signals);

  // One line of fact per stage. Written here rather than in the rules because a
  // sentence is a presentation choice, and the rules have to stay testable
  // without a database.
  const summaries: Record<StageKey, string | null> = {
    // The stage name differs by audience on purpose. "Due diligence" to an
    // applicant reads as a decision already taken, and "not eligible" is an
    // assessment of them rather than a statement about our decision —
    // `PUBLIC_STAGE_LABELS` carries the wording we can stand behind.
    proposal: budget.proposal
      ? `${budget.proposal.publicRef} · ${
          audience === "internal"
            ? budget.proposal.stage.replace(/_/g, " ")
            : PUBLIC_STAGE_LABELS[budget.proposal.stage]
        }`
      : "No proposal on record — this grant was set up directly.",
    due_diligence: !signals.hasGrantee
      ? "No grantee organisation assigned."
      : !review.reachable
        ? "Held in the review database, which could not be read just now."
        : !review.mirrored
          ? `${budget.grantPartner?.name ?? "This grantee"} is not linked to a due-diligence record.`
          : review.ddSectionsComplete === null
            ? "Linked, but no section has been started."
            : `${review.ddSectionsComplete} of ${DD_SECTION_COUNT} sections complete`,
    budget: budget._count.lines
      ? `${budget._count.lines} lines · ${budget.status}${
          budget.partnerEditState === "open" ? " · open to the grantee" : ""
        }`
      : "No lines yet.",
    appraisal: !review.reachable
      ? "Held in the review database, which could not be read just now."
      : review.assembly
        ? `${review.assembly.status.replace(/_/g, " ")}${review.assembly.rendered ? " · rendered" : ""}`
        : "No appraisal note started for this grant.",
    review: !review.reachable
      ? "Held in the review database, which could not be read just now."
      : !review.assembly
        ? "Nothing to review until there is an appraisal note."
        : review.assembly.judgementRecorded
          ? "Judgement recorded"
          : `Awaiting judgement · at step ${review.assembly.currentStep || "?"}`,
    decision: decision
      ? `${decision.outcome.replace(/_/g, " ")} · ${formatMoneyShort(decision.approvedAmount)} · ${decision.forum}`
      : budget.approvedAt
        ? "Marked approved, but no decision of record behind it."
        : "No decision recorded.",
    agreement: budget.agreement
      ? `${budget.agreement.status.replace(/_/g, " ")}${
          budget.agreement.executedOn
            ? ` on ${budget.agreement.executedOn.toISOString().slice(0, 10)}`
            : ""
        }`
      : "Not drafted.",
    documents: budget._count.documents
      ? `${budget._count.documents} on file`
      : "Nothing filed against this grant.",
    releases: tranches.length
      ? `${released.length} of ${tranches.length} released · ${formatMoneyShort(
          sumMoney(released.map((t) => t.plannedAmount)),
        )}`
      : decision
        ? "No release schedule generated yet."
        : "Nothing to release.",
    reporting: slots.length
      ? `${submitted.length} of ${slots.length} filed${overdue.length ? ` · ${overdue.length} overdue` : ""}`
      : "No reporting schedule set up.",
    assessment: latestAssessment
      ? `${latestAssessment.overallRag} as at ${latestAssessment.assessedOn.toISOString().slice(0, 10)}`
      : "Never assessed.",
    closure: budget.closure
      ? `${budget.closure.status.replace(/_/g, " ")}${
          budget.closure.settlementMode
            ? ` · ${budget.closure.settlementMode.replace(/_/g, " ")}`
            : ""
        }${
          Number(budget.closure.unspentAmount)
            ? ` · ${formatMoneyShort(budget.closure.unspentAmount)} unspent`
            : ""
        }`
      : budget.status === "closed"
        ? "Marked closed with no closure record."
        : "Open.",
  };

  // Where each stage links, per audience. A grantee's budget link goes to the
  // shared-draft view, which is the only budget screen middleware lets a
  // grantee reach — a link to /budget/<id> would silently redirect them to
  // /budget, which reads as the app losing their place.
  const hrefs: Record<StageKey, string | null> = {
    // Internal only. `PARTNER_VISIBLE.proposal` is true — a grantee may see
    // THAT their proposal exists and where it got to — but the desk behind
    // this link carries scores, decline reasons and reviewers' notes.
    proposal:
      audience === "internal" && budget.proposal
        ? `/budget/proposals/${budget.proposal.id}`
        : null,
    due_diligence:
      audience === "internal" && review.reviewOrgId
        ? `/due-diligence/${review.reviewOrgId}`
        : audience === "internal"
          ? "/due-diligence"
          : null,
    budget:
      audience === "partner"
        ? budget.partnerEditState === "open" || budget.partnerSubmittedAt
          ? `/budget/${budgetId}/draft`
          : null
        : `/budget/${budgetId}`,
    appraisal: review.assembly ? `/approvals/${review.assembly.id}` : "/approvals/new",
    review: review.assembly ? `/approvals/${review.assembly.id}` : null,
    decision: audience === "internal" ? `/budget/${budgetId}/decision` : null,
    agreement: `/budget/${budgetId}/agreement`,
    documents: `/budget/${budgetId}/documents`,
    releases: `/budget/${budgetId}/disbursements`,
    reporting: `/budget/${budgetId}/reports`,
    assessment: null,
    closure: `/budget/${budgetId}/closure`,
  };

  const badges: Record<StageKey, number | null> = {
    proposal: null,
    due_diligence:
      review.ddSectionsComplete !== null && review.ddSectionsComplete < DD_SECTION_COUNT
        ? DD_SECTION_COUNT - review.ddSectionsComplete
        : null,
    budget: null,
    appraisal: null,
    review: null,
    decision: openConditions.length || null,
    agreement: null,
    documents: null,
    releases: tranches.filter((t) => t.status === "requested").length || null,
    reporting: overdue.length || null,
    assessment: null,
    closure: null,
  };

  const all: SpineStage[] = STAGE_ORDER.map((key) => ({
    key,
    label: STAGE_LABELS[key],
    summary: summaries[key],
    state: states[key].state,
    blockers: states[key].blockers,
    href: hrefs[key],
    partnerVisible: PARTNER_VISIBLE[key],
    badge: badges[key],
  }));

  const visible = audience === "partner" ? all.filter((s) => s.partnerVisible) : all;
  const applicable = visible.filter((s) => s.state !== "skipped");

  return {
    budgetId,
    name: budget.name,
    granteeName: budget.grantPartner?.name ?? null,
    stages: visible,
    activeKey: currentStage(states, { audience }),
    progress: {
      done: applicable.filter((s) => s.state === "done").length,
      total: applicable.length,
    },
  };
}

// ── The whole portfolio ─────────────────────────────────────────────────────

export type PipelineRow = {
  budgetId: string;
  name: string;
  granteeName: string | null;
  grantingUnit: string | null;
  grantLead: string | null;
  status: string;
  /** Approved amount where there is a decision, else the budget's own total. */
  amount: string | null;
  amountIsApproved: boolean;
  stage: StageKey | null;
  stageState: StageState;
  blockers: string[];
  /** Days since the grant last changed — a cheap stand-in for time in stage. */
  daysSinceChange: number;
};

/**
 * Every grant, placed at the stage it is actually at.
 *
 * Two review-database queries for the whole set rather than two per grant, and
 * the same `buildStageStates` the per-grant spine uses — so a grant can never
 * appear in one column on the board and report a different stage when opened.
 */
export async function grantPipeline(opts: { grantingUnitId?: string } = {}): Promise<PipelineRow[]> {
  const budgets = await prisma.budget.findMany({
    where: opts.grantingUnitId ? { grantingUnitId: opts.grantingUnitId } : undefined,
    select: {
      id: true,
      name: true,
      status: true,
      approvedAt: true,
      updatedAt: true,
      horizonMonths: true,
      grantPartner: { select: { name: true, orgId: true } },
      grantingUnit: { select: { name: true } },
      grantLead: { select: { name: true } },
      agreement: { select: { status: true } },
      closure: { select: { status: true } },
      proposal: { select: { stage: true } },
      decisions: {
        where: { outcome: { in: ["approved", "approved_with_conditions"] } },
        select: { id: true, approvedAmount: true, supersedesId: true, decidedOn: true },
        orderBy: { decidedOn: "desc" },
      },
      tranches: { select: { status: true } },
      reportSlots: { select: { dueDate: true, report: { select: { submittedAt: true } } } },
      lines: { select: { y1Total: true, y2Total: true, y3Total: true, y4Total: true, y5Total: true } },
      _count: { select: { documents: true, assessments: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const review = await loadReviewSideBatch(
    budgets.map((b) => ({ budgetId: b.id, appOrgId: b.grantPartner?.orgId ?? null })),
  );

  // Open pre-disbursement conditions for the whole set in one query — the
  // release gate's most common blocker, and the one worth showing on a board.
  const openConds = await prisma.grantCondition.groupBy({
    by: ["decisionId"],
    where: { status: "open", timing: "pre_disbursement" },
    _count: { _all: true },
  });
  const condsByDecision = new Map(openConds.map((c) => [c.decisionId, c._count._all]));

  const now = Date.now();

  return budgets.map((b) => {
    const r = review.get(b.id) ?? UNREACHABLE;

    // The head decision is the one nothing supersedes — the same rule as
    // lib/budget/baselineDiff.ts's activeBaseline.
    const superseded = new Set(
      b.decisions.map((d) => d.supersedesId).filter(Boolean) as string[],
    );
    const head = b.decisions.find((d) => !superseded.has(d.id)) ?? b.decisions[0] ?? null;

    const submitted = b.reportSlots.filter((s) => s.report?.submittedAt).length;
    const overdue = b.reportSlots.filter(
      (s) => !s.report?.submittedAt && s.dueDate.getTime() < now,
    ).length;

    const signals: StageSignals = {
      hasGrantee: Boolean(b.grantPartner),
      hasProposal: Boolean(b.proposal),
      proposalDecided: b.proposal?.stage === "decided",
      reviewReachable: r.reachable,
      granteeMirrored: r.mirrored,
      ddSectionsComplete: r.ddSectionsComplete,
      lineCount: b.lines.length,
      budgetApproved: b.status === "approved",
      budgetClosed: b.status === "closed",
      hasAssembly: Boolean(r.assembly),
      assemblyRendered: Boolean(r.assembly?.rendered),
      judgementRecorded: Boolean(r.assembly?.judgementRecorded),
      hasDecision: Boolean(head),
      openPreDisbursementConditions: head ? (condsByDecision.get(head.id) ?? 0) : 0,
      hasAgreement: Boolean(b.agreement),
      agreementExecuted: b.agreement?.status === "executed",
      documentCount: b._count.documents,
      trancheCount: b.tranches.length,
      tranchesReleased: b.tranches.filter((t) => t.status === "released").length,
      slotCount: b.reportSlots.length,
      slotsSubmitted: submitted,
      slotsOverdue: overdue,
      hasAssessment: b._count.assessments > 0,
      closureStatus: b.closure?.status ?? null,
    };

    const states = buildStageStates(signals);
    const stage = currentStage(states);

    // The budget's own total is a fallback only. Where a decision exists, the
    // approved amount is the figure that matters — they are routinely
    // different, and showing the budget total for an approved grant would
    // overstate the portfolio by every variation ever granted.
    const bands = Math.min(5, Math.max(1, Math.ceil(b.horizonMonths / 12)));
    const budgetTotal = b.lines.reduce((sum, l) => {
      const years = [l.y1Total, l.y2Total, l.y3Total, l.y4Total, l.y5Total].slice(0, bands);
      return sum + years.reduce((a, v) => a + v, 0);
    }, 0);

    return {
      budgetId: b.id,
      name: b.name,
      granteeName: b.grantPartner?.name ?? null,
      grantingUnit: b.grantingUnit?.name ?? null,
      grantLead: b.grantLead?.name ?? null,
      status: b.status,
      amount: head
        ? formatMoneyShort(head.approvedAmount)
        : budgetTotal
          ? formatMoneyShort(budgetTotal)
          : null,
      amountIsApproved: Boolean(head),
      stage,
      stageState: stage ? states[stage].state : "done",
      blockers: stage ? states[stage].blockers : [],
      daysSinceChange: Math.floor((now - b.updatedAt.getTime()) / 86_400_000),
    };
  });
}
