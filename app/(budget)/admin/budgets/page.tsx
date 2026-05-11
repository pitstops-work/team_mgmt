import { auth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roleGuard";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import BudgetApprovalsClient from "./BudgetApprovalsClient";

export default async function AdminBudgetsPage() {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session)) redirect("/portal");

  const budgets = await prisma.budget.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      partner: { select: { name: true, email: true } },
      reportConfig: true,
      reportSlots: { select: { id: true, status: true, periodFrom: true, periodTo: true, dueDate: true, slotNumber: true, grantYear: true } },
    },
  });

  const serialized = JSON.parse(JSON.stringify(budgets));
  return <BudgetApprovalsClient budgets={serialized} />;
}
