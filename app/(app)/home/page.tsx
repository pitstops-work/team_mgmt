import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import HomeView from "./HomeView";
import { goalCityFilter } from "@/lib/goalCityFilter";

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

export default async function HomePage() {
  const session = await auth();
  const currentUserId = session!.user!.id!;
  const me = await prisma.user.findUnique({ where: { id: currentUserId }, select: { cityId: true } });
  const cityFilter = goalCityFilter(me?.cityId);

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const { weekStart, weekEnd } = getWeekBounds(now);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twentyOneDaysAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const m = now.getMonth();
  const fyYear = m >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyQ = m >= 3 && m <= 5 ? 1 : m >= 6 && m <= 8 ? 2 : m >= 9 ? 3 : 4;

  const [
    users,
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
    prisma.user.findMany({
      select: { id: true, name: true, image: true, email: true },
      orderBy: { name: "asc" },
    }),

    prisma.pitstop.findMany({
      where: {
        deletedAt: null,
        ownerId: currentUserId,
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

    prisma.pitstop.findMany({
      where: {
        deletedAt: null,
        ownerId: currentUserId,
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

    prisma.planItem.findMany({
      where: { userId: currentUserId, deletedAt: null, date: { gte: todayStart, lte: todayEnd } },
      include: {
        pitstops: { select: { pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } } } } } },
      },
      orderBy: { date: "asc" },
    }),

    prisma.pitstopEvent.findMany({
      where: {
        deletedAt: null,
        scheduledAt: { gte: todayStart, lte: todayEnd },
        attendees: { some: { userId: currentUserId } },
      },
      select: { id: true, title: true, type: true, scheduledAt: true, location: true, status: true },
      orderBy: { scheduledAt: "asc" },
    }),

    prisma.pitstop.findMany({
      where: { deletedAt: null, ownerId: currentUserId, status: "InProgress", goal: { deletedAt: null } },
      select: { id: true, title: true, targetDate: true, goal: { select: { id: true, title: true } } },
    }),

    prisma.planItemPitstop.findMany({
      where: {
        planItem: { userId: currentUserId, deletedAt: null, date: { gte: weekStart, lte: weekEnd } },
      },
      select: { pitstopId: true },
    }),

    prisma.goal.findMany({
      where: {
        deletedAt: null,
        ...cityFilter,
        status: { not: "Complete" },
        pitstops: {
          some: { deletedAt: null, ownerId: currentUserId, status: { in: ["Upcoming", "InProgress"] } },
        },
      },
      select: {
        id: true, title: true,
        pitstops: {
          where: { deletedAt: null, ownerId: currentUserId, status: { in: ["Upcoming", "InProgress"] } },
          select: { updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
    }),

    prisma.pitstopEvent.findMany({
      where: {
        deletedAt: null,
        status: "Flagged",
        attendees: { some: { userId: currentUserId } },
      },
      select: { id: true, title: true, scheduledAt: true, type: true },
      orderBy: { scheduledAt: "asc" },
    }),

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

    // Recent goal broadcasts
    prisma.goalBroadcast.findMany({
      where: { goal: { deletedAt: null } },
      include: {
        author: { select: { id: true, name: true, image: true } },
        goal: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),

    // Recent standups
    prisma.standupLog.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      include: { user: { select: { id: true, name: true, image: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),

    // InProgress pitstops with no check-in in 7 days
    prisma.pitstop.findMany({
      where: {
        deletedAt: null,
        ownerId: currentUserId,
        status: "InProgress",
        goal: { deletedAt: null },
        checkins: { none: { createdAt: { gte: sevenDaysAgo } } },
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

    // Pitstops that are Done but unverified — owned by reports of current user
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

    // Goals without confirmation — owned by reports of current user
    prisma.goal.findMany({
      where: {
        deletedAt: null,
        ...cityFilter,
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

  const goneQuietGoals = activeGoals
    .filter(g => g.pitstops.length > 0 && new Date(g.pitstops[0].updatedAt) < fourteenDaysAgo)
    .map(g => ({ id: g.id, title: g.title, lastUpdated: g.pitstops[0].updatedAt.toISOString() }));

  const initialData = {
    overduePitstops: JSON.parse(JSON.stringify(overduePitstops)),
    thisWeekPitstops: JSON.parse(JSON.stringify(thisWeekPitstops)),
    todayPlanItems: JSON.parse(JSON.stringify(todayPlanItems)),
    todayActivities: JSON.parse(JSON.stringify(todayActivities)),
    noPlanPitstops: JSON.parse(JSON.stringify(noPlanPitstops)),
    goneQuietGoals,
    flaggedActivities: JSON.parse(JSON.stringify(flaggedActivities)),
    recentNotifications: JSON.parse(JSON.stringify(recentNotifications)),
    currentQuarter: JSON.parse(JSON.stringify(currentQuarter)),
    recentBroadcasts: JSON.parse(JSON.stringify(recentBroadcasts)),
    recentStandups: JSON.parse(JSON.stringify(recentStandups)),
    staleCheckins: JSON.parse(JSON.stringify(staleCheckins)),
    driftingThemes: JSON.parse(JSON.stringify(driftingThemes)),
    pendingVerifications: JSON.parse(JSON.stringify(pendingVerifications)),
    unconfirmedGoals: JSON.parse(JSON.stringify(unconfirmedGoals)),
    fyYear,
    fyQ,
  };

  return (
    <HomeView
      currentUserId={currentUserId}
      users={JSON.parse(JSON.stringify(users))}
      initialData={initialData}
      greeting={greeting}
      todayLabel={todayLabel}
    />
  );
}
