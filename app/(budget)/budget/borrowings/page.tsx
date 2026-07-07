import { auth } from "@/lib/auth";
import { isBudgetAdminOrSuperAdmin } from "@/lib/roleGuard";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import BorrowingsClient from "./BorrowingsClient";

export default async function BorrowingsPage() {
  const session = await auth();
  if (!session?.user || !isBudgetAdminOrSuperAdmin(session)) redirect("/budget");

  const [budgets, borrowings] = await Promise.all([
    prisma.budget.findMany({
      where: { status: "approved" },
      select: { id: true, name: true, city: true, grantPartner: { select: { name: true } } },
      orderBy: [{ city: "asc" }, { name: "asc" }],
    }),
    prisma.grantBorrowing.findMany({
      select: {
        id: true, amount: true, borrowedOn: true, reason: true, status: true,
        fromBudget: { select: { id: true, name: true } },
        toBudget: { select: { id: true, name: true } },
        repayments: { select: { id: true, amount: true, repaidOn: true, note: true }, orderBy: { repaidOn: "asc" } },
      },
      orderBy: { borrowedOn: "desc" },
    }),
  ]);

  return (
    <BorrowingsClient
      budgets={budgets.map((b) => ({ id: b.id, name: b.name, city: b.city, partner: b.grantPartner?.name ?? null }))}
      borrowings={JSON.parse(JSON.stringify(borrowings))}
    />
  );
}
