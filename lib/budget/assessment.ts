/**
 * What a reviewer concluded about a grant.
 *
 * Reports say what was spent and what was delivered. Nothing said what anyone
 * THOUGHT — and a grant can be entirely compliant on paper and still be in
 * trouble: budgeted badly, underspending, reporting late, delivering the
 * activities but not the outcome. The financial record cannot express any of
 * that, and the people who know it have nowhere to write it down.
 *
 * Two axes rather than one, because the programme view and the finance view
 * diverge often enough that a single rating hides the interesting case — a
 * programme going well on money that is being managed badly, or the reverse.
 * A reviewer sets the overall themselves rather than having it derived: the
 * weighing is a judgement, and recording the judgement is the point.
 */

import prisma from "@/lib/prisma";
import type { Rag } from "@/app/generated/prisma/client";
import { logGrant } from "./audit";

type SessionLike = { user?: { id?: string | null } | null } | null;

/** Worst-first, so a sort gives the attention order. */
export const RAG_ORDER: Record<Rag, number> = { red: 0, amber: 1, green: 2 };

export type AssessmentInput = {
  budgetId: string;
  /** The reporting period assessed. Null for an off-cycle assessment. */
  slotId?: string | null;
  programmeRag: Rag;
  programmeRationale?: string;
  financeRag: Rag;
  financeRationale?: string;
  overallRag: Rag;
  overallNote?: string;
  assessedOn?: Date;
};

/**
 * Record or update an assessment.
 *
 * A rationale is REQUIRED on any axis that is not green. A bare colour with no
 * reason is the field people learn to scroll past, and six months later nobody
 * can reconstruct what the amber meant — which is exactly when it matters.
 */
export async function recordAssessment(session: SessionLike, input: AssessmentInput) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  if (input.programmeRag !== "green" && !input.programmeRationale?.trim()) {
    throw new Error("Say why the programme assessment is not green.");
  }
  if (input.financeRag !== "green" && !input.financeRationale?.trim()) {
    throw new Error("Say why the finance assessment is not green.");
  }

  const assessedOn = input.assessedOn ?? new Date();
  const data = {
    programmeRag: input.programmeRag,
    programmeRationale: input.programmeRationale?.trim() || null,
    financeRag: input.financeRag,
    financeRationale: input.financeRationale?.trim() || null,
    overallRag: input.overallRag,
    overallNote: input.overallNote?.trim() || null,
    assessedOn: new Date(
      Date.UTC(assessedOn.getUTCFullYear(), assessedOn.getUTCMonth(), assessedOn.getUTCDate()),
    ),
    assessedById: userId,
  };

  const before = input.slotId
    ? await prisma.grantAssessment.findUnique({
        where: { budgetId_slotId: { budgetId: input.budgetId, slotId: input.slotId } },
        select: { id: true, overallRag: true },
      })
    : null;

  // A slot-linked assessment is unique per period and updates in place; an
  // off-cycle one (slotId null) is always a new row, because two site visits in
  // a year are two separate judgements, not a correction of the first.
  const row = input.slotId
    ? await prisma.grantAssessment.upsert({
        where: { budgetId_slotId: { budgetId: input.budgetId, slotId: input.slotId } },
        create: { budgetId: input.budgetId, slotId: input.slotId, ...data },
        update: data,
        select: { id: true },
      })
    : await prisma.grantAssessment.create({
        data: { budgetId: input.budgetId, slotId: null, ...data },
        select: { id: true },
      });

  logGrant("Budget", input.budgetId, userId, "assessed", {
    field: `programme ${input.programmeRag} / finance ${input.financeRag}`,
    from: before?.overallRag ?? null,
    to: input.overallRag,
  });

  return row;
}

/** The latest assessment for a grant, and the trend before it. */
export async function assessmentHistory(budgetId: string) {
  return prisma.grantAssessment.findMany({
    where: { budgetId },
    select: {
      id: true,
      slotId: true,
      programmeRag: true,
      programmeRationale: true,
      financeRag: true,
      financeRationale: true,
      overallRag: true,
      overallNote: true,
      assessedOn: true,
      assessedBy: { select: { id: true, name: true } },
      slot: { select: { slotNumber: true, periodFrom: true, periodTo: true } },
    },
    orderBy: { assessedOn: "desc" },
  });
}

/**
 * The portfolio health view: the most recent assessment per grant, worst first.
 *
 * Deliberately returns the grants with NO assessment too, marked as such. An
 * unassessed grant is not a green grant, and a dashboard that silently drops
 * them reports a portfolio healthier than the one that exists.
 */
export async function portfolioHealth(filter?: { grantingUnitId?: string }) {
  const budgets = await prisma.budget.findMany({
    where: {
      status: "approved",
      ...(filter?.grantingUnitId ? { grantingUnitId: filter.grantingUnitId } : {}),
    },
    select: {
      id: true,
      name: true,
      grantPartner: { select: { name: true } },
      assessments: {
        select: {
          overallRag: true,
          programmeRag: true,
          financeRag: true,
          assessedOn: true,
          programmeRationale: true,
          financeRationale: true,
        },
        orderBy: { assessedOn: "desc" },
        take: 1,
      },
    },
  });

  const rows = budgets.map((b) => {
    const latest = b.assessments[0] ?? null;
    return {
      budgetId: b.id,
      name: b.name,
      partnerName: b.grantPartner?.name ?? null,
      overallRag: latest?.overallRag ?? null,
      programmeRag: latest?.programmeRag ?? null,
      financeRag: latest?.financeRag ?? null,
      assessedOn: latest?.assessedOn ?? null,
      // The case worth seeing: the two axes disagree, so one number would have
      // hidden it.
      diverges: latest ? latest.programmeRag !== latest.financeRag : false,
      rationale: latest
        ? [latest.programmeRationale, latest.financeRationale].filter(Boolean).join(" · ")
        : null,
      staleDays: latest
        ? Math.floor((Date.now() - latest.assessedOn.getTime()) / 86_400_000)
        : null,
    };
  });

  return rows.sort((a, b) => {
    // Never assessed sorts first: it is a gap in the record, not a good result.
    if (a.overallRag === null && b.overallRag !== null) return -1;
    if (b.overallRag === null && a.overallRag !== null) return 1;
    if (a.overallRag && b.overallRag) {
      const d = RAG_ORDER[a.overallRag] - RAG_ORDER[b.overallRag];
      if (d !== 0) return d;
    }
    return (b.staleDays ?? 0) - (a.staleDays ?? 0);
  });
}

/**
 * Grants whose reporting period closed without anyone assessing it.
 *
 * The quiet failure this guards against: reports get approved on the financial
 * detail alone and the judgement step is skipped, so the first anyone hears of
 * a struggling grant is at closure.
 */
export async function unassessedPeriods(opts: { graceDays?: number } = {}) {
  const grace = opts.graceDays ?? 30;
  const cutoff = new Date(Date.now() - grace * 86_400_000);

  const slots = await prisma.budgetReportSlot.findMany({
    where: {
      status: "approved",
      periodTo: { lt: cutoff },
      assessments: { none: {} },
      budget: { status: "approved" },
    },
    select: {
      id: true,
      slotNumber: true,
      periodTo: true,
      budgetId: true,
      budget: { select: { name: true, grantPartner: { select: { name: true } } } },
    },
    orderBy: { periodTo: "asc" },
  });

  return slots.map((s) => ({
    slotId: s.id,
    budgetId: s.budgetId,
    budgetName: s.budget.name,
    partnerName: s.budget.grantPartner?.name ?? null,
    slotNumber: s.slotNumber,
    periodEnded: s.periodTo,
    daysSince: Math.floor((Date.now() - s.periodTo.getTime()) / 86_400_000),
  }));
}
