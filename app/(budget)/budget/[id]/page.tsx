import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import BudgetEditor from "./BudgetEditor";

export default async function BudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  const budget = await prisma.budget.findUnique({
    where: { id },
    include: {
      inputs: true,
      lines: { orderBy: { position: "asc" } },
    },
  });

  if (!budget || budget.partnerId !== session!.user!.id!) notFound();

  return <BudgetEditor budget={JSON.parse(JSON.stringify(budget))} />;
}
