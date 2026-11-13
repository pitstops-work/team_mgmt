/**
 * Calls for proposals.
 *
 * A funding window is the thing a proposal arrives against: published dates,
 * published guidance, a question set, and an indicative ceiling. There are
 * currently none in the database, which is why the intake tables have never
 * held a row — the pipeline was built from the proposal end and had nothing to
 * point at.
 *
 * Two rules here carry most of the weight:
 *
 *   The status machine. `status` was a free enum column with nothing enforcing
 *   it, so a window could be open with a close date already in the past — open
 *   and closed at the same time, which `createPublicProposal` then refuses on
 *   one branch and accepts on the other depending on which field it reads.
 *
 *   Question keys. `questions` is JSON the public form renders and
 *   `Proposal.answers` is keyed by it. Two questions with the same key means
 *   the second answer silently overwrites the first, and the loss is invisible
 *   — the form looks right, the submission looks right, and one answer is
 *   simply gone. So a duplicate key is refused at the point of authoring.
 */

import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import type { FundingWindowStatus } from "@/app/generated/prisma/client";
import { toDecimal, moneyToString } from "./money";
import { logGrant } from "./audit";
import { isQuestionType, type WindowQuestion } from "./proposalVocabulary";

type SessionLike = { user?: { id?: string | null; role?: string | null } | null } | null;

/**
 * `Record<FundingWindowStatus, …>` so a new status cannot be added without
 * deciding what it may become.
 *
 * `closed → open` is allowed: a deadline gets extended, and the alternative is
 * that someone edits the row by hand. It is audited, and the close date has to
 * move with it, so an extension cannot be smuggled in as a reopen.
 */
export const WINDOW_TRANSITIONS: Record<FundingWindowStatus, FundingWindowStatus[]> = {
  draft: ["open", "archived"],
  open: ["closed", "draft"],
  closed: ["open", "archived"],
  archived: [],
};

export function canTransitionWindow(from: FundingWindowStatus, to: FundingWindowStatus): boolean {
  return WINDOW_TRANSITIONS[from]?.includes(to) ?? false;
}

const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validate the question set.
 *
 * Returns the cleaned questions rather than mutating in place, because the
 * caller writes them to a JSON column and a half-cleaned array is worse than a
 * refusal.
 */
export function parseQuestions(raw: unknown): WindowQuestion[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error("The question set must be a list.");

  const seen = new Set<string>();
  const out: WindowQuestion[] = [];

  for (const [i, item] of raw.entries()) {
    if (!item || typeof item !== "object") throw new Error(`Question ${i + 1} is not a question.`);
    const q = item as Record<string, unknown>;
    const key = typeof q.key === "string" ? q.key.trim() : "";
    const label = typeof q.label === "string" ? q.label.trim() : "";
    const type = typeof q.type === "string" ? q.type : "";

    if (!key) throw new Error(`Question ${i + 1} has no key.`);
    if (!SLUG_SHAPE.test(key)) {
      throw new Error(
        `Question key "${key}" must be lowercase letters, numbers and hyphens — it is a data column, not a heading.`,
      );
    }
    if (seen.has(key)) {
      // The silent one. Both questions render; only one answer survives.
      throw new Error(
        `Two questions share the key "${key}". The second answer would overwrite the first and nothing would show that it had.`,
      );
    }
    seen.add(key);
    if (!label) throw new Error(`Question "${key}" has no label.`);
    if (!isQuestionType(type)) throw new Error(`Question "${key}" has an unknown type "${type}".`);

    const options =
      Array.isArray(q.options) ? q.options.filter((o): o is string => typeof o === "string" && o.trim() !== "") : [];
    if (type === "select" && options.length < 2) {
      throw new Error(`Question "${key}" is a choice with fewer than two options.`);
    }

    out.push({
      key,
      label,
      type,
      required: q.required === true,
      ...(type === "select" ? { options } : {}),
      ...(typeof q.help === "string" && q.help.trim() ? { help: q.help.trim() } : {}),
    });
  }

  return out;
}

export async function saveFundingWindow(
  session: SessionLike,
  input: {
    id?: string;
    name: string;
    slug: string;
    grantingUnitId?: string | null;
    opensOn?: string | null;
    closesOn?: string | null;
    brief?: string | null;
    ceilingAmount?: number | null;
    questions?: unknown;
  },
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const name = input.name?.trim();
  const slug = input.slug?.trim().toLowerCase();
  if (!name) throw new Error("Give the call a name.");
  if (!slug) throw new Error("Give the call a slug — it is the public web address.");
  if (!SLUG_SHAPE.test(slug)) {
    throw new Error("The slug must be lowercase letters, numbers and hyphens, e.g. creche-2027.");
  }

  const opensOn = input.opensOn ? new Date(input.opensOn) : null;
  const closesOn = input.closesOn ? new Date(input.closesOn) : null;
  if (opensOn && Number.isNaN(opensOn.getTime())) throw new Error("That opening date is not a date.");
  if (closesOn && Number.isNaN(closesOn.getTime())) throw new Error("That closing date is not a date.");
  if (opensOn && closesOn && closesOn < opensOn) {
    throw new Error("The call cannot close before it opens.");
  }
  if (input.ceilingAmount !== null && input.ceilingAmount !== undefined && input.ceilingAmount <= 0) {
    throw new Error("An indicative ceiling of zero tells an applicant nothing. Leave it blank instead.");
  }

  const questions = parseQuestions(input.questions);

  const clash = await prisma.fundingWindow.findUnique({ where: { slug }, select: { id: true } });
  if (clash && clash.id !== input.id) {
    throw new Error(`The slug "${slug}" is already used by another call.`);
  }

  if (input.grantingUnitId) {
    const unit = await prisma.grantingUnit.findUnique({
      where: { id: input.grantingUnitId },
      select: { id: true },
    });
    if (!unit) throw new Error("That granting unit does not exist.");
  }

  const data = {
    name,
    slug,
    grantingUnitId: input.grantingUnitId ?? null,
    opensOn,
    closesOn,
    brief: input.brief?.trim() || null,
    ceilingAmount:
      input.ceilingAmount === null || input.ceilingAmount === undefined
        ? null
        : toDecimal(input.ceilingAmount),
    questions: questions as unknown as Prisma.InputJsonValue,
  };

  if (input.id) {
    const existing = await prisma.fundingWindow.findUnique({
      where: { id: input.id },
      select: { status: true, questions: true },
    });
    if (!existing) throw new Error("Not found");
    if (existing.status === "archived") throw new Error("An archived call cannot be edited.");

    // ── Why an open call's questions are frozen ─────────────────────────────
    // `Proposal.answers` is keyed by question key. Removing or re-keying a
    // question while applications are in flight does not delete the answers —
    // it orphans them, so an answer someone wrote is still in the row and no
    // longer appears anywhere. Renaming a label is fine; changing the shape is
    // not, and the honest move is to close the call and open another.
    if (existing.status === "open") {
      const before = parseQuestions(existing.questions);
      const beforeKeys = before.map((q) => `${q.key}:${q.type}`).sort().join("|");
      const afterKeys = questions.map((q) => `${q.key}:${q.type}`).sort().join("|");
      if (beforeKeys !== afterKeys) {
        throw new Error(
          "This call is open, so its question set is frozen. Labels and guidance can change; adding, removing or re-typing a question would orphan answers already submitted.",
        );
      }
    }

    const window = await prisma.fundingWindow.update({
      where: { id: input.id },
      data,
      select: { id: true, slug: true },
    });
    logGrant("FundingWindow", window.id, userId, "updated", { field: "slug", to: slug });
    return window;
  }

  const window = await prisma.fundingWindow.create({
    data: { ...data, status: "draft" },
    select: { id: true, slug: true },
  });
  logGrant("FundingWindow", window.id, userId, "created", { field: "slug", to: slug });
  return window;
}

/**
 * Open, close, reopen or archive a call.
 *
 * Opening is the one with real preconditions, because opening is publishing: a
 * public web address starts serving a form, and whatever is wrong with the call
 * at that moment is wrong in front of applicants.
 */
export async function setWindowStatus(
  session: SessionLike,
  windowId: string,
  to: FundingWindowStatus,
  opts?: { closesOn?: string | null },
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const window = await prisma.fundingWindow.findUnique({
    where: { id: windowId },
    select: {
      id: true,
      name: true,
      status: true,
      closesOn: true,
      brief: true,
      questions: true,
      _count: { select: { proposals: true } },
    },
  });
  if (!window) throw new Error("Not found");
  if (window.status === to) return { status: to, unchanged: true as const };
  if (!canTransitionWindow(window.status, to)) {
    throw new Error(`A call cannot go from ${window.status} to ${to}.`);
  }

  const newClose = opts?.closesOn ? new Date(opts.closesOn) : null;
  if (opts?.closesOn && Number.isNaN(newClose!.getTime())) {
    throw new Error("That closing date is not a date.");
  }

  if (to === "open") {
    const closesOn = newClose ?? window.closesOn;
    if (!closesOn) {
      throw new Error("A call needs a closing date before it opens — an open call with no deadline never closes.");
    }
    // Open and closed at once. `createPublicProposal` checks the status on one
    // branch and the date on another, so this state accepts or refuses a
    // submission depending on which check runs first.
    if (closesOn < new Date()) {
      throw new Error("That closing date has already passed. Move it before opening the call.");
    }
    if (!window.brief?.trim()) {
      throw new Error("Publish the guidance first. An open call with no brief is a form with no question behind it.");
    }
    // A reopen must move the deadline. Otherwise "reopened" and "was never
    // closed" are the same row, and the applicant who missed the first
    // deadline has no way to know which they are looking at.
    if (window.status === "closed" && (!newClose || newClose <= new Date())) {
      throw new Error("Reopening a closed call needs a new closing date in the future.");
    }
  }

  if (to === "archived" && window._count.proposals > 0) {
    throw new Error(
      `${window._count.proposals} proposal(s) came in through this call. Archiving would hide where they came from — leave it closed.`,
    );
  }

  await prisma.$transaction([
    prisma.fundingWindow.update({
      where: { id: windowId },
      data: { status: to, ...(newClose ? { closesOn: newClose } : {}) },
    }),
  ]);

  logGrant("FundingWindow", windowId, userId, `status_${to}`, {
    field: "status",
    from: window.status,
    to,
  });

  return { status: to, unchanged: false as const };
}

/** Every call, with what has come in through it. */
export async function fundingWindows() {
  const windows = await prisma.fundingWindow.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      opensOn: true,
      closesOn: true,
      ceilingAmount: true,
      brief: true,
      questions: true,
      grantingUnit: { select: { id: true, name: true } },
      proposals: { select: { stage: true, requestedAmount: true } },
    },
    orderBy: [{ status: "asc" }, { closesOn: "desc" }],
  });

  const now = new Date();
  return windows.map((w) => {
    const requested = w.proposals.reduce(
      (acc, p) => acc.plus(p.requestedAmount ?? 0),
      new Prisma.Decimal(0),
    );
    return {
      id: w.id,
      name: w.name,
      slug: w.slug,
      status: w.status,
      opensOn: w.opensOn,
      closesOn: w.closesOn,
      grantingUnit: w.grantingUnit,
      ceilingAmount: w.ceilingAmount ? moneyToString(w.ceilingAmount) : null,
      hasBrief: Boolean(w.brief?.trim()),
      questionCount: Array.isArray(w.questions) ? (w.questions as unknown[]).length : 0,
      proposalCount: w.proposals.length,
      liveCount: w.proposals.filter(
        (p) => !["ineligible", "withdrawn", "decided"].includes(p.stage),
      ).length,
      requestedTotal: moneyToString(requested),
      /**
       * Open, with a deadline in the past. Refused on every path that writes
       * the status now, but 0 windows exist today and nothing stops a row
       * reaching this state by hand, so the desk says so rather than
       * pretending the call is taking submissions.
       */
      pastDeadlineWhileOpen: w.status === "open" && Boolean(w.closesOn && w.closesOn < now),
    };
  });
}

export async function fundingWindowDetail(windowId: string) {
  const w = await prisma.fundingWindow.findUnique({
    where: { id: windowId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      opensOn: true,
      closesOn: true,
      brief: true,
      ceilingAmount: true,
      questions: true,
      grantingUnit: { select: { id: true, name: true } },
      rubrics: {
        select: { id: true, name: true, version: true, isActive: true, criteria: true },
        orderBy: [{ isActive: "desc" }, { version: "desc" }],
      },
      _count: { select: { proposals: true } },
    },
  });
  if (!w) return null;
  return {
    ...w,
    ceilingAmount: w.ceilingAmount ? moneyToString(w.ceilingAmount) : null,
    questions: parseQuestions(w.questions),
    nextStatuses: WINDOW_TRANSITIONS[w.status] ?? [],
  };
}

/**
 * Save a scoring sheet.
 *
 * Versioned rather than edited: `ProposalReview.rubricSnapshot` freezes the
 * sheet onto each review, so editing criteria in place leaves recorded totals
 * describing a sheet that no longer exists. Once a review has used a rubric, a
 * change makes a NEW version and retires the old one, which is the same freeze
 * discipline the budget side uses for an approved baseline.
 */
export async function saveRubric(
  session: SessionLike,
  input: {
    id?: string;
    windowId?: string | null;
    name: string;
    criteria: unknown;
  },
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");
  const name = input.name?.trim();
  if (!name) throw new Error("Give the scoring sheet a name.");

  if (!Array.isArray(input.criteria) || input.criteria.length === 0) {
    throw new Error("A scoring sheet with no criteria scores nothing.");
  }
  const seen = new Set<string>();
  const criteria = input.criteria.map((item, i) => {
    const c = (item ?? {}) as Record<string, unknown>;
    const key = typeof c.key === "string" ? c.key.trim() : "";
    const label = typeof c.label === "string" ? c.label.trim() : "";
    if (!key) throw new Error(`Criterion ${i + 1} has no key.`);
    if (!SLUG_SHAPE.test(key)) {
      throw new Error(`Criterion key "${key}" must be lowercase letters, numbers and hyphens.`);
    }
    if (seen.has(key)) throw new Error(`Two criteria share the key "${key}".`);
    seen.add(key);
    if (!label) throw new Error(`Criterion "${key}" has no label.`);
    const weight = typeof c.weight === "number" ? c.weight : 1;
    const maxScore = typeof c.maxScore === "number" ? c.maxScore : 10;
    if (weight <= 0) throw new Error(`Criterion "${key}" has a weight of zero — it would not count.`);
    if (maxScore <= 0) throw new Error(`Criterion "${key}" has a maximum of zero.`);
    return {
      key,
      label,
      weight,
      maxScore,
      ...(typeof c.guidance === "string" && c.guidance.trim() ? { guidance: c.guidance.trim() } : {}),
    };
  });

  if (input.windowId) {
    const window = await prisma.fundingWindow.findUnique({
      where: { id: input.windowId },
      select: { id: true },
    });
    if (!window) throw new Error("That call does not exist.");
  }

  if (!input.id) {
    const created = await prisma.proposalRubric.create({
      data: {
        windowId: input.windowId ?? null,
        name,
        version: 1,
        criteria: criteria as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, version: true },
    });
    logGrant("ProposalRubric", created.id, userId, "created", { field: "name", to: name });
    return created;
  }

  const existing = await prisma.proposalRubric.findUnique({
    where: { id: input.id },
    select: { id: true, windowId: true, name: true, version: true, _count: { select: { reviews: true } } },
  });
  if (!existing) throw new Error("Not found");

  // Nothing has been scored against it yet, so editing in place changes
  // nothing that has been relied on.
  if (existing._count.reviews === 0) {
    const updated = await prisma.proposalRubric.update({
      where: { id: input.id },
      data: {
        name,
        windowId: input.windowId ?? null,
        criteria: criteria as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, version: true },
    });
    logGrant("ProposalRubric", updated.id, userId, "updated", { field: "name", to: name });
    return updated;
  }

  const [, created] = await prisma.$transaction([
    prisma.proposalRubric.update({ where: { id: input.id }, data: { isActive: false } }),
    prisma.proposalRubric.create({
      data: {
        windowId: input.windowId ?? existing.windowId,
        name,
        version: existing.version + 1,
        criteria: criteria as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, version: true },
    }),
  ]);
  logGrant("ProposalRubric", created.id, userId, "versioned", {
    field: "version",
    from: String(existing.version),
    to: String(created.version),
  });
  return created;
}

/** Active sheets a reviewer may use on a proposal in this call. */
export async function rubricsFor(windowId: string | null) {
  return prisma.proposalRubric.findMany({
    where: {
      isActive: true,
      // A window-less sheet is the house default and is offered everywhere.
      OR: [{ windowId: null }, ...(windowId ? [{ windowId }] : [])],
    },
    select: { id: true, name: true, version: true, windowId: true, criteria: true },
    orderBy: [{ windowId: "desc" }, { version: "desc" }],
  });
}
