/**
 * The decision of record.
 *
 * Until now a grant became approved as a SIDE EFFECT of configuring reporting —
 * `app/(budget)/budget/report-actions.ts` writes `status: "approved"` while
 * setting up report slots. So there was no answer to: who decided, on what
 * date, in which forum, on what conditions, and against which version of the
 * numbers. The appraisal schema even defined a `Condition` shape, but nothing
 * carried it forward, which means a conditional approval was indistinguishable
 * from a clean one the following day.
 *
 * This module is the only writer of `GrantDecision` and the only reader that
 * other code should use: `activeDecision()` resolves the head of the supersedes
 * chain, and nothing else should query `grantDecision` directly, or a grant with
 * two revisions will start reporting both.
 */

import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import type {
  GrantDecisionForum,
  GrantDecisionOutcome,
  GrantConditionTiming,
} from "@/app/generated/prisma/client";
import { takeBudgetSnapshot } from "./baselineDiff";
import { toDecimal, moneyToString, type MoneyInput } from "./money";
import { requireAuthority } from "./authority";
import { logGrant, logGrantChanges } from "./audit";

export type ConditionInput = {
  text: string;
  timing: GrantConditionTiming;
  blocksTrancheNumber?: number | null;
  dueOn?: Date | null;
};

export type RecordDecisionInput = {
  budgetId: string;
  outcome: GrantDecisionOutcome;
  forum: GrantDecisionForum;
  decidedOn: Date;
  approvedAmount: MoneyInput;
  variationNote?: string;
  approvedMonths?: number | null;
  reasonCode?: string;
  reasonNote?: string;
  assemblyId?: string | null;
  meetingId?: string | null;
  conditions?: ConditionInput[];
  /** Set when this decision replaces an earlier one (a re-presentation). */
  supersedesId?: string | null;
  votes?: { userId?: string | null; voterName?: string | null; vote: "for" | "against" | "abstained" | "recused"; note?: string }[];
};

type SessionLike = { user?: { id?: string | null; role?: string | null } | null } | null;

const OUTCOMES_NEEDING_REASON: GrantDecisionOutcome[] = ["deferred", "declined", "withdrawn"];
const APPROVING_OUTCOMES: GrantDecisionOutcome[] = ["approved", "approved_with_conditions"];

/**
 * Record a decision.
 *
 * Invariants enforced here rather than in the UI, because the UI is not the
 * only caller and a decision is immutable once written:
 *
 *  1. `approved_with_conditions` requires at least one condition, and a plain
 *     `approved` requires none. Adding a condition afterwards is a NEW decision
 *     with the outcome flipped — not an edit, because the thing that was
 *     approved changed.
 *  2. deferred / declined / withdrawn require a reason code. A decline with no
 *     recorded reason is the single most common complaint about grant systems.
 *  3. The budget's lines are frozen into `budgetSnapshot` in the SAME
 *     transaction as the status write. A snapshot taken a moment later could
 *     catch an edit that landed in between.
 *  4. An approving decision sets `Budget.status = approved` and stamps
 *     `approvedAt` / `approvedAmount` — so approval stops being a side effect of
 *     report configuration and starts being the thing that causes it.
 */
export async function recordDecision(session: SessionLike, input: RecordDecisionInput) {
  const conditions = input.conditions ?? [];

  if (input.outcome === "approved_with_conditions" && conditions.length === 0) {
    throw new Error("An approval with conditions needs at least one condition.");
  }
  if (input.outcome === "approved" && conditions.length > 0) {
    throw new Error(
      "This has conditions attached, so the outcome is 'approved with conditions' — a clean approval and a conditional one must not look the same.",
    );
  }
  if (OUTCOMES_NEEDING_REASON.includes(input.outcome) && !input.reasonCode) {
    throw new Error("A deferral, decline or withdrawal needs a reason code.");
  }

  const budget = await prisma.budget.findUnique({
    where: { id: input.budgetId },
    select: {
      id: true,
      status: true,
      grantingUnitId: true,
      domains: true,
      grantPartner: { select: { orgId: true } },
    },
  });
  if (!budget) throw new Error("Not found");

  const isApproving = APPROVING_OUTCOMES.includes(input.outcome);

  // The authority check runs for every outcome, not just approvals: a decline
  // is a decision about money too, and recording one is an act of authority.
  const verdict = await requireAuthority(session, {
    action: "grant_decision",
    amount: isApproving ? input.approvedAmount : undefined,
    budgetId: input.budgetId,
    grantingUnitId: budget.grantingUnitId,
    domain: budget.domains[0] ?? null,
    orgId: budget.grantPartner?.orgId ?? null,
  });

  // Frozen in the transaction below; taken here so a failure to read the lines
  // aborts before anything is written.
  const snapshot = isApproving ? await takeBudgetSnapshot(input.budgetId) : null;

  const decision = await prisma.$transaction(async (tx) => {
    if (input.supersedesId) {
      const prior = await tx.grantDecision.findUnique({
        where: { id: input.supersedesId },
        select: { id: true, budgetId: true, supersededBy: { select: { id: true } } },
      });
      if (!prior) throw new Error("The decision being superseded no longer exists.");
      if (prior.budgetId !== input.budgetId) {
        throw new Error("A decision can only supersede one on the same budget.");
      }
      if (prior.supersededBy) {
        throw new Error("That decision has already been superseded.");
      }
    }

    const created = await tx.grantDecision.create({
      data: {
        budgetId: input.budgetId,
        outcome: input.outcome,
        forum: input.forum,
        decidedOn: input.decidedOn,
        approvedAmount: toDecimal(isApproving ? input.approvedAmount : 0),
        variationNote: input.variationNote ?? null,
        approvedMonths: input.approvedMonths ?? null,
        budgetSnapshot: (snapshot ?? {}) as unknown as Prisma.InputJsonValue,
        reasonCode: input.reasonCode ?? null,
        reasonNote: input.reasonNote ?? null,
        assemblyId: input.assemblyId ?? null,
        meetingId: input.meetingId ?? null,
        supersedesId: input.supersedesId ?? null,
        recordedById: session?.user?.id ?? null,
        conditions: {
          create: conditions.map((c) => ({
            text: c.text,
            timing: c.timing,
            blocksTrancheNumber: c.blocksTrancheNumber ?? null,
            dueOn: c.dueOn ?? null,
          })),
        },
        votes: input.votes?.length
          ? {
              create: input.votes.map((v) => ({
                userId: v.userId ?? null,
                voterName: v.voterName ?? null,
                vote: v.vote,
                note: v.note ?? null,
              })),
            }
          : undefined,
      },
      select: { id: true, outcome: true },
    });

    if (isApproving) {
      await tx.budget.update({
        where: { id: input.budgetId },
        data: {
          status: "approved",
          approvedAt: input.decidedOn,
          // The legacy comparables column stays in step, as a number — it feeds
          // cost-per-beneficiary and is still Float until the sweep.
          approvedAmount: toDecimal(input.approvedAmount).toNumber(),
        },
      });
    }

    return created;
  });

  logGrant("GrantDecision", decision.id, session?.user?.id ?? "system", `recorded_${input.outcome}`, {
    field: `${input.forum}:${input.budgetId}`,
    from: budget.status,
    to: isApproving ? moneyToString(input.approvedAmount) : (input.reasonCode ?? input.outcome),
  });
  if (verdict.disclosureId) {
    logGrant("GrantDecision", decision.id, session?.user?.id ?? "system", "conflict_disclosed", {
      field: "declaration",
      to: verdict.disclosureId,
    });
  }
  if (conditions.length) {
    logGrantChanges(
      "GrantDecision",
      decision.id,
      session?.user?.id ?? "system",
      "condition_attached",
      conditions.map((c) => ({ field: c.timing, to: c.text })),
    );
  }

  return decision;
}

/**
 * The live decision for a budget: the head of the supersedes chain.
 *
 * Every reader should come through here. A budget with two revisions queried
 * directly returns both, and a dashboard that sums them double-counts the
 * grant.
 */
export async function activeDecision(budgetId: string) {
  const decisions = await prisma.grantDecision.findMany({
    where: { budgetId },
    select: {
      id: true,
      outcome: true,
      forum: true,
      decidedOn: true,
      approvedAmount: true,
      approvedMonths: true,
      variationNote: true,
      reasonCode: true,
      reasonNote: true,
      assemblyId: true,
      supersedesId: true,
      conditions: {
        select: {
          id: true,
          text: true,
          timing: true,
          status: true,
          dueOn: true,
          blocksTrancheNumber: true,
        },
      },
    },
    orderBy: { decidedOn: "desc" },
  });
  if (!decisions.length) return null;
  const superseded = new Set(decisions.map((d) => d.supersedesId).filter(Boolean) as string[]);
  return decisions.find((d) => !superseded.has(d.id)) ?? decisions[0];
}

/** The full revision chain, oldest first — "how many times did this go to the board". */
export async function decisionHistory(budgetId: string) {
  return prisma.grantDecision.findMany({
    where: { budgetId },
    select: {
      id: true,
      outcome: true,
      forum: true,
      decidedOn: true,
      approvedAmount: true,
      reasonCode: true,
      supersedesId: true,
      recordedBy: { select: { id: true, name: true } },
      meeting: { select: { id: true, heldOn: true, reference: true } },
    },
    orderBy: { decidedOn: "asc" },
  });
}

/**
 * Discharge a condition (it was satisfied) or waive it (it was not, and someone
 * decided to proceed anyway).
 *
 * Waiving carries its own authority action, because waiving a pre-disbursement
 * condition is the quietest way to approve money without appearing to.
 */
export async function resolveCondition(
  session: SessionLike,
  conditionId: string,
  resolution: { mode: "discharge" | "waive"; note: string },
) {
  if (!resolution.note?.trim()) {
    throw new Error(resolution.mode === "waive" ? "A waiver needs a reason." : "Say what discharged it.");
  }

  const condition = await prisma.grantCondition.findUnique({
    where: { id: conditionId },
    select: {
      id: true,
      status: true,
      text: true,
      timing: true,
      decision: {
        select: {
          id: true,
          approvedAmount: true,
          budget: {
            select: {
              id: true,
              grantingUnitId: true,
              domains: true,
              grantPartner: { select: { orgId: true } },
            },
          },
        },
      },
    },
  });
  if (!condition) throw new Error("Not found");
  if (condition.status !== "open") throw new Error("This condition is already resolved.");

  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  if (resolution.mode === "waive") {
    await requireAuthority(session, {
      action: "condition_waive",
      amount: condition.decision.approvedAmount,
      budgetId: condition.decision.budget.id,
      grantingUnitId: condition.decision.budget.grantingUnitId,
      domain: condition.decision.budget.domains[0] ?? null,
      orgId: condition.decision.budget.grantPartner?.orgId ?? null,
    });
  }

  await prisma.grantCondition.update({
    where: { id: conditionId },
    data:
      resolution.mode === "discharge"
        ? {
            status: "discharged",
            dischargedById: userId,
            dischargedAt: new Date(),
            dischargeNote: resolution.note.trim(),
          }
        : {
            status: "waived",
            waivedById: userId,
            waivedAt: new Date(),
            waiverNote: resolution.note.trim(),
          },
  });

  logGrant("GrantDecision", condition.decision.id, userId, `condition_${resolution.mode}d`, {
    field: `${condition.timing}: ${condition.text.slice(0, 120)}`,
    from: "open",
    to: resolution.note.trim().slice(0, 500),
  });
}

/** Open conditions for a budget, by timing — what `releaseGate()` reads. */
export async function openConditions(budgetId: string) {
  const decision = await activeDecision(budgetId);
  if (!decision) return [];
  return decision.conditions.filter((c) => c.status === "open");
}
