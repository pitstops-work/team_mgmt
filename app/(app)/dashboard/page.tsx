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
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7); weekStart.setHours(0, 0, 0, 0);

  const currentUserId = session!.user!.id!;
  const me = await prisma.user.findUnique({ where: { id: currentUserId }, select: { cityId: true, designation: true, role: true } });
  const designation = me?.designation ?? "Other";
  const isSuperAdmin = (session as { user?: { role?: string } } | null)?.user?.role === "super-admin";

  // Build team ID scope for RP/ZL/PM
  let teamIds: string[] = [currentUserId];
  if (designation === "ZL") {
    const team = await prisma.user.findMany({ where: { reportsToId: currentUserId }, select: { id: true } });
    teamIds = [currentUserId, ...team.map(m => m.id)];
  } else if (designation === "PM") {
    const zls = await prisma.user.findMany({ where: { reportsToId: currentUserId }, select: { id: true } });
    const zlIds = zls.map(m => m.id);
    const rps = zlIds.length > 0
      ? await prisma.user.findMany({ where: { reportsToId: { in: zlIds } }, select: { id: true } })
      : [];
    teamIds = [currentUserId, ...zlIds, ...rps.map(m => m.id)];
  }
  const isScoped = designation === "RP" || designation === "ZL" || designation === "PM";
  // Super admin: no filters. Scoped roles: owner filter only (cityFilter is redundant when scoped by owner).
  // Leader/Other: city filter only.
  const ownerFilter = isScoped ? { ownerId: { in: teamIds } } : {};
  const cityFilter = (isSuperAdmin || isScoped) ? {} : goalCityFilter(me?.cityId);

  const [goals, users, programs, threads, myPitstops, overviewData] = await Promise.all([
    prisma.goal.findMany({
      where: { deletedAt: null, ...cityFilter, ...ownerFilter },
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
    prisma.user.findMany({
      where: isScoped ? { id: { in: teamIds } } : {},
      select: { id: true, name: true, image: true, designation: true, reportsToId: true },
      orderBy: { name: "asc" },
    }),
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
      // Overdue pitstops (scoped to team for RP/ZL)
      prisma.pitstop.findMany({
        where: {
          deletedAt: null,
          status: { in: ["Upcoming", "InProgress"] },
          targetDate: { lt: todayStart },
          goal: { deletedAt: null },
          ...ownerFilter,
        },
        select: {
          id: true, title: true, status: true, targetDate: true,
          goal: { select: { id: true, title: true } },
          owner: { select: { id: true, name: true, image: true } },
        },
        orderBy: { targetDate: "asc" },
        take: 20,
      }),

      // InProgress pitstops with checklist items (scoped to team)
      prisma.pitstop.findMany({
        where: { deletedAt: null, status: "InProgress", goal: { deletedAt: null }, ...ownerFilter },
        select: {
          id: true, title: true, targetDate: true,
          goal: { select: { id: true, title: true } },
          owner: { select: { id: true, name: true, image: true } },
          checklistItems: { select: { id: true, checked: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 30,
      }),

      // Pitstop workload detail per user — replaces groupBy, enables drill-down + stalled detection
      prisma.pitstop.findMany({
        where: {
          deletedAt: null,
          ownerId: isScoped ? { in: teamIds } : { not: null },
          status: { in: ["Upcoming", "InProgress"] },
          goal: { deletedAt: null },
        },
        select: {
          id: true, title: true, status: true, targetDate: true, ownerId: true, updatedAt: true,
          goal: { select: { id: true, title: true } },
          checklistItems: { select: { id: true, checked: true } },
        },
        orderBy: [{ status: "desc" }, { targetDate: "asc" }],
      }),

      // Done pitstops this month (scoped to team for RP/ZL)
      prisma.pitstop.count({
        where: {
          deletedAt: null,
          status: "Done",
          completedAt: { gte: monthStart },
          goal: { deletedAt: null },
          ...ownerFilter,
        },
      }),

      // Clusters — scoped to ZL's zone, all for others
      prisma.cluster.findMany({
        where: designation === "ZL" ? { zone: { leadId: currentUserId } } : {},
        select: { id: true, name: true, zone: { select: { name: true } } },
      }),

      // Zones — scoped to ZL's assigned zone, all for others
      prisma.zone.findMany({
        where: designation === "ZL" ? { leadId: currentUserId } : {},
        select: { id: true, name: true },
      }),

      // Goals with geo FKs + pitstops (scoped to team for RP/ZL)
      prisma.goal.findMany({
        where: { deletedAt: null, ...cityFilter, ...ownerFilter },
        select: {
          id: true, needsClusterId: true, needsZoneId: true,
          pitstops: { where: { deletedAt: null }, select: { id: true, status: true } },
        },
      }),

      // Recent activity feed — scoped to team for RP/ZL
      prisma.auditLog.findMany({
        where: {
          action: "status_change",
          entityType: "Pitstop",
          ...(isScoped ? { userId: { in: teamIds } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          id: true, entityId: true, oldValue: true, newValue: true, createdAt: true,
          user: { select: { id: true, name: true, image: true } },
        },
      }),

      // Checklist items completed this week per pitstop owner
      prisma.checklistItem.findMany({
        where: {
          checked: true,
          updatedAt: { gte: weekStart },
          pitstop: {
            deletedAt: null,
            goal: { deletedAt: null },
            ...(isScoped ? { ownerId: { in: teamIds } } : {}),
          },
        },
        select: { pitstop: { select: { ownerId: true } } },
      }),
    ]).then(([overduePitstops, inProgressPitstops, pitstopWorkloadDetail, doneThisMonth, rawClusters, rawZones, goalGeo, recentActivity, rawClWeekly]) => {
      const clusters = rawClusters.map(c => ({
        ...c,
        goals: goalGeo.filter(g => g.needsClusterId === c.id).map(g => ({ goal: { id: g.id, pitstops: g.pitstops } })),
      }));
      const zones = rawZones.map(z => ({
        ...z,
        goals: goalGeo.filter(g => g.needsZoneId === z.id).map(g => ({ goal: { id: g.id, pitstops: g.pitstops } })),
      }));
      const weeklyMap: Record<string, number> = {};
      rawClWeekly.forEach(item => {
        const uid = item.pitstop.ownerId;
        if (uid) weeklyMap[uid] = (weeklyMap[uid] ?? 0) + 1;
      });
      const clCompletionsThisWeek = Object.entries(weeklyMap).map(([ownerId, count]) => ({ ownerId, count }));
      return { overduePitstops, inProgressPitstops, pitstopWorkloadDetail, clCompletionsThisWeek, doneThisMonth, clusters, zones, recentActivity };
    }),
  ]);

  // Phase data — scoped to match the goals query above so counts stay consistent
  const goalIdSet = new Set(goals.map(g => g.id));
  const phaseRowsRaw = await prisma.$queryRaw<{
    id: string; goalId: string; goalTitle: string; title: string; progressTag: string | null; status: string;
    targetDate: Date | null; startDate: Date | null;
    ownerId: string | null; ownerName: string | null; ownerDesignation: string | null;
    checklistTotal: bigint; checklistDone: bigint;
    activityTotal: bigint; activityDone: bigint;
  }[]>`
    SELECT
      p.id, p."goalId", g.title AS "goalTitle", p.title, p."progressTag", p.status::text,
      p."targetDate", p."startDate",
      p."ownerId", u.name AS "ownerName", u.designation AS "ownerDesignation",
      COALESCE(cl."checklistTotal", 0) AS "checklistTotal",
      COALESCE(cl."checklistDone", 0) AS "checklistDone",
      COALESCE(act."activityTotal", 0) AS "activityTotal",
      COALESCE(act."activityDone", 0) AS "activityDone"
    FROM "Pitstop" p
    JOIN "Goal" g ON p."goalId" = g.id
    LEFT JOIN "User" u ON p."ownerId" = u.id
    LEFT JOIN (
      SELECT "pitstopId",
        COUNT(*) AS "checklistTotal",
        COUNT(*) FILTER (WHERE status = 'Done'::"ChecklistItemStatus") AS "checklistDone"
      FROM "ChecklistItem"
      GROUP BY "pitstopId"
    ) cl ON cl."pitstopId" = p.id
    LEFT JOIN (
      SELECT pep."pitstopId",
        COUNT(DISTINCT pe.id) AS "activityTotal",
        COUNT(DISTINCT pe.id) FILTER (WHERE pe.status = 'Done'::"PitstopEventStatus") AS "activityDone"
      FROM "PitstopEventPitstop" pep
      JOIN "PitstopEvent" pe ON pe.id = pep."eventId" AND pe."deletedAt" IS NULL
      GROUP BY pep."pitstopId"
    ) act ON act."pitstopId" = p.id
    WHERE p."deletedAt" IS NULL AND g."deletedAt" IS NULL
  `;
  const phaseRows = phaseRowsRaw
    .filter(r => goalIdSet.has(r.goalId))
    .map(r => ({
      ...r,
      targetDate: r.targetDate ? r.targetDate.toISOString() : null,
      startDate:  r.startDate  ? r.startDate.toISOString()  : null,
      checklistTotal: Number(r.checklistTotal),
      checklistDone:  Number(r.checklistDone),
      activityTotal:  Number(r.activityTotal),
      activityDone:   Number(r.activityDone),
    }));

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
      currentUserRole={me?.role ?? session?.user?.role ?? "member"}
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
