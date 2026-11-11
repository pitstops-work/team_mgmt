/**
 * The funder side of the money.
 *
 * The largest gap in the portal was that "released" existed nowhere:
 * `BudgetReport.tranchesReceived` is a number the GRANTEE types, so
 * `grantAggregation.ts` could only ever compute approved vs utilised. Nobody
 * could answer what had actually gone out.
 *
 * **Accounting is the system of record.** Pitstops approves a release; finance
 * pays from the accounting system. So `Disbursement` here is a CONFIRMATION
 * record, not a ledger: it exists so the approved-vs-paid gap is visible, and
 * `bankReference` is what ties a row to the system that really owns it. Two
 * consequences run through this file:
 *
 *  - Nothing writes to a bank, and no figure here is presented as authoritative
 *    on a payment. The valuable screen is the gap.
 *  - A `released` row without a bank reference is refused. A payment recorded
 *    here that accounting does not have is worse than no row at all, because it
 *    makes a reconciliation look complete.
 */

import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { toDecimal, moneyToString, sumMoney, subMoney, type MoneyInput } from "./money";
import { requireAuthority } from "./authority";
import { releaseGate, wouldExceedApproved, type Blocker } from "./releaseGate";
import { logGrant, logGateOverride } from "./audit";

type SessionLike = { user?: { id?: string | null; role?: string | null } | null } | null;

/**
 * Raise a request to release a tranche.
 *
 * Deliberately permitted while the gate is blocked: the blockers are frozen
 * into `gateSnapshot` and the request becomes the thing that makes the blockage
 * visible and chaseable. Approval is where the gate bites.
 */
export async function submitDisbursementRequest(
  session: SessionLike,
  input: { trancheId: string; requestedAmount?: MoneyInput; justification: string },
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");
  if (!input.justification?.trim()) throw new Error("Say what this release is for.");

  const tranche = await prisma.grantTranche.findUnique({
    where: { id: input.trancheId },
    select: {
      id: true,
      budgetId: true,
      plannedAmount: true,
      isCommitted: true,
      status: true,
      requests: { where: { status: { in: ["draft", "submitted", "approved"] } }, select: { id: true } },
    },
  });
  if (!tranche) throw new Error("Not found");

  // An indicative tranche is a projection off the budget, not a commitment —
  // requesting against one would start a release for a figure nobody approved.
  if (!tranche.isCommitted) {
    throw new Error(
      "This tranche is still an indicative projection. Recompute and commit the grant year before requesting a release against it.",
    );
  }
  if (tranche.status === "cancelled") throw new Error("This tranche has been cancelled.");
  if (tranche.requests.length) {
    throw new Error("There is already an open request on this tranche.");
  }

  const amount = toDecimal(input.requestedAmount ?? tranche.plannedAmount);
  const gate = await releaseGate(input.trancheId);

  const request = await prisma.disbursementRequest.create({
    data: {
      trancheId: input.trancheId,
      requestedAmount: amount,
      justification: input.justification.trim(),
      // Frozen at submit: a condition discharged tomorrow must not rewrite why
      // this request was allowed through today.
      gateSnapshot: {
        takenAt: new Date().toISOString(),
        ok: gate.ok,
        blockers: gate.blockers,
      } as unknown as Prisma.InputJsonValue,
      status: "submitted",
      submittedById: userId,
      submittedAt: new Date(),
    },
    select: { id: true },
  });

  await prisma.grantTranche.update({
    where: { id: input.trancheId },
    data: { status: gate.ok ? "requested" : "blocked" },
  });

  logGrant("Disbursement", request.id, userId, "request_submitted", {
    field: `tranche:${input.trancheId}${gate.ok ? "" : ` (${gate.blockers.length} blocker(s))`}`,
    to: moneyToString(amount),
  });

  return { requestId: request.id, gate };
}

/**
 * Approve a release request.
 *
 * Three gates, in this order, because the order is the point:
 *  1. The release gate — refuses while a condition, document, report or
 *     registration stands in the way, unless an override is supplied.
 *  2. The approved ceiling — an ABSOLUTE refusal with no override. Over-paying
 *     an approved grant is the error this module exists to prevent.
 *  3. Authority — the amount against the DoA matrix, maker-checker, and any
 *     live conflict declaration.
 */
export async function approveDisbursementRequest(
  session: SessionLike,
  requestId: string,
  opts?: { override?: { reason: string }; note?: string },
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const request = await prisma.disbursementRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      requestedAmount: true,
      submittedById: true,
      trancheId: true,
      approvals: { select: { approverId: true } },
      tranche: {
        select: {
          id: true,
          budgetId: true,
          budget: {
            select: {
              grantingUnitId: true,
              domains: true,
              grantPartner: { select: { orgId: true } },
            },
          },
        },
      },
    },
  });
  if (!request) throw new Error("Not found");
  if (request.status !== "submitted") throw new Error("This request is not awaiting approval.");

  const gate = await releaseGate(request.trancheId);
  if (!gate.ok) {
    if (!opts?.override?.reason?.trim()) {
      throw new Error(
        `Cannot approve while blocked: ${gate.blockers.map((b) => b.message).join(" / ")}`,
      );
    }
    // Overriding is its own authority action, so that the right to push past a
    // gate can be held by fewer people than the right to approve a release.
    await requireAuthority(session, {
      action: "gate_override",
      budgetId: request.tranche.budgetId,
      grantingUnitId: request.tranche.budget.grantingUnitId,
      domain: request.tranche.budget.domains[0] ?? null,
      orgId: request.tranche.budget.grantPartner?.orgId ?? null,
    });
  }

  const ceiling = await wouldExceedApproved(request.tranche.budgetId, request.requestedAmount);
  if (ceiling.exceeds) {
    // No override path. Deliberate.
    throw new Error(
      `This would take releases to more than the approved amount (approved ${ceiling.approved}, already ${ceiling.releasedSoFar}, requesting ${ceiling.attempting}).`,
    );
  }

  const verdict = await requireAuthority(session, {
    action: "disbursement_approve",
    amount: request.requestedAmount,
    budgetId: request.tranche.budgetId,
    grantingUnitId: request.tranche.budget.grantingUnitId,
    domain: request.tranche.budget.domains[0] ?? null,
    orgId: request.tranche.budget.grantPartner?.orgId ?? null,
    submittedById: request.submittedById,
    existingApproverIds: request.approvals.map((a) => a.approverId),
  });

  const stillNeeded = verdict.remainingApprovals;

  await prisma.$transaction(async (tx) => {
    await tx.disbursementApproval.create({
      data: {
        requestId,
        approverId: userId,
        decision: "approve",
        note: opts?.note ?? null,
        authorityRuleId: verdict.ruleId,
        authoritySnapshot: {
          ...verdict.snapshot,
          ...(verdict.disclosureId ? { conflictDeclarationId: verdict.disclosureId } : {}),
          ...(opts?.override ? { overrodeBlockers: gate.blockers, overrideReason: opts.override.reason } : {}),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    if (stillNeeded === 0) {
      await tx.disbursementRequest.update({
        where: { id: requestId },
        data: { status: "approved", resolvedAt: new Date() },
      });
      await tx.grantTranche.update({
        where: { id: request.trancheId },
        data: { status: "approved" },
      });
    }
  });

  if (opts?.override?.reason) {
    logGateOverride("Disbursement", requestId, userId, {
      gate: "release",
      blockers: gate.blockers.map((b: Blocker) => `${b.code}: ${b.message}`),
      reason: opts.override.reason,
    });
  }
  logGrant("Disbursement", requestId, userId, stillNeeded === 0 ? "request_approved" : "request_part_approved", {
    field: stillNeeded === 0 ? "final approval" : `${stillNeeded} more approval(s) needed`,
    to: moneyToString(request.requestedAmount),
  });

  return { approved: stillNeeded === 0, remainingApprovals: stillNeeded };
}

export async function rejectDisbursementRequest(
  session: SessionLike,
  requestId: string,
  rejectionNote: string,
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");
  if (!rejectionNote?.trim()) throw new Error("A rejection needs a reason.");

  const request = await prisma.disbursementRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, trancheId: true, requestedAmount: true },
  });
  if (!request) throw new Error("Not found");
  if (request.status !== "submitted") throw new Error("This request is not awaiting approval.");

  await prisma.$transaction([
    prisma.disbursementRequest.update({
      where: { id: requestId },
      data: { status: "rejected", rejectionNote: rejectionNote.trim(), resolvedAt: new Date() },
    }),
    prisma.grantTranche.update({ where: { id: request.trancheId }, data: { status: "planned" } }),
  ]);

  logGrant("Disbursement", requestId, userId, "request_rejected", {
    field: rejectionNote.trim().slice(0, 200),
    to: moneyToString(request.requestedAmount),
  });
}

/**
 * Confirm that an approved release was paid.
 *
 * This mirrors a payment made in the accounting system. It does not make one.
 * The bank reference is mandatory on a released row for exactly that reason.
 */
export async function recordDisbursement(
  session: SessionLike,
  input: {
    requestId: string;
    amount: MoneyInput;
    tdsAmount?: MoneyInput;
    valueDate: Date;
    bankReference: string;
    instrument?: string;
    fromAccountLabel?: string;
  },
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");
  if (!input.bankReference?.trim()) {
    throw new Error(
      "A bank reference is required — it is what ties this to the payment in the accounting system.",
    );
  }

  const request = await prisma.disbursementRequest.findUnique({
    where: { id: input.requestId },
    select: {
      id: true,
      status: true,
      trancheId: true,
      tranche: { select: { id: true, budgetId: true, plannedAmount: true } },
    },
  });
  if (!request) throw new Error("Not found");
  if (request.status !== "approved") {
    throw new Error("Only an approved request can be recorded as paid.");
  }

  const amount = toDecimal(input.amount);
  const tds = toDecimal(input.tdsAmount ?? 0);
  const net = subMoney(amount, tds);
  if (net.isNegative()) throw new Error("TDS cannot exceed the gross amount.");

  const ceiling = await wouldExceedApproved(request.tranche.budgetId, amount);
  if (ceiling.exceeds) {
    throw new Error(
      `This payment would take releases past the approved amount (approved ${ceiling.approved}, already ${ceiling.releasedSoFar}).`,
    );
  }

  const disbursement = await prisma.$transaction(async (tx) => {
    const created = await tx.disbursement.create({
      data: {
        trancheId: request.trancheId,
        budgetId: request.tranche.budgetId,
        requestId: request.id,
        amount,
        tdsAmount: tds,
        netAmount: net,
        valueDate: input.valueDate,
        bankReference: input.bankReference.trim(),
        instrument: input.instrument ?? null,
        fromAccountLabel: input.fromAccountLabel ?? null,
        status: "released",
        recordedById: userId,
      },
      select: { id: true },
    });

    // Tranche status is DERIVED from its payments, never set by hand (except
    // cancellation), and recomputed in the same transaction as the write.
    await recomputeTrancheStatus(tx, request.trancheId);
    return created;
  });

  logGrant("Disbursement", disbursement.id, userId, "payment_recorded", {
    field: `${input.bankReference.trim()} on ${input.valueDate.toISOString().slice(0, 10)}`,
    to: moneyToString(amount),
  });

  return disbursement;
}

/**
 * The interactive-transaction client. Derived from Prisma's own parameter type
 * rather than hand-written, so a client upgrade that adds a method here does not
 * silently break the signature.
 */
type TxLike = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Recompute a tranche's status from the payments against it.
 *
 * Derived rather than stored-by-hand, for the reason the recurring-pitstop
 * target date taught: a derived field maintained at write time, in one place,
 * stays true; one maintained at several call sites does not.
 */
export async function recomputeTrancheStatus(tx: TxLike, trancheId: string) {
  const tranche = await tx.grantTranche.findUnique({
    where: { id: trancheId },
    select: {
      plannedAmount: true,
      status: true,
      disbursements: { select: { amount: true, status: true } },
    },
  });
  if (!tranche || tranche.status === "cancelled") return;

  const released = sumMoney(
    tranche.disbursements.filter((d) => d.status === "released").map((d) => d.amount),
  );
  const planned = toDecimal(tranche.plannedAmount);

  const status = released.isZero()
    ? tranche.status === "approved" || tranche.status === "requested" || tranche.status === "blocked"
      ? tranche.status
      : "planned"
    : released.greaterThanOrEqualTo(planned)
      ? "released"
      : "partially_released";

  await tx.grantTranche.update({ where: { id: trancheId }, data: { status } });
}

/** A payment bounced, or was clawed back. Never a delete, never an edit. */
export async function markDisbursementFailed(
  session: SessionLike,
  disbursementId: string,
  input: { status: "failed" | "returned" | "recovered"; note: string },
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");
  if (!input.note?.trim()) throw new Error("Say what happened.");

  const row = await prisma.disbursement.findUnique({
    where: { id: disbursementId },
    select: { id: true, status: true, trancheId: true, amount: true },
  });
  if (!row) throw new Error("Not found");

  await prisma.$transaction(async (tx) => {
    await tx.disbursement.update({
      where: { id: disbursementId },
      data: { status: input.status, failureNote: input.note.trim() },
    });
    await recomputeTrancheStatus(tx, row.trancheId);
  });

  logGrant("Disbursement", disbursementId, userId, `marked_${input.status}`, {
    field: input.note.trim().slice(0, 200),
    from: row.status,
    to: input.status,
  });
}

/**
 * Reconcile a report period against what was actually released.
 *
 * `tranchesReceived` (the grantee's typed figure) stops being the record and
 * becomes one side of a comparison. A non-zero delta is a FINDING to show a
 * reviewer, not an error to correct silently — the grantee may be right.
 */
export async function reconcileSlot(session: SessionLike, slotId: string) {
  const userId = session?.user?.id ?? "system";

  const slot = await prisma.budgetReportSlot.findUnique({
    where: { id: slotId },
    select: {
      id: true,
      budgetId: true,
      periodFrom: true,
      periodTo: true,
      report: { select: { id: true, tranchesReceived: true } },
    },
  });
  if (!slot?.report) throw new Error("No report on this slot.");

  const payments = await prisma.disbursement.findMany({
    where: {
      budgetId: slot.budgetId,
      status: "released",
      valueDate: { gte: slot.periodFrom, lte: slot.periodTo },
    },
    select: { id: true, amount: true },
  });

  const released = sumMoney(payments.map((p) => p.amount));
  const reported = toDecimal(slot.report.tranchesReceived);
  const delta = reported.minus(released);

  await prisma.$transaction(
    payments.map((p) =>
      prisma.disbursement.update({
        where: { id: p.id },
        data: {
          reconciledReportId: slot.report!.id,
          reconciledAt: new Date(),
          // The delta is the PERIOD's, carried on each payment in it: a
          // per-payment split would be arbitrary, since the grantee reports one
          // figure for the period rather than per instrument.
          reconciliationDelta: delta,
        },
      }),
    ),
  );

  if (!delta.isZero()) {
    logGrant("Disbursement", slot.report.id, userId, "reconciliation_delta", {
      field: `slot ${slot.id}`,
      from: moneyToString(released),
      to: moneyToString(reported),
    });
  }

  return {
    released: moneyToString(released),
    reported: moneyToString(reported),
    delta: moneyToString(delta),
    paymentCount: payments.length,
  };
}

/**
 * Approved but not paid — the screen that matters when accounting owns the
 * payment. Everything approved for release with no confirmation against it.
 */
export async function approvedUnpaid(filter?: { budgetId?: string }) {
  const requests = await prisma.disbursementRequest.findMany({
    where: {
      status: "approved",
      ...(filter?.budgetId ? { tranche: { budgetId: filter.budgetId } } : {}),
    },
    select: {
      id: true,
      requestedAmount: true,
      resolvedAt: true,
      tranche: {
        select: {
          id: true,
          trancheNumber: true,
          plannedOn: true,
          budgetId: true,
          budget: { select: { name: true, grantPartner: { select: { name: true } } } },
        },
      },
      disbursements: { select: { amount: true, status: true } },
    },
    orderBy: { resolvedAt: "asc" },
  });

  const today = Date.now();
  return requests
    .map((r) => {
      const paid = sumMoney(
        r.disbursements.filter((d) => d.status === "released").map((d) => d.amount),
      );
      const outstanding = subMoney(r.requestedAmount, paid);
      return {
        requestId: r.id,
        budgetId: r.tranche.budgetId,
        budgetName: r.tranche.budget.name,
        partnerName: r.tranche.budget.grantPartner?.name ?? null,
        trancheNumber: r.tranche.trancheNumber,
        approvedOn: r.resolvedAt,
        approvedAmount: moneyToString(r.requestedAmount),
        paid: moneyToString(paid),
        outstanding: moneyToString(outstanding),
        ageDays: r.resolvedAt
          ? Math.floor((today - r.resolvedAt.getTime()) / 86_400_000)
          : null,
      };
    })
    .filter((r) => r.outstanding !== "0.00");
}
