import { auth } from "@/lib/auth";
import { isBudgetAdminOrSuperAdmin } from "@/lib/roleGuard";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import PartnersClient from "./PartnersClient";

export default async function PartnersAdminPage() {
  const session = await auth();
  if (!session?.user || !isBudgetAdminOrSuperAdmin(session)) redirect("/budget");

  const partners = await prisma.grantPartner.findMany({
    orderBy: [{ city: "asc" }, { name: "asc" }],
    select: { id: true, name: true, city: true, isActive: true, _count: { select: { budgets: true } } },
  });

  return (
    <PartnersClient
      partners={partners.map((p) => ({ id: p.id, name: p.name, city: p.city, isActive: p.isActive, budgetCount: p._count.budgets }))}
    />
  );
}
