/**
 * Who is asking, for document access.
 *
 * Separate from the routes because both the upload route and the file route
 * need exactly the same answer, and a second copy of "which grants is this
 * grantee attached to" is a second thing to get wrong.
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { getPartnerAccess } from "./partnerAccess";

export type DocumentViewer = {
  userId: string;
  isInternal: boolean;
  /** Budgets a grantee login is attached to. Empty for internal callers. */
  grantBudgetIds: string[];
};

export async function documentViewer(): Promise<DocumentViewer | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const isInternal = isSuperAdmin(session) || isBudgetAdmin(session);
  if (isInternal) return { userId, isInternal: true, grantBudgetIds: [] };

  const access = await getPartnerAccess(session);
  const budgets = access.grantPartnerIds.length
    ? await prisma.budget.findMany({
        where: { grantPartnerId: { in: access.grantPartnerIds } },
        select: { id: true },
      })
    : [];

  // A budget's creator is not a grantee but is not internal either — they keep
  // access to their own grant's documents, matching canAccessBudget's creator
  // path, which exists because people who pre-date RBAC still own their work.
  const own = await prisma.budget.findMany({
    where: { partnerId: userId },
    select: { id: true },
  });

  return {
    userId,
    isInternal: false,
    grantBudgetIds: [...new Set([...budgets, ...own].map((b) => b.id))],
  };
}
