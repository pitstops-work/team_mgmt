/**
 * Intake and pipeline.
 *
 * An organisation could only enter Pitstops when a staff member created an
 * `Org` plus a blank due-diligence row (`lib/partners/reviewMirror.ts`). There
 * was no call for proposals, no grantee-submitted concept note, no pipeline, and
 * no way to decline something before appraisal — so the work of saying no left
 * no trace at all, and nobody could say how long anything had been sitting.
 *
 * Intake here is a PUBLIC open call, which is what makes this the largest piece
 * of the lifecycle work: the public surface, not the pipeline. The pipeline half
 * (this file's stage machine, ageing and decline reasons) is useful on its own
 * and ships first; the public form sits on top of `createPublicProposal`.
 *
 * Built on the screening module's bones — idempotent intake on a ref,
 * structured answers, a versioned rubric whose edits never change a recorded
 * score, an event trail — but as its own model. A grantee org and a fellowship
 * applicant have genuinely different fields, and one polymorphic table serving
 * both would be worse than two.
 */

import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import type { ProposalStage } from "@/app/generated/prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { toDecimal, moneyToString } from "./money";
import { logGrant } from "./audit";

type SessionLike = { user?: { id?: string | null; role?: string | null } | null } | null;

/**
 * Which stage can follow which. A pipeline without this is a set of labels
 * people set in any order, and the ageing report stops meaning anything.
 */
const STAGE_TRANSITIONS: Record<ProposalStage, ProposalStage[]> = {
  received: ["screening", "ineligible", "withdrawn"],
  screening: ["eligible", "ineligible", "withdrawn"],
  eligible: ["due_diligence", "ineligible", "withdrawn"],
  ineligible: [],
  due_diligence: ["appraisal", "ineligible", "withdrawn"],
  appraisal: ["decided", "ineligible", "withdrawn"],
  decided: [],
  withdrawn: [],
};

const TERMINAL_STAGES: ProposalStage[] = ["ineligible", "decided", "withdrawn"];
/** Stages whose exit needs a recorded reason. */
const STAGES_NEEDING_REASON: ProposalStage[] = ["ineligible", "withdrawn"];

export function canTransition(from: ProposalStage, to: ProposalStage): boolean {
  return STAGE_TRANSITIONS[from]?.includes(to) ?? false;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Create or update a proposal from the public form.
 *
 * Idempotent on `publicRef`: a resubmitted draft updates rather than creating a
 * second proposal, which is the failure mode of every public form that keys on
 * nothing. The resume token is returned in CLEARTEXT once, here, and only its
 * hash is stored — the same discipline as a password reset.
 *
 * Note on identity: `applicantOrgName` is what the applicant typed and is never
 * overwritten by a registry match. `orgId` is set separately once a human
 * confirms which existing org this is — a near-match on an organisation name is
 * a judgement, not a lookup, and the alias registry exists because getting that
 * wrong has consequences.
 */
export async function createPublicProposal(input: {
  windowId?: string | null;
  publicRef?: string;
  applicantOrgName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  title: string;
  summary?: string;
  requestedAmount?: number | null;
  requestedMonths?: number | null;
  domains?: string[];
  city?: string | null;
  answers?: Record<string, unknown>;
  submit?: boolean;
}): Promise<{ proposalId: string; publicRef: string; resumeToken?: string }> {
  if (!input.applicantOrgName?.trim()) throw new Error("Tell us the organisation's name.");
  if (!input.contactEmail?.trim()) throw new Error("We need an email to reply to.");
  if (!input.title?.trim()) throw new Error("Give the proposal a title.");

  if (input.windowId) {
    const window = await prisma.fundingWindow.findUnique({
      where: { id: input.windowId },
      select: { status: true, closesOn: true, name: true },
    });
    if (!window) throw new Error("That call for proposals does not exist.");
    if (window.status !== "open") throw new Error(`${window.name} is not open for submissions.`);
    if (window.closesOn && window.closesOn < new Date()) {
      throw new Error(`${window.name} closed on ${window.closesOn.toISOString().slice(0, 10)}.`);
    }
  }

  const publicRef = input.publicRef ?? `P-${randomBytes(6).toString("hex").toUpperCase()}`;
  const token = input.publicRef ? undefined : randomBytes(24).toString("hex");

  const data = {
    windowId: input.windowId ?? null,
    applicantOrgName: input.applicantOrgName.trim(),
    contactName: input.contactName.trim(),
    contactEmail: input.contactEmail.trim().toLowerCase(),
    contactPhone: input.contactPhone?.trim() ?? null,
    title: input.title.trim(),
    summary: input.summary?.trim() ?? null,
    requestedAmount:
      input.requestedAmount === null || input.requestedAmount === undefined
        ? null
        : toDecimal(input.requestedAmount),
    requestedMonths: input.requestedMonths ?? null,
    domains: input.domains ?? [],
    city: input.city ?? null,
    answers: (input.answers ?? {}) as unknown as Prisma.InputJsonValue,
    ...(input.submit ? { submittedAt: new Date() } : {}),
    ...(token
      ? {
          resumeTokenHash: hashToken(token),
          // Long enough to finish an application over a few sittings, short
          // enough that a leaked link does not stay live for a year.
          resumeExpiresAt: new Date(Date.now() + 30 * 86_400_000),
        }
      : {}),
  };

  const proposal = await prisma.proposal.upsert({
    where: { publicRef },
    create: { publicRef, ...data },
    update: data,
    select: { id: true, stage: true },
  });

  await prisma.proposalEvent.create({
    data: {
      proposalId: proposal.id,
      kind: input.submit ? "submitted" : "draft_saved",
      detail: { via: "public_form" } as unknown as Prisma.InputJsonValue,
      isPublic: true,
    },
  });

  return { proposalId: proposal.id, publicRef, resumeToken: token };
}

/** Resume a draft from a magic link. Compares the hash, never the token. */
export async function resumeProposal(publicRef: string, token: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { publicRef },
    select: {
      id: true,
      resumeTokenHash: true,
      resumeExpiresAt: true,
      stage: true,
      submittedAt: true,
      title: true,
      answers: true,
    },
  });
  if (!proposal?.resumeTokenHash) return null;
  if (proposal.resumeTokenHash !== hashToken(token)) return null;
  if (proposal.resumeExpiresAt && proposal.resumeExpiresAt < new Date()) return null;
  // A submitted proposal is readable but no longer editable — the applicant
  // should see their own submission, not a form that pretends to save.
  return { ...proposal, editable: !proposal.submittedAt };
}

/** Staff-created proposal: the pipeline half, for solicited work. */
export async function createStaffProposal(
  session: SessionLike,
  input: {
    orgId?: string | null;
    applicantOrgName: string;
    contactName: string;
    contactEmail: string;
    title: string;
    requestedAmount?: number | null;
    domains?: string[];
    city?: string | null;
    windowId?: string | null;
  },
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const proposal = await prisma.proposal.create({
    data: {
      publicRef: `S-${randomBytes(6).toString("hex").toUpperCase()}`,
      orgId: input.orgId ?? null,
      windowId: input.windowId ?? null,
      applicantOrgName: input.applicantOrgName.trim(),
      contactName: input.contactName.trim(),
      contactEmail: input.contactEmail.trim().toLowerCase(),
      title: input.title.trim(),
      requestedAmount:
        input.requestedAmount === null || input.requestedAmount === undefined
          ? null
          : toDecimal(input.requestedAmount),
      domains: input.domains ?? [],
      city: input.city ?? null,
      submittedAt: new Date(),
      assignedToId: userId,
    },
    select: { id: true, publicRef: true },
  });

  await prisma.proposalEvent.create({
    data: {
      proposalId: proposal.id,
      kind: "created_by_staff",
      actorId: userId,
      detail: {} as unknown as Prisma.InputJsonValue,
    },
  });
  logGrant("Proposal", proposal.id, userId, "created", {
    field: proposal.publicRef,
    to: input.applicantOrgName,
  });

  return proposal;
}

/**
 * Move a proposal along.
 *
 * Refuses an impossible transition rather than accepting it, and requires a
 * reason to leave the pipeline. "Why did we say no" is the question a grant
 * pipeline exists to answer, and the reason has to be captured at the moment
 * the decision is made or it is never captured at all.
 */
export async function moveProposalStage(
  session: SessionLike,
  proposalId: string,
  to: ProposalStage,
  opts?: { reasonCode?: string; reasonNote?: string },
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { id: true, stage: true, publicRef: true, applicantOrgName: true },
  });
  if (!proposal) throw new Error("Not found");

  if (proposal.stage === to) return { stage: to, unchanged: true as const };
  if (!canTransition(proposal.stage, to)) {
    throw new Error(
      `A proposal cannot go from ${proposal.stage.replace(/_/g, " ")} to ${to.replace(/_/g, " ")}.`,
    );
  }
  if (STAGES_NEEDING_REASON.includes(to) && !opts?.reasonCode) {
    throw new Error("Record why — a decline with no reason tells nobody anything later.");
  }

  await prisma.$transaction([
    prisma.proposal.update({
      where: { id: proposalId },
      data: {
        stage: to,
        declineReasonCode: STAGES_NEEDING_REASON.includes(to) ? opts!.reasonCode : undefined,
        declineReasonNote: STAGES_NEEDING_REASON.includes(to) ? (opts?.reasonNote ?? null) : undefined,
      },
    }),
    prisma.proposalEvent.create({
      data: {
        proposalId,
        kind: `stage_${to}`,
        actorId: userId,
        detail: {
          from: proposal.stage,
          to,
          reasonCode: opts?.reasonCode ?? null,
        } as unknown as Prisma.InputJsonValue,
        // The applicant sees that it moved, not the internal reasoning.
        isPublic: TERMINAL_STAGES.includes(to),
      },
    }),
  ]);

  logGrant("Proposal", proposalId, userId, `stage_${to}`, {
    field: proposal.publicRef,
    from: proposal.stage,
    to: opts?.reasonCode ?? to,
  });

  return { stage: to, unchanged: false as const };
}

/**
 * Score a proposal against a rubric.
 *
 * The rubric is COPIED onto the review. Editing the rubric afterwards must not
 * change a score already recorded — the screening module learnt this, and the
 * recorded total is what a decision rests on.
 */
export async function scoreProposal(
  session: SessionLike,
  input: { proposalId: string; rubricId: string; level?: number; scores: Record<string, number>; recommendation?: string; note?: string },
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const rubric = await prisma.proposalRubric.findUnique({
    where: { id: input.rubricId },
    select: { id: true, criteria: true, name: true, version: true },
  });
  if (!rubric) throw new Error("Rubric not found");

  const criteria = Array.isArray(rubric.criteria)
    ? (rubric.criteria as unknown as { key: string; weight?: number; maxScore?: number }[])
    : [];

  let total = 0;
  for (const c of criteria) {
    const raw = input.scores[c.key];
    if (raw === undefined) continue;
    const max = c.maxScore ?? 10;
    if (raw < 0 || raw > max) {
      throw new Error(`Score for ${c.key} must be between 0 and ${max}.`);
    }
    total += raw * (c.weight ?? 1);
  }

  const level = input.level ?? 1;
  const review = await prisma.proposalReview.upsert({
    where: { proposalId_reviewerId_level: { proposalId: input.proposalId, reviewerId: userId, level } },
    create: {
      proposalId: input.proposalId,
      reviewerId: userId,
      level,
      rubricId: rubric.id,
      rubricSnapshot: { name: rubric.name, version: rubric.version, criteria } as unknown as Prisma.InputJsonValue,
      scores: input.scores as unknown as Prisma.InputJsonValue,
      totalScore: total,
      recommendation: input.recommendation ?? null,
      note: input.note ?? null,
      submittedAt: new Date(),
    },
    update: {
      scores: input.scores as unknown as Prisma.InputJsonValue,
      totalScore: total,
      recommendation: input.recommendation ?? null,
      note: input.note ?? null,
      submittedAt: new Date(),
    },
    select: { id: true, totalScore: true },
  });

  return review;
}

/**
 * Turn an accepted proposal into a grant.
 *
 * The join from intake to the rest of the lifecycle. One-way and one-to-one:
 * `Proposal.budgetId` is `@unique`, so a proposal cannot quietly spawn two
 * grants.
 */
export async function linkProposalToBudget(session: SessionLike, proposalId: string, budgetId: string) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const [proposal, existing] = await Promise.all([
    prisma.proposal.findUnique({ where: { id: proposalId }, select: { budgetId: true, stage: true } }),
    prisma.proposal.findUnique({ where: { budgetId }, select: { id: true } }),
  ]);
  if (!proposal) throw new Error("Not found");
  if (proposal.budgetId) throw new Error("This proposal is already linked to a grant.");
  if (existing) throw new Error("That grant already came from another proposal.");

  await prisma.proposal.update({ where: { id: proposalId }, data: { budgetId } });
  logGrant("Proposal", proposalId, userId, "linked_to_budget", { field: "budgetId", to: budgetId });
}

/**
 * The pipeline, with ageing.
 *
 * Age is measured from the last stage MOVE, not from submission: a proposal
 * that moved yesterday is being worked on, and lumping it with one untouched
 * for ninety days is how a pipeline report gets ignored.
 */
export async function proposalPipeline(filter?: { windowId?: string; stage?: ProposalStage }) {
  const proposals = await prisma.proposal.findMany({
    where: {
      ...(filter?.windowId ? { windowId: filter.windowId } : {}),
      ...(filter?.stage ? { stage: filter.stage } : { stage: { notIn: TERMINAL_STAGES } }),
    },
    select: {
      id: true,
      publicRef: true,
      applicantOrgName: true,
      title: true,
      stage: true,
      requestedAmount: true,
      submittedAt: true,
      createdAt: true,
      city: true,
      domains: true,
      assignedTo: { select: { id: true, name: true } },
      reviews: { select: { totalScore: true, level: true } },
      events: {
        where: { kind: { startsWith: "stage_" } },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const now = Date.now();
  return proposals.map((p) => {
    const lastMove = p.events[0]?.createdAt ?? p.submittedAt ?? p.createdAt;
    return {
      id: p.id,
      publicRef: p.publicRef,
      orgName: p.applicantOrgName,
      title: p.title,
      stage: p.stage,
      requestedAmount: p.requestedAmount ? moneyToString(p.requestedAmount) : null,
      city: p.city,
      domains: p.domains,
      assignedTo: p.assignedTo,
      scores: p.reviews.map((r) => ({ level: r.level, total: r.totalScore })),
      daysInStage: Math.floor((now - lastMove.getTime()) / 86_400_000),
      daysSinceSubmission: p.submittedAt
        ? Math.floor((now - p.submittedAt.getTime()) / 86_400_000)
        : null,
    };
  });
}

/** Decline reasons, counted — what a funder should be able to say about itself. */
export async function declineReasonSummary(since?: Date) {
  const rows = await prisma.proposal.groupBy({
    by: ["declineReasonCode"],
    where: {
      stage: { in: ["ineligible", "withdrawn"] },
      declineReasonCode: { not: null },
      ...(since ? { updatedAt: { gte: since } } : {}),
    },
    _count: { _all: true },
  });
  return rows
    .map((r) => ({ reasonCode: r.declineReasonCode!, count: r._count._all }))
    .sort((a, b) => b.count - a.count);
}
