// Access model for external grantee "partner" logins. A partner is a User with
// role "partner" linked (via GrantPartner.userId) to exactly one grantee org.
// They may read + report on budgets whose grantPartnerId matches that org.

import prisma from "@/lib/prisma";

type SessionLike = { user?: { id?: string; role?: string } } | null;

export type PartnerAccess = {
  userId: string | null;
  isPartner: boolean;
  grantPartnerId: string | null;
};

export async function getPartnerAccess(session: SessionLike): Promise<PartnerAccess> {
  const userId = session?.user?.id ?? null;
  const isPartner = session?.user?.role === "partner";
  if (!userId || !isPartner) return { userId, isPartner: false, grantPartnerId: null };
  const gp = await prisma.grantPartner.findUnique({ where: { userId }, select: { id: true } });
  return { userId, isPartner: true, grantPartnerId: gp?.id ?? null };
}

/** True only for a partner whose linked grantee owns this budget. */
export function partnerCanAccessBudget(
  access: PartnerAccess,
  budget: { grantPartnerId: string | null },
): boolean {
  return access.isPartner && !!access.grantPartnerId && budget.grantPartnerId === access.grantPartnerId;
}
