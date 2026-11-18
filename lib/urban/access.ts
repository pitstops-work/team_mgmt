// The ONE access module for Urban Operations (spec rules R1, R6; §9).
//
// Every page, server action and route under /urban calls `requireActor()` and
// then `can()` / a scope helper from here. scripts/check-urban-access.mjs fails
// the build if one doesn't. Roles are derived HERE and nowhere else:
//
//   admin   ← User.role admin / super-admin
//   leader  ← designation Leader
//   zl / pm ← designation ZL / PM
//   rp      ← designation RP
//   other   ← anything else (treated like an RP: sees only what they're assigned)
//
// Visibility (one definition, used by lists AND by single-record checks):
//   admin, leader → every effort
//   everyone else → efforts they or anyone below them (reportsTo, recursive) own,
//                   plus efforts in places assigned to them or anyone below them
//                   (an assignment covers that place and everything under it).
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

export type UrbanRole = "admin" | "leader" | "pm" | "zl" | "rp" | "other";

export type Actor = {
  id: string;
  name: string;
  email: string;
  role: UrbanRole;
  /** A "viewer" account: can look, never write. */
  readOnly: boolean;
};

export const ROLE_LABEL: Record<UrbanRole, string> = {
  admin: "Admin",
  leader: "Leader",
  pm: "PM",
  zl: "ZL",
  rp: "RP",
  other: "Staff",
};

/** The only role derivation in /urban (rule R6). */
export function urbanRoleOf(appRole: string | null | undefined, designation: string | null | undefined): UrbanRole {
  if (appRole === "admin" || appRole === "super-admin") return "admin";
  switch (designation) {
    case "Leader": return "leader";
    case "PM": return "pm";
    case "ZL": return "zl";
    case "RP": return "rp";
    default: return "other";
  }
}

/**
 * Pilot gate (spec §10, Phase 1–2: admins only). Widen later by listing
 * emails in URBAN_PILOT_EMAILS (comma-separated) — no code change needed.
 */
function mayEnter(actor: Actor): boolean {
  if (actor.role === "admin") return true;
  const list = (process.env.URBAN_PILOT_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(actor.email.toLowerCase());
}

/** The signed-in user as an Urban actor, or null. Does not gate. */
export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true, designation: true } });
  if (!u) return null;
  return { id: u.id, name: u.name ?? u.email, email: u.email, role: urbanRoleOf(u.role, u.designation), readOnly: u.role === "viewer" };
}

/** Whether the signed-in user may open /urban (drives the /portal card; same rule as the gate). */
export async function canEnterUrban(): Promise<boolean> {
  const actor = await getActor();
  return !!actor && mayEnter(actor);
}

/** For pages: the actor, or a redirect to sign-in / the portal. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!mayEnter(actor)) redirect("/portal");
  return actor;
}

/** For server actions: the actor, or an error (actions must not redirect mid-mutation). */
export async function requireActorForAction(): Promise<Actor> {
  const actor = await getActor();
  if (!actor || !mayEnter(actor)) throw new UrbanAccessError("Not allowed");
  if (actor.readOnly) throw new UrbanAccessError("This account can view but not change anything");
  return actor;
}

export class UrbanAccessError extends Error {}

// ── Trees ──────────────────────────────────────────────────────────────────

/** The actor plus everyone below them in the reporting tree. */
async function teamIds(userId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE t AS (
      SELECT id FROM "User" WHERE id = ${userId}
      UNION
      SELECT u.id FROM "User" u JOIN t ON u."reportsToId" = t.id
    )
    SELECT id FROM t`;
  return rows.map((r) => r.id);
}

/** Every place at or under the places assigned to any of these users. */
async function coveredPlaceIds(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE p AS (
      SELECT "placeId" AS id FROM "uo_assignment" WHERE "userId" = ANY(${userIds})
      UNION
      SELECT c.id FROM "uo_place" c JOIN p ON c."parentId" = p.id
    )
    SELECT id FROM p`;
  return rows.map((r) => r.id);
}

// ── Scope (the single definition of "which efforts can this actor see") ──────

/** A Prisma where-fragment for efforts the actor may see. Lists use this; `can()` uses this. */
export async function visibleEffortsWhere(actor: Actor): Promise<Prisma.UoEffortWhereInput> {
  if (actor.role === "admin" || actor.role === "leader") return {};
  const team = await teamIds(actor.id);
  const places = await coveredPlaceIds(team);
  return { OR: [{ ownerId: { in: team } }, { placeId: { in: places } }] };
}

/** Users the actor may make an effort's owner: themselves and everyone below them (admins/leaders: anyone). */
export async function assignableOwnerIds(actor: Actor): Promise<string[] | "any"> {
  if (actor.role === "admin" || actor.role === "leader") return "any";
  return teamIds(actor.id);
}

// ── can() ──────────────────────────────────────────────────────────────────

export type UrbanAction =
  | "programme.edit"   // programme settings
  | "setup.edit"       // people, places, partners, assignments
  | "effort.view"
  | "effort.create"
  | "effort.manage"    // reassign, close, reopen
  | "effort.work";     // do tasks, run sessions, add follow-ups (Phase 2)

/**
 * May the actor do `action` (on this effort, where it applies)?
 * Write actions are refused for read-only accounts.
 */
export async function can(actor: Actor, action: UrbanAction, effortId?: string): Promise<boolean> {
  const write = action !== "effort.view";
  if (write && actor.readOnly) return false;

  switch (action) {
    case "programme.edit":
    case "setup.edit":
      return actor.role === "admin";
    case "effort.create":
      return actor.role === "admin" || actor.role === "leader" || actor.role === "pm" || actor.role === "zl";
    case "effort.view":
    case "effort.manage":
    case "effort.work": {
      if (!effortId) return false;
      if (actor.role === "admin") return true;
      const effort = await prisma.uoEffort.findUnique({ where: { id: effortId }, select: { ownerId: true } });
      if (!effort) return false;
      if (action === "effort.work" && effort.ownerId === actor.id) return true;
      if (action === "effort.manage" && actor.role === "rp") return false;
      if (action === "effort.work" && (actor.role === "rp" || actor.role === "other")) return false;
      // Supervisors (and leaders) act on what they can see; "step in" is logged as an Event by the caller.
      const where = await visibleEffortsWhere(actor);
      return (await prisma.uoEffort.count({ where: { AND: [{ id: effortId }, where] } })) > 0;
    }
  }
}

/** can() or throw — for server actions. */
export async function authorize(actor: Actor, action: UrbanAction, effortId?: string): Promise<void> {
  if (!(await can(actor, action, effortId))) throw new UrbanAccessError("Not allowed");
}
