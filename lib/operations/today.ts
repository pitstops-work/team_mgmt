/**
 * On-the-ground "today" loader for the Operations driver.
 *
 * Returns the person's overdue + today activities across ALL goal types, in the
 * exact `Activity` / `ChecklistItem` shape the reused ActivityCard consumes, so
 * completion (indicators + follow-ups + Done cascade) works unchanged. Grouping
 * (cluster → theme → centre) happens client-side from the activity's own goal
 * fields — no extra server work.
 */

import prisma from "@/lib/prisma";
import { eventOwnedByAnyOf, pitstopOwnedByAnyOf } from "@/lib/ownership";
import type { Activity, ChecklistItem } from "@/app/(app)/home/_lib/types";

// Matches the home loader's event select so the shapes are identical.
const EVENT_SELECT = {
  id: true,
  title: true,
  type: true,
  scheduledAt: true,
  location: true,
  status: true,
  displayDate: true,
  rescheduleCount: true,
  rescheduleReasonCode: true,
  attendees: { select: { user: { select: { id: true, name: true } } } },
  pitstops: {
    select: {
      pitstop: {
        select: {
          id: true,
          title: true,
          ownerId: true,
          goal: {
            select: {
              id: true,
              title: true,
              needsDomain: true,
              linkedFacilityId: true,
              needsCluster: { select: { id: true, name: true } },
              needsSettlement: { select: { id: true, name: true } },
              linkedFacility: { select: { name: true, cluster: { select: { id: true, name: true } } } },
              needsZone: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    take: 1,
  },
} as const;

export type TodayDriverData = {
  overdue: Activity[];
  today: Activity[];
  checklists: ChecklistItem[];
};

export async function loadTodayDriver(userIds: string[], now: Date = new Date()): Promise<TodayDriverData> {
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  // Not-pulled-into-today guard (mirrors home): exclude events whose displayDate
  // parks them on today from the overdue list.
  const notPulledIntoToday = {
    AND: [{
      OR: [
        { displayDate: null },
        { displayDate: { lt: todayStart } },
        { displayDate: { gt: todayEnd } },
      ],
    }],
  };

  const [today, overdue, checklists] = await Promise.all([
    prisma.pitstopEvent.findMany({
      where: {
        deletedAt: null,
        status: { not: "Cancelled" },
        AND: [{
          OR: [
            { scheduledAt: { gte: todayStart, lte: todayEnd } },
            { displayDate: { gte: todayStart, lte: todayEnd } },
          ],
        }],
        pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null } } } },
        ...eventOwnedByAnyOf(userIds),
      },
      select: EVENT_SELECT,
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.pitstopEvent.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ["Done", "Cancelled"] },
        scheduledAt: { lt: todayStart },
        ...notPulledIntoToday,
        pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null } } } },
        ...eventOwnedByAnyOf(userIds),
      },
      select: EVENT_SELECT,
      orderBy: { scheduledAt: "asc" },
      take: 200,
    }),
    prisma.checklistItem.findMany({
      where: {
        status: { notIn: ["Done", "Cancelled"] },
        pitstop: { ...pitstopOwnedByAnyOf(userIds), deletedAt: null, goal: { deletedAt: null } },
      },
      select: {
        id: true, text: true, status: true, checked: true, completionType: true,
        activities: { select: { id: true, title: true, status: true, scheduledAt: true, type: true } },
        pitstop: {
          select: {
            id: true, title: true, targetDate: true, status: true, ownerId: true,
            owner: { select: { id: true, name: true } },
            goal: {
              select: {
                id: true, title: true, needsDomain: true, linkedFacilityId: true,
                needsCluster: { select: { id: true, name: true } },
                needsSettlement: { select: { id: true, name: true } },
                linkedFacility: { select: { name: true, cluster: { select: { id: true, name: true } } } },
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    today: today as unknown as Activity[],
    overdue: overdue as unknown as Activity[],
    checklists: checklists as unknown as ChecklistItem[],
  };
}
