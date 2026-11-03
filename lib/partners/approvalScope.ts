/**
 * Which budgets may be attached to an approval.
 *
 * An approval assembly is about one organisation (`assessment_assemblies.org_id`
 * → the review DB's mirror row → a registry partner). A budget belongs to one
 * grantee too (`Budget.grantPartnerId` → a grant relationship → the same
 * registry partner). Nothing connected the two: the picker offered every budget
 * the reviewer had created, so an approval for one grantee could be confirmed
 * against another grantee's budget, and the resulting deviation table,
 * cost-per-beneficiary and portfolio comparables would all be about the wrong
 * organisation while looking entirely normal.
 *
 * Now the two resolve through the registry and must agree.
 */

import prisma from "@/lib/prisma";
import { partnerForReviewOrg } from "./reviewMirror";
import type { PartnerRecord } from "./registry";

export type ApprovalBudgetScope = {
  /** The partner the approval is about, or null for an unlinked legacy row. */
  partner: PartnerRecord | null;
  /**
   * GrantPartner.ids a budget may belong to. Empty with a partner present means
   * that partner holds no grant relationship yet — nothing is attachable, which
   * is the honest answer rather than offering the whole list.
   */
  grantPartnerIds: string[];
  /**
   * False when the assembly's org predates the registry and so can't be scoped.
   * Callers fall back to the old unscoped behaviour and say so in the UI
   * instead of silently refusing a reviewer mid-approval.
   */
  scoped: boolean;
};

export async function approvalBudgetScope(reviewOrgId: string): Promise<ApprovalBudgetScope> {
  const partner = await partnerForReviewOrg(reviewOrgId);
  if (!partner) return { partner: null, grantPartnerIds: [], scoped: false };
  return { partner, grantPartnerIds: partner.grants.map((g) => g.id), scoped: true };
}

/**
 * Refuse a budget that belongs to a different grantee. Returns an error
 * message, or null when the pairing is allowed.
 *
 * An unscoped assembly, or a budget with no grantee assigned at all (51 of 82
 * budgets are in that state), is allowed through: both predate the registry,
 * and blocking them would wall reviewers out of their own historical work.
 * Only a budget assigned to a *different* grantee is a genuine mismatch.
 */
export async function budgetMismatchReason(
  reviewOrgId: string,
  budgetId: string,
): Promise<string | null> {
  const scope = await approvalBudgetScope(reviewOrgId);
  if (!scope.scoped) return null;

  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    select: {
      name: true,
      grantPartnerId: true,
      grantPartner: { select: { org: { select: { name: true } } } },
    },
  });
  if (!budget) return "Budget not found";
  if (!budget.grantPartnerId) return null;
  if (scope.grantPartnerIds.includes(budget.grantPartnerId)) return null;

  const owner = budget.grantPartner?.org.name ?? "another grantee";
  return `"${budget.name}" belongs to ${owner}, but this approval is for ${scope.partner!.name}. Reassign the budget's grantee, or pick a different budget.`;
}
