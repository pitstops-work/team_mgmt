import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import HomeView from "./HomeView";

function getWeekBounds(now: Date) {
  const s = new Date(now);
  const day = s.getDay();
  s.setDate(s.getDate() - (day + 6) % 7);
  s.setHours(0, 0, 0, 0);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return { weekStart: s, weekEnd: e };
}

type GoalRow = {
  id: string;
  title: string;
  status: string;
  needsDomain: string | null;
  needsClusterId: string | null;
  parameter: number | null;
  outcomeCount: number | null;
  ownerId: string | null;
  owner: { id: string; name: string | null } | null;
  pitstops: { id: string; status: string }[];
};

export type DomainStat = { domain: string; label: string; planned: number; done: number; gap: number; goalCount: number; doneGoalCount: number; hasParams: boolean };

function computeDomainStats(goals: Pick<GoalRow, "needsDomain" | "status" | "parameter" | "outcomeCount">[], domainLabels: Record<string, string>): DomainStat[] {
  const stats: Record<string, { planned: number; done: number; goalCount: number; doneGoalCount: number }> = {};
  for (const g of goals) {
    if (!g.needsDomain) continue;
    if (!stats[g.needsDomain]) stats[g.needsDomain] = { planned: 0, done: 0, goalCount: 0, doneGoalCount: 0 };
    if (g.status === "Complete") {
      stats[g.needsDomain].done += g.outcomeCount ?? g.parameter ?? 0;
      stats[g.needsDomain].doneGoalCount++;
    } else if (g.status !== "Cancelled") {
      stats[g.needsDomain].planned += g.parameter ?? 0;
      stats[g.needsDomain].goalCount++;
    }
  }
  return Object.entries(stats)
    .map(([domain, { planned, done, goalCount, doneGoalCount }]) => {
      const hasParams = planned > 0 || done > 0;
      const effectivePlanned = hasParams ? planned : goalCount;
      const effectiveDone   = hasParams ? done   : doneGoalCount;
      return {
        domain,
        label: domainLabels[domain] ?? domain,
        planned: effectivePlanned,
        done:    effectiveDone,
        gap:     Math.max(0, effectivePlanned - effectiveDone),
        goalCount,
        doneGoalCount,
        hasParams,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export type ClusterStat = { clusterId: string; clusterName: string; stats: DomainStat[] };

export type ClusterStatus = {
  clusterId: string;
  name: string;
  goalCount: number;
  pitstopCount: number;
  activityCount: number;
  checklistCount: number;
};

// ── Admin dashboard types ─────────────────────────────────────────────────────

export type AdminKPIs = {
  activeGoals: number;
  pausedGoals: number;
  completeGoals: number;
  overduepitstops: number;
  doneThisMonth: number;
  activitiesThisWeek: number;
  totalUsers: number;
};

export type AdminZone = {
  id: string;
  name: string;
  leadName: string | null;
  cityName: string | null;
  activeGoals: number;
  clusters: { id: string; name: string; activeGoals: number; settlements: { id: string; name: string }[] }[];
};

export type AdminUser = {
  id: string;
  name: string | null;
  designation: string;
  reportsToId: string | null;
  activeGoals: number;
  openPitstops: number;
};

export type AdminGoal = {
  id: string;
  title: string;
  status: string;
  needsDomain: string | null;
  needsClusterId: string | null;
  ownerId: string | null;
  owner: { id: string; name: string | null; designation: string | null } | null;
  pitstops: { id: string; status: string }[];
};

export type OverduePitstop = {
  id: string;
  title: string;
  targetDate: string | null;
  status: string;
  goal: { id: string; title: string };
  owner: { name: string | null } | null;
};

export type AdminDash = {
  kpis: AdminKPIs;
  pitstopByStatus: { status: string; count: number }[];
  goalByStatus: { status: string; count: number }[];
  zones: AdminZone[];
  users: AdminUser[];
  goals: AdminGoal[];
  domainStats: DomainStat[];
  domainConfigs: { domain: string; label: string }[];
  overdueList: OverduePitstop[];
  doneThisMonthList: OverduePitstop[];
  upcoming: { id: string; title: string; type: string; scheduledAt: string; location: string | null; attendees: { user: { name: string | null } }[] }[];
};

export default async function HomePage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const { weekStart, weekEnd } = getWeekBounds(now);

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, designation: true },
  });
  const designation = me?.designation ?? "Other";
  // Use session role — auth stamps super-admin by ADMIN_EMAIL, which may differ from DB value
  const isSuperAdmin = (session as { user?: { role?: string } } | null)?.user?.role === "super-admin";

  // Team IDs: ZL includes her reports
  let teamIds: string[] = [userId];
  let teamMembers: { id: string; name: string | null; image: string | null }[] = [];
  if (designation === "ZL") {
    teamMembers = await prisma.user.findMany({
      where: { reportsToId: userId },
      select: {
        id: true, name: true, image: true,
        rpClusters: { where: { deletedAt: null }, select: { id: true, name: true } },
      },
    });
    teamIds = [userId, ...teamMembers.map(m => m.id)];
  }

  const isScoped = designation === "RP" || designation === "ZL";

  const [
    todayActivities,
    weekActivities,
    weekChecklists,
    myGoals,
    domainConfigs,
    myZone,
    rpOverdueActivities,
    rpDoneActivities,
    zlOverdueActivities,
    zlMyActivities,
  ] = await Promise.all([
    prisma.pitstopEvent.findMany({
      where: {
        deletedAt: null,
        scheduledAt: { gte: todayStart, lte: todayEnd },
        ...(isScoped ? {
          OR: [
            { attendees: { some: { userId } } },
            { pitstops: { some: { pitstop: { ownerId: userId, deletedAt: null } } } },
          ],
        } : {}),
      },
      select: {
        id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
        attendees: { select: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
    }),

    prisma.pitstopEvent.findMany({
      where: {
        deletedAt: null,
        scheduledAt: { gte: weekStart, lte: weekEnd },
        ...(isScoped ? {
          OR: [
            { attendees: { some: { userId: { in: teamIds } } } },
            // Also include events on pitstops owned by this RP/ZL
            { pitstops: { some: { pitstop: { ownerId: { in: teamIds }, deletedAt: null } } } },
          ],
        } : {}),
      },
      select: {
        id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
        attendees: { select: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
    }),

    prisma.checklistItem.findMany({
      where: {
        status: { notIn: ["Done", "Cancelled"] },
        pitstop: {
          ...(isScoped ? { ownerId: { in: teamIds } } : {}),
          deletedAt: null,
          goal: { deletedAt: null },
        },
      },
      select: {
        id: true, text: true, status: true, checked: true,
        completionType: true,
        activities: {
          where: { status: { notIn: ["Cancelled", "Done"] } },
          select: { id: true, title: true, status: true, scheduledAt: true, type: true },
          orderBy: { scheduledAt: "asc" },
          take: 1,
        },
        pitstop: {
          select: {
            id: true, title: true, targetDate: true, status: true,
            ownerId: true,
            owner: { select: { id: true, name: true } },
            goal: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { order: "asc" },
      take: 200,
    }),

    prisma.goal.findMany({
      where: { deletedAt: null, ...(isScoped ? { ownerId: { in: teamIds } } : {}) },
      select: {
        id: true, title: true, status: true, needsDomain: true,
        needsClusterId: true, needsZoneId: true,
        parameter: true, outcomeCount: true,
        ownerId: true,
        owner: { select: { id: true, name: true } },
        pitstops: { where: { deletedAt: null }, select: { id: true, status: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),

    prisma.needsFormulaConfig.findMany({
      where: { isActive: true },
      select: { domain: true, label: true },
      orderBy: { sortOrder: "asc" },
    }),

    designation === "ZL"
      ? prisma.zone.findFirst({
          where: { leadId: userId, deletedAt: null },
          select: {
            id: true, name: true,
            clusters: {
              where: { deletedAt: null },
              orderBy: { name: "asc" },
              select: { id: true, name: true },
            },
          },
        })
      : Promise.resolve(null),

    // RP only: past-due events still in Scheduled status
    designation === "RP"
      ? prisma.pitstopEvent.findMany({
          where: {
            deletedAt: null,
            status: "Scheduled",
            scheduledAt: { lt: todayStart },
            OR: [
              { attendees: { some: { userId } } },
              { pitstops: { some: { pitstop: { ownerId: userId, deletedAt: null } } } },
            ],
          },
          select: {
            id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
            attendees: { select: { user: { select: { id: true, name: true } } } },
          },
          orderBy: { scheduledAt: "asc" },
          take: 20,
        })
      : Promise.resolve([]),

    // RP only: past events already marked Done (so RP can see what they've updated)
    designation === "RP"
      ? prisma.pitstopEvent.findMany({
          where: {
            deletedAt: null,
            status: "Done",
            scheduledAt: { lt: todayStart },
            OR: [
              { attendees: { some: { userId } } },
              { pitstops: { some: { pitstop: { ownerId: userId, deletedAt: null } } } },
            ],
          },
          select: {
            id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
            attendees: { select: { user: { select: { id: true, name: true } } } },
          },
          orderBy: { scheduledAt: "desc" },
          take: 50,
        })
      : Promise.resolve([]),

    // ZL only: team overdue activities (past Scheduled, owned by any team member)
    designation === "ZL"
      ? prisma.pitstopEvent.findMany({
          where: {
            deletedAt: null,
            status: "Scheduled",
            scheduledAt: { lt: todayStart },
            pitstops: { some: { pitstop: { ownerId: { in: teamIds }, deletedAt: null } } },
          },
          select: {
            id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
            attendees: { select: { user: { select: { id: true, name: true } } } },
            pitstops: {
              where: { pitstop: { ownerId: { in: teamIds }, deletedAt: null } },
              select: {
                pitstop: {
                  select: {
                    ownerId: true, targetDate: true,
                    goal: { select: { id: true, title: true, needsClusterId: true } },
                  },
                },
              },
              take: 1,
            },
          },
          orderBy: { scheduledAt: "asc" },
          take: 150,
        })
      : Promise.resolve([]),

    // ZL only: own upcoming scheduled activities (today + this week) with goal/cluster context
    designation === "ZL"
      ? prisma.pitstopEvent.findMany({
          where: {
            deletedAt: null,
            status: "Scheduled",
            scheduledAt: { gte: todayStart, lte: weekEnd },
            pitstops: { some: { pitstop: { ownerId: userId, deletedAt: null } } },
          },
          select: {
            id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
            attendees: { select: { user: { select: { id: true, name: true } } } },
            pitstops: {
              where: { pitstop: { ownerId: userId, deletedAt: null } },
              select: {
                pitstop: {
                  select: {
                    ownerId: true, targetDate: true,
                    goal: { select: { id: true, title: true, needsClusterId: true } },
                  },
                },
              },
              take: 1,
            },
          },
          orderBy: { scheduledAt: "asc" },
          take: 100,
        })
      : Promise.resolve([]),
  ]);

  const domainLabels = Object.fromEntries(domainConfigs.map(d => [d.domain, d.label ?? d.domain]));

  // ── RP: per-cluster domain stats ──────────────────────────────────────────
  let rpClusterStats: ClusterStat[] = [];
  if (designation === "RP") {
    const assignedClusters = await prisma.cluster.findMany({
      where: { rps: { some: { id: userId } }, deletedAt: null },
      select: { id: true, name: true },
    });
    if (assignedClusters.length > 0) {
      const assignedClusterIds = assignedClusters.map(c => c.id);
      const clusterGoals = await prisma.goal.findMany({
        where: { deletedAt: null, needsClusterId: { in: assignedClusterIds } },
        select: { needsDomain: true, needsClusterId: true, status: true, parameter: true, outcomeCount: true },
      });
      rpClusterStats = assignedClusters.map(c => ({
        clusterId: c.id,
        clusterName: c.name,
        stats: computeDomainStats(clusterGoals.filter(g => g.needsClusterId === c.id), domainLabels),
      }));
    }
  }

  // ── ZL: per-cluster domain stats + cluster status ─────────────────────────
  let zlClusterStats: ClusterStat[] = [];
  let clusterStatus: ClusterStatus[] = [];

  if (designation === "ZL" && myZone) {
    const clusterIds = myZone.clusters.map(c => c.id);

    const [zoneGoals, clusterPitstops, clusterActivities, clusterChecklists] = await Promise.all([
      prisma.goal.findMany({
        where: { deletedAt: null, needsClusterId: { in: clusterIds } },
        select: { needsDomain: true, needsClusterId: true, status: true, parameter: true, outcomeCount: true },
      }),
      prisma.pitstop.findMany({
        where: {
          deletedAt: null,
          status: { in: ["Upcoming", "InProgress"] },
          goal: { deletedAt: null, needsClusterId: { in: clusterIds } },
        },
        select: { id: true, goal: { select: { needsClusterId: true } } },
      }),
      prisma.pitstopEvent.findMany({
        where: {
          deletedAt: null,
          scheduledAt: { gte: weekStart, lte: weekEnd },
          pitstops: { some: { pitstop: { goal: { needsClusterId: { in: clusterIds } } } } },
        },
        select: {
          id: true,
          pitstops: { select: { pitstop: { select: { goal: { select: { needsClusterId: true } } } } } },
        },
      }),
      prisma.checklistItem.findMany({
        where: {
          status: { notIn: ["Done", "Cancelled"] },
          pitstop: { deletedAt: null, goal: { deletedAt: null, needsClusterId: { in: clusterIds } } },
        },
        select: { id: true, pitstop: { select: { goal: { select: { needsClusterId: true } } } } },
      }),
    ]);

    zlClusterStats = myZone.clusters.map(c => ({
      clusterId: c.id,
      clusterName: c.name,
      stats: computeDomainStats(zoneGoals.filter(g => g.needsClusterId === c.id), domainLabels),
    }));

    const activeGoalsByCluster: Record<string, number> = {};
    for (const g of zoneGoals.filter(g => g.status !== "Complete" && g.status !== "Paused")) {
      if (g.needsClusterId) activeGoalsByCluster[g.needsClusterId] = (activeGoalsByCluster[g.needsClusterId] ?? 0) + 1;
    }

    clusterStatus = myZone.clusters.map(c => ({
      clusterId: c.id,
      name: c.name,
      goalCount: activeGoalsByCluster[c.id] ?? 0,
      pitstopCount: clusterPitstops.filter(p => p.goal.needsClusterId === c.id).length,
      activityCount: clusterActivities.filter(a =>
        a.pitstops.some(ep => ep.pitstop.goal.needsClusterId === c.id)
      ).length,
      checklistCount: clusterChecklists.filter(ci =>
        ci.pitstop.goal.needsClusterId === c.id
      ).length,
    }));
  }

  // ── Admin pilot dashboard data ────────────────────────────────────────────
  let adminDash: AdminDash | null = null;

  if (isSuperAdmin || designation === "Leader") {
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const [
      goalGroups,
      pitstopGroups,
      overdueCount,
      doneThisMonthCount,
      activitiesThisWeekCount,
      totalUsersCount,
      zonesRaw,
      usersRaw,
      adminGoalsRaw,
      overdueListRaw,
      doneThisMonthListRaw,
      upcomingListRaw,
      openPitstopsRaw,
    ] = await Promise.all([
      prisma.goal.groupBy({ by: ["status"], _count: { id: true }, where: { deletedAt: null } }),
      prisma.pitstop.groupBy({ by: ["status"], _count: { id: true }, where: { deletedAt: null } }),
      prisma.pitstop.count({ where: { deletedAt: null, targetDate: { lt: todayStart }, status: { in: ["Upcoming", "InProgress"] } } }),
      prisma.pitstop.count({ where: { deletedAt: null, completedAt: { gte: monthStart } } }),
      prisma.pitstopEvent.count({ where: { deletedAt: null, scheduledAt: { gte: weekStart, lte: weekEnd } } }),
      prisma.user.count(),
      prisma.zone.findMany({
        where: { deletedAt: null },
        select: {
          id: true, name: true, leadId: true,
          lead: { select: { name: true } },
          city: { select: { name: true } },
          clusters: {
          where: { deletedAt: null },
          orderBy: { name: "asc" },
          select: {
            id: true, name: true,
            settlements: { where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } },
          },
        },
        },
        orderBy: { name: "asc" },
      }),
      prisma.user.findMany({
        select: { id: true, name: true, designation: true, reportsToId: true },
        orderBy: [{ designation: "asc" }, { name: "asc" }],
      }),
      prisma.goal.findMany({
        where: { deletedAt: null },
        select: {
          id: true, title: true, status: true,
          needsDomain: true, needsClusterId: true,
          parameter: true, outcomeCount: true,
          ownerId: true,
          owner: { select: { id: true, name: true, designation: true } },
          pitstops: { where: { deletedAt: null }, select: { id: true, status: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 500,
      }),
      prisma.pitstop.findMany({
        where: { deletedAt: null, targetDate: { lt: todayStart }, status: { in: ["Upcoming", "InProgress"] } },
        select: {
          id: true, title: true, targetDate: true, status: true,
          goal: { select: { id: true, title: true } },
          owner: { select: { name: true } },
        },
        orderBy: { targetDate: "asc" },
        take: 15,
      }),
      prisma.pitstop.findMany({
        where: { deletedAt: null, completedAt: { gte: monthStart } },
        select: {
          id: true, title: true, targetDate: true, status: true,
          goal: { select: { id: true, title: true } },
          owner: { select: { name: true } },
        },
        orderBy: { completedAt: "desc" },
        take: 20,
      }),
      prisma.pitstopEvent.findMany({
        where: { deletedAt: null, scheduledAt: { gte: todayStart, lte: in14Days }, status: "Scheduled" },
        select: {
          id: true, title: true, type: true, scheduledAt: true, location: true,
          attendees: { select: { user: { select: { name: true } } } },
        },
        orderBy: { scheduledAt: "asc" },
        take: 30,
      }),
      // Open pitstops (Upcoming/InProgress) per owner — for user workload
      prisma.pitstop.findMany({
        where: { deletedAt: null, status: { in: ["Upcoming", "InProgress"] }, ownerId: { not: null } },
        select: { ownerId: true },
      }),
    ]);

    const clusterActiveGoals: Record<string, number> = {};
    for (const g of adminGoalsRaw) {
      if (g.status === "Active" && g.needsClusterId) {
        clusterActiveGoals[g.needsClusterId] = (clusterActiveGoals[g.needsClusterId] ?? 0) + 1;
      }
    }

    // Compute per-user counts from fetched data
    const activeGoalsByOwner: Record<string, number> = {};
    for (const g of adminGoalsRaw) {
      if ((g.status === "Active" || g.status === "Paused") && g.ownerId) {
        activeGoalsByOwner[g.ownerId] = (activeGoalsByOwner[g.ownerId] ?? 0) + 1;
      }
    }
    const openPitstopsByOwner: Record<string, number> = {};
    for (const p of openPitstopsRaw) {
      if (p.ownerId) openPitstopsByOwner[p.ownerId] = (openPitstopsByOwner[p.ownerId] ?? 0) + 1;
    }

    const goalStatusMap: Record<string, number> = {};
    for (const g of goalGroups) goalStatusMap[g.status] = g._count.id;

    const pitstopStatusMap: Record<string, number> = {};
    for (const p of pitstopGroups) pitstopStatusMap[p.status] = p._count.id;

    adminDash = {
      kpis: {
        activeGoals: goalStatusMap["Active"] ?? 0,
        pausedGoals: goalStatusMap["Paused"] ?? 0,
        completeGoals: goalStatusMap["Complete"] ?? 0,
        overduepitstops: overdueCount,
        doneThisMonth: doneThisMonthCount,
        activitiesThisWeek: activitiesThisWeekCount,
        totalUsers: totalUsersCount,
      },
      goalByStatus: Object.entries(goalStatusMap)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
      pitstopByStatus: Object.entries(pitstopStatusMap)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
      zones: zonesRaw.map(z => ({
        id: z.id, name: z.name,
        leadName: z.lead?.name ?? null,
        cityName: z.city?.name ?? null,
        clusters: z.clusters.map(c => ({
          id: c.id, name: c.name,
          activeGoals: clusterActiveGoals[c.id] ?? 0,
          settlements: c.settlements,
        })),
        activeGoals: z.clusters.reduce((sum, c) => sum + (clusterActiveGoals[c.id] ?? 0), 0),
      })),
      users: usersRaw.map(u => ({
        id: u.id, name: u.name, designation: u.designation ?? "Other",
        reportsToId: u.reportsToId,
        activeGoals: activeGoalsByOwner[u.id] ?? 0,
        openPitstops: openPitstopsByOwner[u.id] ?? 0,
      })),
      goals: JSON.parse(JSON.stringify(adminGoalsRaw)),
      domainStats: computeDomainStats(adminGoalsRaw, domainLabels),
      domainConfigs: domainConfigs.map(d => ({ domain: d.domain, label: d.label ?? d.domain })),
      overdueList: JSON.parse(JSON.stringify(overdueListRaw)),
      doneThisMonthList: JSON.parse(JSON.stringify(doneThisMonthListRaw)),
      upcoming: JSON.parse(JSON.stringify(upcomingListRaw)),
    };
  }

  return (
    <HomeView
      userId={userId}
      userName={me?.name ?? ""}
      designation={designation}
      greeting={greeting}
      todayLabel={todayLabel}
      todayActivities={JSON.parse(JSON.stringify(todayActivities))}
      weekActivities={JSON.parse(JSON.stringify(weekActivities))}
      weekChecklists={JSON.parse(JSON.stringify(weekChecklists))}
      myGoals={JSON.parse(JSON.stringify(myGoals))}
      rpClusterStats={rpClusterStats}
      rpOverdueActivities={JSON.parse(JSON.stringify(rpOverdueActivities))}
      rpDoneActivities={JSON.parse(JSON.stringify(rpDoneActivities))}
      zlOverdueActivities={JSON.parse(JSON.stringify(zlOverdueActivities))}
      zlMyActivities={JSON.parse(JSON.stringify(zlMyActivities))}
      zlZoneName={myZone?.name ?? null}
      zlClusterStats={zlClusterStats}
      clusterStatus={clusterStatus}
      teamMembers={JSON.parse(JSON.stringify(teamMembers))}
      adminDash={adminDash}
    />
  );
}
