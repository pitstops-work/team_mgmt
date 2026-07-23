import prisma from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roleGuard";
import { SCHOOL_PLAN_ROLE_BY_KEY, isCentralSchoolPlanRole, isPlanScopedRole } from "./roles";

type SessionLike = {
  user?: { id?: string | null; role?: string; email?: string | null };
} | null;

export type SchoolPlanAccess = {
  userId: string | null;
  isSuperAdmin: boolean;
  isMember: boolean;
  memberships: { role: string; planId: string | null }[];
  /** Has a central role or super-admin → sees/edits all plans. */
  isCentral: boolean;
  /** Plan ids this user is scoped to (plan-scoped roles). Empty when isCentral. */
  planIds: string[];
  /** May open the portal at all. */
  canAccess: boolean;
  /** Has some edit right (central, super-admin, or any plan-scoped role). Viewer = false. */
  canEdit: boolean;
  /** May add plans, edit standard-cost registry, manage members. Central-only. */
  canManageStructure: boolean;
  /** Sees sensitive fields (salaries, vendor quotes, budget, phones). False for
   *  anchor_partner + viewer roles when they're the only role held. */
  seesSensitive: boolean;
};

export async function getSchoolPlanAccess(session: SessionLike): Promise<SchoolPlanAccess> {
  const userId = session?.user?.id ?? null;
  const superAdmin = isSuperAdmin(session);
  const memberships = userId
    ? await prisma.schoolPlanMember.findMany({
        where: { userId },
        select: { role: true, planId: true },
      })
    : [];
  const isMember = memberships.length > 0;
  const isCentral = superAdmin || memberships.some((m) => isCentralSchoolPlanRole(m.role));
  const planIds = isCentral
    ? []
    : [...new Set(memberships.filter((m) => m.planId).map((m) => m.planId!))];
  const anyPlanScoped = memberships.some((m) => isPlanScopedRole(m.role));
  // Sensitive-field visibility: true if super-admin OR any held role has
  // seesSensitive=true. A user who is ONLY anchor_partner + viewer sees masked.
  const seesSensitive = superAdmin
    || memberships.some((m) => SCHOOL_PLAN_ROLE_BY_KEY[m.role]?.seesSensitive === true);
  return {
    userId,
    isSuperAdmin: superAdmin,
    isMember,
    memberships,
    isCentral,
    planIds,
    canAccess: superAdmin || isMember,
    canEdit: isCentral || anyPlanScoped,
    canManageStructure: superAdmin || memberships.some((m) => m.role === "central_lead"),
    seesSensitive,
  };
}

/** Does this user hold `role` covering `planId`? A membership with `planId=null`
 *  (central grant for that role) matches every plan; otherwise the planIds must
 *  match. Used by Path C role-based ownership: /my and step tracker check this
 *  to decide who inherits work tagged `ownerRole=<role>` on a given plan. */
export function holdsRoleForPlan(a: SchoolPlanAccess, role: string, planId: string): boolean {
  if (a.isSuperAdmin) return true;
  return a.memberships.some(
    (m) => m.role === role && (m.planId === null || m.planId === planId),
  );
}

/** Can this user edit fields on a specific plan? */
export function canEditPlan(a: SchoolPlanAccess, planId: string): boolean {
  if (a.isSuperAdmin || a.isCentral) return true;
  return a.planIds.includes(planId);
}

/** Can this user view a specific plan at all? */
export function canViewPlan(a: SchoolPlanAccess, planId: string): boolean {
  if (a.isSuperAdmin || a.isCentral) return true;
  // Viewer with a planId scope sees just that plan; global viewer sees all.
  const isGlobalViewer = a.memberships.some((m) => m.role === "viewer" && m.planId === null);
  if (isGlobalViewer) return true;
  return a.planIds.includes(planId) ||
    a.memberships.some((m) => m.role === "viewer" && m.planId === planId);
}
