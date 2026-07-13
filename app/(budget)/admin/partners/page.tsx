import { auth } from "@/lib/auth";
import { isBudgetAdminOrSuperAdmin } from "@/lib/roleGuard";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import PartnersClient from "./PartnersClient";

export default async function PartnersAdminPage() {
  const session = await auth();
  if (!session?.user || !isBudgetAdminOrSuperAdmin(session)) redirect("/budget");

  const [partners, candidates] = await Promise.all([
    prisma.grantPartner.findMany({
      orderBy: [{ city: "asc" }, { name: "asc" }],
      select: { id: true, name: true, city: true, isActive: true, user: { select: { email: true } }, _count: { select: { budgets: true } } },
    }),
    // Partner-role accounts not yet linked to any grantee — offered as suggestions.
    prisma.user.findMany({
      where: { role: "partner", granteeLogin: { is: null } },
      select: { email: true, name: true },
      orderBy: { email: "asc" },
    }),
  ]);

  return (
    <PartnersClient
      partners={partners.map((p) => ({ id: p.id, name: p.name, city: p.city, isActive: p.isActive, budgetCount: p._count.budgets, loginEmail: p.user?.email ?? null }))}
      candidates={candidates.map((c) => ({ email: c.email, name: c.name }))}
    />
  );
}
