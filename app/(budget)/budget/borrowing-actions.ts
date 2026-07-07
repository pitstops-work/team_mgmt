"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isBudgetAdminOrSuperAdmin } from "@/lib/roleGuard";
import { revalidatePath } from "next/cache";
import { borrowingStatus } from "@/lib/budget/grantAggregation";

async function requireBudgetAdmin() {
  const session = await auth();
  if (!session?.user?.id || !isBudgetAdminOrSuperAdmin(session)) throw new Error("Not authorised");
  return session.user.id;
}

/** Recompute + persist a borrowing's status from its repayment total. */
async function refreshStatus(borrowingId: string) {
  const b = await prisma.grantBorrowing.findUnique({
    where: { id: borrowingId },
    select: { amount: true, repayments: { select: { amount: true } } },
  });
  if (!b) return;
  const repaid = b.repayments.reduce((s, r) => s + r.amount, 0);
  await prisma.grantBorrowing.update({
    where: { id: borrowingId },
    data: { status: borrowingStatus(b.amount, repaid) },
  });
}

export async function createBorrowing(input: {
  fromBudgetId: string;
  toBudgetId: string;
  amount: number;
  borrowedOn: string; // yyyy-mm-dd
  reason?: string;
}) {
  const uid = await requireBudgetAdmin();
  if (input.fromBudgetId === input.toBudgetId) throw new Error("Lender and borrower grants must differ");
  if (!(input.amount > 0)) throw new Error("Amount must be positive");
  await prisma.grantBorrowing.create({
    data: {
      fromBudgetId: input.fromBudgetId,
      toBudgetId: input.toBudgetId,
      amount: input.amount,
      borrowedOn: new Date(input.borrowedOn),
      reason: input.reason?.trim() || null,
      createdById: uid,
    },
  });
  revalidatePath("/budget/borrowings");
  revalidatePath("/budget/dashboard");
}

export async function addRepayment(input: {
  borrowingId: string;
  amount: number;
  repaidOn: string;
  note?: string;
}) {
  await requireBudgetAdmin();
  if (!(input.amount > 0)) throw new Error("Amount must be positive");
  await prisma.grantBorrowingRepayment.create({
    data: {
      borrowingId: input.borrowingId,
      amount: input.amount,
      repaidOn: new Date(input.repaidOn),
      note: input.note?.trim() || null,
    },
  });
  await refreshStatus(input.borrowingId);
  revalidatePath("/budget/borrowings");
  revalidatePath("/budget/dashboard");
}

export async function deleteBorrowing(id: string) {
  await requireBudgetAdmin();
  await prisma.grantBorrowing.delete({ where: { id } });
  revalidatePath("/budget/borrowings");
  revalidatePath("/budget/dashboard");
}
