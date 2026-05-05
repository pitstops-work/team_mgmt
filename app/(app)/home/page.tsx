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

export type RPPitstopDetail = {
  id: string;
  title: string;
  goalTitle: string;
  targetDate: string | null;
  daysOverdue: number;
  pendingChecklists: { id: string; text: string }[];
};

export type ZLHealthStat = {
  zlId: string;
  totalGoals: number;
  activeGoals: number;
  completeGoals: number;
  pausedGoals: number;
  rpCount: number;
  totalDelayedPitstops: number;
  totalOverdueActivities: number;
  totalChecklists: number;
  doneChecklists: number;
  delayedPitstops: RPPitstopDetail[];
};

export type RPHealthStat = {
  rpId: string;
  zlId: string | null;
  totalGoals: number;
  activeGoals: number;
  pausedGoals: number;
  completeGoals: number;
  onTrackPitstops: number;
  overduePitstops: number;
  overdueActivities: number;
  totalChecklists: number;
  doneChecklists: number;
  delayedPitstops: RPPitstopDetail[];
};

// ── Admin dashboard types ─────────────────────────────────────────────────────

export type AdminKPIs = {
  activeGoals: number;
  pausedGoals: number;
  completeGoals: number;
  overduepitstops: number;
  overdueActivities: number;
  slaOnTrack: number;
  doneThisMonth: number;
  activitiesThisWeek: number;
  totalUsers: number;
  checklistDone: number;
  checklistTotal: number;
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
  image: string | null;
  designation: string;
  reportsToId: string | null;
  activeGoals: number;
  openPitstops: number;
};

export type AdminPersonHealth = {
  userId: string;
  name: string | null;
  image: string | null;
  designation: string;
  reportsToId: string | null;
  totalGoals: number; activeGoals: number; pausedGoals: number; completeGoals: number;
  onTrackPitstops: number; overduePitstops: number;
  overdueActivities: number;
  totalChecklists: number; doneChecklists: number;
  delayedPitstops: RPPitstopDetail[];
};

export type AdminDelayedPitstop = {
  id: string; title: string; goalTitle: string; goalId: string;
  targetDate: string | null; daysOverdue: number;
  ownerId: string | null; ownerName: string | null;
  ownerDesignation: string | null; ownerReportsToId: string | null;
  pendingChecklists: { id: string; text: string }[];
};

export type AdminOverdueActivity = {
  id: string; title: string; type: string; scheduledAt: string;
  ownerId: string | null; ownerName: string | null;
  ownerDesignation: string | null; ownerReportsToId: string | null;
  goalId: string | null; goalTitle: string | null;
};

export type AdminEngagementStat = {
  userId: string;
  name: string | null;
  image: string | null;
  designation: string;
  lastLoginAt: string | null;
  logins7d: number;
  logins30d: number;
  // Activity completion discipline (pitstop-owner's events)
  activitiesTotal: number;
  activitiesCompleted: number;
  completionRate: number;        // 0-100
  sameDayCount: number;
  nextDayCount: number;
  twothreeDayCount: number;
  withinWeekCount: number;
  weekPlusCount: number;
  neverCompletedCount: number;
  // Pitstop freshness
  lastPitstopActivityAt: string | null;
  totalActivePitstops: number;
  stalePitstopCount: number;     // open pitstops not touched in 14d
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

export type AdminCityCoverage = {
  id: string;
  name: string;
  totalSettlements: number;
  coveredCount: number;
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
  personHealth: AdminPersonHealth[];
  delayedPitstopsAll: AdminDelayedPitstop[];
  overdueActivitiesList: AdminOverdueActivity[];
  engagement: AdminEngagementStat[];
  cities: AdminCityCoverage[];
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

  // Team IDs: ZL includes her reports; PM pre-fetches ZL+RP IDs so myGoals is correctly scoped
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
  } else if (designation === "PM") {
    const pmZLs = await prisma.user.findMany({ where: { reportsToId: userId }, select: { id: true } });
    const zlIds = pmZLs.map(m => m.id);
    const pmRPs = zlIds.length > 0
      ? await prisma.user.findMany({ where: { reportsToId: { in: zlIds } }, select: { id: true } })
      : [];
    teamIds = [userId, ...zlIds, ...pmRPs.map(m => m.id)];
  }

  const isScoped = designation === "RP" || designation === "ZL" || designation === "PM";

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
            goal: { select: { id: true, title: true, needsDomain: true, needsCluster: { select: { id: true, name: true } } } },
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

  // ── ZL: per-RP health stats ───────────────────────────────────────────────
  let rpTeamHealth: RPHealthStat[] = [];
  if (designation === "ZL" && teamMembers.length > 0) {
    const rpIds = teamMembers.map(m => m.id);
    const todayMs = todayStart.getTime();

    const [rpPitstopsRaw, allRpChecklists] = await Promise.all([
      prisma.pitstop.findMany({
        where: { deletedAt: null, ownerId: { in: rpIds }, goal: { deletedAt: null } },
        select: {
          id: true, title: true, ownerId: true, status: true, targetDate: true,
          goal: { select: { title: true } },
          checklistItems: {
            where: { status: { notIn: ["Done", "Cancelled"] } },
            select: { id: true, text: true },
            orderBy: { order: "asc" },
          },
        },
      }),
      prisma.checklistItem.findMany({
        where: { pitstop: { deletedAt: null, ownerId: { in: rpIds }, goal: { deletedAt: null } } },
        select: { status: true, pitstop: { select: { ownerId: true } } },
      }),
    ]);

    rpTeamHealth = teamMembers.map(rp => {
      const rpGoals = myGoals.filter(g => g.ownerId === rp.id);
      const rpPits = rpPitstopsRaw.filter(p => p.ownerId === rp.id);
      const rpCls  = allRpChecklists.filter(ci => ci.pitstop.ownerId === rp.id);
      const rpOverdueActs = zlOverdueActivities.filter(a =>
        a.pitstops.some((ep: { pitstop: { ownerId: string | null } }) => ep.pitstop.ownerId === rp.id)
      );

      const openPits    = rpPits.filter(p => p.status === "Upcoming" || p.status === "InProgress");
      const delayedPits = openPits.filter(p => p.targetDate != null && new Date(p.targetDate).getTime() < todayMs);
      const onTrackPits = openPits.filter(p => !p.targetDate || new Date(p.targetDate).getTime() >= todayMs);

      const delayedPitstops: RPPitstopDetail[] = delayedPits
        .sort((a, b) => new Date(a.targetDate!).getTime() - new Date(b.targetDate!).getTime())
        .map(p => ({
          id: p.id,
          title: p.title,
          goalTitle: p.goal.title,
          targetDate: p.targetDate ? p.targetDate.toISOString() : null,
          daysOverdue: p.targetDate
            ? Math.floor((todayMs - new Date(p.targetDate).getTime()) / 86400000)
            : 0,
          pendingChecklists: p.checklistItems.map(ci => ({ id: ci.id, text: ci.text })),
        }));

      return {
        rpId: rp.id,
        zlId: null,
        totalGoals: rpGoals.length,
        activeGoals: rpGoals.filter(g => g.status === "Active").length,
        pausedGoals: rpGoals.filter(g => g.status === "Paused").length,
        completeGoals: rpGoals.filter(g => g.status === "Complete").length,
        onTrackPitstops: onTrackPits.length,
        overduePitstops: delayedPits.length,
        overdueActivities: rpOverdueActs.length,
        totalChecklists: rpCls.length,
        doneChecklists: rpCls.filter(ci => ci.status === "Done").length,
        delayedPitstops,
      };
    });
  }

  // ── PM: ZL + RP health stats ──────────────────────────────────────────────
  type PMTeamMember = { id: string; name: string | null; image: string | null; reportsToId: string | null };
  let pmZLMembers: PMTeamMember[] = [];
  let pmRPMembers: PMTeamMember[] = [];
  let pmZLHealth: ZLHealthStat[] = [];
  let pmRPHealth: RPHealthStat[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pmZLOverdueActivities: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pmZLChecklists: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pmMyActivities: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pmRPOverdueActivities: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pmRPChecklists: any[] = [];
  let pmZoneClusterMap: { id: string; name: string; clusterIds: string[] }[] = [];
  let pmClusterStats: ClusterStat[] = [];
  let pmClusterStatus: ClusterStatus[] = [];

  if (designation === "PM") {
    pmZLMembers = await prisma.user.findMany({
      where: { reportsToId: userId },
      select: { id: true, name: true, image: true, reportsToId: true },
    });

    if (pmZLMembers.length > 0) {
      const zlIds = pmZLMembers.map(z => z.id);
      pmRPMembers = await prisma.user.findMany({
        where: { reportsToId: { in: zlIds } },
        select: { id: true, name: true, image: true, reportsToId: true },
      });

      const allRpIds = pmRPMembers.map(r => r.id);
      const pmTodayMs = todayStart.getTime();

      const [pmRpPitstops, pmRpChecklists, pmOverdueActs] = await Promise.all([
        allRpIds.length > 0
          ? prisma.pitstop.findMany({
              where: { deletedAt: null, ownerId: { in: allRpIds }, goal: { deletedAt: null } },
              select: {
                id: true, title: true, ownerId: true, status: true, targetDate: true,
                goal: { select: { title: true } },
                checklistItems: {
                  where: { status: { notIn: ["Done", "Cancelled"] } },
                  select: { id: true, text: true },
                  orderBy: { order: "asc" },
                },
              },
            })
          : Promise.resolve([]),
        allRpIds.length > 0
          ? prisma.checklistItem.findMany({
              where: { pitstop: { deletedAt: null, ownerId: { in: allRpIds }, goal: { deletedAt: null } } },
              select: { status: true, pitstop: { select: { ownerId: true } } },
            })
          : Promise.resolve([]),
        allRpIds.length > 0
          ? prisma.pitstopEvent.findMany({
              where: {
                deletedAt: null, status: "Scheduled",
                scheduledAt: { lt: todayStart },
                pitstops: { some: { pitstop: { ownerId: { in: allRpIds }, deletedAt: null } } },
              },
              select: {
                id: true,
                pitstops: {
                  where: { pitstop: { ownerId: { in: allRpIds }, deletedAt: null } },
                  select: { pitstop: { select: { ownerId: true } } },
                  take: 1,
                },
              },
            })
          : Promise.resolve([]),
      ]);

      // Compute RPHealthStat for every RP across all ZLs
      pmRPHealth = pmRPMembers.map(rp => {
        const rpGoals  = myGoals.filter(g => g.ownerId === rp.id);
        const rpPits   = pmRpPitstops.filter(p => p.ownerId === rp.id);
        const rpCls    = pmRpChecklists.filter(ci => ci.pitstop.ownerId === rp.id);
        const overdueActs = pmOverdueActs.filter(a =>
          a.pitstops.some((ep: { pitstop: { ownerId: string | null } }) => ep.pitstop.ownerId === rp.id)
        );

        const openPits    = rpPits.filter(p => p.status === "Upcoming" || p.status === "InProgress");
        const delayedPits = openPits.filter(p => p.targetDate != null && new Date(p.targetDate).getTime() < pmTodayMs);
        const onTrackPits = openPits.filter(p => !p.targetDate || new Date(p.targetDate).getTime() >= pmTodayMs);

        const delayedPitstops: RPPitstopDetail[] = delayedPits
          .sort((a, b) => new Date(a.targetDate!).getTime() - new Date(b.targetDate!).getTime())
          .map(p => ({
            id: p.id, title: p.title, goalTitle: p.goal.title,
            targetDate: p.targetDate ? p.targetDate.toISOString() : null,
            daysOverdue: p.targetDate ? Math.floor((pmTodayMs - new Date(p.targetDate).getTime()) / 86400000) : 0,
            pendingChecklists: p.checklistItems.map(ci => ({ id: ci.id, text: ci.text })),
          }));

        return {
          rpId: rp.id,
          zlId: rp.reportsToId,
          totalGoals: rpGoals.length,
          activeGoals: rpGoals.filter(g => g.status === "Active").length,
          pausedGoals: rpGoals.filter(g => g.status === "Paused").length,
          completeGoals: rpGoals.filter(g => g.status === "Complete").length,
          onTrackPitstops: onTrackPits.length,
          overduePitstops: delayedPits.length,
          overdueActivities: overdueActs.length,
          totalChecklists: rpCls.length,
          doneChecklists: rpCls.filter(ci => ci.status === "Done").length,
          delayedPitstops,
        };
      });

      // Aggregate ZL-level health from RP health
      pmZLHealth = pmZLMembers.map(zl => {
        const zlGoals  = myGoals.filter(g => g.ownerId === zl.id);
        const zlRPIds  = pmRPMembers.filter(r => r.reportsToId === zl.id).map(r => r.id);
        const zlRpStat = pmRPHealth.filter(r => zlRPIds.includes(r.rpId));
        return {
          zlId: zl.id,
          totalGoals: zlGoals.length,
          activeGoals: zlGoals.filter(g => g.status === "Active").length,
          completeGoals: zlGoals.filter(g => g.status === "Complete").length,
          pausedGoals: zlGoals.filter(g => g.status === "Paused").length,
          rpCount: zlRPIds.length,
          totalDelayedPitstops: zlRpStat.reduce((s, r) => s + r.overduePitstops, 0),
          totalOverdueActivities: zlRpStat.reduce((s, r) => s + r.overdueActivities, 0),
          totalChecklists: zlRpStat.reduce((s, r) => s + r.totalChecklists, 0),
          doneChecklists: zlRpStat.reduce((s, r) => s + r.doneChecklists, 0),
          delayedPitstops: zlRpStat.flatMap(r => r.delayedPitstops),
        };
      });

      // PM Today tab: ZL-level operational data
      const [pmZLOverdueRaw, pmZLChecklistsRaw, pmMyActivitiesRaw, pmZonesRaw, pmRPOverdueRaw, pmRPChecklistsFullRaw] = await Promise.all([
        // Overdue activities on ZL-owned pitstops
        prisma.pitstopEvent.findMany({
          where: {
            deletedAt: null, status: "Scheduled", scheduledAt: { lt: todayStart },
            pitstops: { some: { pitstop: { ownerId: { in: zlIds }, deletedAt: null } } },
          },
          select: {
            id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
            attendees: { select: { user: { select: { id: true, name: true } } } },
            pitstops: {
              where: { pitstop: { ownerId: { in: zlIds }, deletedAt: null } },
              select: { pitstop: { select: { ownerId: true, targetDate: true, goal: { select: { id: true, title: true, needsClusterId: true } } } } },
              take: 1,
            },
          },
          orderBy: { scheduledAt: "asc" }, take: 150,
        }),
        // Open checklists on ZL-owned pitstops
        prisma.checklistItem.findMany({
          where: {
            status: { notIn: ["Done", "Cancelled"] },
            pitstop: { deletedAt: null, ownerId: { in: zlIds }, goal: { deletedAt: null } },
          },
          select: {
            id: true, text: true, status: true, checked: true, completionType: true,
            activities: {
              where: { status: { notIn: ["Cancelled", "Done"] } },
              select: { id: true, title: true, status: true, scheduledAt: true, type: true },
              orderBy: { scheduledAt: "asc" }, take: 1,
            },
            pitstop: {
              select: {
                id: true, title: true, targetDate: true, status: true, ownerId: true,
                owner: { select: { id: true, name: true } },
                goal: { select: { id: true, title: true } },
              },
            },
          },
          orderBy: { order: "asc" }, take: 200,
        }),
        // PM's own upcoming activities
        prisma.pitstopEvent.findMany({
          where: {
            deletedAt: null, status: "Scheduled",
            scheduledAt: { gte: todayStart, lte: weekEnd },
            pitstops: { some: { pitstop: { ownerId: userId, deletedAt: null } } },
          },
          select: {
            id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
            attendees: { select: { user: { select: { id: true, name: true } } } },
            pitstops: {
              where: { pitstop: { ownerId: userId, deletedAt: null } },
              select: { pitstop: { select: { ownerId: true, targetDate: true, goal: { select: { id: true, title: true, needsClusterId: true } } } } },
              take: 1,
            },
          },
          orderBy: { scheduledAt: "asc" },
        }),
        // PM's zones (via ZL leads)
        prisma.zone.findMany({
          where: { leadId: { in: zlIds }, deletedAt: null },
          select: {
            id: true, name: true,
            clusters: { where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } },
          },
          orderBy: { name: "asc" },
        }),
        // Overdue activities on RP-owned pitstops (for PM Today → Your RPs section)
        allRpIds.length > 0
          ? prisma.pitstopEvent.findMany({
              where: {
                deletedAt: null, status: "Scheduled", scheduledAt: { lt: todayStart },
                pitstops: { some: { pitstop: { ownerId: { in: allRpIds }, deletedAt: null } } },
              },
              select: {
                id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
                attendees: { select: { user: { select: { id: true, name: true } } } },
                pitstops: {
                  where: { pitstop: { ownerId: { in: allRpIds }, deletedAt: null } },
                  select: { pitstop: { select: { ownerId: true, targetDate: true, goal: { select: { id: true, title: true, needsClusterId: true } } } } },
                  take: 1,
                },
              },
              orderBy: { scheduledAt: "asc" }, take: 300,
            })
          : Promise.resolve([]),
        // Open checklists on RP-owned pitstops (for PM Today → Your RPs section)
        allRpIds.length > 0
          ? prisma.checklistItem.findMany({
              where: {
                status: { notIn: ["Done", "Cancelled"] },
                pitstop: { deletedAt: null, ownerId: { in: allRpIds }, goal: { deletedAt: null } },
              },
              select: {
                id: true, text: true, status: true, checked: true, completionType: true,
                activities: {
                  where: { status: { notIn: ["Cancelled", "Done"] } },
                  select: { id: true, title: true, status: true, scheduledAt: true, type: true },
                  orderBy: { scheduledAt: "asc" }, take: 1,
                },
                pitstop: {
                  select: {
                    id: true, title: true, targetDate: true, status: true, ownerId: true,
                    owner: { select: { id: true, name: true } },
                    goal: { select: { id: true, title: true } },
                  },
                },
              },
              orderBy: { order: "asc" }, take: 500,
            })
          : Promise.resolve([]),
      ]);

      pmZLOverdueActivities  = JSON.parse(JSON.stringify(pmZLOverdueRaw));
      pmZLChecklists         = JSON.parse(JSON.stringify(pmZLChecklistsRaw));
      pmMyActivities         = JSON.parse(JSON.stringify(pmMyActivitiesRaw));
      pmRPOverdueActivities  = JSON.parse(JSON.stringify(pmRPOverdueRaw));
      pmRPChecklists         = JSON.parse(JSON.stringify(pmRPChecklistsFullRaw));

      // PM cluster coverage + status
      const pmClusterIds = pmZonesRaw.flatMap(z => z.clusters.map(c => c.id));
      pmZoneClusterMap   = pmZonesRaw.map(z => ({ id: z.id, name: z.name, clusterIds: z.clusters.map(c => c.id) }));

      if (pmClusterIds.length > 0) {
        const [pmCGoals, pmCPitstops, pmCActivities, pmCChecklists] = await Promise.all([
          prisma.goal.findMany({
            where: { deletedAt: null, needsClusterId: { in: pmClusterIds } },
            select: { needsDomain: true, needsClusterId: true, status: true, parameter: true, outcomeCount: true },
          }),
          prisma.pitstop.findMany({
            where: { deletedAt: null, status: { in: ["Upcoming", "InProgress"] }, goal: { deletedAt: null, needsClusterId: { in: pmClusterIds } } },
            select: { id: true, goal: { select: { needsClusterId: true } } },
          }),
          prisma.pitstopEvent.findMany({
            where: { deletedAt: null, scheduledAt: { gte: weekStart, lte: weekEnd }, pitstops: { some: { pitstop: { goal: { needsClusterId: { in: pmClusterIds } } } } } },
            select: { id: true, pitstops: { select: { pitstop: { select: { goal: { select: { needsClusterId: true } } } } } } },
          }),
          prisma.checklistItem.findMany({
            where: { status: { notIn: ["Done", "Cancelled"] }, pitstop: { deletedAt: null, goal: { deletedAt: null, needsClusterId: { in: pmClusterIds } } } },
            select: { id: true, pitstop: { select: { goal: { select: { needsClusterId: true } } } } },
          }),
        ]);

        const activeGoalsByCluster: Record<string, number> = {};
        for (const g of pmCGoals.filter(g => g.status !== "Complete" && g.status !== "Paused")) {
          if (g.needsClusterId) activeGoalsByCluster[g.needsClusterId] = (activeGoalsByCluster[g.needsClusterId] ?? 0) + 1;
        }

        pmClusterStats = pmZonesRaw.flatMap(z => z.clusters.map(c => ({
          clusterId: c.id,
          clusterName: c.name,
          stats: computeDomainStats(pmCGoals.filter(g => g.needsClusterId === c.id), domainLabels),
        })));

        pmClusterStatus = pmZonesRaw.flatMap(z => z.clusters.map(c => ({
          clusterId: c.id,
          name: c.name,
          goalCount: activeGoalsByCluster[c.id] ?? 0,
          pitstopCount: pmCPitstops.filter(p => p.goal.needsClusterId === c.id).length,
          activityCount: pmCActivities.filter(a => a.pitstops.some(ep => ep.pitstop.goal.needsClusterId === c.id)).length,
          checklistCount: pmCChecklists.filter(ci => ci.pitstop.goal.needsClusterId === c.id).length,
        })));
      }
    }
  }

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
      allDelayedPitstopsDetailedRaw,
      doneThisMonthListRaw,
      upcomingListRaw,
      openPitstopsRaw,
      allChecklistsRaw,
      allOverdueActivitiesRaw,
      citiesRaw,
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
        select: { id: true, name: true, image: true, designation: true, reportsToId: true, lastSeenAt: true },
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
      // All delayed pitstops with full owner + checklist detail
      prisma.pitstop.findMany({
        where: { deletedAt: null, targetDate: { lt: todayStart }, status: { in: ["Upcoming", "InProgress"] } },
        select: {
          id: true, title: true, ownerId: true, targetDate: true, status: true,
          goal: { select: { id: true, title: true } },
          owner: { select: { id: true, name: true, designation: true, reportsToId: true, image: true } },
          checklistItems: {
            where: { status: { notIn: ["Done", "Cancelled"] } },
            select: { id: true, text: true },
          },
        },
        orderBy: { targetDate: "asc" },
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
      // Open pitstops per owner — workload + on-track counts
      prisma.pitstop.findMany({
        where: { deletedAt: null, status: { in: ["Upcoming", "InProgress"] }, ownerId: { not: null } },
        select: { id: true, ownerId: true },
      }),
      // Checklist items for org-wide completion rate + per-person health
      prisma.checklistItem.findMany({
        where: { pitstop: { deletedAt: null, owner: { designation: { in: ["RP", "ZL", "PM"] } } } },
        select: { status: true, pitstop: { select: { ownerId: true } } },
      }),
      // All overdue activities with pitstop owner info
      prisma.pitstopEvent.findMany({
        where: { deletedAt: null, status: "Scheduled", scheduledAt: { lt: todayStart } },
        select: {
          id: true, title: true, type: true, scheduledAt: true,
          pitstops: {
            select: {
              pitstop: {
                select: {
                  ownerId: true,
                  owner: { select: { id: true, name: true, designation: true, reportsToId: true } },
                  goal: { select: { id: true, title: true } },
                },
              },
            },
            take: 1,
          },
        },
        orderBy: { scheduledAt: "asc" },
        take: 500,
      }),
      // City settlement coverage
      prisma.city.findMany({
        where: { deletedAt: null },
        select: {
          id: true, name: true, totalSettlements: true,
          _count: { select: { settlements: { where: { deletedAt: null } } } },
        },
        orderBy: { name: "asc" },
      }),
    ]);

    // --- Engagement queries (parallel, after main Promise.all) ---
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [loginCountsRaw, activityLatencyRaw, pitstopFreshnessRaw] = await Promise.all([
      // Login counts per user (7d and 30d windows)
      prisma.$queryRaw<{ user_id: string; logins_7d: bigint; logins_30d: bigint }[]>`
        SELECT
          "userId" AS user_id,
          COUNT(*) FILTER (WHERE "createdAt" >= ${sevenDaysAgo})  AS logins_7d,
          COUNT(*) FILTER (WHERE "createdAt" >= ${thirtyDaysAgo}) AS logins_30d
        FROM "UserLoginEvent"
        GROUP BY "userId"
      `,
      // Activity completion latency buckets per pitstop owner
      prisma.$queryRaw<{
        owner_id: string;
        total: bigint; completed: bigint;
        same_day: bigint; next_day: bigint;
        two_three_days: bigint; within_week: bigint;
        week_plus: bigint; never_completed: bigint;
      }[]>`
        SELECT
          p."ownerId" AS owner_id,
          COUNT(DISTINCT pe.id) AS total,
          COUNT(DISTINCT pe.id) FILTER (WHERE pe.status = 'Done'::"PitstopEventStatus") AS completed,
          COUNT(DISTINCT pe.id) FILTER (WHERE pe.status = 'Done'::"PitstopEventStatus"
            AND pe."completedAt"::date = pe."scheduledAt"::date) AS same_day,
          COUNT(DISTINCT pe.id) FILTER (WHERE pe.status = 'Done'::"PitstopEventStatus"
            AND (pe."completedAt"::date - pe."scheduledAt"::date) = 1) AS next_day,
          COUNT(DISTINCT pe.id) FILTER (WHERE pe.status = 'Done'::"PitstopEventStatus"
            AND (pe."completedAt"::date - pe."scheduledAt"::date) BETWEEN 2 AND 3) AS two_three_days,
          COUNT(DISTINCT pe.id) FILTER (WHERE pe.status = 'Done'::"PitstopEventStatus"
            AND (pe."completedAt"::date - pe."scheduledAt"::date) BETWEEN 4 AND 7) AS within_week,
          COUNT(DISTINCT pe.id) FILTER (WHERE pe.status = 'Done'::"PitstopEventStatus"
            AND (pe."completedAt"::date - pe."scheduledAt"::date) > 7) AS week_plus,
          COUNT(DISTINCT pe.id) FILTER (WHERE pe.status != 'Done'::"PitstopEventStatus"
            AND pe.status != 'Cancelled'::"PitstopEventStatus") AS never_completed
        FROM "PitstopEvent" pe
        JOIN "PitstopEventPitstop" pep ON pep."eventId" = pe.id
        JOIN "Pitstop" p ON p.id = pep."pitstopId" AND p."deletedAt" IS NULL
        WHERE pe."deletedAt" IS NULL AND pe."scheduledAt" < ${todayStart}
          AND p."ownerId" IS NOT NULL
        GROUP BY p."ownerId"
      `,
      // Pitstop freshness: last activity date + stale (not touched in 14d) per owner
      prisma.$queryRaw<{
        owner_id: string;
        last_activity: Date | null;
        total_open: bigint;
        stale_count: bigint;
      }[]>`
        SELECT
          p."ownerId" AS owner_id,
          MAX(GREATEST(p."updatedAt", COALESCE(ci."updatedAt", p."updatedAt"))) AS last_activity,
          COUNT(DISTINCT p.id) FILTER (WHERE p.status::text IN ('Upcoming', 'InProgress')) AS total_open,
          COUNT(DISTINCT p.id) FILTER (
            WHERE p.status::text IN ('Upcoming', 'InProgress')
              AND p."updatedAt" < ${fourteenDaysAgo}
          ) AS stale_count
        FROM "Pitstop" p
        LEFT JOIN "ChecklistItem" ci ON ci."pitstopId" = p.id
        WHERE p."deletedAt" IS NULL AND p."ownerId" IS NOT NULL
        GROUP BY p."ownerId"
      `,
    ]);

    // Build lookup maps for engagement
    const loginByUser: Record<string, { logins7d: number; logins30d: number }> = {};
    for (const r of loginCountsRaw) {
      loginByUser[r.user_id] = { logins7d: Number(r.logins_7d), logins30d: Number(r.logins_30d) };
    }
    const latencyByOwner: Record<string, typeof activityLatencyRaw[0]> = {};
    for (const r of activityLatencyRaw) latencyByOwner[r.owner_id] = r;
    const freshnessMap: Record<string, typeof pitstopFreshnessRaw[0]> = {};
    for (const r of pitstopFreshnessRaw) freshnessMap[r.owner_id] = r;

    const adminEngagement: AdminEngagementStat[] = usersRaw
      .filter(u => u.designation === "RP" || u.designation === "ZL" || u.designation === "PM")
      .map(u => {
        const lg = loginByUser[u.id];
        const lt = latencyByOwner[u.id];
        const fr = freshnessMap[u.id];
        const total      = lt ? Number(lt.total)      : 0;
        const completed  = lt ? Number(lt.completed)  : 0;
        return {
          userId: u.id,
          name: u.name,
          image: u.image ?? null,
          designation: u.designation ?? "Other",
          lastLoginAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : null,
          logins7d:    lg?.logins7d  ?? 0,
          logins30d:   lg?.logins30d ?? 0,
          activitiesTotal:      total,
          activitiesCompleted:  completed,
          completionRate:       total > 0 ? Math.round(completed / total * 100) : 0,
          sameDayCount:         lt ? Number(lt.same_day)       : 0,
          nextDayCount:         lt ? Number(lt.next_day)       : 0,
          twothreeDayCount:     lt ? Number(lt.two_three_days) : 0,
          withinWeekCount:      lt ? Number(lt.within_week)    : 0,
          weekPlusCount:        lt ? Number(lt.week_plus)      : 0,
          neverCompletedCount:  lt ? Number(lt.never_completed): 0,
          lastPitstopActivityAt: fr?.last_activity ? fr.last_activity.toISOString() : null,
          totalActivePitstops:  fr ? Number(fr.total_open) : 0,
          stalePitstopCount:    fr ? Number(fr.stale_count) : 0,
        };
      });

    const clusterActiveGoals: Record<string, number> = {};
    for (const g of adminGoalsRaw) {
      if (g.status === "Active" && g.needsClusterId) {
        clusterActiveGoals[g.needsClusterId] = (clusterActiveGoals[g.needsClusterId] ?? 0) + 1;
      }
    }

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

    // Stringify Prisma Date objects
    const allDelayedPitstops = JSON.parse(JSON.stringify(allDelayedPitstopsDetailedRaw)) as {
      id: string; title: string; ownerId: string | null; targetDate: string | null; status: string;
      goal: { id: string; title: string };
      owner: { id: string; name: string | null; designation: string | null; reportsToId: string | null; image: string | null } | null;
      checklistItems: { id: string; text: string }[];
    }[];

    const adminTodayMs = todayStart.getTime();

    // Per-owner lookup maps for health computation
    const delayedByOwner: Record<string, typeof allDelayedPitstops> = {};
    for (const p of allDelayedPitstops) {
      if (p.ownerId) (delayedByOwner[p.ownerId] ??= []).push(p);
    }

    const clsByOwner: Record<string, { total: number; done: number }> = {};
    for (const ci of allChecklistsRaw) {
      const oid = ci.pitstop.ownerId;
      if (!oid) continue;
      if (!clsByOwner[oid]) clsByOwner[oid] = { total: 0, done: 0 };
      clsByOwner[oid].total++;
      if (ci.status === "Done") clsByOwner[oid].done++;
    }

    const overdueActsByOwner: Record<string, number> = {};
    for (const a of allOverdueActivitiesRaw) {
      const oid = a.pitstops[0]?.pitstop.ownerId;
      if (oid) overdueActsByOwner[oid] = (overdueActsByOwner[oid] ?? 0) + 1;
    }

    // Per-person health stats for Team Health + Overview chips
    const adminPersonHealth: AdminPersonHealth[] = usersRaw
      .filter(u => u.designation === "RP" || u.designation === "ZL" || u.designation === "PM")
      .map(u => {
        const userGoals  = adminGoalsRaw.filter(g => g.ownerId === u.id);
        const userDelayed = delayedByOwner[u.id] ?? [];
        const userCls     = clsByOwner[u.id] ?? { total: 0, done: 0 };
        const totalOpen   = openPitstopsByOwner[u.id] ?? 0;

        const delayedPitstops: RPPitstopDetail[] = userDelayed.map(p => ({
          id: p.id, title: p.title, goalTitle: p.goal.title,
          targetDate: p.targetDate,
          daysOverdue: p.targetDate ? Math.floor((adminTodayMs - new Date(p.targetDate).getTime()) / 86400000) : 0,
          pendingChecklists: p.checklistItems.map(ci => ({ id: ci.id, text: ci.text })),
        }));

        return {
          userId: u.id,
          name: u.name,
          image: u.image ?? null,
          designation: u.designation ?? "Other",
          reportsToId: u.reportsToId,
          totalGoals: userGoals.length,
          activeGoals: userGoals.filter(g => g.status === "Active").length,
          pausedGoals: userGoals.filter(g => g.status === "Paused").length,
          completeGoals: userGoals.filter(g => g.status === "Complete").length,
          onTrackPitstops: Math.max(0, totalOpen - userDelayed.length),
          overduePitstops: userDelayed.length,
          overdueActivities: overdueActsByOwner[u.id] ?? 0,
          totalChecklists: userCls.total,
          doneChecklists: userCls.done,
          delayedPitstops,
        };
      });

    // Org-wide health aggregates
    const orgDoneCls    = Object.values(clsByOwner).reduce((s, v) => s + v.done, 0);
    const orgTotalCls   = Object.values(clsByOwner).reduce((s, v) => s + v.total, 0);
    const orgOvActs     = allOverdueActivitiesRaw.length;
    const slaOnTrack    = Math.max(0, openPitstopsRaw.length - allDelayedPitstops.length);

    // Reshape for Attention tab
    const delayedPitstopsAll: AdminDelayedPitstop[] = allDelayedPitstops.map(p => ({
      id: p.id, title: p.title, goalTitle: p.goal.title, goalId: p.goal.id,
      targetDate: p.targetDate,
      daysOverdue: p.targetDate ? Math.floor((adminTodayMs - new Date(p.targetDate).getTime()) / 86400000) : 0,
      ownerId: p.ownerId,
      ownerName: p.owner?.name ?? null,
      ownerDesignation: p.owner?.designation ?? null,
      ownerReportsToId: p.owner?.reportsToId ?? null,
      pendingChecklists: p.checklistItems,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overdueActivitiesList: AdminOverdueActivity[] = JSON.parse(JSON.stringify(allOverdueActivitiesRaw)).map((a: any) => {
      const ps = a.pitstops[0]?.pitstop;
      return {
        id: a.id, title: a.title, type: a.type, scheduledAt: a.scheduledAt,
        ownerId: ps?.ownerId ?? null,
        ownerName: ps?.owner?.name ?? null,
        ownerDesignation: ps?.owner?.designation ?? null,
        ownerReportsToId: ps?.owner?.reportsToId ?? null,
        goalId: ps?.goal?.id ?? null,
        goalTitle: ps?.goal?.title ?? null,
      };
    });

    adminDash = {
      kpis: {
        activeGoals: goalStatusMap["Active"] ?? 0,
        pausedGoals: goalStatusMap["Paused"] ?? 0,
        completeGoals: goalStatusMap["Complete"] ?? 0,
        overduepitstops: overdueCount,
        overdueActivities: orgOvActs,
        slaOnTrack,
        doneThisMonth: doneThisMonthCount,
        activitiesThisWeek: activitiesThisWeekCount,
        totalUsers: totalUsersCount,
        checklistDone: orgDoneCls,
        checklistTotal: orgTotalCls,
      },
      goalByStatus: Object.entries(goalStatusMap).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
      pitstopByStatus: Object.entries(pitstopStatusMap).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
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
        id: u.id, name: u.name, image: u.image ?? null,
        designation: u.designation ?? "Other",
        reportsToId: u.reportsToId,
        activeGoals: activeGoalsByOwner[u.id] ?? 0,
        openPitstops: openPitstopsByOwner[u.id] ?? 0,
      })),
      goals: JSON.parse(JSON.stringify(adminGoalsRaw)),
      domainStats: computeDomainStats(adminGoalsRaw, domainLabels),
      domainConfigs: domainConfigs.map(d => ({ domain: d.domain, label: d.label ?? d.domain })),
      overdueList: allDelayedPitstops.slice(0, 15).map(p => ({
        id: p.id, title: p.title,
        targetDate: p.targetDate,
        status: p.status,
        goal: p.goal,
        owner: p.owner ? { name: p.owner.name } : null,
      })),
      doneThisMonthList: JSON.parse(JSON.stringify(doneThisMonthListRaw)),
      upcoming: JSON.parse(JSON.stringify(upcomingListRaw)),
      personHealth: adminPersonHealth,
      delayedPitstopsAll,
      overdueActivitiesList,
      engagement: adminEngagement,
      cities: citiesRaw.map(c => ({
        id: c.id,
        name: c.name,
        totalSettlements: c.totalSettlements,
        coveredCount: c._count.settlements,
      })),
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
      rpTeamHealth={rpTeamHealth}
      pmZLMembers={JSON.parse(JSON.stringify(pmZLMembers))}
      pmRPMembers={JSON.parse(JSON.stringify(pmRPMembers))}
      pmZLHealth={pmZLHealth}
      pmRPHealth={JSON.parse(JSON.stringify(pmRPHealth))}
      pmZLOverdueActivities={pmZLOverdueActivities}
      pmZLChecklists={pmZLChecklists}
      pmMyActivities={pmMyActivities}
      pmRPOverdueActivities={pmRPOverdueActivities}
      pmRPChecklists={pmRPChecklists}
      pmZoneClusterMap={pmZoneClusterMap}
      pmClusterStats={pmClusterStats}
      pmClusterStatus={pmClusterStatus}
      adminDash={adminDash}
    />
  );
}
