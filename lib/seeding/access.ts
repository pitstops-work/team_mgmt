import prisma from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roleGuard";
import { isCentralRole, isGeoRole, ownerIsGeoScoped } from "./roles";

type SessionLike = {
  user?: { id?: string | null; role?: string; email?: string | null };
} | null;

export type SeedingAccess = {
  userId: string | null;
  isSuperAdmin: boolean;
  isMember: boolean;
  memberships: { role: string; geoId: string | null }[];
  /** Has a central role or is super-admin → sees/edits all geos. */
  isCentral: boolean;
  /** Geo ids this user is scoped to (geo roles). */
  geoIds: string[];
  /** May open the portal at all. */
  canAccess: boolean;
  /** Has some edit right (central, super-admin, or any geo role). Viewer = false. */
  canEdit: boolean;
  /** May add/delete workstreams & phases and manage members. */
  canManageStructure: boolean;
};

export async function getSeedingAccess(session: SessionLike): Promise<SeedingAccess> {
  const userId = session?.user?.id ?? null;
  const superAdmin = isSuperAdmin(session);
  const memberships = userId
    ? await prisma.seedingMember.findMany({ where: { userId }, select: { role: true, geoId: true } })
    : [];
  const isMember = memberships.length > 0;
  const isCentral = superAdmin || memberships.some((m) => isCentralRole(m.role));
  const geoIds = [...new Set(memberships.filter((m) => m.geoId).map((m) => m.geoId!))];
  const hasCentralLead = superAdmin || memberships.some((m) => m.role === "central_lead");
  const anyGeoRole = memberships.some((m) => isGeoRole(m.role));
  return {
    userId,
    isSuperAdmin: superAdmin,
    isMember,
    memberships,
    isCentral,
    geoIds,
    canAccess: superAdmin || isMember,
    canEdit: isCentral || anyGeoRole,
    canManageStructure: hasCentralLead,
  };
}

/** Central/super-admin edit anything; geo members edit geo-scoped tasks. */
export function canEditTask(a: SeedingAccess, task: { ownerRole: string | null }): boolean {
  if (a.isSuperAdmin || a.isCentral) return true;
  const isGeoMember = a.memberships.some((m) => isGeoRole(m.role));
  return isGeoMember && ownerIsGeoScoped(task.ownerRole);
}

/** Central/super-admin edit any geo's funnel; geo members edit their geo only. */
export function canEditFunnelGeo(a: SeedingAccess, geoId: string): boolean {
  if (a.isSuperAdmin || a.isCentral) return true;
  return a.geoIds.includes(geoId);
}
