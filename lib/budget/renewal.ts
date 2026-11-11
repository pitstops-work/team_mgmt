/**
 * Renewal lineage.
 *
 * Renewal is the normal shape of grant-making in a portfolio built over years,
 * and modelling every grant as a first grant loses exactly the history that
 * makes an appraisal quick: how many times have we funded them, what happened
 * last time, is this the same work continuing or something new.
 *
 * Distinct from `GrantClosure.adjustedIntoBudgetId`, which carries MONEY
 * forward when a closing grant has a balance. This carries the RELATIONSHIP
 * forward, and the two need not agree — a renewal usually starts before the
 * previous grant closes, and a balance is sometimes carried into a different
 * grant entirely.
 */

import prisma from "@/lib/prisma";
import type { GrantContinuity } from "@/app/generated/prisma/client";
import { moneyToString } from "./money";
import { logGrant } from "./audit";

type SessionLike = { user?: { id?: string | null } | null } | null;

/**
 * Record that one grant continues another.
 *
 * Refuses to link grants for different partners, and refuses a cycle. Both are
 * cheap to check and expensive to discover later: a mis-linked chain makes the
 * sequence number wrong for every grant after it.
 */
export async function linkRenewal(
  session: SessionLike,
  budgetId: string,
  renewsBudgetId: string,
  continuity?: GrantContinuity,
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");
  if (budgetId === renewsBudgetId) throw new Error("A grant cannot renew itself.");

  const [budget, prior, alreadyRenewed] = await Promise.all([
    prisma.budget.findUnique({
      where: { id: budgetId },
      select: { id: true, grantPartnerId: true, renewsBudgetId: true },
    }),
    prisma.budget.findUnique({
      where: { id: renewsBudgetId },
      select: { id: true, grantPartnerId: true, name: true },
    }),
    prisma.budget.findUnique({
      where: { renewsBudgetId },
      select: { id: true },
    }),
  ]);

  if (!budget || !prior) throw new Error("Not found");
  if (budget.renewsBudgetId) throw new Error("This grant already continues another.");
  if (alreadyRenewed && alreadyRenewed.id !== budgetId) {
    throw new Error("That grant has already been renewed by a different grant.");
  }
  if (
    budget.grantPartnerId &&
    prior.grantPartnerId &&
    budget.grantPartnerId !== prior.grantPartnerId
  ) {
    throw new Error("These two grants are for different partners.");
  }

  // Walk the existing chain to be sure this does not close a loop. Chains are
  // short, so an iterative walk is cheaper and clearer than a recursive query.
  let cursor: string | null = renewsBudgetId;
  const seen = new Set<string>([budgetId]);
  while (cursor) {
    if (seen.has(cursor)) throw new Error("That would make a loop in the renewal chain.");
    seen.add(cursor);
    const next: { renewsBudgetId: string | null } | null = await prisma.budget.findUnique({
      where: { id: cursor },
      select: { renewsBudgetId: true },
    });
    cursor = next?.renewsBudgetId ?? null;
  }

  await prisma.budget.update({
    where: { id: budgetId },
    data: { renewsBudgetId, continuity: continuity ?? undefined },
  });

  logGrant("Budget", budgetId, userId, "renewal_linked", {
    field: continuity ?? "continues",
    to: renewsBudgetId,
  });
}

/**
 * The whole chain for a grant, oldest first, with this grant's position in it.
 *
 * `sequence` is derived rather than stored: a stored counter goes wrong the
 * first time someone links a grant that was missed, and then stays wrong.
 */
export async function renewalChain(budgetId: string) {
  // Walk back to the first grant in the chain.
  let rootId = budgetId;
  const guard = new Set<string>();
  for (;;) {
    if (guard.has(rootId)) break;
    guard.add(rootId);
    const row: { renewsBudgetId: string | null } | null = await prisma.budget.findUnique({
      where: { id: rootId },
      select: { renewsBudgetId: true },
    });
    if (!row?.renewsBudgetId) break;
    rootId = row.renewsBudgetId;
  }

  // Then forward, collecting each grant.
  const chain: {
    id: string;
    name: string;
    continuity: GrantContinuity | null;
    status: string;
    approvedAmount: string | null;
    approvedAt: Date | null;
  }[] = [];
  let cursor: string | null = rootId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    const currentId: string = cursor;
    seen.add(currentId);
    // `currentId` rather than `cursor` inside the query: cursor is reassigned
    // from this row's own `renewedBy`, and reading it here would make its type
    // depend on itself.
    const row = await prisma.budget.findUnique({
      where: { id: currentId },
      select: {
        id: true,
        name: true,
        continuity: true,
        status: true,
        approvedAt: true,
        decisions: {
          where: { outcome: { in: ["approved", "approved_with_conditions"] } },
          select: { approvedAmount: true },
          orderBy: { decidedOn: "desc" },
          take: 1,
        },
        renewedBy: { select: { id: true } },
      },
    });
    if (!row) break;
    chain.push({
      id: row.id,
      name: row.name,
      continuity: row.continuity,
      status: row.status,
      approvedAmount: row.decisions[0] ? moneyToString(row.decisions[0].approvedAmount) : null,
      approvedAt: row.approvedAt,
    });
    cursor = row.renewedBy?.id ?? null;
  }

  const index = chain.findIndex((c) => c.id === budgetId);
  return {
    chain,
    /** 1-based: "this is their 3rd grant". 0 when the grant is not in a chain. */
    sequence: index >= 0 ? index + 1 : 0,
    isFirst: index === 0,
    priorGrant: index > 0 ? chain[index - 1] : null,
  };
}

/**
 * How many grants this partner has had, and how they went.
 *
 * Counts grants for the partner rather than walking a chain, because chains are
 * only as complete as the linking: a partner may have had five grants with none
 * of them linked, and reporting "1st grant" there would be worse than silence.
 */
export async function partnerGrantHistory(grantPartnerId: string) {
  const budgets = await prisma.budget.findMany({
    where: { grantPartnerId, status: { in: ["approved", "closed"] } },
    select: {
      id: true,
      name: true,
      approvedAt: true,
      status: true,
      continuity: true,
      renewsBudgetId: true,
      closure: { select: { status: true, unspentAmount: true, exitDecision: true } },
      assessments: {
        select: { overallRag: true, assessedOn: true },
        orderBy: { assessedOn: "desc" },
        take: 1,
      },
    },
    orderBy: { approvedAt: "asc" },
  });

  return {
    count: budgets.length,
    linkedCount: budgets.filter((b) => b.renewsBudgetId).length,
    grants: budgets.map((b) => ({
      id: b.id,
      name: b.name,
      approvedAt: b.approvedAt,
      status: b.status,
      continuity: b.continuity,
      closureStatus: b.closure?.status ?? null,
      unspent: b.closure ? moneyToString(b.closure.unspentAmount) : null,
      exitDecision: b.closure?.exitDecision ?? null,
      lastRag: b.assessments[0]?.overallRag ?? null,
    })),
  };
}
