// Seeding role vocabulary. Roles are programme-specific and geo-scoped, which
// the global RBAC (OWN/TEAM/ALL scopes) doesn't model — so seeding uses its own
// thin membership layer (SeedingMember { userId, role, geo? }).

export type SeedingScope = "central" | "geo" | "viewer";

export type SeedingRoleDefn = {
  key: string;
  label: string;
  scope: SeedingScope;
  /** Substrings that map a checklist task's free-text ownerRole to this role,
   *  used to build each member's "My tasks" slice. */
  ownerMatches: string[];
};

export const SEEDING_ROLES: SeedingRoleDefn[] = [
  { key: "central_lead",     label: "Central Programme Lead", scope: "central", ownerMatches: ["asavari", "vishnu", "central programme lead"] },
  { key: "central_team",     label: "Central Team",           scope: "central", ownerMatches: ["central"] },
  { key: "portal_mis",       label: "Portal / MIS Owner",     scope: "central", ownerMatches: ["portal", "mis"] },
  { key: "people_fn",        label: "People Function",        scope: "central", ownerMatches: ["people"] },
  { key: "theme_team",       label: "Theme Team",             scope: "central", ownerMatches: ["theme"] },
  { key: "geo_lead",         label: "Geo Lead",               scope: "geo",     ownerMatches: ["geo lead"] },
  { key: "geo_poc",          label: "Geo POC",                scope: "geo",     ownerMatches: ["geo poc"] },
  { key: "coordinator",      label: "Coordinator",            scope: "geo",     ownerMatches: ["coordinator"] },
  { key: "outreach_support", label: "Outreach Support",       scope: "geo",     ownerMatches: ["outreach"] },
  { key: "viewer",           label: "Viewer (read-only)",     scope: "viewer",  ownerMatches: [] },
];

export const SEEDING_ROLE_BY_KEY: Record<string, SeedingRoleDefn> =
  Object.fromEntries(SEEDING_ROLES.map((r) => [r.key, r]));

export function seedingRoleLabel(key: string): string {
  return SEEDING_ROLE_BY_KEY[key]?.label ?? key;
}

export function isCentralRole(key: string): boolean {
  return SEEDING_ROLE_BY_KEY[key]?.scope === "central";
}

export function isGeoRole(key: string): boolean {
  return SEEDING_ROLE_BY_KEY[key]?.scope === "geo";
}

/** True if a checklist owner label belongs to a geo-scoped role (Geo POC,
 *  Coordinator, …) — used to decide which tasks a geo member may edit. */
export function ownerIsGeoScoped(ownerRole: string | null | undefined): boolean {
  if (!ownerRole) return false;
  const o = ownerRole.toLowerCase();
  return SEEDING_ROLES.filter((r) => r.scope === "geo").some((r) =>
    r.ownerMatches.some((m) => o.includes(m)),
  );
}

/** Does a task's owner label match the given member role? (for "My tasks") */
export function ownerMatchesRole(ownerRole: string | null | undefined, roleKey: string): boolean {
  if (!ownerRole) return false;
  const o = ownerRole.toLowerCase();
  const def = SEEDING_ROLE_BY_KEY[roleKey];
  return !!def && def.ownerMatches.some((m) => o.includes(m));
}
