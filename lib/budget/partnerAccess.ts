// Access model for external grantee "partner" logins.
//
// A partner is a User with role "partner" linked (via GrantPartnerUser) to
// exactly one grantee *organisation*. They may read + report on budgets whose
// grantPartnerId is one of that org's grant relationships. An org can hold
// several logins; a login belongs to one org.
//
// The link used to be to a single GrantPartner row, which silently capped a
// grantee at one granting unit: an org funded from both Bangalore and Chennai
// has two grant relationships, the login could point at only one, and the
// budgets under the other were invisible to the grantee who had to report on
// them. Resolving to the org and collecting its relationships fixes that.

import prisma from "@/lib/prisma";

type SessionLike = { user?: { id?: string; role?: string } } | null;

export type PartnerAccess = {
  userId: string | null;
  isPartner: boolean;
  /** Org.id — the grantee's identity in the registry. */
  orgId: string | null;
  /** Every GrantPartner.id this grantee holds, across granting units. */
  grantPartnerIds: string[];
  /**
   * First relationship, for the callers that only ever needed one. Prefer
   * `grantPartnerIds`; this exists so a single-unit grantee reads naturally.
   */
  grantPartnerId: string | null;
};

const EMPTY: Omit<PartnerAccess, "userId"> = {
  isPartner: false,
  orgId: null,
  grantPartnerIds: [],
  grantPartnerId: null,
};

export async function getPartnerAccess(session: SessionLike): Promise<PartnerAccess> {
  const userId = session?.user?.id ?? null;
  const isPartner = session?.user?.role === "partner";
  if (!userId || !isPartner) return { userId, ...EMPTY };

  const link = await prisma.grantPartnerUser.findUnique({
    where: { userId },
    select: { orgId: true, org: { select: { grantRelationships: { select: { id: true } } } } },
  });
  if (!link) return { userId, ...EMPTY, isPartner: true };

  const grantPartnerIds = link.org.grantRelationships.map((g) => g.id);
  return {
    userId,
    isPartner: true,
    orgId: link.orgId,
    grantPartnerIds,
    grantPartnerId: grantPartnerIds[0] ?? null,
  };
}

/** True only for a partner whose linked grantee owns this budget. */
export function partnerCanAccessBudget(
  access: PartnerAccess,
  budget: { grantPartnerId: string | null },
): boolean {
  return (
    access.isPartner &&
    !!budget.grantPartnerId &&
    access.grantPartnerIds.includes(budget.grantPartnerId)
  );
}
