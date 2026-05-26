/**
 * Centralized RBAC: `can()` for booleans, `scopeWhere()` for list filters.
 *
 * Source of truth is the `Role` / `Permission` / `RolePermission` tables
 * (seeded by `scripts/seed-rbac.ts`, editable via the admin UI). The user's
 * `role` string maps 1:1 to `Role.name`.
 *
 * Per `docs/rbac-catalog.md`: designations (`RP`/`ZL`/`PM`/`Leader`/`Other`)
 * are reporting-hierarchy markers ONLY — they don't grant permissions. The
 * "team" scope rule expands to the user's recursive descendants in the
 * reportsToId tree, which produces the right scope for every designation
 * without needing per-designation permission entries.
 */

import prisma from "./prisma";

// ── Context ──────────────────────────────────────────────────────────────────

export type RbacContext = {
  userId: string;
  role: string;
  designation: string;
  cityId: string | null;
};

type SessionLike = {
  user?: { id?: string; role?: string; email?: string | null } | null;
} | null;

/**
 * Build the context once per request and reuse for multiple checks.
 * Pulls designation + cityId from the DB (not the JWT) for freshness.
 */
export async function buildRbacContext(session: SessionLike): Promise<RbacContext | null> {
  const userId = session?.user?.id;
  if (!userId) return null;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { designation: true, cityId: true, role: true },
  });
  if (!me) return null;

  // Prefer DB role over session — defends against stale JWT after role changes.
  return {
    userId,
    role: me.role ?? session?.user?.role ?? "member",
    designation: me.designation ?? "Other",
    cityId: me.cityId ?? null,
  };
}

// ── Permission lookup (cached per request) ───────────────────────────────────

type ScopeRule = { kind: string; [k: string]: unknown };

type RolePermissionsCache = Map<string, ScopeRule>; // "resource.action" → rule

// Per-process cache. invalidateRbacCache() clears it on admin edits, but that
// only reaches the one instance that served the request — other warm instances
// keep stale perms. The TTL bounds that staleness without cross-instance coord.
const ROLE_PERMS_TTL_MS = 60_000;
const ROLE_PERMS_CACHE = new Map<string, { value: Promise<RolePermissionsCache>; expires: number }>();

async function getRolePermissions(roleName: string): Promise<RolePermissionsCache> {
  const cached = ROLE_PERMS_CACHE.get(roleName);
  if (cached && cached.expires > Date.now()) return cached.value;

  const value = (async () => {
    const role = await prisma.role.findUnique({
      where: { name: roleName },
      include: { permissions: { include: { permission: true } } },
    });
    const map: RolePermissionsCache = new Map();
    if (role) {
      for (const rp of role.permissions) {
        map.set(`${rp.permission.resource}.${rp.permission.action}`, rp.scopeRule as ScopeRule);
      }
    }
    return map;
  })();
  ROLE_PERMS_CACHE.set(roleName, { value, expires: Date.now() + ROLE_PERMS_TTL_MS });
  return value;
}

/** Wipe the in-process cache. Call after seeding or admin-UI edits. */
export function invalidateRbacCache() {
  ROLE_PERMS_CACHE.clear();
}

// ── can() ────────────────────────────────────────────────────────────────────

/** Does this user's role have the (resource, action) permission, at any scope? */
export async function can(
  ctx: RbacContext | null,
  resource: string,
  action: string,
): Promise<boolean> {
  if (!ctx) return false;
  const perms = await getRolePermissions(ctx.role);
  return perms.has(`${resource}.${action}`);
}

/** Look up the scope rule for this (resource, action). Null if no permission. */
export async function getScopeRule(
  ctx: RbacContext,
  resource: string,
  action: string,
): Promise<ScopeRule | null> {
  const perms = await getRolePermissions(ctx.role);
  return perms.get(`${resource}.${action}`) ?? null;
}

// ── Team expansion (recursive descendants via reportsToId) ───────────────────

const TEAM_CACHE = new Map<string, Promise<string[]>>();

/**
 * Self + all (transitive) reports via `reportsToId`. Cached per process —
 * shouldn't change within a request. Call `invalidateRbacCache()` if a user's
 * reportsToId changes during admin operations.
 */
export async function getTeamIds(userId: string): Promise<string[]> {
  let entry = TEAM_CACHE.get(userId);
  if (!entry) {
    entry = (async () => {
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        WITH RECURSIVE descendants AS (
          SELECT id FROM "User" WHERE id = ${userId}
          UNION ALL
          SELECT u.id
          FROM "User" u
          INNER JOIN descendants d ON u."reportsToId" = d.id
        )
        SELECT id FROM descendants
      `;
      return rows.map((r) => r.id);
    })();
    TEAM_CACHE.set(userId, entry);
  }
  return entry;
}

// ── Resource-specific scope evaluators ───────────────────────────────────────
// Each entry knows how to translate a ScopeRule into a Prisma `where` fragment
// for one resource. Add a new resource here when you migrate a route to RBAC.

type ScopeArgs = {
  rule: ScopeRule;
  ctx: RbacContext;
  teamIds: string[]; // lazy-fetched outside; passed in
};

type WhereFragment = Record<string, unknown>;

const resourceScopeBuilders: Record<string, (a: ScopeArgs) => WhereFragment> = {
  goal: ({ rule, ctx, teamIds }) => {
    // Co-owners are treated like owners for visibility purposes.
    switch (rule.kind) {
      case "all":            return {};
      case "own":
        return {
          OR: [
            { ownerId: ctx.userId },
            { coOwners: { some: { userId: ctx.userId } } },
          ],
        };
      case "team":
        return {
          OR: [
            { ownerId: { in: teamIds } },
            { coOwners: { some: { userId: { in: teamIds } } } },
          ],
        };
      case "city":           return goalCityWhere(ctx.cityId);
      case "team_and_city":
        return {
          AND: [
            {
              OR: [
                { ownerId: { in: teamIds } },
                { coOwners: { some: { userId: { in: teamIds } } } },
              ],
            },
            goalCityWhere(ctx.cityId),
          ],
        };
      case "own_or_followed":
        return {
          OR: [
            { ownerId: ctx.userId },
            { coOwners: { some: { userId: ctx.userId } } },
            { followers: { some: { userId: ctx.userId } } },
          ],
        };
      default: throw scopeUnsupported("goal", rule.kind);
    }
  },
  pitstop: ({ rule, ctx, teamIds }) => {
    // Co-owners are treated like owners for visibility purposes.
    switch (rule.kind) {
      case "all":  return {};
      case "own":
        return {
          OR: [
            { ownerId: ctx.userId },
            { coOwners: { some: { userId: ctx.userId } } },
          ],
        };
      case "team":
        return {
          OR: [
            { ownerId: { in: teamIds } },
            { coOwners: { some: { userId: { in: teamIds } } } },
          ],
        };
      default: throw scopeUnsupported("pitstop", rule.kind);
    }
  },
  pitstop_event: ({ rule, ctx, teamIds }) => {
    switch (rule.kind) {
      case "all":  return {};
      case "own":  return { createdById: ctx.userId };
      case "self": return { attendees: { some: { userId: ctx.userId } } };
      case "team":
        return { attendees: { some: { userId: { in: teamIds } } } };
      default: throw scopeUnsupported("pitstop_event", rule.kind);
    }
  },
  // ChecklistItem inherits its scope from the parent Pitstop (owner / co-owners),
  // mirroring the `pitstop` builder but nested through the `pitstop` relation.
  checklist_item: ({ rule, ctx, teamIds }) => {
    switch (rule.kind) {
      case "all":  return {};
      case "own":
        return {
          pitstop: {
            OR: [
              { ownerId: ctx.userId },
              { coOwners: { some: { userId: ctx.userId } } },
            ],
          },
        };
      case "team":
        return {
          pitstop: {
            OR: [
              { ownerId: { in: teamIds } },
              { coOwners: { some: { userId: { in: teamIds } } } },
            ],
          },
        };
      default: throw scopeUnsupported("checklist_item", rule.kind);
    }
  },
  programme_journey: ({ rule, ctx }) => {
    // Journey is settlement-scoped; settlement carries cityId directly.
    switch (rule.kind) {
      case "all":  return {};
      case "city": return ctx.cityId ? { settlement: { cityId: ctx.cityId } } : {};
      default: throw scopeUnsupported("programme_journey", rule.kind);
    }
  },
  thread: ({ rule, ctx, teamIds }) => {
    switch (rule.kind) {
      case "all": return {};
      case "team_or_subscribed":
        return {
          OR: [
            { pitstop: { ownerId: { in: teamIds } } },
            { goal:    { ownerId: { in: teamIds } } },
            { subscriptions: { some: { userId: ctx.userId } } },
          ],
        };
      case "own_or_subscribed":
        return {
          OR: [
            { pitstop: { ownerId: ctx.userId } },
            { goal:    { ownerId: ctx.userId } },
            { subscriptions: { some: { userId: ctx.userId } } },
          ],
        };
      default: throw scopeUnsupported("thread", rule.kind);
    }
  },
  notification: ({ rule, ctx }) => {
    switch (rule.kind) {
      case "self": return { userId: ctx.userId };
      case "all":  return {};
      default: throw scopeUnsupported("notification", rule.kind);
    }
  },
};

function goalCityWhere(cityId: string | null): WhereFragment {
  if (!cityId) return {};
  return {
    OR: [
      { needsCityId: null, needsZoneId: null, needsClusterId: null, needsSettlementId: null },
      { needsCityId: cityId },
      { needsZone:       { cityId } },
      { needsCluster:    { zone: { cityId } } },
      { needsSettlement: { cluster: { zone: { cityId } } } },
    ],
  };
}

function scopeUnsupported(resource: string, kind: string) {
  return new Error(`[rbac] scope rule "${kind}" not implemented for resource "${resource}"`);
}

// ── scopeWhere() ─────────────────────────────────────────────────────────────

/**
 * Returns a Prisma `where` fragment to filter rows of `resource` according to
 * the user's permission for `action`. Returns `null` if the user has no
 * permission at all (caller should 403 / return empty list).
 *
 * Empty object (`{}`) means "no filter" (scope = all). Otherwise spread the
 * fragment into your existing `where` clause.
 */
export async function scopeWhere(
  ctx: RbacContext,
  resource: string,
  action: string,
): Promise<WhereFragment | null> {
  const rule = await getScopeRule(ctx, resource, action);
  if (!rule) return null;

  const builder = resourceScopeBuilders[resource];
  if (!builder) {
    throw new Error(`[rbac] no scope builder registered for resource "${resource}"`);
  }

  // Lazy team fetch — only run the recursive CTE if the rule actually needs it.
  const needsTeam = JSON.stringify(rule).includes("team");
  const teamIds = needsTeam ? await getTeamIds(ctx.userId) : [];

  return builder({ rule, ctx, teamIds });
}

// ── ChecklistItem helpers ────────────────────────────────────────────────────

/**
 * Authoritative per-record gate for the checklist write routes. Resolves the
 * caller's scope for `checklist_item.<action>` and confirms `itemId` falls in
 * it. `false` when the role lacks the permission entirely or the item is out
 * of scope (also covers a missing item — don't leak existence).
 */
export async function checklistItemInScope(
  ctx: RbacContext | null,
  itemId: string,
  action: string,
): Promise<boolean> {
  if (!ctx) return false;
  const scope = await scopeWhere(ctx, "checklist_item", action);
  if (scope === null) return false;                 // no permission at all
  if (Object.keys(scope).length === 0) return true; // scope = all
  const hit = await prisma.checklistItem.findFirst({
    where: { id: itemId, ...scope },
    select: { id: true },
  });
  return hit !== null;
}

/**
 * Of `pitstopIds`, which ones may the caller update checklist items on? The
 * checklist_item scope is pitstop-derived, so the answer is uniform across a
 * pitstop's items — letting the UI gate per pitstop with one query. Returns a
 * Set for O(1) membership checks. The route remains the authoritative gate.
 */
export async function checklistUpdatablePitstopIds(
  ctx: RbacContext | null,
  pitstopIds: string[],
): Promise<Set<string>> {
  if (!ctx || pitstopIds.length === 0) return new Set();
  const scope = await scopeWhere(ctx, "checklist_item", "update");
  if (scope === null) return new Set();                            // no permission
  if (Object.keys(scope).length === 0) return new Set(pitstopIds); // scope = all
  const inner = (scope as { pitstop?: WhereFragment }).pitstop;
  if (!inner) return new Set();                                    // non-pitstop scope → defer to server gate
  const rows = await prisma.pitstop.findMany({
    where: { id: { in: pitstopIds }, ...inner },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}
