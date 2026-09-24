// Access gate for the /field surface (P3 dogfood). While the surface is being
// validated it is OFF by default and reachable only by:
//   • anyone, when FIELD_SURFACE_ENABLED === "1" (global on), OR
//   • a user whose email is in FIELD_ALLOWLIST (comma-separated), OR
//   • an admin (so the team can preview it).
// At cut-over (P4) this relaxes to "all RPs".
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";

export type FieldSession = { userId: string; email: string | null };

export async function getFieldSession(): Promise<FieldSession | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  if (!fieldEnabledForSession(session)) return null;
  return { userId, email: session.user.email ?? null };
}

/**
 * Gate the /field backend console. Allowed for admins/super-admins (as before)
 * OR any role granted the `field.manage` permission via /settings/roles — so
 * a programme lead can manage the field backend without being a super-admin.
 * Returns userId or null.
 */
export async function requireFieldAdmin(): Promise<string | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  if (isAdminUser(session)) return userId;
  const { buildRbacContext, can } = await import("@/lib/rbac");
  const ctx = await buildRbacContext(session);
  if (ctx && (await can(ctx, "field", "manage"))) return userId;
  return null;
}

/** Whether this session may see /field (env global, admin, or allowlist). Safe to call in the layout. */
export function fieldEnabledForSession(session: Awaited<ReturnType<typeof auth>>): boolean {
  if (process.env.FIELD_SURFACE_ENABLED === "1") return true;
  if (session && isAdminUser(session)) return true;
  const email = session?.user?.email?.toLowerCase();
  const allow = (process.env.FIELD_ALLOWLIST ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && allow.includes(email);
}

/**
 * Verify the user may act on this goal from /field: it must be one of their
 * interventions (owned, or in a cluster they work in) and in an active field domain.
 * Returns the goal id if allowed, else null.
 */
export async function assertFieldGoalAccess(userId: string, goalId: string): Promise<string | null> {
  const { getUserClusters, goalInClusterFilter } = await import("@/lib/operations/clusters");
  const { goalOwnedByAnyOf } = await import("@/lib/ownership");
  const domains = await activeFieldDomains();
  if (domains.size === 0) return null;
  const clusters = await getUserClusters([userId]);
  const goal = await prisma.goal.findFirst({
    where: {
      id: goalId,
      deletedAt: null,
      needsDomain: { in: [...domains.keys()] },
      OR: [goalOwnedByAnyOf([userId]), ...clusters.map((c) => goalInClusterFilter(c.id))],
    },
    select: { id: true },
  });
  return goal?.id ?? null;
}

/** Domains that have been onboarded onto /field (have a FieldDomainConfig row). */
export async function activeFieldDomains(): Promise<Map<string, { label: string; unit: string; cadenceCount: number | null; cadencePeriod: string | null; overallSlaDays: number | null }>> {
  const rows = await prisma.fieldDomainConfig.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  return new Map(rows.map((r) => [r.domain, { label: r.label, unit: r.unit, cadenceCount: r.cadenceCount, cadencePeriod: r.cadencePeriod, overallSlaDays: r.overallSlaDays }]));
}

/**
 * Who may edit the caregiver-practice catalog.
 *
 * The catalog is shared: /settings/caregiver-practices and /field/backend/caregiver
 * are two views of the same tables. But the /field page is gated on
 * `requireFieldAdmin` while its writes go to /api/admin/caregiver-practices*,
 * which checked `isAdminUser` only — so a `field.manage` holder could open the
 * editor, see everything, and have every save fail with a bare 403.
 *
 * Accepts admins, `field.manage` holders (they own the field backend), and
 * anyone granted `caregiver_practice.update` directly.
 */
export async function requireCaregiverCatalogWrite(): Promise<string | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  if (isAdminUser(session)) return userId;
  const { buildRbacContext, can } = await import("@/lib/rbac");
  const ctx = await buildRbacContext(session);
  if (!ctx) return null;
  if (await can(ctx, "field", "manage")) return userId;
  if (await can(ctx, "caregiver_practice", "update")) return userId;
  return null;
}

/**
 * Who may see the /field manager views.
 *
 * Deliberately NOT a new RBAC permission. A `field.oversee` grant would mean a
 * prod grant migration (see scripts/add-field-manage-grant.ts for the pattern)
 * for a surface that is still behind FIELD_SURFACE_ENABLED and has no users
 * yet. Composed from what already exists instead:
 *
 *   - the /field gate itself, and
 *   - being a supervisor — the same predicate /operations/oversight/dashboard
 *     uses (anyone whose visibility set reaches past themselves), or holding
 *     field.manage, since a programme lead running the backend should be able
 *     to read the dashboard for it.
 *
 * Returns the ids whose clusters are in scope: a ZL sees their reports', a
 * Leader sees everything below them. getUserClusters already takes a list, so
 * widening from the RP's self-scope is free.
 */
export async function getFieldOversightScope(): Promise<{ userId: string; visibleIds: string[] } | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  if (!fieldEnabledForSession(session)) return null;

  const { buildRbacContext, can } = await import("@/lib/rbac");
  const ctx = await buildRbacContext(session);
  if (!ctx) return null;

  const { getVisibleUserIds } = await import("@/lib/visibilityScope");
  const visibleIds = await getVisibleUserIds(ctx);
  const isAdmin = isAdminUser(session);
  const isSupervisor = visibleIds.length > 1 || isAdmin;
  if (!isSupervisor && !(await can(ctx, "field", "manage"))) return null;

  return { userId, visibleIds: visibleIds.length ? visibleIds : [userId] };
}


/**
 * The /field domains a user is scoped to, or null for "no restriction".
 *
 * /field is cluster-scoped by design — an RP sees all the work in their patch,
 * so a colleague can cover. But the team is not made of cluster generalists:
 * most people run several domains across several clusters, and two are pure
 * domain specialists spanning five clusters each. Assigning a creche RP their
 * five clusters handed them the welfare and toilet work in them too.
 *
 * An empty set means unrestricted, so this changes nothing for anyone until a
 * domain is deliberately assigned.
 */
export async function getRpDomainScope(userId: string): Promise<string[] | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { rpFieldDomains: { where: { isActive: true }, select: { domain: true } } },
  });
  const domains = u?.rpFieldDomains.map((d) => d.domain) ?? [];
  return domains.length ? domains : null;
}
