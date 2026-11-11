/**
 * Who holds which responsibility on a grant.
 *
 * `Budget.grantLeadId` names one person — the colleague who chases the partner
 * and gets the reminders. In practice a grant has several role-holders, and the
 * split is the organisation's own separation of duties: programme judgement and
 * financial judgement sit with different people. That split is what makes
 * maker-checker more than a formality, because `excludeSubmitter` is weak when
 * only one person is named on the grant at all.
 *
 * Assignments are never deleted, only ended. Someone who approved a release in
 * March must still be explicable in September, and a deleted row makes an
 * authority snapshot unreadable.
 */

import prisma from "@/lib/prisma";
import type { GrantRole } from "@/app/generated/prisma/client";
import { logGrant } from "./audit";

export const GRANT_ROLE_LABELS: Record<GrantRole, string> = {
  programme_lead: "Programme lead",
  programme_finance: "Programme finance",
  effects_and_learning: "Effects and learning",
  location_team: "Location team",
  consultant: "Consultant",
  other: "Other",
};

type SessionLike = { user?: { id?: string | null } | null } | null;

/** Midnight UTC on the same calendar day, for a @db.Date column. */
function asDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Who holds `role` on this grant right now.
 *
 * Returns a LIST, not a single user. One live holder per role is the intent and
 * what `assignGrantRole` maintains, but the schema cannot enforce it (a partial
 * unique index is not expressible, and a handover needs both rows to exist for
 * the instant between them). A caller that assumes one and silently takes
 * `[0]` would quietly ignore a second approver during a handover, so the plural
 * is deliberate.
 */
export async function holdersOf(budgetId: string, role: GrantRole): Promise<string[]> {
  const rows = await prisma.grantRoleAssignment.findMany({
    where: { budgetId, role, endedOn: null },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

/** Every live role-holder on a grant, for display and for notifications. */
export async function grantRoleHolders(budgetId: string) {
  const rows = await prisma.grantRoleAssignment.findMany({
    where: { budgetId, endedOn: null },
    select: {
      id: true,
      role: true,
      startedOn: true,
      note: true,
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { role: "asc" },
  });
  return rows.map((r) => ({ ...r, label: GRANT_ROLE_LABELS[r.role] }));
}

/** Does this person hold `role` on this grant? The authority seam's question. */
export async function holdsGrantRole(
  budgetId: string,
  userId: string,
  role: GrantRole,
): Promise<boolean> {
  const row = await prisma.grantRoleAssignment.findFirst({
    where: { budgetId, userId, role, endedOn: null },
    select: { id: true },
  });
  return row !== null;
}

/** Every role this person currently holds on this grant. */
export async function rolesHeldBy(budgetId: string, userId: string): Promise<GrantRole[]> {
  const rows = await prisma.grantRoleAssignment.findMany({
    where: { budgetId, userId, endedOn: null },
    select: { role: true },
  });
  return rows.map((r) => r.role);
}

/**
 * Assign a role, ending whoever held it.
 *
 * A handover in one transaction, so there is never a moment with two holders of
 * record, and never a gap with none. Re-assigning the same person is a no-op
 * rather than an end-and-restart, which would otherwise litter the history with
 * meaningless handovers every time a form is saved.
 */
export async function assignGrantRole(
  session: SessionLike,
  input: { budgetId: string; role: GrantRole; userId: string; note?: string; startedOn?: Date },
) {
  const actorId = session?.user?.id;
  if (!actorId) throw new Error("Not authenticated");

  const existing = await prisma.grantRoleAssignment.findMany({
    where: { budgetId: input.budgetId, role: input.role, endedOn: null },
    select: { id: true, userId: true },
  });

  if (existing.length === 1 && existing[0].userId === input.userId) {
    return { assignmentId: existing[0].id, unchanged: true as const };
  }

  const startedOn = asDate(input.startedOn ?? new Date());

  const created = await prisma.$transaction(async (tx) => {
    if (existing.length) {
      await tx.grantRoleAssignment.updateMany({
        where: { id: { in: existing.map((e) => e.id) } },
        data: { endedOn: startedOn },
      });
    }
    return tx.grantRoleAssignment.create({
      data: {
        budgetId: input.budgetId,
        role: input.role,
        userId: input.userId,
        startedOn,
        note: input.note ?? null,
        assignedById: actorId,
      },
      select: { id: true },
    });
  });

  logGrant("Budget", input.budgetId, actorId, "role_assigned", {
    field: GRANT_ROLE_LABELS[input.role],
    from: existing.map((e) => e.userId).join(", ") || null,
    to: input.userId,
  });

  return { assignmentId: created.id, unchanged: false as const };
}

/** End a role with nobody replacing them. Recorded, never deleted. */
export async function endGrantRole(session: SessionLike, assignmentId: string, note?: string) {
  const actorId = session?.user?.id;
  if (!actorId) throw new Error("Not authenticated");

  const row = await prisma.grantRoleAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, budgetId: true, role: true, userId: true, endedOn: true },
  });
  if (!row) throw new Error("Not found");
  if (row.endedOn) return;

  await prisma.grantRoleAssignment.update({
    where: { id: assignmentId },
    data: { endedOn: asDate(new Date()), note: note ?? undefined },
  });

  logGrant("Budget", row.budgetId, actorId, "role_ended", {
    field: GRANT_ROLE_LABELS[row.role],
    from: row.userId,
    to: note ?? "ended",
  });
}

/**
 * Roles with nobody in them on an active grant.
 *
 * A grant with no programme finance named has no second pair of eyes on the
 * money, which is worth surfacing before a release is refused for it.
 */
export async function unfilledRoles(
  budgetId: string,
  required: GrantRole[] = ["programme_lead", "programme_finance"],
): Promise<GrantRole[]> {
  const rows = await prisma.grantRoleAssignment.findMany({
    where: { budgetId, endedOn: null, role: { in: required } },
    select: { role: true },
  });
  const held = new Set(rows.map((r) => r.role));
  return required.filter((r) => !held.has(r));
}
