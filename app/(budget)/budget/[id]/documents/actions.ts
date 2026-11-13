"use server";

/**
 * Document actions that are not the upload.
 *
 * The upload itself is `/api/grants/documents/upload`, because a server action
 * cannot stream a 25 MB multipart body the way a route handler can.
 */

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { canAccessBudget } from "@/lib/budget/budgetAccess";
import { deleteDocument } from "@/lib/budget/documents";

/**
 * Same two-step gate as the agreement actions: the ROLE first and explicitly,
 * then record access. `canAccessBudget`'s `own` rule is what a grantee login
 * resolves to on their own grant, so it cannot be the only check on an action
 * that destroys a file.
 */
async function requireGrantReviewer(budgetId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  if (!(isSuperAdmin(session) || isBudgetAdmin(session))) throw new Error("Forbidden");
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    select: { partnerId: true, grantPartnerId: true },
  });
  if (!budget) throw new Error("Not found");
  if (!(await canAccessBudget(session, budget, "update"))) throw new Error("Forbidden");
  return session;
}

export async function removeGrantDocument(input: {
  budgetId: string;
  documentId: string;
  reason: string;
}) {
  try {
    const session = await requireGrantReviewer(input.budgetId);
    await deleteDocument(session, input.documentId, input.reason);
    revalidatePath(`/budget/${input.budgetId}/documents`);
    revalidatePath(`/budget/${input.budgetId}`);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}
