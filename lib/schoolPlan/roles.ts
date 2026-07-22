// After-School Centres portal role vocab. Roles are programme-specific and
// per-plan-scoped, which the global RBAC (OWN/TEAM/ALL scopes) doesn't model.
// Membership rows live in SchoolPlanMember { userId, role, planId? } — planId
// null means "all plans for this role".

export type SchoolPlanScope = "central" | "plan" | "viewer";

export type SchoolPlanRoleDefn = {
  key: string;
  label: string;
  scope: SchoolPlanScope;
  /** Sensitive-field visibility (Phase 2). Anchor partners see only their plan's
   *  non-sensitive fields; salaries and vendor quotes stay masked. */
  seesSensitive: boolean;
};

export const SCHOOL_PLAN_ROLES: SchoolPlanRoleDefn[] = [
  { key: "central_lead",   label: "Central Lead",            scope: "central", seesSensitive: true  },
  { key: "city_lead",      label: "City Lead",               scope: "central", seesSensitive: true  },
  { key: "school_owner",   label: "School Owner",            scope: "plan",    seesSensitive: true  },
  { key: "anchor_partner", label: "Anchor Partner",          scope: "plan",    seesSensitive: false },
  { key: "viewer",         label: "Viewer (read-only)",      scope: "viewer",  seesSensitive: false },
];

export const SCHOOL_PLAN_ROLE_BY_KEY: Record<string, SchoolPlanRoleDefn> =
  Object.fromEntries(SCHOOL_PLAN_ROLES.map((r) => [r.key, r]));

export function schoolPlanRoleLabel(key: string): string {
  return SCHOOL_PLAN_ROLE_BY_KEY[key]?.label ?? key;
}

export function isCentralSchoolPlanRole(key: string): boolean {
  return SCHOOL_PLAN_ROLE_BY_KEY[key]?.scope === "central";
}

export function isPlanScopedRole(key: string): boolean {
  return SCHOOL_PLAN_ROLE_BY_KEY[key]?.scope === "plan";
}
