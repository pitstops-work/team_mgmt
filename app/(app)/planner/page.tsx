import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import PlannerView from "./PlannerView";

export default async function PlannerPage() {
  const session = await auth();
  const currentUserId = session!.user!.id!;

  const now = new Date();
  const m = now.getMonth(); // 0-indexed
  // FY Q1=Apr–Jun(3–5), Q2=Jul–Sep(6–8), Q3=Oct–Dec(9–11), Q4=Jan–Mar(0–2)
  const currentQuarter = m >= 3 && m <= 5 ? 1 : m >= 6 && m <= 8 ? 2 : m >= 9 ? 3 : 4;
  // FY year = calendar year of April (start of FY). Jan–Mar belong to previous FY year.
  const currentYear = m < 3 ? now.getFullYear() - 1 : now.getFullYear();

  // Quarter date range for initial load
  const FY_QUARTER_START_MONTH = [3, 6, 9, 0];
  const startMonth = FY_QUARTER_START_MONTH[currentQuarter - 1];
  const startYear  = currentQuarter === 4 ? currentYear + 1 : currentYear;
  const qStart = new Date(startYear, startMonth, 1);
  const qEnd   = new Date(startYear, startMonth + 3, 1);

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
        id: true, title: true, type: true, scheduledAt: true, endsAt: true, location: true,
        pitstops: { select: { pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } } } } } },
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
