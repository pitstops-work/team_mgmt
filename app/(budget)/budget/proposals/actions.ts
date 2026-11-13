"use server";

/**
 * Intake actions.
 *
 * Every function in `lib/budget/proposals.ts` and `lib/budget/fundingWindows.ts`
 * checks `session.user.id` and nothing else, which is what "not authenticated"
 * means and not what "may do this" means. Until now that was academic: no
 * screen called any of them. These actions are the screens, so the gate lives
 * here, once, at the top of each — the same shape the agreement, document and
 * closure actions settled on after each turned out to have the same hole.
 *
 * Intake is internal-only, and that is a different split from the rest of the
 * lifecycle. An applicant is not a grantee: they have no login, no grant and no
 * `Budget` row for `canAccessBudget` to reason about. Their face on this stage
 * is the public status page, which authenticates with a reference and a resume
 * token and never touches these actions.
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { canAccessBudget } from "@/lib/budget/budgetAccess";
import type { ProposalStage, FundingWindowStatus } from "@/app/generated/prisma/client";
import {
  createStaffProposal,
  moveProposalStage,
  scoreProposal,
  linkProposalToBudget,
  matchProposalToOrg,
  assignProposal,
  proposalDetail,
  proposalPipeline,
  declineReasonSummary,
} from "@/lib/budget/proposals";
import {
  saveFundingWindow,
  setWindowStatus,
  saveRubric,
  fundingWindows,
  fundingWindowDetail,
  rubricsFor,
} from "@/lib/budget/fundingWindows";

/**
 * The gate for everything on this desk.
 *
 * There is no record-level dimension to add here the way there is on a grant —
 * a proposal has no grantee to be, and no partner lane reaches it — so the
 * role check IS the gate, and it is stated explicitly rather than inherited
 * from a page that happens to be admin-only.
 */
async function requireIntakeStaff() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  if (!(isSuperAdmin(session) || isBudgetAdmin(session))) throw new Error("Forbidden");
  return session;
}

function asFormError(err: unknown) {
  return { ok: false as const, error: err instanceof Error ? err.message : "Something went wrong." };
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function getProposalDesk(filter?: { windowId?: string; stage?: ProposalStage }) {
  await requireIntakeStaff();
  const [rows, declines, windows] = await Promise.all([
    proposalPipeline(filter),
    declineReasonSummary(),
    fundingWindows(),
  ]);
  return { rows, declines, windows };
}

export async function getProposal(proposalId: string) {
  await requireIntakeStaff();
  const proposal = await proposalDetail(proposalId);
  if (!proposal) throw new Error("Not found");
  const rubrics = await rubricsFor(proposal.window?.id ?? null);
  return { proposal, rubrics };
}

export async function getWindows() {
  await requireIntakeStaff();
  return fundingWindows();
}

export async function getWindow(windowId: string) {
  await requireIntakeStaff();
  const window = await fundingWindowDetail(windowId);
  if (!window) throw new Error("Not found");
  return window;
}

// ── Proposals ────────────────────────────────────────────────────────────────

export async function addStaffProposal(input: {
  applicantOrgName: string;
  contactName: string;
  contactEmail: string;
  title: string;
  requestedAmount?: number | null;
  domains?: string[];
  city?: string | null;
  windowId?: string | null;
  orgId?: string | null;
}) {
  try {
    const session = await requireIntakeStaff();
    const proposal = await createStaffProposal(session, input);
    revalidatePath("/budget/proposals");
    revalidatePath("/budget/pipeline");
    return { ok: true as const, proposalId: proposal.id, publicRef: proposal.publicRef };
  } catch (err) {
    return asFormError(err);
  }
}

export async function moveProposal(input: {
  proposalId: string;
  to: ProposalStage;
  reasonCode?: string;
  reasonNote?: string;
}) {
  try {
    const session = await requireIntakeStaff();
    const result = await moveProposalStage(session, input.proposalId, input.to, {
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote,
    });
    revalidatePath(`/budget/proposals/${input.proposalId}`);
    revalidatePath("/budget/proposals");
    revalidatePath("/budget/pipeline");
    return { ok: true as const, stage: result.stage };
  } catch (err) {
    return asFormError(err);
  }
}

export async function scoreOneProposal(input: {
  proposalId: string;
  rubricId: string;
  level?: number;
  scores: Record<string, number>;
  recommendation?: string;
  note?: string;
}) {
  try {
    const session = await requireIntakeStaff();
    const review = await scoreProposal(session, input);
    revalidatePath(`/budget/proposals/${input.proposalId}`);
    return { ok: true as const, total: review.totalScore, maxPossible: review.maxPossible };
  } catch (err) {
    return asFormError(err);
  }
}

export async function setProposalOrg(input: { proposalId: string; orgId: string | null }) {
  try {
    const session = await requireIntakeStaff();
    await matchProposalToOrg(session, input.proposalId, input.orgId);
    revalidatePath(`/budget/proposals/${input.proposalId}`);
    return { ok: true as const };
  } catch (err) {
    return asFormError(err);
  }
}

export async function setProposalAssignee(input: { proposalId: string; assigneeId: string | null }) {
  try {
    const session = await requireIntakeStaff();
    await assignProposal(session, input.proposalId, input.assigneeId);
    revalidatePath(`/budget/proposals/${input.proposalId}`);
    revalidatePath("/budget/proposals");
    return { ok: true as const };
  } catch (err) {
    return asFormError(err);
  }
}

/**
 * The intake-to-grant join.
 *
 * The only action on this desk that needs a SECOND check, because it writes to
 * a `Budget` — and the grant side's access rules are the ones that say who may
 * touch that budget. The role check alone would let any budget admin attach a
 * proposal to a grant in a granting unit they have nothing to do with.
 */
export async function linkProposal(input: { proposalId: string; budgetId: string }) {
  try {
    const session = await requireIntakeStaff();
    const budget = await prisma.budget.findUnique({
      where: { id: input.budgetId },
      select: { partnerId: true, grantPartnerId: true },
    });
    if (!budget) throw new Error("That grant does not exist.");
    if (!(await canAccessBudget(session, budget, "update"))) throw new Error("Forbidden");

    await linkProposalToBudget(session, input.proposalId, input.budgetId);
    revalidatePath(`/budget/proposals/${input.proposalId}`);
    revalidatePath(`/budget/${input.budgetId}`);
    revalidatePath("/budget/pipeline");
    return { ok: true as const };
  } catch (err) {
    return asFormError(err);
  }
}

/** Grants with no proposal behind them, for the link picker. */
export async function unlinkedGrants() {
  await requireIntakeStaff();
  const budgets = await prisma.budget.findMany({
    where: { proposal: null, status: { notIn: ["closed"] } },
    select: {
      id: true,
      name: true,
      status: true,
      grantPartner: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return budgets.map((b) => ({
    id: b.id,
    name: b.name,
    status: b.status,
    granteeName: b.grantPartner?.name ?? null,
  }));
}

/** Registry organisations, for the match picker. */
export async function orgOptions(query: string) {
  await requireIntakeStaff();
  const q = query.trim();
  if (q.length < 2) return [];
  return prisma.org.findMany({
    // Archived orgs are excluded: matching a proposal to one would attach the
    // new work to an organisation the registry has retired.
    where: { kind: "partner", archivedAt: null, name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
    take: 20,
  });
}

/** Staff who can carry a proposal, for the assignee picker. */
export async function assigneeOptions() {
  await requireIntakeStaff();
  return prisma.user.findMany({
    where: { role: { in: ["super_admin", "budget_admin"] } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
    take: 100,
  });
}

// ── Calls for proposals ──────────────────────────────────────────────────────

export async function saveWindow(input: {
  id?: string;
  name: string;
  slug: string;
  grantingUnitId?: string | null;
  opensOn?: string | null;
  closesOn?: string | null;
  brief?: string | null;
  ceilingAmount?: number | null;
  questions?: unknown;
}) {
  try {
    const session = await requireIntakeStaff();
    const window = await saveFundingWindow(session, input);
    revalidatePath("/budget/windows");
    revalidatePath(`/budget/windows/${window.id}`);
    return { ok: true as const, windowId: window.id, slug: window.slug };
  } catch (err) {
    return asFormError(err);
  }
}

export async function setWindow(input: {
  windowId: string;
  to: FundingWindowStatus;
  closesOn?: string | null;
}) {
  try {
    const session = await requireIntakeStaff();
    const result = await setWindowStatus(session, input.windowId, input.to, {
      closesOn: input.closesOn,
    });
    revalidatePath("/budget/windows");
    revalidatePath(`/budget/windows/${input.windowId}`);
    return { ok: true as const, status: result.status };
  } catch (err) {
    return asFormError(err);
  }
}

export async function saveScoringSheet(input: {
  id?: string;
  windowId?: string | null;
  name: string;
  criteria: unknown;
}) {
  try {
    const session = await requireIntakeStaff();
    const rubric = await saveRubric(session, input);
    if (input.windowId) revalidatePath(`/budget/windows/${input.windowId}`);
    revalidatePath("/budget/windows");
    return { ok: true as const, rubricId: rubric.id, version: rubric.version };
  } catch (err) {
    return asFormError(err);
  }
}

export async function grantingUnitOptions() {
  await requireIntakeStaff();
  return prisma.grantingUnit.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
