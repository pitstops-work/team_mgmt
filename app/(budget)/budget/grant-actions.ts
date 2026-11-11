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
  closureGate,
  closureFigures,
  overdueForClosure,
  type SettlementMode,
} from "@/lib/budget/closure";
import { AuthorityError, checkAuthority, authorityHoldersFor, type AuthorityAction } from "@/lib/budget/authority";
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
}) {
  const session = await requireSession();
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
  const session = await requireSession();
  try {
    await resolveCondition(session, conditionId, { mode: "discharge", note });
    revalidatePath("/budget");
    return { ok: true as const };
  } catch (err) {
    return asFormError(err);
  }
}

export async function waiveCondition(conditionId: string, note: string) {
  const session = await requireSession();
  try {
    await resolveCondition(session, conditionId, { mode: "waive", note });
    revalidatePath("/budget");
    return { ok: true as const };
  } catch (err) {
    return asFormError(err);
  }
}

export async function getGrantDecision(budgetId: string) {
  await requireSession();
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

export async function upsertGrantAgreement(input: {
  budgetId: string;
  decisionId?: string | null;
  reference?: string;
  trancheFrequency?: TrancheFrequency;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  granteeSignatoryName?: string;
  granteeSignatoryRole?: string;
  funderSignatoryName?: string;
  funderSignatoryRole?: string;
}) {
  const session = await requireSession();
  const data = {
    decisionId: input.decisionId ?? null,
    reference: input.reference ?? null,
    trancheFrequency: input.trancheFrequency ?? undefined,
    effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
    effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
    granteeSignatoryName: input.granteeSignatoryName ?? null,
    granteeSignatoryRole: input.granteeSignatoryRole ?? null,
    funderSignatoryName: input.funderSignatoryName ?? null,
    funderSignatoryRole: input.funderSignatoryRole ?? null,
  };

  const agreement = await prisma.grantAgreement.upsert({
    where: { budgetId: input.budgetId },
    create: { budgetId: input.budgetId, ...data },
    update: data,
    select: { id: true },
  });

  logGrant("GrantAgreement", agreement.id, session.user!.id!, "saved", {
    field: input.reference ?? "agreement",
    to: input.trancheFrequency ?? null,
  });
  revalidatePath(`/budget/${input.budgetId}`);
  return { ok: true as const, agreementId: agreement.id };
}

/**
 * Mark the agreement executed.
 *
 * This is the gate everything downstream hangs off — no money moves without it
 * — so both signature dates are required rather than assumed. An "executed"
 * agreement that nobody signed is the sort of record that only becomes a
 * problem during an audit.
 */
export async function executeGrantAgreement(input: {
  budgetId: string;
  granteeSignedOn: string;
  funderSignedOn: string;
  executedOn: string;
}) {
  const session = await requireSession();
  const existing = await prisma.grantAgreement.findUnique({
    where: { budgetId: input.budgetId },
    select: { id: true, status: true, granteeSignatoryName: true, funderSignatoryName: true },
  });
  if (!existing) return { ok: false as const, error: "Create the agreement first." };
  if (!existing.granteeSignatoryName || !existing.funderSignatoryName) {
    return { ok: false as const, error: "Record who signed on each side before marking it executed." };
  }

  await prisma.grantAgreement.update({
    where: { budgetId: input.budgetId },
    data: {
      status: "executed",
      granteeSignedOn: new Date(input.granteeSignedOn),
      funderSignedOn: new Date(input.funderSignedOn),
      executedOn: new Date(input.executedOn),
    },
  });

  logGrant("GrantAgreement", existing.id, session.user!.id!, "executed", {
    field: "status",
    from: existing.status,
    to: "executed",
  });
  revalidatePath(`/budget/${input.budgetId}`);
  return { ok: true as const };
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
  const session = await requireSession();
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

export async function generateSchedule(budgetId: string, opts?: { frequency?: TrancheFrequency; startOn?: string }) {
  const session = await requireSession();
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
  const session = await requireSession();
  try {
    const result = await recomputeGrantYear(session.user!.id!, budgetId, grantYear);
    revalidatePath(`/budget/${budgetId}/disbursements`);
    return { ok: true as const, ...result };
  } catch (err) {
    return asFormError(err);
  }
}

export async function getTrancheView(budgetId: string) {
  await requireSession();
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
  await requireSession();
  return releaseGate(trancheId);
}

export async function requestRelease(input: { trancheId: string; requestedAmount?: number; justification: string }) {
  const session = await requireSession();
  try {
    const result = await submitDisbursementRequest(session, input);
    revalidatePath("/budget/disbursements");
    return { ok: true as const, ...result };
  } catch (err) {
    return asFormError(err);
  }
}

export async function approveRelease(requestId: string, opts?: { note?: string; overrideReason?: string }) {
  const session = await requireSession();
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
  const session = await requireSession();
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
  const session = await requireSession();
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
  const session = await requireSession();
  try {
    await markDisbursementFailed(session, disbursementId, input);
    revalidatePath("/budget/disbursements");
    return { ok: true as const };
  } catch (err) {
    return asFormError(err);
  }
}

export async function reconcileReportSlot(slotId: string) {
  const session = await requireSession();
  try {
    const result = await reconcileSlot(session, slotId);
    return { ok: true as const, ...result };
  } catch (err) {
    return asFormError(err);
  }
}

/** The gap: approved for release, not yet confirmed paid by accounting. */
export async function getApprovedUnpaid(budgetId?: string) {
  await requireSession();
  return approvedUnpaid(budgetId ? { budgetId } : undefined);
}

// ── 1.4 Closure ──────────────────────────────────────────────────────────────

export async function startClosure(budgetId: string) {
  const session = await requireSession();
  try {
    const result = await initiateClosure(session, budgetId);
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
  const session = await requireSession();
  try {
    await setSettlement(session, input.budgetId, {
      mode: input.mode,
      adjustedIntoBudgetId: input.adjustedIntoBudgetId,
      refundAmount: input.refundAmount,
      refundReceivedOn: input.refundReceivedOn ? new Date(input.refundReceivedOn) : null,
      refundReference: input.refundReference,
      writeOffNote: input.writeOffNote,
    });
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
  const session = await requireSession();
  try {
    const result = await closeGrant(session, input.budgetId, input);
    revalidatePath(`/budget/${input.budgetId}`);
    revalidatePath("/budget/dashboard");
    return { ok: true as const, ...result };
  } catch (err) {
    return asFormError(err);
  }
}

export async function getClosureView(budgetId: string) {
  await requireSession();
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

export async function getOverdueClosures() {
  await requireSession();
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
  const session = await requireSession();
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
