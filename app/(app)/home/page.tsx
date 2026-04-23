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

export type DomainStat = { domain: string; label: string; planned: number; done: number; gap: number };

function computeDomainStats(goals: Pick<GoalRow, "needsDomain" | "status" | "parameter" | "outcomeCount">[], domainLabels: Record<string, string>): DomainStat[] {
  const stats: Record<string, { planned: number; done: number }> = {};
  for (const g of goals) {
    if (!g.needsDomain) continue;
    if (!stats[g.needsDomain]) stats[g.needsDomain] = { planned: 0, done: 0 };
    if (g.status === "Complete") {
      stats[g.needsDomain].done += g.outcomeCount ?? g.parameter ?? 0;
    } else if (g.status === "Active") {
      stats[g.needsDomain].planned += g.parameter ?? 0;
    }
  }
  return Object.entries(stats)
    .map(([domain, { planned, done }]) => ({
      domain,
      label: domainLabels[domain] ?? domain,
      planned,
      done,
      gap: Math.max(0, planned - done),
    }))
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

  // Team IDs: ZL includes her reports
  let teamIds: string[] = [userId];
  let teamMembers: { id: string; name: string | null; image: string | null }[] = [];
  if (designation === "ZL") {
    teamMembers = await prisma.user.findMany({
      where: { reportsToId: userId },
      select: { id: true, name: true, image: true },
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
  ] = await Promise.all([
    // Today's activities — own for RP/ZL, all for others
    prisma.pitstopEvent.findMany({
      where: {
        deletedAt: null,
        scheduledAt: { gte: todayStart, lte: todayEnd },
        ...(isScoped ? { attendees: { some: { userId } } } : {}),
      },
      select: { id: true, title: true, type: true, scheduledAt: true, location: true, status: true },
      orderBy: { scheduledAt: "asc" },
    }),

    // This week's activities — own/team for RP/ZL, all for others
    prisma.pitstopEvent.findMany({
      where: {
        deletedAt: null,
        scheduledAt: { gte: weekStart, lte: weekEnd },
        ...(isScoped ? { attendees: { some: { userId: { in: teamIds } } } } : {}),
      },
      select: {
        id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
        attendees: { select: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
    }),

    // Open checklist items — own/team for RP/ZL, all for others
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
        pitstop: {
          select: {
            id: true, title: true, targetDate: true,
            ownerId: true,
            owner: { select: { id: true, name: true } },
            goal: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { order: "asc" },
      take: 50,
    }),

    // Goals — own/team for RP/ZL, all for others
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

    // Domain labels for coverage tab
    prisma.needsFormulaConfig.findMany({
      where: { isActive: true },
      select: { domain: true, label: true },
      orderBy: { sortOrder: "asc" },
    }),

    // ZL's zone
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
  ]);

  const domainLabels = Object.fromEntries(domainConfigs.map(d => [d.domain, d.label ?? d.domain]));

  // ── RP: per-cluster domain stats (from assigned clusters, not from goals) ──
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
      zlZoneName={myZone?.name ?? null}
      zlClusterStats={zlClusterStats}
      clusterStatus={clusterStatus}
      teamMembers={JSON.parse(JSON.stringify(teamMembers))}
    />
  );
}
