/**
 * RBAC seed configuration. The catalog of permissions and the per-role
 * scope grants live here so they can be reused by:
 *   - `scripts/seed-rbac.ts` (CLI bootstrap)
 *   - `/api/admin/rbac/roles/[id]/reset` (admin UI "reset to defaults" button)
 *
 * Single source of truth — when the catalog (docs/rbac-catalog.md) changes,
 * update this file and re-run the seed (or click reset in the admin UI).
 */

import prisma from "./prisma";

// ── Scope rule kinds (the closed set surfaced in the admin UI) ───────────────

export type ScopeRule =
  | { kind: "all" }
  | { kind: "self" }
  | { kind: "own" }
  | { kind: "team" }
  | { kind: "city" }
  | { kind: "team_and_city" }
  | { kind: "own_or_followed" }
  | { kind: "team_or_subscribed" }
  | { kind: "own_or_subscribed" };

export const SCOPE_KINDS = [
  "all",
  "self",
  "own",
  "team",
  "city",
  "team_and_city",
  "own_or_followed",
  "team_or_subscribed",
  "own_or_subscribed",
] as const;

export type ScopeKind = typeof SCOPE_KINDS[number];

export const SCOPE_LABELS: Record<ScopeKind, string> = {
  all:                 "All records (no filter)",
  self:                "Only the user themselves",
  own:                 "Owned/created by me",
  team:                "My team (self + reports, recursive)",
  city:                "My assigned city",
  team_and_city:       "My team AND my city",
  own_or_followed:     "Owned by me OR I'm a follower",
  team_or_subscribed:  "My team OR I'm subscribed",
  own_or_subscribed:   "Owned by me OR I'm subscribed",
};

const ALL: ScopeRule = { kind: "all" };
const SELF: ScopeRule = { kind: "self" };
const OWN: ScopeRule = { kind: "own" };
const TEAM: ScopeRule = { kind: "team" };
const CITY: ScopeRule = { kind: "city" };
const TEAM_AND_CITY: ScopeRule = { kind: "team_and_city" };
const OWN_OR_FOLLOWED: ScopeRule = { kind: "own_or_followed" };
const TEAM_OR_SUBSCRIBED: ScopeRule = { kind: "team_or_subscribed" };

// ── Resources × Actions catalog ──────────────────────────────────────────────

const STANDARD_ACTIONS = ["list", "read", "create", "update", "delete"] as const;

export const RESOURCE_ACTIONS: Record<string, readonly string[]> = {
  user: [...STANDARD_ACTIONS, "reset_password", "change_own_password"],
  goal: [...STANDARD_ACTIONS, "change_owner"],
  pitstop: [...STANDARD_ACTIONS, "generate_partner_briefing"],
  pitstop_event: [...STANDARD_ACTIONS, "respond", "cancel", "reschedule"],
  decision: [...STANDARD_ACTIONS],
  risk: [...STANDARD_ACTIONS],
  settlement: [...STANDARD_ACTIONS, "sync_civic_data"],
  cluster: [...STANDARD_ACTIONS],
  zone: [...STANDARD_ACTIONS],
  city: [...STANDARD_ACTIONS],
  programme: [...STANDARD_ACTIONS],
  programme_journey: [...STANDARD_ACTIONS],
  plan_item: [...STANDARD_ACTIONS],
  checklist_item: [...STANDARD_ACTIONS],
  thread: [...STANDARD_ACTIONS, "post_message", "subscribe"],
  notification: ["list", "read", "mark_read"],
  map_note: [...STANDARD_ACTIONS],
  map_partner: [...STANDARD_ACTIONS],
  layer_feature: [...STANDARD_ACTIONS],
  needs_scheme: [...STANDARD_ACTIONS],
  needs_formula: [...STANDARD_ACTIONS],
  template: [...STANDARD_ACTIONS],
  facility_indicator: [...STANDARD_ACTIONS],
  facility_layer: [...STANDARD_ACTIONS],
  journey_outcome_pack: [...STANDARD_ACTIONS],
  mis_provider: [...STANDARD_ACTIONS],
  app_setting: [...STANDARD_ACTIONS],
  invite_code: ["read", "rotate"],
  audit_log: ["list", "read"],
  review_portal: ["access"],
  budget: [...STANDARD_ACTIONS],
  system: ["agent_use", "seed_run", "geo_sync_civic"],
};

export type RoleGrant = Record<string, ScopeRule>; // "resource.action" → rule

// ── Per-role grants ──────────────────────────────────────────────────────────

const SUPER_ADMIN_GRANTS: RoleGrant = (() => {
  const out: RoleGrant = {};
  for (const [resource, actions] of Object.entries(RESOURCE_ACTIONS)) {
    for (const action of actions) out[`${resource}.${action}`] = ALL;
  }
  return out;
})();

const ADMIN_EXCLUDED = new Set<string>([
  "system.agent_use",
  "system.seed_run",
  "system.geo_sync_civic",
  "review_portal.access",
  "invite_code.rotate",
  "settlement.sync_civic_data",
  "budget.list", "budget.read", "budget.create", "budget.update", "budget.delete",
]);

const ADMIN_GRANTS: RoleGrant = (() => {
  const out: RoleGrant = {};
  for (const [resource, actions] of Object.entries(RESOURCE_ACTIONS)) {
    for (const action of actions) {
      const key = `${resource}.${action}`;
      if (ADMIN_EXCLUDED.has(key)) continue;
      out[key] = ALL;
    }
  }
  return out;
})();

const MEMBER_GRANTS: RoleGrant = {
  "user.list":                SELF,
  "user.read":                SELF,
  "user.update":              SELF,
  "user.change_own_password": SELF,

  "goal.list":         TEAM_AND_CITY,
  "goal.read":         OWN_OR_FOLLOWED,
  "goal.create":       OWN,
  "goal.update":       OWN,
  "goal.change_owner": OWN,

  "pitstop.list":   TEAM,
  "pitstop.read":   TEAM,
  "pitstop.create": OWN,
  "pitstop.update": OWN,

  "pitstop_event.list":       TEAM,
  "pitstop_event.read":       TEAM,
  "pitstop_event.create":     OWN,
  "pitstop_event.update":     OWN,
  "pitstop_event.respond":    SELF,
  "pitstop_event.cancel":     OWN,
  "pitstop_event.reschedule": OWN,

  "decision.list":   OWN,
  "decision.read":   OWN,
  "decision.create": OWN,
  "decision.update": OWN,
  "decision.delete": OWN,
  "risk.list":       OWN,
  "risk.read":       OWN,
  "risk.create":     OWN,
  "risk.update":     OWN,
  "risk.delete":     OWN,

  "settlement.list": ALL,
  "settlement.read": ALL,
  "cluster.list":    ALL,
  "cluster.read":    ALL,
  "zone.list":       ALL,
  "zone.read":       ALL,
  "city.list":       ALL,
  "city.read":       ALL,

  "programme.list":   OWN,
  "programme.read":   OWN,
  "programme.create": OWN,
  "programme.update": OWN,
  "programme.delete": OWN,

  "programme_journey.list": CITY,
  "programme_journey.read": CITY,

  "plan_item.list":      OWN,
  "plan_item.read":      OWN,
  "plan_item.create":    OWN,
  "plan_item.update":    OWN,
  "plan_item.delete":    OWN,
  "checklist_item.list":   OWN,
  "checklist_item.read":   OWN,
  "checklist_item.create": OWN,
  "checklist_item.update": OWN,
  "checklist_item.delete": OWN,

  "thread.list":         TEAM_OR_SUBSCRIBED,
  "thread.read":         TEAM_OR_SUBSCRIBED,
  "thread.post_message": OWN,
  "thread.subscribe":    SELF,

  "notification.list":      SELF,
  "notification.read":      SELF,
  "notification.mark_read": SELF,

  "map_note.list":             ALL,
  "map_note.read":             ALL,
  "map_partner.list":          ALL,
  "map_partner.read":          ALL,
  "layer_feature.list":        ALL,
  "layer_feature.read":        ALL,
  "needs_scheme.list":         ALL,
  "needs_scheme.read":         ALL,
  "needs_formula.list":        ALL,
  "needs_formula.read":        ALL,
  "template.list":             ALL,
  "template.read":             ALL,
  "facility_indicator.list":   ALL,
  "facility_indicator.read":   ALL,
  "facility_layer.list":       ALL,
  "facility_layer.read":       ALL,
  "journey_outcome_pack.list": ALL,
  "journey_outcome_pack.read": ALL,
  "mis_provider.list":         ALL,
  "mis_provider.read":         ALL,
};

const VIEWER_GRANTS: RoleGrant = (() => {
  const out: RoleGrant = {};
  const SENSITIVE = new Set(["audit_log", "review_portal", "budget", "system"]);
  for (const [resource, actions] of Object.entries(RESOURCE_ACTIONS)) {
    if (SENSITIVE.has(resource)) continue;
    for (const action of actions) {
      if (action === "list" || action === "read" || action === "mark_read") {
        out[`${resource}.${action}`] = (resource === "user" || resource === "notification") ? SELF : ALL;
      }
    }
  }
  return out;
})();

const BUDGET_ADMIN_GRANTS: RoleGrant = {
  "budget.list":   ALL,
  "budget.read":   ALL,
  "budget.create": ALL,
  "budget.update": ALL,
  "budget.delete": ALL,
  "user.read":                SELF,
  "user.update":              SELF,
  "user.change_own_password": SELF,
  "notification.list":        SELF,
  "notification.read":        SELF,
  "notification.mark_read":   SELF,
};

export const ROLES_CONFIG: Array<{ name: string; description: string; grants: RoleGrant }> = [
  {
    name: "super-admin",
    description: "Apex role. Bootstrapped via ADMIN_EMAIL on first sign-in; thereafter assigned in the DB.",
    grants: SUPER_ADMIN_GRANTS,
  },
  {
    name: "admin",
    description: "Organisation admin. Configures settings, templates, geography. Cannot manage admin/super-admin users.",
    grants: ADMIN_GRANTS,
  },
  {
    name: "member",
    description: "Default contributor. Scope tracks the user's place in the reporting hierarchy via designation.",
    grants: MEMBER_GRANTS,
  },
  {
    name: "viewer",
    description: "Read-only. Cannot mutate any resource.",
    grants: VIEWER_GRANTS,
  },
  {
    name: "budget-admin",
    description: "Budget realm only.",
    grants: BUDGET_ADMIN_GRANTS,
  },
];

// ── Seed operations ──────────────────────────────────────────────────────────

export async function seedPermissions(): Promise<number> {
  const keys: { resource: string; action: string }[] = [];
  for (const [resource, actions] of Object.entries(RESOURCE_ACTIONS)) {
    for (const action of actions) keys.push({ resource, action });
  }
  for (const k of keys) {
    await prisma.permission.upsert({
      where: { resource_action: { resource: k.resource, action: k.action } },
      create: k,
      update: {},
    });
  }
  return keys.length;
}

export async function seedRole(name: string): Promise<number> {
  const cfg = ROLES_CONFIG.find((r) => r.name === name);
  if (!cfg) throw new Error(`[rbac-seed] unknown role: ${name}`);

  await prisma.role.upsert({
    where: { name: cfg.name },
    create: { name: cfg.name, description: cfg.description, isSystem: true },
    update: { description: cfg.description, isSystem: true },
  });
  const role = await prisma.role.findUniqueOrThrow({ where: { name: cfg.name } });

  const perms = await prisma.permission.findMany();
  const permByKey = new Map(perms.map((p) => [`${p.resource}.${p.action}`, p.id]));

  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

  const entries = Object.entries(cfg.grants);
  if (entries.length === 0) return 0;

  await prisma.rolePermission.createMany({
    data: entries.map(([key, scopeRule]) => {
      const permissionId = permByKey.get(key);
      if (!permissionId) throw new Error(`[rbac-seed] unknown permission key in ${cfg.name}: ${key}`);
      return { roleId: role.id, permissionId, scopeRule };
    }),
    skipDuplicates: true,
  });
  return entries.length;
}

export async function seedAllRoles(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const role of ROLES_CONFIG) counts[role.name] = await seedRole(role.name);
  return counts;
}
