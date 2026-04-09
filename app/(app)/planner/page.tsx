import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import PlannerView from "./PlannerView";

export default async function PlannerPage() {
  const session = await auth();
  const currentUserId = session!.user!.id!;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

  // Quarter date range for initial load
  const qStart = new Date(currentYear, (currentQuarter - 1) * 3, 1);
  const qEnd   = new Date(currentYear, currentQuarter * 3, 1);

  const [users, pitstops, activities, planItems] = await Promise.all([
    // All users (for manager person picker)
    prisma.user.findMany({
      select: { id: true, name: true, image: true, email: true },
      orderBy: { name: "asc" },
    }),

    // Pitstops active in this quarter for current user
    prisma.pitstop.findMany({
      where: {
        deletedAt: null,
        goal: { deletedAt: null },
        ownerId: currentUserId,
        OR: [
          { startDate:  { gte: qStart, lt: qEnd } },
          { targetDate: { gte: qStart, lt: qEnd } },
          // pitstops that span the quarter (start before, end after)
          { startDate: { lt: qEnd }, targetDate: { gte: qStart } },
        ],
      },
      select: {
        id: true, title: true, status: true, type: true,
        startDate: true, targetDate: true,
        goal: { select: { id: true, title: true } },
        owner: { select: { id: true, name: true, image: true } },
      },
    }),

    // Activities for current user in this quarter
    prisma.pitstopEvent.findMany({
      where: {
        deletedAt: null,
        scheduledAt: { gte: qStart, lt: qEnd },
        attendees: { some: { userId: currentUserId } },
      },
      select: {
        id: true, title: true, type: true, scheduledAt: true, location: true,
        pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } } } },
        attendees: { select: { userId: true, user: { select: { id: true, name: true, image: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
    }),

    // Plan items for current user in this quarter
    prisma.planItem.findMany({
      where: {
        userId: currentUserId,
        deletedAt: null,
        date: { gte: qStart, lt: qEnd },
      },
      include: {
        pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } } } },
      },
      orderBy: { date: "asc" },
    }),

    // All pitstops for person picker (manager needs to load on switch)
  ]);

  // All pitstops (for the dropdown when adding plan items)
  const allPitstops = await prisma.pitstop.findMany({
    where: { deletedAt: null, goal: { deletedAt: null } },
    select: {
      id: true, title: true,
      goal: { select: { id: true, title: true } },
      owner: { select: { id: true, name: true } },
    },
    orderBy: [{ goal: { title: "asc" } }, { order: "asc" }],
  });

  return (
    <PlannerView
      currentUserId={currentUserId}
      initialYear={currentYear}
      initialQuarter={currentQuarter}
      users={JSON.parse(JSON.stringify(users))}
      initialPitstops={JSON.parse(JSON.stringify(pitstops))}
      initialActivities={JSON.parse(JSON.stringify(activities))}
      initialPlanItems={JSON.parse(JSON.stringify(planItems))}
      allPitstops={JSON.parse(JSON.stringify(allPitstops))}
    />
  );
}
