import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

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
  ] = await Promise.all([
    // Overdue: past target date, not done
    prisma.pitstop.findMany({
      where: {
        deletedAt: null,
        ownerId: targetUserId,
        status: { in: ["Upcoming", "InProgress"] },
        targetDate: { lt: todayStart },
        goal: { deletedAt: null },
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
        ownerId: targetUserId,
        goal: { deletedAt: null },
        OR: [
          { targetDate: { gte: weekStart, lte: weekEnd } },
          { startDate:  { gte: weekStart, lte: weekEnd } },
        ],
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
        attendees: { some: { userId: targetUserId } },
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
        ownerId: targetUserId,
        status: "InProgress",
        goal: { deletedAt: null },
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
            ownerId: targetUserId,
            status: { in: ["Upcoming", "InProgress"] },
          },
        },
      },
      select: {
        id: true, title: true,
        pitstops: {
          where: {
            deletedAt: null,
            ownerId: targetUserId,
            status: { in: ["Upcoming", "InProgress"] },
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
        attendees: { some: { userId: targetUserId } },
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
  });
}
