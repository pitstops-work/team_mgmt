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
import { liveConflictFor } from "./authority";
import {
  TERMINAL_PROPOSAL_STAGES,
  STAGES_NEEDING_REASON,
  isDeclineReason,
  declineReasonNeedsNote,
  declineReasonLabel,
} from "./proposalVocabulary";

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

/**
 * Both of these used to be declared here. They now come from
 * `proposalVocabulary.ts` so the stage picker and the applicant's status page
 * read the SAME lists — a hand-maintained second copy drifts, and the way this
 * one would drift is by offering a transition the server then refuses.
 */
const TERMINAL_STAGES = TERMINAL_PROPOSAL_STAGES;

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
  /** Required whenever `publicRef` is given — see the guard below. */
  resumeToken?: string;
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
  /** Salted hash of the submitting IP. Written once, on creation only. */
  createdIpHash?: string;
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

  // ── The hole this closes ──────────────────────────────────────────────────
  // `publicRef` is an INPUT, and the write below is an upsert on it. So a
  // caller who knew or guessed another applicant's reference could overwrite
  // that applicant's entire proposal — org name, contact, amount, every answer
  // — with no token, on a public endpoint. `resumeProposal` takes the token
  // seriously and then refuses to return an editable form once the proposal is
  // submitted; the save path ignored both facts.
  //
  // Continuing an existing proposal therefore needs the resume token, and the
  // proposal has to still be open. Once it is submitted, or once a human has
  // started working on it, the applicant's own route is to talk to us — not to
  // rewrite the document under the person reading it.
  if (input.publicRef) {
    const existing = await prisma.proposal.findUnique({
      where: { publicRef: input.publicRef },
      select: {
        resumeTokenHash: true,
        resumeExpiresAt: true,
        submittedAt: true,
        stage: true,
      },
    });
    if (!existing) throw new Error("We could not find that application.");
    // One message for a missing token, a wrong token and a wrong reference.
    // Distinguishing them would turn this into an oracle for which references
    // exist. It does NOT say "the link we emailed you": no sending domain is
    // verified on this account, so every message the app tries to send is
    // refused by the provider — pointing someone at an inbox would strand them.
    const wrongLink = "Open your application from the link you saved when you started it.";
    if (!input.resumeToken || !existing.resumeTokenHash) throw new Error(wrongLink);
    if (existing.resumeTokenHash !== hashToken(input.resumeToken)) throw new Error(wrongLink);
    if (existing.resumeExpiresAt && existing.resumeExpiresAt < new Date()) {
      throw new Error("That link has expired. Write to us and we will reopen the application.");
    }
    if (existing.submittedAt) {
      throw new Error("This application has already been submitted and cannot be changed.");
    }
    if (existing.stage !== "received") {
      throw new Error("This application is already being assessed and cannot be changed.");
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
    ...(token
      ? {
          resumeTokenHash: hashToken(token),
          // Long enough to finish an application over a few sittings, short
          // enough that a leaked link does not stay live for a year.
          resumeExpiresAt: new Date(Date.now() + 30 * 86_400_000),
        }
      : {}),
    // ── Why submitting clears the expiry ──────────────────────────────────
    // The same token is the applicant's editing link AND their status link.
    // Expiring it in 30 days is right for editing and wrong for status: a
    // funding decision takes months, so the applicant would be locked out of
    // their own record long before there was anything to see — silently, with
    // the page reading as a 404. Submitting already removes the token's power
    // to change anything (`createPublicProposal` refuses a submitted proposal
    // and `draftForForm` will not reopen one), so what is left is a read key
    // with no reason to lapse.
    //
    // Ordered after the token clause so this wins when an application is
    // started and submitted in one sitting.
    ...(input.submit ? { submittedAt: new Date(), resumeExpiresAt: null } : {}),
  };

  const proposal = await prisma.proposal.upsert({
    where: { publicRef },
    // `createdIpHash` is in the create branch only. On the update branch it
    // would move with whoever last opened the draft — which both loses the
    // provenance it exists to record and lets the throttle be reset by
    // continuing an application from somewhere else.
    create: { publicRef, ...data, createdIpHash: input.createdIpHash ?? null },
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
  if (STAGES_NEEDING_REASON.includes(to)) {
    if (!opts?.reasonCode) {
      throw new Error("Record why — a decline with no reason tells nobody anything later.");
    }
    // The code has to come from the fixed list. `declineReasonSummary()` groups
    // by this column, and free text through a group-by turns "no fit", "No Fit"
    // and "not a fit" into three separate findings.
    if (!isDeclineReason(opts.reasonCode)) {
      throw new Error("Choose one of the recorded decline reasons.");
    }
    if (declineReasonNeedsNote(opts.reasonCode) && !opts.reasonNote?.trim()) {
      throw new Error(
        `"${declineReasonLabel(opts.reasonCode)}" says nothing on its own — add the detail.`,
      );
    }
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

  const [proposal, rubric, existing] = await Promise.all([
    prisma.proposal.findUnique({
      where: { id: input.proposalId },
      select: { id: true, stage: true, windowId: true, orgId: true, publicRef: true },
    }),
    prisma.proposalRubric.findUnique({
      where: { id: input.rubricId },
      select: { id: true, criteria: true, name: true, version: true, windowId: true, isActive: true },
    }),
    prisma.proposalReview.findUnique({
      where: {
        proposalId_reviewerId_level: {
          proposalId: input.proposalId,
          reviewerId: userId,
          level: input.level ?? 1,
        },
      },
      select: { id: true, rubricId: true },
    }),
  ]);
  if (!proposal) throw new Error("Not found");
  if (!rubric) throw new Error("Rubric not found");

  // A proposal that has left the pipeline is not scoreable. A score arriving
  // after a decline reads, later, as though the decline was taken against it.
  if (TERMINAL_STAGES.includes(proposal.stage)) {
    throw new Error(
      `This proposal is ${proposal.stage.replace(/_/g, " ")} — scoring it now would backdate the record.`,
    );
  }

  // The rubric has to belong to this call, or be a global one. Scoring two
  // proposals in the same window against different rubrics produces two totals
  // that are then ranked against each other, which is the one thing a score is
  // for and the one thing it cannot survive.
  if (rubric.windowId && rubric.windowId !== proposal.windowId) {
    throw new Error("That scoring sheet belongs to a different call for proposals.");
  }
  if (!rubric.isActive && existing?.rubricId !== rubric.id) {
    throw new Error("That scoring sheet has been retired.");
  }

  // The rubric is frozen onto the review at creation. Letting an EXISTING
  // review switch rubric would change the scores while `rubricSnapshot` kept
  // describing the old sheet — a total whose own record of how it was computed
  // is wrong.
  if (existing && existing.rubricId && existing.rubricId !== rubric.id) {
    throw new Error(
      "This review was scored against a different sheet. Start a new review rather than re-pointing this one.",
    );
  }

  // A declared conflict requiring recusal stops the score, not just the
  // decision. The person who stood aside from the vote should not be writing
  // the number the vote is taken on.
  const conflict = await liveConflictFor(userId, proposal.orgId);
  if (conflict?.disposition === "recuse") {
    throw new Error(
      "You have declared a conflict requiring recusal on this organisation, so you cannot score its proposal.",
    );
  }

  const criteria = Array.isArray(rubric.criteria)
    ? (rubric.criteria as unknown as { key: string; weight?: number; maxScore?: number }[])
    : [];

  if (!criteria.length) throw new Error("That scoring sheet has no criteria on it.");

  // Every criterion, not the ones that were filled in.
  //
  // The original skipped a missing score and carried on. A weighted total over
  // four of six criteria is simply a smaller number than one over all six —
  // and nothing downstream knows the difference, so the half-scored proposal
  // ranks below the fully-scored one for a reason that has nothing to do with
  // its merit. Refusing is the only version of this that stays comparable.
  const missing = criteria.filter((c) => input.scores[c.key] === undefined).map((c) => c.key);
  if (missing.length) {
    throw new Error(
      `Score every criterion — a partial total ranks below a complete one for no reason. Missing: ${missing.join(", ")}.`,
    );
  }

  let total = 0;
  let maxPossible = 0;
  for (const c of criteria) {
    const raw = input.scores[c.key];
    const max = c.maxScore ?? 10;
    if (!Number.isFinite(raw)) throw new Error(`Score for ${c.key} is not a number.`);
    if (raw < 0 || raw > max) {
      throw new Error(`Score for ${c.key} must be between 0 and ${max}.`);
    }
    total += raw * (c.weight ?? 1);
    maxPossible += max * (c.weight ?? 1);
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

  await prisma.proposalEvent.create({
    data: {
      proposalId: input.proposalId,
      kind: "scored",
      actorId: userId,
      detail: {
        level,
        total,
        maxPossible,
        rubric: `${rubric.name} v${rubric.version}`,
        ...(conflict ? { disclosureId: conflict.id } : {}),
      } as unknown as Prisma.InputJsonValue,
      // The applicant is not shown a score. The whole point of candour in a
      // review is that it is not written to be read by its subject.
      isPublic: false,
    },
  });

  return { ...review, maxPossible };
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

  const [proposal, existing, budget] = await Promise.all([
    prisma.proposal.findUnique({
      where: { id: proposalId },
      select: {
        budgetId: true,
        stage: true,
        continuity: true,
        publicRef: true,
        declineReasonCode: true,
      },
    }),
    prisma.proposal.findUnique({ where: { budgetId }, select: { id: true, publicRef: true } }),
    prisma.budget.findUnique({ where: { id: budgetId }, select: { id: true, name: true } }),
  ]);
  if (!proposal) throw new Error("Not found");
  if (!budget) throw new Error("That grant does not exist.");
  if (proposal.budgetId) throw new Error("This proposal is already linked to a grant.");
  if (existing) throw new Error(`That grant already came from proposal ${existing.publicRef}.`);

  // ── The stage check this never had ────────────────────────────────────────
  // This is the join from intake to the rest of the lifecycle, and it accepted
  // ANY stage. A proposal marked `ineligible` — declined, with the reason on
  // the record — could be turned into a grant, and the spine would then read
  // "Proposal: declined" above a live grant with a budget and a release
  // schedule. So could one still at `received`, which nobody had read.
  if (TERMINAL_STAGES.includes(proposal.stage) && proposal.stage !== "decided") {
    throw new Error(
      proposal.declineReasonCode
        ? `${proposal.publicRef} was declined (${declineReasonLabel(proposal.declineReasonCode)}). A declined proposal cannot become a grant.`
        : `${proposal.publicRef} is ${proposal.stage.replace(/_/g, " ")} and cannot become a grant.`,
    );
  }
  if (proposal.stage === "received" || proposal.stage === "screening") {
    throw new Error(
      `${proposal.publicRef} has not been screened yet. Take it to eligible first — a grant built now has nothing behind it.`,
    );
  }

  // Carry the applicant's own framing forward. A grant that the applicant
  // described as a continuation should not arrive on the grant side looking
  // like a first grant, which is the context an appraisal leans on.
  await prisma.$transaction([
    prisma.proposal.update({ where: { id: proposalId }, data: { budgetId } }),
    ...(proposal.continuity
      ? [prisma.budget.update({ where: { id: budgetId }, data: { continuity: proposal.continuity } })]
      : []),
    prisma.proposalEvent.create({
      data: {
        proposalId,
        kind: "linked_to_grant",
        actorId: userId,
        detail: { budgetId, budgetName: budget.name } as unknown as Prisma.InputJsonValue,
        isPublic: true,
      },
    }),
  ]);
  logGrant("Proposal", proposalId, userId, "linked_to_budget", { field: "budgetId", to: budgetId });
}

/**
 * Attach a proposal to an organisation in the registry.
 *
 * Kept separate from intake, and audited, because a near-match on an
 * organisation name is a JUDGEMENT rather than a lookup — the alias registry
 * exists because this project has already watched the app agree with itself on
 * a misspelt partner name. `applicantOrgName` stays exactly as typed, so the
 * two can always be compared afterwards.
 */
export async function matchProposalToOrg(
  session: SessionLike,
  proposalId: string,
  orgId: string | null,
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { orgId: true, publicRef: true, applicantOrgName: true, budgetId: true },
  });
  if (!proposal) throw new Error("Not found");
  // Once the proposal is a grant, the org on it is what due diligence,
  // authority and the conflict checks all read. Re-pointing it here would move
  // those silently.
  if (proposal.budgetId) {
    throw new Error("This proposal is already a grant — change the organisation on the grant instead.");
  }

  if (orgId) {
    const org = await prisma.org.findUnique({ where: { id: orgId }, select: { id: true, name: true } });
    if (!org) throw new Error("That organisation does not exist.");
  }

  await prisma.$transaction([
    prisma.proposal.update({ where: { id: proposalId }, data: { orgId } }),
    prisma.proposalEvent.create({
      data: {
        proposalId,
        kind: orgId ? "org_matched" : "org_unmatched",
        actorId: userId,
        detail: { typedAs: proposal.applicantOrgName, orgId } as unknown as Prisma.InputJsonValue,
        isPublic: false,
      },
    }),
  ]);
  logGrant("Proposal", proposalId, userId, orgId ? "org_matched" : "org_unmatched", {
    field: "orgId",
    from: proposal.orgId ?? undefined,
    to: orgId ?? undefined,
  });
}

/** Who is carrying this one. Audited so "nobody owns it" is answerable. */
export async function assignProposal(
  session: SessionLike,
  proposalId: string,
  assigneeId: string | null,
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { assignedToId: true },
  });
  if (!proposal) throw new Error("Not found");
  if (assigneeId) {
    const user = await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true } });
    if (!user) throw new Error("That person does not exist.");
  }

  await prisma.proposal.update({ where: { id: proposalId }, data: { assignedToId: assigneeId } });
  logGrant("Proposal", proposalId, userId, "assigned", {
    field: "assignedToId",
    from: proposal.assignedToId ?? undefined,
    to: assigneeId ?? undefined,
  });
}

/**
 * One proposal, whole.
 *
 * Returns the stages it may legitimately move to rather than letting the screen
 * work that out — the picker and the server then cannot disagree about what is
 * offered, which is how a UI ends up presenting a button that always errors.
 */
export async function proposalDetail(proposalId: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      publicRef: true,
      stage: true,
      applicantOrgName: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      title: true,
      summary: true,
      requestedAmount: true,
      requestedMonths: true,
      domains: true,
      city: true,
      answers: true,
      continuity: true,
      declineReasonCode: true,
      declineReasonNote: true,
      submittedAt: true,
      createdAt: true,
      updatedAt: true,
      budgetId: true,
      budget: { select: { id: true, name: true, status: true } },
      org: { select: { id: true, name: true } },
      window: { select: { id: true, name: true, ceilingAmount: true, questions: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      reviews: {
        select: {
          id: true,
          level: true,
          totalScore: true,
          recommendation: true,
          note: true,
          submittedAt: true,
          rubricSnapshot: true,
          scores: true,
          reviewer: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ level: "asc" }, { createdAt: "asc" }],
      },
      events: {
        select: { id: true, kind: true, detail: true, isPublic: true, createdAt: true, actor: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      documents: { select: { id: true, kind: true, title: true, createdAt: true } },
    },
  });
  if (!proposal) return null;

  return {
    ...proposal,
    requestedAmount: proposal.requestedAmount ? moneyToString(proposal.requestedAmount) : null,
    ceilingAmount: proposal.window?.ceilingAmount
      ? moneyToString(proposal.window.ceilingAmount)
      : null,
    nextStages: STAGE_TRANSITIONS[proposal.stage] ?? [],
  };
}

export type ProposalDetail = NonNullable<Awaited<ReturnType<typeof proposalDetail>>>;

/**
 * The applicant's own view, by reference and resume token.
 *
 * Shaped by what it must NOT carry. There is no session here — this is read by
 * someone who holds a link — so it is built by naming each field rather than
 * spreading the row, and it contains no score, no reviewer, no internal note,
 * and no event that was not marked public when it was written.
 */
export async function publicProposalStatus(publicRef: string, token: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { publicRef },
    select: {
      publicRef: true,
      resumeTokenHash: true,
      resumeExpiresAt: true,
      stage: true,
      title: true,
      applicantOrgName: true,
      contactName: true,
      requestedAmount: true,
      declineReasonCode: true,
      submittedAt: true,
      createdAt: true,
      window: { select: { name: true, closesOn: true } },
      events: {
        where: { isPublic: true },
        select: { kind: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!proposal?.resumeTokenHash) return null;
  if (proposal.resumeTokenHash !== hashToken(token)) return null;
  if (proposal.resumeExpiresAt && proposal.resumeExpiresAt < new Date()) return null;

  return {
    publicRef: proposal.publicRef,
    stage: proposal.stage,
    title: proposal.title,
    orgName: proposal.applicantOrgName,
    contactName: proposal.contactName,
    requestedAmount: proposal.requestedAmount ? moneyToString(proposal.requestedAmount) : null,
    declineReasonCode: proposal.declineReasonCode,
    submittedAt: proposal.submittedAt,
    createdAt: proposal.createdAt,
    windowName: proposal.window?.name ?? null,
    timeline: proposal.events.map((e) => ({ kind: e.kind, at: e.createdAt })),
    editable: !proposal.submittedAt && proposal.stage === "received",
  };
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
