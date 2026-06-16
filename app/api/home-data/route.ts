import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { pitstopOwnedByAnyOf, eventOwnedByAnyOf } from "@/lib/ownership";

// Indian FY: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
function currentFYQuarter(now: Date): { year: number; quarter: number } {
  const m = now.getMonth();
  if (m >= 3 && m <= 5) return { year: now.getFullYear(), quarter: 1 };
  if (m >= 6 && m <= 8) return { year: now.getFullYear(), quarter: 2 };
  if (m >= 9)           return { year: now.getFullYear(), quarter: 3 };
  return { year: now.getFullYear() - 1, quarter: 4 };
}

function getWeekBounds(now: Date) {
  const weekStart = new Date(now);
  const day = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - (day + 6) % 7);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const targetUserId = searchParams.get("userId") ?? session.user.id;
  const currentUserId = session.user.id;

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const { weekStart, weekEnd } = getWeekBounds(now);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const twentyOneDaysAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);

  const { year: fyYear, quarter: fyQ } = currentFYQuarter(now);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    overduePitstops,
    thisWeekPitstops,
    todayPlanItems,
    todayActivities,
    inProgressPitstops,
    plannedThisWeek,
    activeGoals,
    flaggedActivities,
    recentNotifications,
    currentQuarter,
    recentBroadcasts,
    recentStandups,
    staleCheckins,
    driftingThemes,
    pendingVerifications,
    unconfirmedGoals,
  ] = await Promise.all([
    // Overdue: past target date, not done
    prisma.pitstop.findMany({
      where: {
        deletedAt: null,
        status: { in: ["Upcoming", "InProgress"] },
        targetDate: { lt: todayStart },
        goal: { deletedAt: null },
        ...pitstopOwnedByAnyOf([targetUserId]),
      },
      select: {
        id: true, title: true, status: true, targetDate: true,
        goal: { select: { id: true, title: true } },
        owner: { select: { id: true, name: true, image: true } },
      },
      orderBy: { targetDate: "asc" },
    }),

    // This week: pitstops due or starting
    prisma.pitstop.findMany({
      where: {
        deletedAt: null,
        goal: { deletedAt: null },
        ...pitstopOwnedByAnyOf([targetUserId]),
        AND: [{
          OR: [
            { targetDate: { gte: weekStart, lte: weekEnd } },
            { startDate:  { gte: weekStart, lte: weekEnd } },
          ],
        }],
      },
      select: {
        id: true, title: true, status: true, targetDate: true, startDate: true,
        goal: { select: { id: true, title: true } },
        owner: { select: { id: true, name: true, image: true } },
      },
      orderBy: { targetDate: "asc" },
    }),

    // Today's plan items
    prisma.planItem.findMany({
      where: {
        userId: targetUserId,
        deletedAt: null,
        date: { gte: todayStart, lte: todayEnd },
      },
      include: {
        pitstops: { select: { pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } } } } } },
      },
      orderBy: { date: "asc" },
    }),

    // Today's activities
    prisma.pitstopEvent.findMany({
      where: {
        deletedAt: null,
        scheduledAt: { gte: todayStart, lte: todayEnd },
        ...eventOwnedByAnyOf([targetUserId]),
      },
      select: {
        id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
      },
      orderBy: { scheduledAt: "asc" },
    }),

    // InProgress pitstops (for no-plan check)
    prisma.pitstop.findMany({
      where: {
        deletedAt: null,
        status: "InProgress",
        goal: { deletedAt: null },
        ...pitstopOwnedByAnyOf([targetUserId]),
      },
      select: {
        id: true, title: true, targetDate: true,
        goal: { select: { id: true, title: true } },
      },
    }),

    // Pitstop IDs that have plan items this week
    prisma.planItemPitstop.findMany({
      where: {
        planItem: {
          userId: targetUserId,
          deletedAt: null,
          date: { gte: weekStart, lte: weekEnd },
        },
      },
      select: { pitstopId: true },
    }),

    // Goals with active pitstops — for gone-quiet check
    prisma.goal.findMany({
      where: {
        deletedAt: null,
        status: { not: "Complete" },
        pitstops: {
          some: {
            deletedAt: null,
            status: { in: ["Upcoming", "InProgress"] },
            ...pitstopOwnedByAnyOf([targetUserId]),
          },
        },
      },
      select: {
        id: true, title: true,
        pitstops: {
          where: {
            deletedAt: null,
            status: { in: ["Upcoming", "InProgress"] },
            ...pitstopOwnedByAnyOf([targetUserId]),
          },
          select: { updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
    }),

    // Flagged activities
    prisma.pitstopEvent.findMany({
      where: {
        deletedAt: null,
        status: "Flagged",
        ...eventOwnedByAnyOf([targetUserId]),
      },
      select: {
        id: true, title: true, scheduledAt: true, type: true,
      },
      orderBy: { scheduledAt: "asc" },
    }),

    // Recent notifications — always for current user
    prisma.notification.findMany({
      where: { userId: currentUserId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),

    // Current quarter with its goals
    prisma.quarter.findFirst({
      where: { deletedAt: null, year: fyYear, quarter: fyQ },
      include: {
        goals: {
          include: {
            goal: {
              select: {
                id: true, title: true, status: true,
                pitstops: { where: { deletedAt: null }, select: { id: true, status: true } },
              },
            },
          },
        },
      },
    }),

    // Recent goal broadcasts (last 5)
    prisma.goalBroadcast.findMany({
      where: { goal: { deletedAt: null } },
      include: {
        author: { select: { id: true, name: true, image: true } },
        goal: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),

    // Recent standups (last 3 days, all users)
    prisma.standupLog.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      include: { user: { select: { id: true, name: true, image: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),

    // InProgress pitstops the target user owns/co-owns with no check-in in 7 days
    prisma.pitstop.findMany({
      where: {
        deletedAt: null,
        status: "InProgress",
        goal: { deletedAt: null },
        checkins: { none: { createdAt: { gte: sevenDaysAgo } } },
        ...pitstopOwnedByAnyOf([targetUserId]),
      },
      select: {
        id: true, title: true,
        goal: { select: { id: true, title: true } },
      },
      take: 5,
    }),

    // Drifting themes: have InProgress pitstops not updated in 21 days
    prisma.theme.findMany({
      where: {
        deletedAt: null,
        goals: {
          some: {
            goal: {
              deletedAt: null,
              status: { not: "Complete" },
              pitstops: {
                some: {
                  deletedAt: null,
                  status: "InProgress",
                  updatedAt: { lt: twentyOneDaysAgo },
                },
              },
            },
          },
        },
      },
      select: { id: true, name: true, color: true },
    }),

    // Done pitstops owned by reports of current user, not yet verified
    prisma.pitstop.findMany({
      where: {
        deletedAt: null,
        status: "Done",
        verifiedById: null,
        goal: { deletedAt: null },
        owner: { reportsToId: currentUserId },
      },
      select: {
        id: true, title: true, completedAt: true,
        goal: { select: { id: true, title: true } },
        owner: { select: { id: true, name: true, image: true } },
      },
      orderBy: { completedAt: "desc" },
      take: 10,
    }),

    // Goals not yet confirmed owned by reports of current user
    prisma.goal.findMany({
      where: {
        deletedAt: null,
        status: { not: "Complete" },
        confirmedById: null,
        owner: { reportsToId: currentUserId },
      },
      select: {
        id: true, title: true, createdAt: true,
        owner: { select: { id: true, name: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const plannedIds = new Set(plannedThisWeek.map(r => r.pitstopId));
  const noPlanPitstops = inProgressPitstops.filter(p => !plannedIds.has(p.id));

  const goneQuietGoals = activeGoals.filter(g =>
    g.pitstops.length > 0 &&
    new Date(g.pitstops[0].updatedAt) < fourteenDaysAgo
  ).map(g => ({ id: g.id, title: g.title, lastUpdated: g.pitstops[0].updatedAt }));

  return Response.json({
    overduePitstops,
    thisWeekPitstops,
    todayPlanItems,
    todayActivities,
    noPlanPitstops,
    goneQuietGoals,
    flaggedActivities,
    recentNotifications,
    currentQuarter,
    recentBroadcasts,
    recentStandups,
    staleCheckins,
    driftingThemes,
    pendingVerifications,
    unconfirmedGoals,
    fyYear,
    fyQ,
  });
}
