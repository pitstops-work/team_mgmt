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
      deliveryPartners: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!budget || budget.partnerId !== session!.user!.id!) notFound();

  // Load domain labels for this city so BudgetEditor can display them
  const domainConfigs = await prisma.budgetDomainConfig.findMany({
    where: { city: budget.city },
    select: { key: true, label: true },
  });
  const domainLabels = Object.fromEntries(domainConfigs.map(d => [d.key, d.label]));

  // Grantee orgs in this budget's city, for the assign-partner control.
  const grantPartners = await prisma.grantPartner.findMany({
    where: { city: budget.city, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const serialized = JSON.parse(JSON.stringify(budget));
  return <BudgetEditor budget={{ ...serialized, domainLabels, grantPartners }} />;
}
