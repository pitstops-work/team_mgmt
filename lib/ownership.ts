/**
 * Ownership predicates. Single source of truth for "this row is owned by any
 * of these users" — used inside RBAC scope builders AND by ad-hoc list queries
 * that filter by an arbitrary user-id set (e.g. "all RPs reporting to a PM").
 *
 * Semantics match the RBAC visibility model: goal-level ownership flows down
 * to pitstops, events, and checklist items. A goal co-owner sees every
 * pitstop / event / checklist under their goal, same as the goal owner.
 *
 * Keeping the predicate centralised means future model changes (followers,
 * deputies, etc.) land in one place instead of every list query.
 */

import type { Prisma } from "@/app/generated/prisma/client";

/** Goal rows owned by any of `userIds` — primary owner or co-owner. */
export function goalOwnedByAnyOf(userIds: string[]): Prisma.GoalWhereInput {
  return {
    OR: [
      { ownerId: { in: userIds } },
      { coOwners: { some: { userId: { in: userIds } } } },
    ],
  };
}

/** Pitstop rows owned by any of `userIds`, including via parent goal. */
export function pitstopOwnedByAnyOf(userIds: string[]): Prisma.PitstopWhereInput {
  return {
    OR: [
      { ownerId: { in: userIds } },
      { coOwners: { some: { userId: { in: userIds } } } },
      { goal: goalOwnedByAnyOf(userIds) },
    ],
  };
}

/** ChecklistItem rows whose parent pitstop is owned by any of `userIds`. */
export function checklistItemOwnedByAnyOf(userIds: string[]): Prisma.ChecklistItemWhereInput {
  return { pitstop: pitstopOwnedByAnyOf(userIds) };
}

/**
 * PitstopEvent rows owned by any of `userIds` — attendee OR parent pitstop
 * is owned by them. Used for "what activities should this user / set of
 * users see".
 *
 * The nested pitstop sub-clause guards `deletedAt: null` because the outer
 * caller can't reach into the `pitstops.some.pitstop` shape to enforce it;
 * without this guard a soft-deleted pitstop could still match via co-owner.
 *
 * Does NOT include `createdById`. The RBAC scope builder layers that on top
 * for the "own" rule because user-initiated creates are always self-relevant;
 * for "team" / arbitrary-user-set queries that distinction doesn't apply.
 */
export function eventOwnedByAnyOf(userIds: string[]): Prisma.PitstopEventWhereInput {
  return {
    OR: [
      { attendees: { some: { userId: { in: userIds } } } },
      { pitstops: { some: { pitstop: { deletedAt: null, ...pitstopOwnedByAnyOf(userIds) } } } },
    ],
  };
}
