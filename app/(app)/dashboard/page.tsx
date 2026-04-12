import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import GoalsDashboard from "./GoalsDashboard";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  const session = await auth();
  const { q, tab } = await searchParams;

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [goals, users, programs, overviewData] = await Promise.all([
    prisma.goal.findMany({
      where: { deletedAt: null },
      include: {
        owner: { select: { id: true, name: true, image: true } },
        pitstops: { where: { deletedAt: null }, select: { id: true, status: true } },
        programs: { include: { program: { select: { id: true, title: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.user.findMany({ select: { id: true, name: true, image: true }, orderBy: { name: "asc" } }),
    prisma.program.findMany({ where: { deletedAt: null }, select: { id: true, title: true }, orderBy: { title: "asc" } }),

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

      // Clusters with tagged goals
      prisma.cluster.findMany({
        select: {
          id: true, name: true,
          zone: { select: { name: true } },
          goals: {
            where: { goal: { deletedAt: null } },
            select: {
              goal: {
                select: {
                  id: true,
                  pitstops: {
                    where: { deletedAt: null },
                    select: { id: true, status: true },
                  },
                },
              },
            },
          },
        },
      }),

      // Zones with tagged goals
      prisma.zone.findMany({
        select: {
          id: true, name: true,
          goals: {
            where: { goal: { deletedAt: null } },
            select: {
              goal: {
                select: {
                  id: true,
                  pitstops: {
                    where: { deletedAt: null },
                    select: { id: true, status: true },
                  },
                },
              },
            },
          },
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
    ]).then(([overduePitstops, inProgressPitstops, workloadRaw, doneThisMonth, clusters, zones, recentActivity]) => ({
      overduePitstops,
      inProgressPitstops,
      workloadRaw,
      doneThisMonth,
      clusters,
      zones,
      recentActivity,
    })),
  ]);

  let searchResults = null;
  if (q?.trim()) {
    const [matchingGoals, matchingPitstops] = await Promise.all([
      prisma.goal.findMany({
        where: {
          deletedAt: null,
          OR: [{ title: { contains: q } }, { description: { contains: q } }],
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
      currentUserId={session!.user!.id!}
      searchResults={searchResults ? JSON.parse(JSON.stringify(searchResults)) : null}
      users={users}
      programs={programs}
      overviewData={JSON.parse(JSON.stringify(overviewData))}
      initialTab={(tab === "overview" ? "overview" : "goals") as "overview" | "goals"}
    />
  );
}
