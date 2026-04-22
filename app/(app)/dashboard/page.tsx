import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import GoalsDashboard from "./GoalsDashboard";
import { goalCityFilter } from "@/lib/goalCityFilter";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string; filter?: string }>;
}) {
  const session = await auth();
  const { q, tab, filter } = await searchParams;

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const currentUserId = session!.user!.id!;
  const me = await prisma.user.findUnique({ where: { id: currentUserId }, select: { cityId: true, designation: true } });
  const cityFilter = goalCityFilter(me?.cityId);

  const [goals, users, programs, threads, myPitstops, overviewData] = await Promise.all([
    prisma.goal.findMany({
      where: { deletedAt: null, ...cityFilter },
      include: {
        owner: { select: { id: true, name: true, image: true } },
        pitstops: { where: { deletedAt: null }, select: { id: true, status: true } },
        programs: { include: { program: { select: { id: true, title: true } } } },
        needsCity: { select: { id: true, name: true } },
        needsZone: { select: { id: true, name: true, city: { select: { id: true, name: true } } } },
        needsCluster: { select: { id: true, name: true, zone: { select: { id: true, name: true, city: { select: { id: true, name: true } } } } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.user.findMany({ select: { id: true, name: true, image: true, designation: true }, orderBy: { name: "asc" } }),
    prisma.program.findMany({ where: { deletedAt: null }, select: { id: true, title: true }, orderBy: { title: "asc" } }),

    // Threads for home tile grid — only threads relevant to current user
    prisma.thread.findMany({
      where: {
        deletedAt: null,
        OR: [
          { pitstop: { deletedAt: null, goal: { deletedAt: null } } },
          { goalId: { not: null } },
          { eventId: { not: null } },
        ],
        AND: [{
          OR: [
            { goal: { ownerId: currentUserId } },
            { pitstop: { ownerId: currentUserId } },
            { messages: { some: { authorId: currentUserId, deletedAt: null } } },
            { subscriptions: { some: { userId: currentUserId } } },
          ],
        }],
      },
      select: {
        id: true, name: true, updatedAt: true,
        pitstopId: true, goalId: true, eventId: true,
        pitstop: {
          select: {
            id: true, title: true,
            goal: { select: { id: true, title: true, needsDomain: true, needsZoneId: true, needsClusterId: true } },
            owner: { select: { id: true, name: true, image: true } },
          },
        },
        goal: {
          select: {
            id: true, title: true, needsDomain: true, needsZoneId: true, needsClusterId: true,
            owner: { select: { id: true, name: true, image: true } },
          },
        },
        event: {
          select: {
            id: true, title: true, scheduledAt: true,
            pitstops: {
              take: 1,
              select: { pitstop: { select: { goal: { select: { id: true, title: true, needsDomain: true, needsZoneId: true, needsClusterId: true } } } } },
            },
          },
        },
        _count: { select: { messages: { where: { deletedAt: null } } } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, createdAt: true, author: { select: { name: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),

    // Current user's active pitstops
    prisma.pitstop.findMany({
      where: {
        deletedAt: null,
        ownerId: currentUserId,
        status: { in: ["Upcoming", "InProgress"] },
        goal: { deletedAt: null },
      },
      select: {
        id: true, title: true, status: true, targetDate: true,
        goal: { select: { id: true, title: true } },
        checklistItems: { select: { id: true, checked: true } },
      },
      orderBy: [{ status: "desc" }, { targetDate: "asc" }],
      take: 10,
    }),

    // Overview data — all fetched in parallel
    Promise.all([
      // Overdue pitstops (all team)
      prisma.pitstop.findMany({
        where: {
          deletedAt: null,
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
        take: 20,
      }),

      // InProgress pitstops with checklist items
      prisma.pitstop.findMany({
        where: { deletedAt: null, status: "InProgress", goal: { deletedAt: null } },
        select: {
          id: true, title: true, targetDate: true,
          goal: { select: { id: true, title: true } },
          owner: { select: { id: true, name: true, image: true } },
          checklistItems: { select: { id: true, checked: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 30,
      }),

      // Pitstop workload per user
      prisma.pitstop.groupBy({
        by: ["ownerId", "status"],
        where: {
          deletedAt: null,
          ownerId: { not: null },
          status: { in: ["Upcoming", "InProgress"] },
          goal: { deletedAt: null },
        },
        _count: { id: true },
      }),

      // Done pitstops this month
      prisma.pitstop.count({
        where: {
          deletedAt: null,
          status: "Done",
          completedAt: { gte: monthStart },
          goal: { deletedAt: null },
        },
      }),

      // Clusters (goals attached via direct FK on Goal)
      prisma.cluster.findMany({
        select: { id: true, name: true, zone: { select: { name: true } } },
      }),

      // Zones (goals attached via direct FK on Goal)
      prisma.zone.findMany({
        select: { id: true, name: true },
      }),

      // Goals with geo FKs + pitstops (for cluster/zone performance)
      prisma.goal.findMany({
        where: { deletedAt: null, ...cityFilter },
        select: {
          id: true, needsClusterId: true, needsZoneId: true,
          pitstops: { where: { deletedAt: null }, select: { id: true, status: true } },
        },
      }),

      // Recent activity feed (status changes)
      prisma.auditLog.findMany({
        where: { action: "status_change", entityType: "Pitstop" },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          id: true, entityId: true, oldValue: true, newValue: true, createdAt: true,
          user: { select: { id: true, name: true, image: true } },
        },
      }),
    ]).then(([overduePitstops, inProgressPitstops, workloadRaw, doneThisMonth, rawClusters, rawZones, goalGeo, recentActivity]) => {
      // Build the same { goals: { goal: { id, pitstops } }[] } shape OrgOverview expects
      const clusters = rawClusters.map(c => ({
        ...c,
        goals: goalGeo.filter(g => g.needsClusterId === c.id).map(g => ({ goal: { id: g.id, pitstops: g.pitstops } })),
      }));
      const zones = rawZones.map(z => ({
        ...z,
        goals: goalGeo.filter(g => g.needsZoneId === z.id).map(g => ({ goal: { id: g.id, pitstops: g.pitstops } })),
      }));
      return { overduePitstops, inProgressPitstops, workloadRaw, doneThisMonth, clusters, zones, recentActivity };
    }),
  ]);

  // Phase data — raw SQL because progressTag is a new column
  const phaseRows = await prisma.$queryRaw<{ goalId: string; progressTag: string | null; status: string }[]>`
    SELECT p."goalId", p."progressTag", p.status::text
    FROM "Pitstop" p
    JOIN "Goal" g ON p."goalId" = g.id
    WHERE p."deletedAt" IS NULL AND g."deletedAt" IS NULL
  `;

  let searchResults = null;
  if (q?.trim()) {
    const [matchingGoals, matchingPitstops] = await Promise.all([
      prisma.goal.findMany({
        where: {
          deletedAt: null,
          AND: [
            ...(me?.cityId ? [cityFilter] : []),
            { OR: [{ title: { contains: q } }, { description: { contains: q } }] },
          ],
        },
        include: { owner: { select: { id: true, name: true, image: true } }, pitstops: { where: { deletedAt: null }, select: { id: true, status: true } } },
        take: 10,
      }),
      prisma.pitstop.findMany({
        where: {
          deletedAt: null,
          OR: [{ title: { contains: q } }, { notes: { contains: q } }],
        },
        include: { goal: { select: { id: true, title: true } } },
        take: 10,
      }),
    ]);
    searchResults = { query: q, goals: matchingGoals, pitstops: matchingPitstops };
  }

  return (
    <GoalsDashboard
      initialGoals={JSON.parse(JSON.stringify(goals))}
      currentUserId={currentUserId}
      currentUserDesignation={me?.designation ?? "Other"}
      searchResults={searchResults ? JSON.parse(JSON.stringify(searchResults)) : null}
      users={users}
      programs={programs}
      threads={JSON.parse(JSON.stringify(threads))}
      myPitstops={JSON.parse(JSON.stringify(myPitstops))}
      overviewData={JSON.parse(JSON.stringify(overviewData))}
      phaseData={JSON.parse(JSON.stringify(phaseRows))}
      initialTab={(tab === "home" || tab === "goals" || tab === "team" || tab === "phase" ? tab : "home") as "home" | "goals" | "team" | "phase"}
      initialFilter={(["All","Mine","Active","Paused","Complete"].includes(filter ?? "") ? filter : "All") as "All" | "Mine" | "Active" | "Paused" | "Complete"}
    />
  );
}
