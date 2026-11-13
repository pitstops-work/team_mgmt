/**
 * The grant agreement — the document that turns a decision into an obligation,
 * and the gate every rupee passes through.
 *
 * `releaseGate()` refuses any tranche whose agreement is not `executed`, so
 * this file is the shortest path between "a committee said yes" and money
 * leaving the organisation. Everything here is written on that basis.
 *
 * It exists because the agreement actions did not have it. `upsertGrantAgreement`
 * and `executeGrantAgreement` checked `requireSession()` and nothing else:
 *
 *   - any logged-in user, a GRANTEE login included, could execute the agreement
 *     on any grant and open its release gate;
 *   - an executed agreement's terms, dates and signatories stayed freely
 *     editable, so a signed contract could be rewritten in place;
 *   - `trancheFrequency` could be changed after the schedule was generated,
 *     leaving the release plan contradicting the contract that governs it;
 *   - an already-executed or terminated agreement could be executed again.
 *
 * The invariants live here rather than in the server action, as grant-actions.ts
 * says they must: a cron, a script or a later API route cannot bypass a rule by
 * not being a server action.
 *
 * ── What is deliberately NOT here ───────────────────────────────────────────
 *
 * Amendments. `GrantAgreement.amendsId` and its `amends`/`amendedBy` relation
 * are unreachable: `budgetId` is `@unique`, so a second agreement row for the
 * same grant cannot be inserted, and an amendment row has nowhere to live. The
 * relation is dead weight until that constraint is revisited, and building an
 * "amend" button on top of it would fail at the database on first use. Varying
 * an executed agreement therefore means a fresh decision (`supersedesId` on
 * GrantDecision already chains those) and re-execution — which is what the
 * decision chain was built for.
 */

import prisma from "@/lib/prisma";
import type { GrantAgreementStatus, TrancheFrequency } from "@/app/generated/prisma/client";
import { logGrant } from "./audit";
import { activeDecision } from "./decision";
import { formatMoneyShort } from "./money";

type SessionLike = { user?: { id?: string | null } | null } | null;

/**
 * Which status can follow which.
 *
 * `executed` leads only to `terminated`. That is the central rule of this file:
 * a contract both sides have signed is not editable, and the way to change it
 * is a new decision, not a quiet update. `sent_for_signature` can fall back to
 * `drafting` because a draft does come back for redrafting, and pretending
 * otherwise would make people work around the state rather than in it.
 */
export const AGREEMENT_TRANSITIONS: Record<GrantAgreementStatus, GrantAgreementStatus[]> = {
  drafting: ["sent_for_signature", "terminated"],
  sent_for_signature: ["drafting", "executed", "terminated"],
  executed: ["terminated"],
  terminated: [],
};

export function canTransitionAgreement(
  from: GrantAgreementStatus,
  to: GrantAgreementStatus,
): boolean {
  return AGREEMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Terms are fixed once both sides have signed. */
export function termsAreFrozen(status: GrantAgreementStatus): boolean {
  return status === "executed" || status === "terminated";
}

export type AgreementBlocker = {
  code:
    | "no_decision"
    | "decision_superseded"
    | "no_reference"
    | "no_grantee_signatory"
    | "no_funder_signatory"
    | "no_effective_from"
    | "signoff_incomplete"
    | "not_sent_for_signature"
    | "already_executed"
    | "terminated";
  message: string;
};

const DATE_ONLY = (d: Date) => d.toISOString().slice(0, 10);

/** Midnight UTC for a yyyy-mm-dd string, so a date never drifts a day in IST. */
function parseDateOnly(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be a date.`);
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`${label} is not a real date.`);
  return d;
}

/** Today at midnight UTC — the comparison point for "not in the future". */
function todayUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

export type AgreementView = Awaited<ReturnType<typeof agreementFor>>;

export async function agreementFor(budgetId: string) {
  const [budget, decision] = await Promise.all([
    prisma.budget.findUnique({
      where: { id: budgetId },
      select: {
        id: true,
        name: true,
        status: true,
        horizonMonths: true,
        grantPartner: { select: { name: true } },
        agreement: {
          select: {
            id: true,
            status: true,
            reference: true,
            decisionId: true,
            trancheFrequency: true,
            effectiveFrom: true,
            effectiveTo: true,
            granteeSignatoryName: true,
            granteeSignatoryRole: true,
            granteeSignedOn: true,
            funderSignatoryName: true,
            funderSignatoryRole: true,
            funderSignedOn: true,
            executedOn: true,
            terminatedOn: true,
            terminationReason: true,
            signoff: {
              select: {
                preparedAt: true,
                preparedBy: { select: { id: true, name: true } },
                reviewedAt: true,
                reviewerNotes: true,
                reviewedBy: { select: { id: true, name: true } },
                approvedAt: true,
                approvalNotes: true,
                approvedBy: { select: { id: true, name: true } },
              },
            },
            documents: {
              where: { supersededBy: { is: null } },
              select: { id: true, kind: true, title: true, fileUrl: true, version: true, createdAt: true },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    }),
    activeDecision(budgetId),
  ]);
  if (!budget) return null;

  const trancheCount = await prisma.grantTranche.count({ where: { budgetId } });

  return {
    budgetId: budget.id,
    budgetName: budget.name,
    budgetStatus: budget.status,
    horizonMonths: budget.horizonMonths,
    granteeName: budget.grantPartner?.name ?? null,
    agreement: budget.agreement,
    decision: decision
      ? {
          id: decision.id,
          outcome: decision.outcome,
          forum: decision.forum,
          decidedOn: decision.decidedOn,
          approvedAmount: formatMoneyShort(decision.approvedAmount),
        }
      : null,
    /** Once a schedule exists the frequency is load-bearing, not a preference. */
    trancheCount,
    frequencyLocked: trancheCount > 0,
  };
}

/**
 * What stands between this agreement and execution.
 *
 * Named blockers rather than one boolean, for the same reason releaseGate() is
 * built that way: "blocked" with no reason is what makes people route around a
 * system instead of using it.
 */
export async function agreementGate(budgetId: string): Promise<AgreementBlocker[]> {
  const view = await agreementFor(budgetId);
  if (!view) throw new Error("Not found");
  const blockers: AgreementBlocker[] = [];
  const ag = view.agreement;

  if (ag?.status === "terminated") {
    return [{ code: "terminated", message: "This agreement has been terminated." }];
  }
  if (ag?.status === "executed") {
    return [{ code: "already_executed", message: "This agreement is already executed." }];
  }

  if (!view.decision) {
    blockers.push({
      code: "no_decision",
      message: "There is no decision of record to draw an agreement from.",
    });
  } else if (ag?.decisionId && ag.decisionId !== view.decision.id) {
    // The agreement cites terms that have since been revised. Executing it
    // would bind the organisation to a superseded approval.
    blockers.push({
      code: "decision_superseded",
      message:
        "This agreement cites an earlier decision that has since been superseded. Re-link it to the current one.",
    });
  }

  if (!ag?.reference) {
    blockers.push({ code: "no_reference", message: "The agreement has no reference number." });
  }
  if (!ag?.granteeSignatoryName) {
    blockers.push({
      code: "no_grantee_signatory",
      message: "Record who signs for the grantee.",
    });
  }
  if (!ag?.funderSignatoryName) {
    blockers.push({ code: "no_funder_signatory", message: "Record who signs on our side." });
  }
  if (!ag?.effectiveFrom) {
    blockers.push({
      code: "no_effective_from",
      message: "The agreement has no start date, so no release can be dated against it.",
    });
  }
  if (!ag?.signoff?.approvedAt) {
    blockers.push({
      code: "signoff_incomplete",
      message: "The draft has not been prepared, reviewed and approved internally.",
    });
  }
  if (ag && ag.status !== "sent_for_signature") {
    blockers.push({
      code: "not_sent_for_signature",
      message: "The agreement has not been sent for signature yet.",
    });
  }

  return blockers;
}

async function requireUser(session: SessionLike): Promise<string> {
  const id = session?.user?.id;
  if (!id) throw new Error("Not authenticated");
  return id;
}

/**
 * Create or edit the agreement's terms.
 *
 * Refuses once executed. Refuses to move `trancheFrequency` after a schedule
 * exists: the tranches were generated FROM the frequency, so changing it in
 * place leaves the release plan disagreeing with the contract, and nothing
 * downstream would notice.
 */
export async function saveAgreementTerms(
  session: SessionLike,
  input: {
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
  },
) {
  const userId = await requireUser(session);

  const existing = await prisma.grantAgreement.findUnique({
    where: { budgetId: input.budgetId },
    select: { id: true, status: true, trancheFrequency: true },
  });

  if (existing && termsAreFrozen(existing.status)) {
    throw new Error(
      existing.status === "executed"
        ? "This agreement is executed. Its terms cannot be edited — vary it with a fresh decision and execute again."
        : "This agreement has been terminated and cannot be edited.",
    );
  }

  // An agreement with nothing to agree to is not a draft, it is a mistake that
  // becomes load-bearing the moment somebody marks it executed.
  const decision = await activeDecision(input.budgetId);
  if (!decision) {
    throw new Error("Record the decision first — an agreement needs approved terms behind it.");
  }

  const from = input.effectiveFrom ? parseDateOnly(input.effectiveFrom, "The start date") : null;
  const to = input.effectiveTo ? parseDateOnly(input.effectiveTo, "The end date") : null;
  if (from && to && to <= from) {
    throw new Error("The agreement cannot end on or before it starts.");
  }

  if (input.trancheFrequency && existing && input.trancheFrequency !== existing.trancheFrequency) {
    const trancheCount = await prisma.grantTranche.count({ where: { budgetId: input.budgetId } });
    if (trancheCount > 0) {
      throw new Error(
        `The release schedule was already generated ${existing.trancheFrequency}. Cancel and regenerate it before changing the frequency, or the schedule will contradict the agreement.`,
      );
    }
  }

  const data = {
    // Default to the head decision rather than null: an agreement silently
    // citing no decision is how a superseded approval survives unnoticed.
    decisionId: input.decisionId === undefined ? decision.id : input.decisionId,
    reference: input.reference?.trim() || null,
    ...(input.trancheFrequency ? { trancheFrequency: input.trancheFrequency } : {}),
    effectiveFrom: from,
    effectiveTo: to,
    granteeSignatoryName: input.granteeSignatoryName?.trim() || null,
    granteeSignatoryRole: input.granteeSignatoryRole?.trim() || null,
    funderSignatoryName: input.funderSignatoryName?.trim() || null,
    funderSignatoryRole: input.funderSignatoryRole?.trim() || null,
  };

  const agreement = await prisma.grantAgreement.upsert({
    where: { budgetId: input.budgetId },
    create: { budgetId: input.budgetId, ...data },
    update: data,
    select: { id: true },
  });

  logGrant("GrantAgreement", agreement.id, userId, existing ? "terms_updated" : "drafted", {
    field: data.reference ?? "agreement",
    to: data.trancheFrequency ?? null,
  });

  return { agreementId: agreement.id };
}

/**
 * The internal control before a draft leaves the building: prepared, reviewed,
 * approved.
 *
 * The reviewer and the approver must not be the person who prepared it. The
 * model carried three separate user columns and nothing enforced that they
 * differed, which makes the chain decorative — one person clicking three
 * buttons records the same assurance as three people reading the draft.
 */
export async function recordAgreementSignoff(
  session: SessionLike,
  input: { budgetId: string; step: "prepared" | "reviewed" | "approved"; note?: string },
) {
  const userId = await requireUser(session);

  const agreement = await prisma.grantAgreement.findUnique({
    where: { budgetId: input.budgetId },
    select: {
      id: true,
      status: true,
      signoff: {
        select: {
          preparedById: true,
          preparedAt: true,
          reviewedById: true,
          reviewedAt: true,
          approvedById: true,
        },
      },
    },
  });
  if (!agreement) throw new Error("Draft the agreement first.");
  if (termsAreFrozen(agreement.status)) {
    throw new Error("This agreement is no longer in draft.");
  }

  const s = agreement.signoff;
  const preparedBy = s?.preparedById ?? null;

  if (input.step === "reviewed") {
    if (!s?.preparedAt) throw new Error("The draft has not been marked prepared yet.");
    if (preparedBy && preparedBy === userId) {
      throw new Error("The draft needs a second pair of eyes — you prepared it.");
    }
  }
  if (input.step === "approved") {
    if (!s?.reviewedAt) throw new Error("The draft has not been reviewed yet.");
    if (preparedBy && preparedBy === userId) {
      throw new Error("You prepared this draft, so you cannot also approve it.");
    }
  }

  const now = new Date();
  const field =
    input.step === "prepared"
      ? { preparedById: userId, preparedAt: now }
      : input.step === "reviewed"
        ? { reviewedById: userId, reviewedAt: now, reviewerNotes: input.note?.trim() || null }
        : { approvedById: userId, approvedAt: now, approvalNotes: input.note?.trim() || null };

  await prisma.grantAgreementSignoff.upsert({
    where: { agreementId: agreement.id },
    create: { agreementId: agreement.id, ...field },
    update: field,
  });

  logGrant("GrantAgreement", agreement.id, userId, `signoff_${input.step}`, {
    field: "signoff",
    to: input.step,
  });
}

/** Send the approved draft out for signature. */
export async function sendAgreementForSignature(session: SessionLike, budgetId: string) {
  const userId = await requireUser(session);

  const agreement = await prisma.grantAgreement.findUnique({
    where: { budgetId },
    select: { id: true, status: true, signoff: { select: { approvedAt: true } } },
  });
  if (!agreement) throw new Error("Draft the agreement first.");
  if (!canTransitionAgreement(agreement.status, "sent_for_signature")) {
    throw new Error(
      `An agreement that is ${agreement.status.replace(/_/g, " ")} cannot be sent for signature.`,
    );
  }
  if (!agreement.signoff?.approvedAt) {
    throw new Error("The draft has to be approved internally before it goes out.");
  }

  await prisma.grantAgreement.update({
    where: { budgetId },
    data: { status: "sent_for_signature" },
  });
  logGrant("GrantAgreement", agreement.id, userId, "sent_for_signature", {
    field: "status",
    from: agreement.status,
    to: "sent_for_signature",
  });
}

/** Pull a draft back from signature for redrafting. */
export async function returnAgreementToDraft(
  session: SessionLike,
  budgetId: string,
  reason: string,
) {
  const userId = await requireUser(session);
  if (!reason?.trim()) throw new Error("Say why it is coming back.");

  const agreement = await prisma.grantAgreement.findUnique({
    where: { budgetId },
    select: { id: true, status: true },
  });
  if (!agreement) throw new Error("Not found");
  if (!canTransitionAgreement(agreement.status, "drafting")) {
    throw new Error(`An agreement that is ${agreement.status.replace(/_/g, " ")} cannot go back to drafting.`);
  }

  await prisma.grantAgreement.update({ where: { budgetId }, data: { status: "drafting" } });
  logGrant("GrantAgreement", agreement.id, userId, "returned_to_draft", {
    field: "status",
    from: agreement.status,
    to: reason.trim(),
  });
}

/**
 * Mark the agreement executed — the moment the release gate opens.
 *
 * Both signature dates are required and neither may be in the future, because
 * an "executed" agreement nobody has signed is the kind of record that only
 * becomes a problem during an audit, by which time money has moved against it.
 */
export async function executeAgreement(
  session: SessionLike,
  input: {
    budgetId: string;
    granteeSignedOn: string;
    funderSignedOn: string;
    executedOn: string;
  },
) {
  const userId = await requireUser(session);

  const blockers = await agreementGate(input.budgetId);
  if (blockers.length) {
    throw new Error(blockers.map((b) => b.message).join(" "));
  }

  const agreement = await prisma.grantAgreement.findUnique({
    where: { budgetId: input.budgetId },
    select: { id: true, status: true, effectiveFrom: true },
  });
  if (!agreement) throw new Error("Not found");
  if (!canTransitionAgreement(agreement.status, "executed")) {
    throw new Error(`An agreement that is ${agreement.status.replace(/_/g, " ")} cannot be executed.`);
  }

  const grantee = parseDateOnly(input.granteeSignedOn, "The grantee's signature date");
  const funder = parseDateOnly(input.funderSignedOn, "Our signature date");
  const executed = parseDateOnly(input.executedOn, "The execution date");
  const today = todayUTC();

  for (const [label, d] of [
    ["The grantee's signature date", grantee],
    ["Our signature date", funder],
    ["The execution date", executed],
  ] as const) {
    if (d > today) throw new Error(`${label} cannot be in the future.`);
  }
  // Execution is the later of the two signatures, by definition. A date before
  // one of them means somebody typed the wrong year, and that date goes on to
  // anchor the whole release schedule.
  if (executed < grantee || executed < funder) {
    throw new Error("The execution date cannot be before either signature.");
  }

  await prisma.grantAgreement.update({
    where: { budgetId: input.budgetId },
    data: {
      status: "executed",
      granteeSignedOn: grantee,
      funderSignedOn: funder,
      executedOn: executed,
    },
  });

  logGrant("GrantAgreement", agreement.id, userId, "executed", {
    field: "status",
    from: agreement.status,
    to: DATE_ONLY(executed),
  });

  return { executedOn: DATE_ONLY(executed) };
}

/**
 * Terminate an agreement.
 *
 * Allowed after execution and after money has moved — early termination is a
 * real thing that happens — but the released total is reported back to the
 * caller so nobody terminates a grant without seeing what has already gone out
 * and will need settling at closure.
 */
export async function terminateAgreement(
  session: SessionLike,
  input: { budgetId: string; terminatedOn: string; reason: string },
) {
  const userId = await requireUser(session);
  if (!input.reason?.trim()) {
    throw new Error("A termination has to say why — it is the only record of it.");
  }

  const agreement = await prisma.grantAgreement.findUnique({
    where: { budgetId: input.budgetId },
    select: { id: true, status: true },
  });
  if (!agreement) throw new Error("Not found");
  if (!canTransitionAgreement(agreement.status, "terminated")) {
    throw new Error("This agreement is already terminated.");
  }

  const on = parseDateOnly(input.terminatedOn, "The termination date");
  if (on > todayUTC()) throw new Error("The termination date cannot be in the future.");

  const released = await prisma.disbursement.aggregate({
    where: { budgetId: input.budgetId },
    _sum: { amount: true },
  });

  await prisma.grantAgreement.update({
    where: { budgetId: input.budgetId },
    data: { status: "terminated", terminatedOn: on, terminationReason: input.reason.trim() },
  });

  logGrant("GrantAgreement", agreement.id, userId, "terminated", {
    field: "status",
    from: agreement.status,
    to: input.reason.trim(),
  });

  return {
    releasedBefore: released._sum.amount ? formatMoneyShort(released._sum.amount) : null,
  };
}
