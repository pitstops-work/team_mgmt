/**
 * What stands between an approved grant and money going out.
 *
 * Conditions only mean something if a machine checks them. Before this, a
 * condition was a sentence in a document: nothing read it, so a
 * pre-disbursement condition and a decorative one behaved identically.
 *
 * The gate is deliberately readable rather than boolean. A list of named
 * blockers can be shown to the person who has to chase them; `false` cannot.
 *
 * One asymmetry, on purpose: a request may be SUBMITTED while blocked, so the
 * blockage becomes visible and chaseable, but it cannot be APPROVED while
 * blocked. Pushing past a blocker is a separate authority action
 * (`gate_override`) and writes its own audit row naming what was overridden.
 */

import prisma from "@/lib/prisma";
import { activeDecision } from "./decision";

export type Blocker = {
  /** Machine-readable, for tests and for the override record. */
  code:
    | "no_decision"
    | "agreement_not_executed"
    | "condition_open"
    | "document_missing"
    | "report_not_approved"
    | "compliance_expired"
    | "tranche_indicative"
    | "tranche_cancelled"
    | "over_approved_amount";
  /** Shown to a person, naming the specific thing rather than the rule. */
  message: string;
};

export type GateResult = {
  ok: boolean;
  blockers: Blocker[];
};

/**
 * Can this tranche be released?
 *
 * Reads, in order: the decision exists and approves; the agreement is executed;
 * no condition that applies to this tranche is open; required pre-disbursement
 * documents are present; the gating report slot is approved; the grantee's
 * blocking compliance registrations are valid; and the tranche is committed
 * rather than an indicative projection.
 */
export async function releaseGate(trancheId: string): Promise<GateResult> {
  const tranche = await prisma.grantTranche.findUnique({
    where: { id: trancheId },
    select: {
      id: true,
      trancheNumber: true,
      status: true,
      isCommitted: true,
      budgetId: true,
      gatingSlot: { select: { id: true, slotNumber: true, status: true } },
      budget: {
        select: {
          id: true,
          grantingUnitId: true,
          grantPartner: { select: { orgId: true, name: true } },
          agreement: { select: { status: true } },
        },
      },
    },
  });
  if (!tranche) throw new Error("Not found");

  const blockers: Blocker[] = [];

  if (tranche.status === "cancelled") {
    blockers.push({ code: "tranche_cancelled", message: "This tranche has been cancelled." });
  }

  // An indicative later-year tranche is a projection, not a promise. Releasing
  // against one would pay out a figure nobody committed to.
  if (!tranche.isCommitted) {
    blockers.push({
      code: "tranche_indicative",
      message:
        "This tranche is still an indicative projection — recompute and commit the grant year before releasing against it.",
    });
  }

  const decision = await activeDecision(tranche.budgetId);
  if (!decision || !["approved", "approved_with_conditions"].includes(decision.outcome)) {
    blockers.push({
      code: "no_decision",
      message: "No live approval on this grant.",
    });
  }

  if (tranche.budget.agreement?.status !== "executed") {
    blockers.push({
      code: "agreement_not_executed",
      message: tranche.budget.agreement
        ? `The agreement is ${tranche.budget.agreement.status.replace(/_/g, " ")}, not executed.`
        : "No agreement on this grant.",
    });
  }

  // Conditions: tranche 1 is gated by pre_disbursement conditions; every
  // tranche is gated by a pre_tranche condition that names it (or names none,
  // meaning all of them).
  for (const c of decision?.conditions ?? []) {
    if (c.status !== "open") continue;
    const appliesToFirst = c.timing === "pre_disbursement" && tranche.trancheNumber === 1;
    const appliesToThis =
      c.timing === "pre_tranche" &&
      (c.blocksTrancheNumber === null || c.blocksTrancheNumber === tranche.trancheNumber);
    if (appliesToFirst || appliesToThis) {
      blockers.push({
        code: "condition_open",
        message: `Condition still open: ${c.text.slice(0, 160)}`,
      });
    }
  }

  // Documents required before any money moves.
  if (tranche.trancheNumber === 1) {
    const requirements = await prisma.grantDocumentRequirement.findMany({
      where: {
        isActive: true,
        timing: "pre_disbursement",
        OR: [{ grantingUnitId: null }, { grantingUnitId: tranche.budget.grantingUnitId }],
      },
      select: { kind: true },
    });
    if (requirements.length) {
      const held = await prisma.grantDocument.findMany({
        where: { budgetId: tranche.budgetId, kind: { in: requirements.map((r) => r.kind) } },
        select: { kind: true },
      });
      const heldKinds = new Set(held.map((d) => d.kind));
      for (const r of requirements) {
        if (!heldKinds.has(r.kind)) {
          blockers.push({
            code: "document_missing",
            message: `Missing document before first release: ${r.kind.replace(/_/g, " ")}`,
          });
        }
      }
    }
  }

  // The common real rule: this tranche waits on a report being approved.
  if (tranche.gatingSlot && tranche.gatingSlot.status !== "approved") {
    blockers.push({
      code: "report_not_approved",
      message: `Report ${tranche.gatingSlot.slotNumber} is ${tranche.gatingSlot.status.replace(/_/g, " ")}, not approved.`,
    });
  }

  // Statutory registrations, where the kind is configured to block a release
  // rather than merely warn.
  const orgId = tranche.budget.grantPartner?.orgId;
  if (orgId) {
    const [blockingKinds, held] = await Promise.all([
      prisma.complianceKindConfig.findMany({
        where: { isActive: true, blocksRelease: true },
        select: { kind: true, label: true },
      }),
      prisma.orgCompliance.findMany({
        where: { orgId },
        select: { kind: true, validUntil: true },
      }),
    ]);
    const byKind = new Map(held.map((h) => [h.kind, h]));
    const today = new Date();
    for (const k of blockingKinds) {
      const row = byKind.get(k.kind);
      if (!row) {
        blockers.push({
          code: "compliance_expired",
          message: `${k.label} is not on record for ${tranche.budget.grantPartner?.name ?? "this grantee"}.`,
        });
        continue;
      }
      // A null validUntil means no expiry (a PAN), not an unknown date.
      if (row.validUntil && row.validUntil < today) {
        blockers.push({
          code: "compliance_expired",
          message: `${k.label} expired on ${row.validUntil.toISOString().slice(0, 10)}.`,
        });
      }
    }
  }

  return { ok: blockers.length === 0, blockers };
}

/**
 * Would releasing `amount` take the grant past what was approved?
 *
 * Checked separately from the gate because it is the one refusal that must be
 * absolute: over-disbursing an approved grant is the error the whole model
 * exists to prevent, and no override covers it.
 */
export async function wouldExceedApproved(
  budgetId: string,
  amount: { toString(): string },
): Promise<{ exceeds: boolean; approved: string; releasedSoFar: string; attempting: string }> {
  const { sumMoney, toDecimal, moneyToString } = await import("./money");
  const [decision, disbursements] = await Promise.all([
    activeDecision(budgetId),
    prisma.disbursement.findMany({
      where: { budgetId, status: { in: ["released", "pending"] } },
      select: { amount: true },
    }),
  ]);
  const approved = toDecimal(decision?.approvedAmount ?? 0);
  const released = sumMoney(disbursements.map((d) => d.amount));
  const attempting = toDecimal(amount.toString());
  return {
    exceeds: released.plus(attempting).greaterThan(approved),
    approved: moneyToString(approved),
    releasedSoFar: moneyToString(released),
    attempting: moneyToString(attempting),
  };
}
