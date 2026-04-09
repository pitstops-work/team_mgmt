import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import HomeView from "./HomeView";

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

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const { weekStart, weekEnd } = getWeekBounds(now);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

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
