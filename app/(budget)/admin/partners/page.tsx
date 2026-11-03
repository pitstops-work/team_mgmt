import { auth } from "@/lib/auth";
import { isBudgetAdminOrSuperAdmin } from "@/lib/roleGuard";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import PartnersClient from "./PartnersClient";
import { listGrantingUnits } from "@/lib/budget/grantingUnits";
import { listPartners } from "@/lib/partners/registry";

/**
 * Grant partners admin.
 *
 * A row here is a *grant relationship* — one registry partner, one granting
 * unit — not a partner identity. The identity lives in the shared registry
 * (Org kind="partner"), which due diligence and the review portal read from the
 * same place, so adding a partner here is adding it everywhere.
 *
 * `registry` is the full partner list, so the Add control can offer the
 * partners that exist but hold no relationship with the chosen unit yet
 * instead of inviting someone to retype a name that already exists.
 */
export default async function PartnersAdminPage() {
  const session = await auth();
  if (!session?.user || !isBudgetAdminOrSuperAdmin(session)) redirect("/budget");

  const [partners, candidates, units, registry] = await Promise.all([
    prisma.grantPartner.findMany({
      orderBy: [{ city: "asc" }, { name: "asc" }],
      select: {
        id: true, city: true, isActive: true, orgId: true,
        org: { select: { name: true, slug: true } },
        logins: { select: { userId: true, user: { select: { email: true, name: true } } }, orderBy: { createdAt: "asc" } },
        _count: { select: { budgets: true } },
      },
    }),
    // Partner-role accounts not yet linked to any grantee — offered as suggestions.
    prisma.user.findMany({
      where: { role: "partner", granteeLogin: { is: null } },
      select: { email: true, name: true },
      orderBy: { email: "asc" },
    }),
    listGrantingUnits(),
    listPartners(),
  ]);

  return (
    <PartnersClient
      partners={partners.map((p) => ({
        id: p.id,
        orgId: p.orgId,
        // Display name comes from the registry, so this page can never
        // disagree with the map, the wiki or the review portal about it.
        name: p.org.name,
        slug: p.org.slug,
        city: p.city,
        isActive: p.isActive,
        budgetCount: p._count.budgets,
        logins: p.logins.map((l) => ({ userId: l.userId, email: l.user.email, name: l.user.name })),
      }))}
      units={units.map((u) => ({ id: u.id, name: u.name }))}
      candidates={candidates.map((c) => ({ email: c.email, name: c.name }))}
      registry={registry.map((r) => ({
        id: r.id,
        name: r.name,
        cities: r.grants.map((g) => g.city),
      }))}
    />
  );
}
