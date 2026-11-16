"use server";

/**
 * Server actions for the grant lifecycle: decision, agreement, tranches,
 * disbursement and closure.
 *
 * Kept apart from `actions.ts` (budget authoring) and `report-actions.ts`
 * (reporting) because the gate is different: these are the amount-bearing
 * actions, and every one of them goes through `requireAuthority` in the library
 * layer rather than `isBudgetAdminOrSuperAdmin`. That guard is what let any
 * budget admin approve any amount, and it is deliberately NOT used here.
 *
 * Each action is a thin wrapper: validate the shape, call the library, revalidate
 * the paths. The invariants live in lib/budget/* so that a cron, a script or a
 * future API route cannot bypass them by not being a server action.
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type {
  GrantContinuity,
  GrantRole,
  GrantConditionTiming,
  GrantDecisionForum,
  GrantDecisionOutcome,
  GrantDocumentKind,
  TrancheFrequency,
} from "@/app/generated/prisma/client";
import { recordDecision, resolveCondition, activeDecision, decisionHistory } from "@/lib/budget/decision";
import { baselineVarianceFor } from "@/lib/budget/baselineDiff";
import { generateTrancheSchedule, recomputeGrantYear, trancheTotals } from "@/lib/budget/tranches";
import { releaseGate } from "@/lib/budget/releaseGate";
import {
  submitDisbursementRequest,
  approveDisbursementRequest,
  rejectDisbursementRequest,
  recordDisbursement,
  markDisbursementFailed,
  reconcileSlot,
  approvedUnpaid,
} from "@/lib/budget/disbursement";
import {
  initiateClosure,
  setSettlement,
  closeGrant,
  addClosureAsset,
  removeClosureAsset,
  closureAssets,
  closureGate,
  closureFigures,
  overdueForClosure,
  type SettlementMode,
} from "@/lib/budget/closure";
import { AuthorityError, checkAuthority, authorityHoldersFor, type AuthorityAction } from "@/lib/budget/authority";
import {
  assignGrantRole,
  endGrantRole,
  grantRoleHolders,
  unfilledRoles,
} from "@/lib/budget/grantRoles";
import {
  recordAssessment,
  assessmentHistory,
  portfolioHealth,
  unassessedPeriods,
  type AssessmentInput,
} from "@/lib/budget/assessment";
import { linkRenewal, renewalChain, partnerGrantHistory } from "@/lib/budget/renewal";
import {
  recordFinancialYear,
  dependencyRatio,
  financialHistory,
  staleFinancials,
} from "@/lib/budget/orgFinancials";
import {
  agreementFor,
  agreementGate,
  saveAgreementTerms,
  recordAgreementSignoff,
  sendAgreementForSignature,
  returnAgreementToDraft,
  executeAgreement,
  terminateAgreement,
} from "@/lib/budget/agreement";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { canAccessBudget } from "@/lib/budget/budgetAccess";
import { getPartnerAccess, partnerCanAccessBudget } from "@/lib/budget/partnerAccess";
import { logGrant } from "@/lib/budget/audit";
import { moneyToString } from "@/lib/budget/money";

async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session;
}

/**
 * Turn an authority refusal into something a form can render.
 *
 * Actions throw on refusal so a caller cannot forget to check, but a UI needs
 * the message and the "ask one of these people" list rather than a stack trace.
 */
/**
 * The gate for an amount-bearing action on one grant.
 *
 * Two checks, not one. `canAccessBudget` alone is not enough: its `own` rule is
 * what a GRANTEE login resolves to, so a grantee would pass it on their own
 * grant — and the agreement actions are what open the release gate. The role
 * check is therefore first and explicit, matching the decision screen's gate.
 */
async function requireGrantReviewer(budgetId: string) {
  const session = await requireSession();
  if (!(isSuperAdmin(session) || isBudgetAdmin(session))) throw new Error("Forbidden");
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    select: { partnerId: true, grantPartnerId: true },
  });
  if (!budget) throw new Error("Not found");
  if (!(await canAccessBudget(session, budget, "update"))) throw new Error("Forbidden");
  return session;
}

/**
 * Read access to one grant, for the views a grantee legitimately sees.
 *
 * Wider than `requireGrantReviewer` on purpose — a grantee should be able to
 * read their own closing figures — but narrower than `requireSession()`, which
 * is what `getClosureView` had and which let any logged-in user read any
 * grant's released, utilised and unspent totals.
 */
async function requireGrantReader(budgetId: string) {
  const session = await requireSession();
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    select: { partnerId: true, grantPartnerId: true },
  });
  if (!budget) throw new Error("Not found");
  if (isSuperAdmin(session) || isBudgetAdmin(session)) return session;
  if (budget.partnerId === session.user!.id) return session;
  const access = await getPartnerAccess(session);
  if (partnerCanAccessBudget(access, budget)) return session;
  throw new Error("Forbidden");
}

/**
 * Read access to a stage a grantee must never see.
 *
 * `requireGrantReader` is deliberately wider than the role — a grantee should
 * be able to read their own closing figures — and that makes it the wrong gate
 * for the three stages `PARTNER_VISIBLE` marks internal-only. An assessment
 * rationale says "budgeting badly, reporting late" about the organisation it is
 * written about; it is candid precisely because it is not addressed to them,
 * and `PARTNER_VISIBLE.assessment = false` is the policy that makes that true.
 * So: the role first and explicitly, then record access.
 */
async function requireInternalGrantReader(budgetId: string) {
  const session = await requireSession();
  if (!(isSuperAdmin(session) || isBudgetAdmin(session))) throw new Error("Forbidden");
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    select: { partnerId: true, grantPartnerId: true },
  });
  if (!budget) throw new Error("Not found");
  if (!(await canAccessBudget(session, budget, "read"))) throw new Error("Forbidden");
  return session;
}

/**
 * The role, with no grant to scope it to.
 *
 * For the portfolio-wide reads and the organisation-keyed writes. There is no
 * `budgetId` to check record access against, so the role IS the gate — which is
 * worth stating rather than leaving as the absence of a second check.
 *
 * What this does NOT do is narrow a portfolio read to the granting units the
 * reader can reach. That is true of every portfolio view in this app and is a
 * real limit, not a decision.
 */
async function requireInternalStaff() {
  const session = await requireSession();
  if (!(isSuperAdmin(session) || isBudgetAdmin(session))) throw new Error("Forbidden");
  return session;
}

/**
 * Which grant does this child row belong to?
 *
 * Half the actions in this file are keyed on a child id — a condition, a
 * tranche, a release request, a disbursement, a reporting slot — and not on a
 * budget. That is why they ended up with `requireSession()` and nothing else:
 * there was no `budgetId` in the signature to hand to a gate, so no gate was
 * written. Resolving ownership is three lines; not resolving it left the
 * release and payment path open to anyone with a login.
 *
 * Returns null when the row does not exist, so the caller refuses rather than
 * silently passing a gate on `undefined`.
 */
type GrantRef =
  | { kind: "condition"; id: string }
  | { kind: "tranche"; id: string }
  | { kind: "request"; id: string }
  | { kind: "disbursement"; id: string }
  | { kind: "slot"; id: string }
  | { kind: "roleAssignment"; id: string };

async function budgetIdFor(ref: GrantRef): Promise<string | null> {
  switch (ref.kind) {
    case "condition": {
      const row = await prisma.grantCondition.findUnique({
        where: { id: ref.id },
        select: { decision: { select: { budgetId: true } } },
      });
      return row?.decision.budgetId ?? null;
    }
    case "tranche": {
      const row = await prisma.grantTranche.findUnique({
        where: { id: ref.id },
        select: { budgetId: true },
      });
      return row?.budgetId ?? null;
    }
    case "request": {
      const row = await prisma.disbursementRequest.findUnique({
        where: { id: ref.id },
        select: { tranche: { select: { budgetId: true } } },
      });
      return row?.tranche.budgetId ?? null;
    }
    case "disbursement": {
      // Straight off the row. `Disbursement.requestId` is nullable with
      // `onDelete: SetNull` — a payment can outlive the request behind it — so
      // resolving through the request would have left an orphaned payment
      // permanently ungateable, and therefore unfixable.
      const row = await prisma.disbursement.findUnique({
        where: { id: ref.id },
        select: { budgetId: true },
      });
      return row?.budgetId ?? null;
    }
    case "slot": {
      const row = await prisma.budgetReportSlot.findUnique({
        where: { id: ref.id },
        select: { budgetId: true },
      });
      return row?.budgetId ?? null;
    }
    case "roleAssignment": {
      const row = await prisma.grantRoleAssignment.findUnique({
        where: { id: ref.id },
        select: { budgetId: true },
      });
      return row?.budgetId ?? null;
    }
  }
}

/** Write access to the grant a child row belongs to. */
async function requireGrantReviewerVia(ref: GrantRef) {
  const budgetId = await budgetIdFor(ref);
  if (!budgetId) throw new Error("Not found");
  return requireGrantReviewer(budgetId);
}

/** Read access to the grant a child row belongs to, grantee included. */
async function requireGrantReaderVia(ref: GrantRef) {
  const budgetId = await budgetIdFor(ref);
  if (!budgetId) throw new Error("Not found");
  return requireGrantReader(budgetId);
}

function asFormError(err: unknown): { ok: false; error: string; reason?: string } {
  if (err instanceof AuthorityError) {
    return { ok: false, error: err.message, reason: err.reason };
  }
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
}

// ── 1.1 Decision ─────────────────────────────────────────────────────────────

export async function recordGrantDecision(input: {
  budgetId: string;
  outcome: GrantDecisionOutcome;
  forum: GrantDecisionForum;
  decidedOn: string;
  approvedAmount: number;
  variationNote?: string;
  approvedMonths?: number | null;
  reasonCode?: string;
  reasonNote?: string;
  assemblyId?: string | null;
  meetingId?: string | null;
  conditions?: { text: string; timing: GrantConditionTiming; blocksTrancheNumber?: number | null; dueOn?: string | null }[];
  supersedesId?: string | null;
  baselineIsReconstructed?: boolean;
  reconstructionNote?: string;
}) {
  // `recordDecision` does check `requireAuthority("grant_decision")`, which is
  // why this was survivable: no authority rule, no decision. But authority
  // answers "may this person approve amounts of this size" — not "does this
  // person have any business with THIS grant". Today all 14 rules are scoped to
  // an RBAC role, so the role check below is partly belt-and-braces; the record
  // check is not, and it is the one authority will never make.
  const session = await requireGrantReviewer(input.budgetId);
  try {
    const decision = await recordDecision(session, {
      ...input,
      decidedOn: new Date(input.decidedOn),
      conditions: input.conditions?.map((c) => ({
        ...c,
        dueOn: c.dueOn ? new Date(c.dueOn) : null,
      })),
    });
    revalidatePath(`/budget/${input.budgetId}`);
    revalidatePath("/budget/dashboard");
    return { ok: true as const, decisionId: decision.id };
  } catch (err) {
    return asFormError(err);
  }
}

export async function dischargeCondition(conditionId: string, note: string) {
  const session = await requireGrantReviewerVia({ kind: "condition", id: conditionId });
  try {
    await resolveCondition(session, conditionId, { mode: "discharge", note });
    revalidatePath("/budget");
    return { ok: true as const };
  } catch (err) {
    return asFormError(err);
  }
}

export async function waiveCondition(conditionId: string, note: string) {
  // Waiving reaches `requireAuthority("condition_waive")` inside
  // `resolveCondition`; discharging does not reach any authority check at all,
  // and a discharged pre-disbursement condition opens the release gate just as
  // a waived one does.
  const session = await requireGrantReviewerVia({ kind: "condition", id: conditionId });
  try {
    await resolveCondition(session, conditionId, { mode: "waive", note });
    revalidatePath("/budget");
    return { ok: true as const };
  } catch (err) {
    return asFormError(err);
  }
}

/**
 * Internal, despite `PARTNER_VISIBLE.decision` being true.
 *
 * A grantee may see THAT a decision exists and on what terms; this returns the
 * forum, the reason codes and the decline notes, which the decision screen
 * itself says are "written for institutional memory rather than for the
 * applicant".
 */
export async function getGrantDecision(budgetId: string) {
  await requireInternalGrantReader(budgetId);
  const [decision, history, variance] = await Promise.all([
    activeDecision(budgetId),
    decisionHistory(budgetId),
    baselineVarianceFor(budgetId),
  ]);
  return {
    decision: decision
      ? { ...decision, approvedAmount: moneyToString(decision.approvedAmount) }
      : null,
    history: history.map((h) => ({ ...h, approvedAmount: moneyToString(h.approvedAmount) })),
    variance,
  };
}

// ── 1.2 Agreement and documents ──────────────────────────────────────────────

export async function getAgreement(budgetId: string) {
  await requireGrantReviewer(budgetId);
  const [view, blockers] = await Promise.all([agreementFor(budgetId), agreementGate(budgetId)]);
  return { view, blockers };
}

export async function saveAgreement(input: {
  budgetId: string;
  decisionId?: string | null;
  reference?: string | null;
  trancheFrequency?: TrancheFrequency;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  granteeSignatoryName?: string | null;
  granteeSignatoryRole?: string | null;
  funderSignatoryName?: string | null;
  funderSignatoryRole?: string | null;
}) {
  try {
    const session = await requireGrantReviewer(input.budgetId);
    const r = await saveAgreementTerms(session, input);
    revalidatePath(`/budget/${input.budgetId}/agreement`);
    revalidatePath(`/budget/${input.budgetId}`);
    return { ok: true as const, agreementId: r.agreementId };
  } catch (err) {
    return asFormError(err);
  }
}

export async function signOffAgreement(input: {
  budgetId: string;
  step: "prepared" | "reviewed" | "approved";
  note?: string;
}) {
  try {
    const session = await requireGrantReviewer(input.budgetId);
    await recordAgreementSignoff(session, input);
    revalidatePath(`/budget/${input.budgetId}/agreement`);
    return { ok: true as const };
  } catch (err) {
    return asFormError(err);
  }
}

export async function sendAgreement(budgetId: string) {
  try {
    const session = await requireGrantReviewer(budgetId);
    await sendAgreementForSignature(session, budgetId);
    revalidatePath(`/budget/${budgetId}/agreement`);
    return { ok: true as const };
  } catch (err) {
    return asFormError(err);
  }
}

export async function recallAgreement(budgetId: string, reason: string) {
  try {
    const session = await requireGrantReviewer(budgetId);
    await returnAgreementToDraft(session, budgetId, reason);
    revalidatePath(`/budget/${budgetId}/agreement`);
    return { ok: true as const };
  } catch (err) {
    return asFormError(err);
  }
}

/**
 * Mark the agreement executed. This is the action that opens the release gate,
 * so it revalidates the releases screen too — a stale "blocked by the
 * agreement" banner there would send someone looking for a problem that no
 * longer exists.
 */
export async function executeGrantAgreement(input: {
  budgetId: string;
  granteeSignedOn: string;
  funderSignedOn: string;
  executedOn: string;
}) {
  try {
    const session = await requireGrantReviewer(input.budgetId);
    const r = await executeAgreement(session, input);
    revalidatePath(`/budget/${input.budgetId}/agreement`);
    revalidatePath(`/budget/${input.budgetId}/disbursements`);
    revalidatePath(`/budget/${input.budgetId}`);
    return { ok: true as const, executedOn: r.executedOn };
  } catch (err) {
    return asFormError(err);
  }
}

export async function terminateGrantAgreement(input: {
  budgetId: string;
  terminatedOn: string;
  reason: string;
}) {
  try {
    const session = await requireGrantReviewer(input.budgetId);
    const r = await terminateAgreement(session, input);
    revalidatePath(`/budget/${input.budgetId}/agreement`);
    revalidatePath(`/budget/${input.budgetId}/disbursements`);
    return { ok: true as const, releasedBefore: r.releasedBefore };
  } catch (err) {
    return asFormError(err);
  }
}

export async function attachGrantDocument(input: {
  kind: GrantDocumentKind;
  title: string;
  fileUrl: string;
  mimeType?: string;
  sizeBytes?: number;
  budgetId?: string;
  agreementId?: string;
  conditionId?: string;
  meetingId?: string;
  disbursementId?: string;
  closureId?: string;
  proposalId?: string;
  /** The document this replaces — a new version is a new row. */
  supersedesId?: string;
}) {
  // Every anchor is optional, so there is not always a `budgetId` to gate on —
  // which is how this ended up ungated. An unanchored document is refused
  // rather than gated loosely: a row in the grant document set belonging to no
  // grant is not a thing anyone asked for, and it is exactly what an
  // unauthenticated-feeling write would produce.
  const anchorBudgetId =
    input.budgetId ??
    (input.conditionId ? await budgetIdFor({ kind: "condition", id: input.conditionId }) : null) ??
    (input.disbursementId
      ? await budgetIdFor({ kind: "disbursement", id: input.disbursementId })
      : null);
  if (!anchorBudgetId) {
    throw new Error(
      "Attach the document to a grant. The grantee-facing upload is /api/grants/documents/upload, which has its own gate on the document KIND.",
    );
  }
  const session = await requireGrantReviewer(anchorBudgetId);
  const anchors = [
    input.budgetId,
    input.agreementId,
    input.conditionId,
    input.meetingId,
    input.disbursementId,
    input.closureId,
    input.proposalId,
  ].filter(Boolean);
  if (anchors.length !== 1) {
    return { ok: false as const, error: "A document hangs off exactly one thing." };
  }

  let version = 1;
  if (input.supersedesId) {
    const prior = await prisma.grantDocument.findUnique({
      where: { id: input.supersedesId },
      select: { version: true, supersededBy: { select: { id: true } } },
    });
    if (!prior) return { ok: false as const, error: "The document being replaced no longer exists." };
    if (prior.supersededBy) return { ok: false as const, error: "That version has already been replaced." };
    version = prior.version + 1;
  }

  const doc = await prisma.grantDocument.create({
    data: {
      kind: input.kind,
      title: input.title,
      fileUrl: input.fileUrl,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? null,
      version,
      supersedesId: input.supersedesId ?? null,
      budgetId: input.budgetId ?? null,
      agreementId: input.agreementId ?? null,
      conditionId: input.conditionId ?? null,
      meetingId: input.meetingId ?? null,
      disbursementId: input.disbursementId ?? null,
      closureId: input.closureId ?? null,
      proposalId: input.proposalId ?? null,
      uploadedById: session.user!.id!,
    },
    select: { id: true },
  });

  logGrant("GrantDocument", doc.id, session.user!.id!, "attached", {
    field: `${input.kind} v${version}`,
    to: input.title,
  });
  if (input.budgetId) revalidatePath(`/budget/${input.budgetId}`);
  return { ok: true as const, documentId: doc.id };
}

// ── 1.3 Tranches and disbursement ────────────────────────────────────────────

/**
 * Writes the whole release schedule: how much the grantee is told they will
 * receive, and when. It reached no authority check and no role check.
 */
export async function generateSchedule(budgetId: string, opts?: { frequency?: TrancheFrequency; startOn?: string }) {
  const session = await requireGrantReviewer(budgetId);
  try {
    const planned = await generateTrancheSchedule(session.user!.id!, budgetId, {
      frequency: opts?.frequency,
      startOn: opts?.startOn ? new Date(opts.startOn) : undefined,
    });
    revalidatePath(`/budget/${budgetId}/disbursements`);
    return {
      ok: true as const,
      tranches: planned.map((t) => ({
        trancheNumber: t.trancheNumber,
        grantYear: t.grantYear,
        plannedOn: t.plannedOn.toISOString(),
        plannedAmount: moneyToString(t.plannedAmount),
        isCommitted: t.isCommitted,
      })),
    };
  } catch (err) {
    return asFormError(err);
  }
}

export async function recomputeYear(budgetId: string, grantYear: number) {
  const session = await requireGrantReviewer(budgetId);
  try {
    const result = await recomputeGrantYear(session.user!.id!, budgetId, grantYear);
    revalidatePath(`/budget/${budgetId}/disbursements`);
    return { ok: true as const, ...result };
  } catch (err) {
    return asFormError(err);
  }
}

/**
 * Read, grantee included: the releases page is in the partner allowlist on
 * purpose — what is coming, what is blocking the next tranche, and the bank
 * references to match against their own statement.
 */
export async function getTrancheView(budgetId: string) {
  await requireGrantReader(budgetId);
  const [tranches, totals] = await Promise.all([
    prisma.grantTranche.findMany({
      where: { budgetId },
      select: {
        id: true,
        trancheNumber: true,
        grantYear: true,
        plannedOn: true,
        plannedAmount: true,
        status: true,
        isCommitted: true,
        restatedFromAmount: true,
        restatementNote: true,
        gatingSlot: { select: { slotNumber: true, status: true } },
        requests: {
          select: { id: true, status: true, requestedAmount: true, submittedAt: true },
          orderBy: { createdAt: "desc" },
        },
        disbursements: {
          select: { id: true, amount: true, netAmount: true, valueDate: true, bankReference: true, status: true },
          orderBy: { valueDate: "desc" },
        },
      },
      orderBy: { trancheNumber: "asc" },
    }),
    trancheTotals(budgetId),
  ]);

  return {
    totals,
    tranches: tranches.map((t) => ({
      ...t,
      plannedAmount: moneyToString(t.plannedAmount),
      restatedFromAmount: t.restatedFromAmount ? moneyToString(t.restatedFromAmount) : null,
      requests: t.requests.map((r) => ({ ...r, requestedAmount: moneyToString(r.requestedAmount) })),
      disbursements: t.disbursements.map((d) => ({
        ...d,
        amount: moneyToString(d.amount),
        netAmount: moneyToString(d.netAmount),
      })),
    })),
  };
}

export async function getReleaseGate(trancheId: string) {
  await requireGrantReaderVia({ kind: "tranche", id: trancheId });
  return releaseGate(trancheId);
}

export async function requestRelease(input: { trancheId: string; requestedAmount?: number; justification: string }) {
  const session = await requireGrantReviewerVia({ kind: "tranche", id: input.trancheId });
  try {
    const result = await submitDisbursementRequest(session, input);
    revalidatePath("/budget/disbursements");
    return { ok: true as const, ...result };
  } catch (err) {
    return asFormError(err);
  }
}

export async function approveRelease(requestId: string, opts?: { note?: string; overrideReason?: string }) {
  const session = await requireGrantReviewerVia({ kind: "request", id: requestId });
  try {
    const result = await approveDisbursementRequest(session, requestId, {
      note: opts?.note,
      override: opts?.overrideReason ? { reason: opts.overrideReason } : undefined,
    });
    revalidatePath("/budget/disbursements");
    return { ok: true as const, ...result };
  } catch (err) {
    return asFormError(err);
  }
}

export async function rejectRelease(requestId: string, note: string) {
  const session = await requireGrantReviewerVia({ kind: "request", id: requestId });
  try {
    await rejectDisbursementRequest(session, requestId, note);
    revalidatePath("/budget/disbursements");
    return { ok: true as const };
  } catch (err) {
    return asFormError(err);
  }
}

export async function confirmPayment(input: {
  requestId: string;
  amount: number;
  tdsAmount?: number;
  valueDate: string;
  bankReference: string;
  instrument?: string;
  fromAccountLabel?: string;
}) {
  // ── The find of this audit ────────────────────────────────────────────────
  // This records money as having left the building: amount, value date, bank
  // reference. `recordDisbursement` checks only that the caller is logged in
  // and that the request is already `approved` — nothing about who they are.
  // The releases page is grantee-reachable and hides these controls behind a
  // `canRecord` prop, which is a UI flag and not a gate, so a grantee could
  // confirm a payment on their own approved tranche with a bank reference they
  // invented. The row would then drop off `approvedUnpaid()` — the report whose
  // whole job is to show money approved and not yet paid.
  const session = await requireGrantReviewerVia({ kind: "request", id: input.requestId });
  try {
    const row = await recordDisbursement(session, { ...input, valueDate: new Date(input.valueDate) });
    revalidatePath("/budget/disbursements");
    return { ok: true as const, disbursementId: row.id };
  } catch (err) {
    return asFormError(err);
  }
}

export async function markPaymentFailed(
  disbursementId: string,
  input: { status: "failed" | "returned" | "recovered"; note: string },
) {
  const session = await requireGrantReviewerVia({ kind: "disbursement", id: disbursementId });
  try {
    await markDisbursementFailed(session, disbursementId, input);
    revalidatePath("/budget/disbursements");
    return { ok: true as const };
  } catch (err) {
    return asFormError(err);
  }
}

export async function reconcileReportSlot(slotId: string) {
  const session = await requireGrantReviewerVia({ kind: "slot", id: slotId });
  try {
    const result = await reconcileSlot(session, slotId);
    return { ok: true as const, ...result };
  } catch (err) {
    return asFormError(err);
  }
}

/** The gap: approved for release, not yet confirmed paid by accounting. */
/**
 * Portfolio-wide when called with no argument, so the role is the gate. With a
 * `budgetId` it is scoped to that grant and checked against it, because a
 * reviewer who may read one grant is not thereby allowed to read the rest.
 */
export async function getApprovedUnpaid(budgetId?: string) {
  if (budgetId) await requireInternalGrantReader(budgetId);
  else await requireInternalStaff();
  return approvedUnpaid(budgetId ? { budgetId } : undefined);
}

// ── 1.4 Closure ──────────────────────────────────────────────────────────────

export async function startClosure(budgetId: string) {
  try {
    const session = await requireGrantReviewer(budgetId);
    const result = await initiateClosure(session, budgetId);
    revalidatePath(`/budget/${budgetId}/closure`);
    revalidatePath(`/budget/${budgetId}`);
    return { ok: true as const, ...result };
  } catch (err) {
    return asFormError(err);
  }
}

export async function recordSettlement(input: {
  budgetId: string;
  mode: SettlementMode;
  adjustedIntoBudgetId?: string | null;
  refundAmount?: number;
  refundReceivedOn?: string | null;
  refundReference?: string | null;
  writeOffNote?: string | null;
}) {
  try {
    const session = await requireGrantReviewer(input.budgetId);
    await setSettlement(session, input.budgetId, {
      mode: input.mode,
      adjustedIntoBudgetId: input.adjustedIntoBudgetId,
      refundAmount: input.refundAmount,
      refundReceivedOn: input.refundReceivedOn ? new Date(input.refundReceivedOn) : null,
      refundReference: input.refundReference,
      writeOffNote: input.writeOffNote,
    });
    revalidatePath(`/budget/${input.budgetId}/closure`);
    revalidatePath(`/budget/${input.budgetId}`);
    return { ok: true as const };
  } catch (err) {
    return asFormError(err);
  }
}

export async function closeOutGrant(input: {
  budgetId: string;
  exitDecision?: "renew" | "exit" | "pause";
  exitNote?: string;
  exceptionNote?: string;
}) {
  try {
    // `closeGrant` already goes through requireAuthority("closure_close"), which
    // refuses when no rule matches. This adds the record-access question that
    // authority rules do not ask: an admin of another granting unit can hold the
    // authority and still have no business closing this grant.
    const session = await requireGrantReviewer(input.budgetId);
    const result = await closeGrant(session, input.budgetId, input);
    revalidatePath(`/budget/${input.budgetId}/closure`);
    revalidatePath(`/budget/${input.budgetId}`);
    revalidatePath("/budget/dashboard");
    revalidatePath("/budget/pipeline");
    return { ok: true as const, ...result };
  } catch (err) {
    return asFormError(err);
  }
}

export async function getClosureView(budgetId: string) {
  await requireGrantReader(budgetId);
  const [gate, figures, closure] = await Promise.all([
    closureGate(budgetId),
    closureFigures(budgetId),
    prisma.grantClosure.findUnique({
      where: { budgetId },
      select: {
        id: true,
        status: true,
        settlementMode: true,
        adjustedIntoBudgetId: true,
        exceptionNote: true,
        exitDecision: true,
        closedAt: true,
        totalReleased: true,
        totalUtilised: true,
        unspentAmount: true,
      },
    }),
  ]);
  return {
    gate,
    live: {
      totalReleased: moneyToString(figures.totalReleased),
      totalUtilised: moneyToString(figures.totalUtilised),
      unspent: moneyToString(figures.unspent),
      openBorrowings: figures.openBorrowings,
    },
    closure: closure
      ? {
          ...closure,
          // Frozen figures, shown as what they are: the numbers at closure, not
          // a live recomputation.
          totalReleased: moneyToString(closure.totalReleased),
          totalUtilised: moneyToString(closure.totalUtilised),
          unspentAmount: moneyToString(closure.unspentAmount),
        }
      : null,
  };
}

export async function recordClosureAsset(input: {
  budgetId: string;
  description: string;
  quantity?: number;
  cost: number;
  acquiredOn?: string | null;
  disposition: string;
  dispositionNote?: string | null;
}) {
  try {
    const session = await requireGrantReviewer(input.budgetId);
    const r = await addClosureAsset(session, input.budgetId, {
      description: input.description,
      quantity: input.quantity,
      cost: input.cost,
      acquiredOn: input.acquiredOn ? new Date(input.acquiredOn) : null,
      disposition: input.disposition,
      dispositionNote: input.dispositionNote,
    });
    revalidatePath(`/budget/${input.budgetId}/closure`);
    return { ok: true as const, ...r };
  } catch (err) {
    return asFormError(err);
  }
}

export async function deleteClosureAsset(input: { budgetId: string; assetId: string }) {
  try {
    const session = await requireGrantReviewer(input.budgetId);
    await removeClosureAsset(session, input.budgetId, input.assetId);
    revalidatePath(`/budget/${input.budgetId}/closure`);
    return { ok: true as const };
  } catch (err) {
    return asFormError(err);
  }
}

export async function getClosureAssets(budgetId: string) {
  await requireGrantReader(budgetId);
  return closureAssets(budgetId);
}

export async function getOverdueClosures() {
  await requireInternalStaff();
  return overdueForClosure();
}

// ── 2.2 Authority, for the UI ────────────────────────────────────────────────

/**
 * Can the current user do this, and if not, who can?
 *
 * Lets a screen disable a button and name an alternative rather than letting
 * someone fill a form and be refused at submit.
 */
export async function canIApprove(input: {
  action: AuthorityAction;
  amount?: number;
  grantingUnitId?: string | null;
  domain?: string | null;
  orgId?: string | null;
  submittedById?: string | null;
}) {
  // Asks about the caller's own authority, which sounds self-scoped — but the
  // refusal path calls `authorityHoldersFor()` and names the people who CAN
  // approve. That is the internal approval chain, and it is not a grantee's to
  // read.
  const session = await requireInternalStaff();
  const verdict = await checkAuthority(session, input);
  if (verdict.ok) return { ok: true as const, remainingApprovals: verdict.remainingApprovals };

  const holders = await authorityHoldersFor(input);
  const users = holders.userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: holders.userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const roles = holders.roleIds.length
    ? await prisma.role.findMany({ where: { id: { in: holders.roleIds } }, select: { id: true, name: true } })
    : [];

  return { ok: false as const, reason: verdict.reason, message: verdict.message, canInstead: { users, roles } };
}

// ── Second pass: roles, assessment, renewal, grantee financials ──────────────

/**
 * ── The escalation chain ──────────────────────────────────────────────────
 * `checkAuthority` matches rules on the grant roles the caller holds
 * (`authority.ts`: `rolesHeldBy(check.budgetId, userId)` feeding
 * `grantRole: { in: grantRoles }`). So assigning a grant role can confer
 * approval authority over that grant's money — and this action asked only for
 * a session. Any logged-in user could give themselves a role on any grant.
 *
 * Latent rather than live today: of the 14 authority rules in the database, 0
 * are scoped to a grant role, so there is currently nothing to escalate INTO.
 * One policy row scoped to "programme finance" would have made it live, and
 * nothing in the code would have changed to tell anyone.
 */
export async function setGrantRole(input: {
  budgetId: string;
  role: GrantRole;
  userId: string;
  note?: string;
}) {
  const session = await requireGrantReviewer(input.budgetId);
  try {
    const result = await assignGrantRole(session, input);
    revalidatePath(`/budget/${input.budgetId}`);
    return { ok: true as const, ...result };
  } catch (err) {
    return asFormError(err);
  }
}

export async function clearGrantRole(assignmentId: string, budgetId: string, note?: string) {
  // Gated on the assignment's OWN grant, not on the `budgetId` the caller
  // passed. The two are separate arguments and nothing tied them together, so
  // a caller with access to one grant could have ended a role on another by
  // naming their own budget here — the revalidate path would even look right.
  const session = await requireGrantReviewerVia({ kind: "roleAssignment", id: assignmentId });
  const ownerBudgetId = await budgetIdFor({ kind: "roleAssignment", id: assignmentId });
  if (ownerBudgetId !== budgetId) {
    throw new Error("That role assignment belongs to a different grant.");
  }
  try {
    await endGrantRole(session, assignmentId, note);
    revalidatePath(`/budget/${budgetId}`);
    return { ok: true as const };
  } catch (err) {
    return asFormError(err);
  }
}

/** Who holds what on this grant — the internal org chart for it. */
export async function getGrantRoles(budgetId: string) {
  await requireInternalGrantReader(budgetId);
  const [holders, unfilled] = await Promise.all([
    grantRoleHolders(budgetId),
    unfilledRoles(budgetId),
  ]);
  return { holders, unfilled };
}

/**
 * Write the judgement.
 *
 * Was `requireSession()`, which on a stage the grantee cannot even SEE meant
 * the grantee could WRITE it: three greens on their own grant, with their own
 * name recorded as the assessor, feeding the portfolio health view that decides
 * where attention goes. That is the sharpest form of this hole yet — the access
 * table said `assessment: false` and the action behind it asked nothing.
 */
export async function saveAssessment(input: AssessmentInput) {
  const session = await requireGrantReviewer(input.budgetId);
  try {
    const row = await recordAssessment(session, input);
    revalidatePath(`/budget/${input.budgetId}`);
    revalidatePath("/budget/dashboard");
    return { ok: true as const, assessmentId: row.id };
  } catch (err) {
    return asFormError(err);
  }
}

export async function getAssessments(budgetId: string) {
  await requireInternalGrantReader(budgetId);
  return assessmentHistory(budgetId);
}

/**
 * The portfolio health view.
 *
 * The worst of the read holes: `requireSession()` returned every approved
 * grant's RAG ratings and rationales, across every grantee, to any logged-in
 * user — including a grantee, who would have read what we think of their peers
 * and of themselves.
 *
 * Role-gated rather than record-gated, because the question it answers is
 * portfolio-wide and there is no single budget to scope it to. What it does NOT
 * do is narrow the rows to the granting units this reviewer can reach; that is
 * true of every portfolio view in this app, and it is a real limit rather than
 * a decision — worth closing once unit-level read scoping exists anywhere else
 * to copy.
 */
export async function getPortfolioHealth(grantingUnitId?: string) {
  await requireInternalStaff();
  const [rows, unassessed] = await Promise.all([
    portfolioHealth(grantingUnitId ? { grantingUnitId } : undefined),
    unassessedPeriods(),
  ]);
  return { rows, unassessed };
}

export async function setRenewal(input: {
  budgetId: string;
  renewsBudgetId: string;
  continuity?: GrantContinuity;
}) {
  // BOTH grants, because this writes a relationship between them and the
  // predecessor's history is what a renewal appraisal then leans on. Access to
  // the new grant alone would let someone attach it to a predecessor they
  // cannot see.
  const session = await requireGrantReviewer(input.budgetId);
  await requireInternalGrantReader(input.renewsBudgetId);
  try {
    await linkRenewal(session, input.budgetId, input.renewsBudgetId, input.continuity);
    revalidatePath(`/budget/${input.budgetId}`);
    return { ok: true as const };
  } catch (err) {
    return asFormError(err);
  }
}

/**
 * Internal: `partnerGrantHistory` returns this grantee's OTHER grants, so a
 * grantee reading it would see the portfolio we hold on them — and a reviewer
 * with access to one grant would see the rest.
 */
export async function getRenewalContext(budgetId: string) {
  await requireInternalGrantReader(budgetId);
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    select: { grantPartnerId: true },
  });
  const [chain, history] = await Promise.all([
    renewalChain(budgetId),
    budget?.grantPartnerId ? partnerGrantHistory(budget.grantPartnerId) : null,
  ]);
  return { chain, history };
}

export async function saveOrgFinancialYear(input: {
  orgId: string;
  yearEnding: number;
  expenditure: number;
  income?: number;
  isAudited?: boolean;
  source?: string;
}) {
  // Keyed on an organisation, not a grant, so the role is the gate. These
  // figures are the denominator of the dependency ratio an appraisal leans on:
  // overstate the expenditure and a grant that would have looked like most of
  // an organisation's income looks like a modest share of it.
  const session = await requireInternalStaff();
  try {
    const row = await recordFinancialYear(session, input);
    return { ok: true as const, id: row.id };
  } catch (err) {
    return asFormError(err);
  }
}

/**
 * The appraisal panel's dependency figure: this grant against what the
 * organisation spends in a year. `months` matters — for a multi-year grant the
 * annualised share is the comparable number, and the raw ratio would wrongly
 * make a sound partner look dependent.
 */
export async function getDependencyRatio(input: {
  orgId: string;
  amount: number;
  months?: number;
}) {
  await requireInternalStaff();
  const [ratio, history] = await Promise.all([
    dependencyRatio(input.orgId, input.amount, { months: input.months }),
    financialHistory(input.orgId),
  ]);
  return { ratio, history };
}

export async function getStaleFinancials() {
  await requireInternalStaff();
  return staleFinancials();
}
