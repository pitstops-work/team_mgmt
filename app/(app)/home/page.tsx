import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildRbacContext, scopeWhere, getTeamIds } from "@/lib/rbac";
import HomeView from "./HomeView";

// Rolling 7-day window starting at today's midnight. The previous version
// returned Monday → Sunday of the *current* calendar week, which on any day
// later in the week (Thu/Fri/Sat) silently dropped most of the actual next
// 7 days from the loader — so an overdue activity rescheduled to next
// Monday vanished from "Next 7 days" because next Monday sat past Sunday's
// weekEnd. The Today bucket overlaps today; TodayTab dedupes on the client.
function getWeekBounds(now: Date) {
  const s = new Date(now); s.setHours(0, 0, 0, 0);
  const e = new Date(s); e.setDate(e.getDate() + 6); e.setHours(23, 59, 59, 999);
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
  /* Today rollup for the ZL Team-today donut. Done = activities the RP has
     completed today; total = activities scheduled today (open + done). */
  todayDone: number;
  todayTotal: number;
};

// RP cluster-deck: cluster geometry + settlements + facility pins. One per
// cluster the RP is assigned to. Used by the playing-card style Today view.
export type RPClusterDeckCluster = {
  id: string;
  name: string;
  geometry: unknown | null; // GeoJSON Polygon / MultiPolygon
  color: string | null;
  settlements: {
    id: string;
    name: string;
    polygon: unknown | null;
    centroidLat: number | null;
    centroidLng: number | null;
  }[];
  layerFeatures: {
    id: string;
    name: string;
    layerKey: string;
    lat: number;
    lng: number;
    settlementId: string | null;
  }[];
};
export type FacilityLayerConfigLite = { layerKey: string; label: string; color: string };

// Leader / Other: one entry per user in the leader's recursive reporting tree.
export type LeaderTeamMember = {
  id: string;
  name: string | null;
  image: string | null;
  designation: string;
  overdueCount: number;
  openChecklistCount: number;
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

  // "Event hasn't been pulled into today via displayDate." The plain
  // `NOT: { displayDate: { gte, lte } }` we used here before silently dropped
  // every NULL-displayDate row — SQL's NOT over a NULL expression is NULL,
  // which doesn't match WHERE — which is the vast majority of events, since
  // only pulled-to-today rows carry a displayDate. Fold the negation into a
  // NULL-tolerant OR. AND-wrapped so spreading it into a query that already
  // has a top-level `OR` (access-scope) doesn't collide with Prisma's
  // sibling-OR collapse.
  const notPulledIntoToday = {
    AND: [{
      OR: [
        { displayDate: null },
        { displayDate: { lt: todayStart } },
        { displayDate: { gt: todayEnd } },
      ],
    }],
  };

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, designation: true },
  });
  const designation = me?.designation ?? "Other";
  const isSuperAdmin = (session as { user?: { role?: string } } | null)?.user?.role === "super-admin";

  // `teamMembers` (ZL roster with rpClusters) feeds ZL-specific UI further down;
  // per-designation UI branching is out of central-RBAC scope.
  let teamMembers: { id: string; name: string | null; image: string | null }[] = [];
  if (designation === "ZL") {
    teamMembers = await prisma.user.findMany({
      where: { reportsToId: userId },
      select: {
        id: true, name: true, image: true,
        rpClusters: { where: { deletedAt: null }, select: { id: true, name: true } },
      },
    });
  }

  const isLeader = !["RP", "ZL", "PM"].includes(designation);

  // Leader / Other Today tab shows a team breakdown of every user in
  // their reporting tree (recursive descendants).
  let leaderTeamIds: string[] = [];
  let leaderTeam: LeaderTeamMember[] = [];
  if (isLeader) {
    const allDescendants = await getTeamIds(userId);
    leaderTeamIds = allDescendants.filter(id => id !== userId);
  }

  // teamIds + isScoped come from central RBAC. WITH RECURSIVE expands the
  // team to arbitrary depth.
  const ctx = await buildRbacContext(session);
  const pitstopScope = ctx ? await scopeWhere(ctx, "pitstop", "list") : null;
  const teamIds: string[] = ctx ? await getTeamIds(ctx.userId) : [userId];
  const isScoped = pitstopScope !== null && Object.keys(pitstopScope).length > 0;

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
    leaderOverdueActivities,
    leaderMyActivities,
    rpOverdueTotal,
    addActivityPitstops,
    addActivityUsers,
  ] = await Promise.all([
    prisma.pitstopEvent.findMany({
      where: {
        deletedAt: null,
        status: { not: "Cancelled" },
        // Today bucket: scheduled today OR pulled to today via displayDate.
        // Wrapped in AND so it composes with the access-scope OR below without
        // colliding at the top level (Prisma collapses sibling ORs).
        AND: [{
          OR: [
            { scheduledAt: { gte: todayStart, lte: todayEnd } },
            { displayDate: { gte: todayStart, lte: todayEnd } },
          ],
        }],
        // Drop events whose parent goal/pitstop has been deleted.
        pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null } } } },
        ...(isScoped ? {
          OR: [
            { attendees: { some: { userId } } },
            { pitstops: { some: { pitstop: { deletedAt: null, OR: [{ ownerId: userId }, { coOwners: { some: { userId } } }] } } } },
          ],
        } : {}),
      },
      select: {
        id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
        displayDate: true,
        rescheduleCount: true, rescheduleReasonCode: true,
        attendees: { select: { user: { select: { id: true, name: true } } } },
        pitstops: {
          select: {
            pitstop: {
              select: {
                id: true, title: true, ownerId: true,
                goal: {
                  select: {
                    id: true, title: true, needsDomain: true, linkedFacilityId: true,
                    needsCluster:    { select: { id: true, name: true } },
                    needsSettlement: { select: { id: true, name: true } },
                    linkedFacility:  { select: { name: true, cluster: { select: { id: true, name: true } } } },
                    needsZone:       { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
          take: 1,
        },
      },
      orderBy: { scheduledAt: "asc" },
    }),

    prisma.pitstopEvent.findMany({
      where: {
        deletedAt: null,
        status: { not: "Cancelled" },
        scheduledAt: { gte: weekStart, lte: weekEnd },
        // Skip activities the RP pulled into today — they're already in the
        // today bucket above, and showing them again in "Next 7 days" would
        // double-count. The activity still belongs to its original day for
        // every other view; this only affects this loader's week list.
        ...notPulledIntoToday,
        pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null } } } },
        ...(isScoped ? {
          OR: [
            { attendees: { some: { userId: { in: teamIds } } } },
            { pitstops: { some: { pitstop: { deletedAt: null, OR: [{ ownerId: { in: teamIds } }, { coOwners: { some: { userId: { in: teamIds } } } }] } } } },
          ],
        } : {}),
      },
      select: {
        id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
        displayDate: true,
        rescheduleCount: true, rescheduleReasonCode: true,
        attendees: { select: { user: { select: { id: true, name: true } } } },
        pitstops: {
          select: {
            pitstop: {
              select: {
                id: true, title: true, ownerId: true,
                goal: {
                  select: {
                    id: true, title: true, needsDomain: true, linkedFacilityId: true,
                    needsCluster:    { select: { id: true, name: true } },
                    needsSettlement: { select: { id: true, name: true } },
                    linkedFacility:  { select: { name: true, cluster: { select: { id: true, name: true } } } },
                    needsZone:       { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
          take: 1,
        },
      },
      orderBy: { scheduledAt: "asc" },
    }),

    prisma.checklistItem.findMany({
      where: {
        status: { notIn: ["Done", "Cancelled"] },
        pitstop: {
          ...(isScoped ? { OR: [{ ownerId: { in: teamIds } }, { coOwners: { some: { userId: { in: teamIds } } } }] } : {}),
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
            goal: { select: { id: true, title: true, needsDomain: true, linkedFacilityId: true, needsCluster: { select: { id: true, name: true } }, needsSettlement: { select: { id: true, name: true } }, linkedFacility: { select: { name: true, cluster: { select: { id: true, name: true } } } } } },
          },
        },
      },
      orderBy: { order: "asc" },
      take: 200,
    }),

    prisma.goal.findMany({
      where: {
        deletedAt: null,
        // Co-owners are treated as owners for visibility.
        ...(isScoped
          ? {
              OR: [
                { ownerId: { in: teamIds } },
                { coOwners: { some: { userId: { in: teamIds } } } },
              ],
            }
          : {}),
      },
      select: {
        id: true, title: true, status: true, needsDomain: true, linkedFacilityId: true,
        needsClusterId: true, needsZoneId: true,
        parameter: true, outcomeCount: true,
        targetDate: true,
        ownerId: true,
        owner: { select: { id: true, name: true } },
        coOwners: { select: { userId: true } },
        needsCluster: { select: { id: true, name: true } },
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

    // RP only: past-due events still in Scheduled status.
    // `take: 200` bounds the page payload — the badge total comes from the
    // separate _count below, so completing one of the 200 surfaces the
    // 201st correctly in the rendered list (slot-fill) but the badge always
    // reflects the true number of overdue items the RP actually has.
    designation === "RP"
      ? prisma.pitstopEvent.findMany({
          where: {
            deletedAt: null,
            status: "Scheduled",
            scheduledAt: { lt: todayStart },
            // An overdue activity the RP has pulled into today isn't "stuck"
            // anymore — it's actively on today's list. Drop it from overdue
            // so the badge + section count don't double-claim it.
            ...notPulledIntoToday,
            pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null } } } },
            OR: [
              { attendees: { some: { userId } } },
              { pitstops: { some: { pitstop: { deletedAt: null, OR: [{ ownerId: userId }, { coOwners: { some: { userId } } }] } } } },
            ],
          },
          select: {
            id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
            displayDate: true,
            rescheduleCount: true, rescheduleReasonCode: true,
            attendees: { select: { user: { select: { id: true, name: true } } } },
            pitstops: {
              select: {
                pitstop: {
                  select: {
                    id: true, title: true, ownerId: true,
                    goal: {
                      select: {
                        id: true, title: true, needsDomain: true, linkedFacilityId: true,
                        needsCluster:    { select: { id: true, name: true } },
                        needsSettlement: { select: { id: true, name: true } },
                        linkedFacility:  { select: { name: true, cluster: { select: { id: true, name: true } } } },
                        needsZone:       { select: { id: true, name: true } },
                      },
                    },
                  },
                },
              },
              take: 1,
            },
          },
          orderBy: { scheduledAt: "asc" },
          take: 200,
        })
      : Promise.resolve([]),

    // Past tab data — activities completed in the last 30 days for the user's
    // OWN pitstops (every designation gets this). Filtered/sorted on
    // completedAt so an event scheduled months ago that was just marked done
    // still surfaces — scheduledAt-window misses the catch-up-on-overdue case
    // entirely. Includes goal/cluster info so the Past tab can cluster-bucket
    // like Today.
    prisma.pitstopEvent.findMany({
      where: {
        deletedAt: null,
        status: "Done",
        completedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null } } } },
        OR: [
          { attendees: { some: { userId } } },
          { pitstops: { some: { pitstop: { deletedAt: null, OR: [{ ownerId: userId }, { coOwners: { some: { userId } } }] } } } },
        ],
      },
      select: {
        id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
        completedAt: true,
        completedBy: { select: { id: true, name: true } },
        attendees: { select: { user: { select: { id: true, name: true } } } },
        pitstops: {
          select: {
            pitstop: {
              select: {
                id: true, title: true, ownerId: true,
                goal: {
                  select: {
                    id: true, title: true, needsDomain: true, linkedFacilityId: true,
                    needsCluster:    { select: { id: true, name: true } },
                    needsSettlement: { select: { id: true, name: true } },
                    linkedFacility:  { select: { name: true, cluster: { select: { id: true, name: true } } } },
                    needsZone:       { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
          take: 1,
        },
        // Linked checklist gives us the proof: voice transcription (notes) and
        // uploaded files (attachments). Used by the RP Done-log to render
        // thumbnail previews + inline transcripts.
        checklistItem: {
          select: {
            id: true, notes: true, completionType: true,
            attachments: {
              select: { id: true, url: true, name: true, mimeType: true },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
      orderBy: { completedAt: "desc" },
      take: 200,
    }),

    // ZL only: team overdue activities (past Scheduled, owned by any team member)
    designation === "ZL"
      ? prisma.pitstopEvent.findMany({
          where: {
            deletedAt: null,
            status: "Scheduled",
            scheduledAt: { lt: todayStart },
            // RP-pulled-to-today drops out of the ZL's overdue sweep too —
            // it's actively in flight, not stuck waiting for a nudge.
            ...notPulledIntoToday,
            pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null }, OR: [{ ownerId: { in: teamIds } }, { coOwners: { some: { userId: { in: teamIds } } } }] } } },
          },
          select: {
            id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
            rescheduleCount: true, rescheduleReasonCode: true,
            attendees: { select: { user: { select: { id: true, name: true } } } },
            pitstops: {
              where: { pitstop: { deletedAt: null, OR: [{ ownerId: { in: teamIds } }, { coOwners: { some: { userId: { in: teamIds } } } }] } },
              select: {
                pitstop: {
                  select: {
                    ownerId: true, targetDate: true,
                    goal: { select: { id: true, title: true, needsDomain: true, linkedFacilityId: true, needsClusterId: true, needsCluster: { select: { id: true, name: true } }, needsSettlement: { select: { id: true, name: true } }, needsZone: { select: { id: true, name: true } }, linkedFacility: { select: { name: true, cluster: { select: { id: true, name: true } } } } } },
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

    // ZL only: own upcoming scheduled activities (today + this week) — attendee OR pitstop owner
    designation === "ZL"
      ? prisma.pitstopEvent.findMany({
          where: {
            deletedAt: null,
            status: "Scheduled",
            scheduledAt: { gte: todayStart, lte: weekEnd },
            pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null } } } },
            OR: [
              { attendees: { some: { userId } } },
              { pitstops: { some: { pitstop: { deletedAt: null, OR: [{ ownerId: userId }, { coOwners: { some: { userId } } }] } } } },
            ],
          },
          select: {
            id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
            rescheduleCount: true, rescheduleReasonCode: true,
            attendees: { select: { user: { select: { id: true, name: true } } } },
            pitstops: {
              where: { pitstop: { deletedAt: null, OR: [{ ownerId: userId }, { coOwners: { some: { userId } } }] } },
              select: {
                pitstop: {
                  select: {
                    ownerId: true, targetDate: true,
                    goal: {
                      select: {
                        id: true, title: true, needsDomain: true, linkedFacilityId: true, needsClusterId: true,
                        needsCluster:    { select: { id: true, name: true } },
                        needsSettlement: { select: { id: true, name: true } },
                        linkedFacility:  { select: { name: true, cluster: { select: { id: true, name: true } } } },
                        needsZone:       { select: { id: true, name: true } },
                      },
                    },
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

    // Leader/Other: past overdue activities (attendee OR pitstop owner)
    isLeader
      ? prisma.pitstopEvent.findMany({
          where: {
            deletedAt: null,
            status: "Scheduled",
            scheduledAt: { lt: todayStart },
            // Same treatment as RP/ZL overdue: skip the ones already pulled
            // into today so they don't appear stuck from a leader's seat.
            ...notPulledIntoToday,
            pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null } } } },
            OR: [
              { attendees: { some: { userId } } },
              { pitstops: { some: { pitstop: { deletedAt: null, OR: [{ ownerId: userId }, { coOwners: { some: { userId } } }] } } } },
            ],
          },
          select: {
            id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
            rescheduleCount: true, rescheduleReasonCode: true,
            attendees: { select: { user: { select: { id: true, name: true } } } },
            pitstops: {
              select: {
                pitstop: {
                  select: {
                    id: true, title: true, ownerId: true,
                    goal: {
                      select: {
                        id: true, title: true, needsDomain: true, linkedFacilityId: true,
                        needsCluster:    { select: { id: true, name: true } },
                        needsSettlement: { select: { id: true, name: true } },
                        linkedFacility:  { select: { name: true, cluster: { select: { id: true, name: true } } } },
                        needsZone:       { select: { id: true, name: true } },
                      },
                    },
                  },
                },
              },
              take: 1,
            },
          },
          orderBy: { scheduledAt: "asc" },
          take: 20,
        })
      : Promise.resolve([]),

    // Leader/Other: today + this week activities (attendee OR pitstop owner)
    isLeader
      ? prisma.pitstopEvent.findMany({
          where: {
            deletedAt: null,
            status: "Scheduled",
            scheduledAt: { gte: todayStart, lte: weekEnd },
            pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null } } } },
            OR: [
              { attendees: { some: { userId } } },
              { pitstops: { some: { pitstop: { deletedAt: null, OR: [{ ownerId: userId }, { coOwners: { some: { userId } } }] } } } },
            ],
          },
          select: {
            id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
            rescheduleCount: true, rescheduleReasonCode: true,
            attendees: { select: { user: { select: { id: true, name: true } } } },
            pitstops: {
              select: {
                pitstop: {
                  select: {
                    id: true, title: true, ownerId: true,
                    goal: {
                      select: {
                        id: true, title: true, needsDomain: true, linkedFacilityId: true,
                        needsCluster:    { select: { id: true, name: true } },
                        needsSettlement: { select: { id: true, name: true } },
                        linkedFacility:  { select: { name: true, cluster: { select: { id: true, name: true } } } },
                        needsZone:       { select: { id: true, name: true } },
                      },
                    },
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

    // True overdue total for the RP cockpit's ProgressChip badge — independent
    // of the `take: 200` cap on the list above. Without this the badge could
    // stay stuck on 20/200 even as the RP completes activities, because the
    // server keeps backfilling the rendered list from the longer tail.
    designation === "RP"
      ? prisma.pitstopEvent.count({
          where: {
            deletedAt: null,
            status: "Scheduled",
            scheduledAt: { lt: todayStart },
            // Must mirror the list query above so badge ↔ rendered count
            // stay consistent when an activity is pulled to today.
            ...notPulledIntoToday,
            pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null } } } },
            OR: [
              { attendees: { some: { userId } } },
              { pitstops: { some: { pitstop: { deletedAt: null, OR: [{ ownerId: userId }, { coOwners: { some: { userId } } }] } } } },
            ],
          },
        })
      : Promise.resolve(0),

    // Feeds the "+ New activity" modal on each role's Today tab — same
    // RBAC-scoped pitstop set + user list the /activities page loads.
    prisma.pitstop.findMany({
      where: { deletedAt: null, goal: { deletedAt: null }, ...(pitstopScope ?? {}) },
      select: {
        id: true,
        title: true,
        owner: { select: { id: true, name: true, image: true } },
        goal: { select: { id: true, title: true } },
      },
      orderBy: [{ goal: { title: "asc" } }, { order: "asc" }],
    }),
    prisma.user.findMany({
      select: { id: true, name: true, image: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // ── Pulled-to-today history: count add_to_today AuditLog actions per event ──
  // One groupBy across every active list on this page, then merge a small
  // `addedToTodayCount` onto each activity. The "Pulled N×" chip uses it to
  // surface pattern-deferral even when the activity isn't currently pulled.
  // Done activities are excluded — once an activity is completed the history
  // chip is no longer actionable signal.
  const activeActivityIds = [
    ...todayActivities,
    ...weekActivities,
    ...rpOverdueActivities,
    ...zlOverdueActivities,
    ...zlMyActivities,
    ...leaderOverdueActivities,
    ...leaderMyActivities,
  ].map(a => a.id);
  const addCountMap = new Map<string, number>();
  if (activeActivityIds.length > 0) {
    const rows = await prisma.auditLog.groupBy({
      by: ["entityId"],
      where: {
        entityType: "Activity",
        action: "add_to_today",
        entityId: { in: activeActivityIds },
      },
      _count: { _all: true },
    });
    for (const r of rows) addCountMap.set(r.entityId, r._count._all);
  }
  // Mutate-in-place: attach `addedToTodayCount` directly onto each row's
  // object. The Prisma result types don't know about it (no shape change
  // there) but the downstream JSX reads via the lib `Activity` type which
  // declares the field optional, so the runtime read works cleanly.
  function attachAddCount(list: { id: string }[]) {
    for (const a of list) {
      const n = addCountMap.get(a.id);
      if (n) (a as { addedToTodayCount?: number }).addedToTodayCount = n;
    }
  }
  attachAddCount(todayActivities);
  attachAddCount(weekActivities);
  attachAddCount(rpOverdueActivities);
  attachAddCount(zlOverdueActivities);
  attachAddCount(zlMyActivities);
  attachAddCount(leaderOverdueActivities);
  attachAddCount(leaderMyActivities);

  // ── Past tab: team done activities (last 30 days) for ZL / PM / Leader.
  // RPs only see their own (rpDoneActivities above). For ZL/PM the scope is
  // teamIds; for Leader/Other it's the recursive descendants leaderTeamIds.
  // Returns one row per Done event with goal+cluster info and the owner id
  // so the client can both cluster-bucket the user's own work and group the
  // rest by team-member.
  const pastTeamScopeIds = designation === "ZL" || designation === "PM"
    ? teamIds.filter(id => id !== userId)
    : isLeader
    ? leaderTeamIds
    : [];
  type TeamDoneActivity = {
    id: string; title: string; type: string; scheduledAt: string;
    location: string | null; status: string;
    attendees: { user: { id: string; name: string | null } }[];
    pitstops: {
      pitstop: {
        id: string; title: string; ownerId: string;
        goal: {
          id: string; title: string; needsDomain: string | null;
          needsCluster:    { id: string; name: string } | null;
          needsSettlement: { id: string; name: string } | null;
          needsZone:       { id: string; name: string } | null;
          linkedFacility:  { name: string; cluster: { id: string; name: string } | null } | null;
        };
      };
    }[];
  };
  let pastTeamDoneActivities: TeamDoneActivity[] = [];
  if (pastTeamScopeIds.length > 0) {
    pastTeamDoneActivities = await prisma.pitstopEvent.findMany({
      where: {
        deletedAt: null,
        status: "Done",
        scheduledAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null }, OR: [{ ownerId: { in: pastTeamScopeIds } }, { coOwners: { some: { userId: { in: pastTeamScopeIds } } } }] } } },
      },
      select: {
        id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
        rescheduleCount: true, rescheduleReasonCode: true,
        attendees: { select: { user: { select: { id: true, name: true } } } },
        pitstops: {
          select: {
            pitstop: {
              select: {
                id: true, title: true, ownerId: true,
                goal: {
                  select: {
                    id: true, title: true, needsDomain: true, linkedFacilityId: true,
                    needsCluster:    { select: { id: true, name: true } },
                    needsSettlement: { select: { id: true, name: true } },
                    linkedFacility:  { select: { name: true, cluster: { select: { id: true, name: true } } } },
                    needsZone:       { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
          take: 1,
        },
      },
      orderBy: { scheduledAt: "desc" },
      take: 500,
    }) as unknown as TeamDoneActivity[];
  }

  // ── Leader/Other: team breakdown data ──────────────────────────────────────
  // Pulls one row per team member + their overdue / open-checklist counts so
  // the Today tab can render a grouped "your team" view (PMs / ZLs / RPs /
  // Others). Only runs when there are team members to scope against.
  if (isLeader && leaderTeamIds.length > 0) {
    const [teamUsers, teamOverdueRaw, teamChecklistsRaw] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: leaderTeamIds } },
        select: { id: true, name: true, image: true, designation: true },
      }),
      prisma.$queryRaw<{ ownerId: string; cnt: number }[]>`
        SELECT p."ownerId" as "ownerId", COUNT(DISTINCT e.id)::int as cnt
        FROM "PitstopEvent" e
        JOIN "PitstopEventPitstop" ep ON ep."eventId" = e.id
        JOIN "Pitstop" p ON p.id = ep."pitstopId"
        WHERE e."deletedAt" IS NULL
          AND e.status = 'Scheduled'::"PitstopEventStatus"
          AND e."scheduledAt" < ${todayStart}
          AND p."deletedAt" IS NULL
          AND p."ownerId" = ANY(${leaderTeamIds})
        GROUP BY p."ownerId"
      `,
      prisma.$queryRaw<{ ownerId: string; cnt: number }[]>`
        SELECT p."ownerId" as "ownerId", COUNT(*)::int as cnt
        FROM "ChecklistItem" ci
        JOIN "Pitstop" p ON p.id = ci."pitstopId"
        JOIN "Goal" g ON g.id = p."goalId"
        WHERE ci.status NOT IN ('Done'::"ChecklistItemStatus", 'Cancelled'::"ChecklistItemStatus")
          AND p."deletedAt" IS NULL
          AND g."deletedAt" IS NULL
          AND p."ownerId" = ANY(${leaderTeamIds})
        GROUP BY p."ownerId"
      `,
    ]);
    const overdueByUser = new Map(teamOverdueRaw.map(r => [r.ownerId, Number(r.cnt)]));
    const checklistByUser = new Map(teamChecklistsRaw.map(r => [r.ownerId, Number(r.cnt)]));
    leaderTeam = teamUsers.map(u => ({
      id: u.id,
      name: u.name,
      image: u.image,
      designation: u.designation ?? "Other",
      overdueCount: overdueByUser.get(u.id) ?? 0,
      openChecklistCount: checklistByUser.get(u.id) ?? 0,
    }));
  }

  // ── Leader: Activity-created tracker ───────────────────────────────────────
  // Sourced from AuditLog `Activity / created` rows over the last 90 days
  // (client trims to 7d / 30d / 90d windows). Template-applied activities
  // don't emit these rows, so this naturally captures only ad-hoc / modal
  // creates. We bulk-fetch the underlying PitstopEvent for title/goal/cluster.
  let leaderActivityCreated: {
    auditId: string; createdAt: string;
    activityId: string; title: string; type: string; scheduledAt: string;
    creator: { id: string; name: string | null; image: string | null };
    goal: {
      id: string; title: string; needsDomain: string | null;
      needsCluster:    { id: string; name: string } | null;
      needsSettlement: { id: string; name: string } | null;
    } | null;
  }[] = [];
  if (isLeader) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const trackedUserIds = [userId, ...leaderTeamIds];
    const audits = await prisma.auditLog.findMany({
      where: {
        entityType: "Activity",
        action: "created",
        userId: { in: trackedUserIds },
        createdAt: { gte: ninetyDaysAgo },
      },
      include: { user: { select: { id: true, name: true, image: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    if (audits.length > 0) {
      const eventIds = audits.map(a => a.entityId);
      const events = await prisma.pitstopEvent.findMany({
        where: { id: { in: eventIds }, deletedAt: null },
        select: {
          id: true, title: true, type: true, scheduledAt: true,
          pitstops: {
            select: {
              pitstop: {
                select: {
                  goal: {
                    select: {
                      id: true, title: true, needsDomain: true,
                      needsCluster:    { select: { id: true, name: true } },
                      needsSettlement: { select: { id: true, name: true } },
                      linkedFacility:  { select: { name: true, cluster: { select: { id: true, name: true } } } },
                    },
                  },
                },
              },
            },
            take: 1,
          },
        },
      });
      const eventMap = new Map(events.map(e => [e.id, e]));
      for (const a of audits) {
        const ev = eventMap.get(a.entityId);
        if (!ev || !a.user) continue;
        const goal = ev.pitstops[0]?.pitstop.goal ?? null;
        leaderActivityCreated.push({
          auditId: a.id,
          createdAt: a.createdAt.toISOString(),
          activityId: ev.id,
          title: ev.title,
          type: ev.type,
          scheduledAt: ev.scheduledAt.toISOString(),
          creator: { id: a.user.id, name: a.user.name, image: a.user.image },
          goal: goal ? {
            id: goal.id,
            title: goal.title,
            needsDomain: goal.needsDomain,
            needsCluster: goal.needsCluster,
            needsSettlement: goal.needsSettlement,
          } : null,
        });
      }
    }
  }

  // ── RP: cluster-deck geometry ──────────────────────────────────────────────
  // Map-card Today view shows one playing-card per assigned cluster with the
  // cluster + settlement boundaries and facility pins. Only fetched for RPs.
  let rpClusterDeck: RPClusterDeckCluster[] = [];
  let facilityLayerConfigs: FacilityLayerConfigLite[] = [];
  if (designation === "RP") {
    const [clustersRaw, configsRaw] = await Promise.all([
      prisma.cluster.findMany({
        where: { deletedAt: null, rps: { some: { id: userId } } },
        select: {
          id: true, name: true, geometry: true, color: true,
          settlements: {
            where: { deletedAt: null },
            select: { id: true, name: true, polygon: true, centroidLat: true, centroidLng: true },
          },
          layerFeatures: {
            select: { id: true, name: true, layerKey: true, lat: true, lng: true, settlementId: true },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.facilityLayerConfig.findMany({
        where: { isActive: true },
        select: { layerKey: true, label: true, color: true },
      }),
    ]);
    rpClusterDeck = clustersRaw as unknown as RPClusterDeckCluster[];
    facilityLayerConfigs = configsRaw;
  }

  const domainLabels = Object.fromEntries(domainConfigs.map(d => [d.domain, d.label ?? d.domain]));

  // ── ZL: per-RP health stats ───────────────────────────────────────────────
  let rpTeamHealth: RPHealthStat[] = [];
  if (designation === "ZL" && teamMembers.length > 0) {
    const rpIds = teamMembers.map(m => m.id);
    const todayMs = todayStart.getTime();

    const [rpPitstopsRaw, allRpChecklists, rpTodayActs] = await Promise.all([
      prisma.pitstop.findMany({
        where: { deletedAt: null, goal: { deletedAt: null }, OR: [{ ownerId: { in: rpIds } }, { coOwners: { some: { userId: { in: rpIds } } } }] },
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
        where: { pitstop: { deletedAt: null, goal: { deletedAt: null }, OR: [{ ownerId: { in: rpIds } }, { coOwners: { some: { userId: { in: rpIds } } } }] } },
        select: { status: true, pitstop: { select: { ownerId: true } } },
      }),
      // Today rollup per RP for the ZL Team-today donut. Lightweight: only
      // status + owner are needed; status=Cancelled is excluded from the
      // donut totals (cancelled work shouldn't drag a person's progress).
      prisma.pitstopEvent.findMany({
        where: {
          deletedAt: null,
          scheduledAt: { gte: todayStart, lte: todayEnd },
          status: { not: "Cancelled" },
          pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null }, OR: [{ ownerId: { in: rpIds } }, { coOwners: { some: { userId: { in: rpIds } } } }] } } },
        },
        select: {
          status: true,
          pitstops: { select: { pitstop: { select: { ownerId: true } } }, take: 1 },
        },
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
        todayTotal: rpTodayActs.filter(a => a.pitstops[0]?.pitstop.ownerId === rp.id).length,
        todayDone:  rpTodayActs.filter(a => a.pitstops[0]?.pitstop.ownerId === rp.id && a.status === "Done").length,
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
              where: { deletedAt: null, goal: { deletedAt: null }, OR: [{ ownerId: { in: allRpIds } }, { coOwners: { some: { userId: { in: allRpIds } } } }] },
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
              where: { pitstop: { deletedAt: null, goal: { deletedAt: null }, OR: [{ ownerId: { in: allRpIds } }, { coOwners: { some: { userId: { in: allRpIds } } } }] } },
              select: { status: true, pitstop: { select: { ownerId: true } } },
            })
          : Promise.resolve([]),
        allRpIds.length > 0
          ? prisma.pitstopEvent.findMany({
              where: {
                deletedAt: null, status: "Scheduled",
                scheduledAt: { lt: todayStart },
                pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null }, OR: [{ ownerId: { in: allRpIds } }, { coOwners: { some: { userId: { in: allRpIds } } } }] } } },
              },
              select: {
                id: true,
                pitstops: {
                  where: { pitstop: { deletedAt: null, OR: [{ ownerId: { in: allRpIds } }, { coOwners: { some: { userId: { in: allRpIds } } } }] } },
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
          // PM path doesn't fetch per-RP today rollup yet; donut on the PM
          // Team-today screen is a separate follow-up. Default to 0/0 so
          // RPHealthStat stays a uniform shape.
          todayTotal: 0,
          todayDone: 0,
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
            pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null }, OR: [{ ownerId: { in: zlIds } }, { coOwners: { some: { userId: { in: zlIds } } } }] } } },
          },
          select: {
            id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
            rescheduleCount: true, rescheduleReasonCode: true,
            attendees: { select: { user: { select: { id: true, name: true } } } },
            pitstops: {
              where: { pitstop: { deletedAt: null, OR: [{ ownerId: { in: zlIds } }, { coOwners: { some: { userId: { in: zlIds } } } }] } },
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
            pitstop: { deletedAt: null, goal: { deletedAt: null }, OR: [{ ownerId: { in: zlIds } }, { coOwners: { some: { userId: { in: zlIds } } } }] },
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
            pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null }, OR: [{ ownerId: userId }, { coOwners: { some: { userId } } }] } } },
          },
          select: {
            id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
            rescheduleCount: true, rescheduleReasonCode: true,
            attendees: { select: { user: { select: { id: true, name: true } } } },
            pitstops: {
              where: { pitstop: { deletedAt: null, OR: [{ ownerId: userId }, { coOwners: { some: { userId } } }] } },
              select: {
                pitstop: {
                  select: {
                    ownerId: true, targetDate: true,
                    goal: {
                      select: {
                        id: true, title: true, needsDomain: true, linkedFacilityId: true, needsClusterId: true,
                        needsCluster:    { select: { id: true, name: true } },
                        needsSettlement: { select: { id: true, name: true } },
                        linkedFacility:  { select: { name: true, cluster: { select: { id: true, name: true } } } },
                        needsZone:       { select: { id: true, name: true } },
                      },
                    },
                  },
                },
              },
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
                pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null }, OR: [{ ownerId: { in: allRpIds } }, { coOwners: { some: { userId: { in: allRpIds } } } }] } } },
              },
              select: {
                id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
                attendees: { select: { user: { select: { id: true, name: true } } } },
                pitstops: {
                  where: { pitstop: { deletedAt: null, OR: [{ ownerId: { in: allRpIds } }, { coOwners: { some: { userId: { in: allRpIds } } } }] } },
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
                pitstop: { deletedAt: null, goal: { deletedAt: null }, OR: [{ ownerId: { in: allRpIds } }, { coOwners: { some: { userId: { in: allRpIds } } } }] },
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
            select: { needsDomain: true, linkedFacilityId: true, needsClusterId: true, status: true, parameter: true, outcomeCount: true },
          }),
          prisma.pitstop.findMany({
            where: { deletedAt: null, status: { in: ["Upcoming", "InProgress"] }, goal: { deletedAt: null, needsClusterId: { in: pmClusterIds } } },
            select: { id: true, goal: { select: { needsClusterId: true } } },
          }),
          prisma.pitstopEvent.findMany({
            where: { deletedAt: null, status: { not: "Cancelled" }, scheduledAt: { gte: weekStart, lte: weekEnd }, pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null, needsClusterId: { in: pmClusterIds } } } } } },
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
        select: { needsDomain: true, linkedFacilityId: true, needsClusterId: true, status: true, parameter: true, outcomeCount: true },
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
        select: { needsDomain: true, linkedFacilityId: true, needsClusterId: true, status: true, parameter: true, outcomeCount: true },
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
          status: { not: "Cancelled" },
          scheduledAt: { gte: weekStart, lte: weekEnd },
          pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null, needsClusterId: { in: clusterIds } } } } },
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
      prisma.pitstopEvent.count({
        where: {
          deletedAt: null,
          status: { not: "Cancelled" },
          scheduledAt: { gte: weekStart, lte: weekEnd },
          pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null } } } },
        },
      }),
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
        select: { id: true, name: true, image: true, designation: true, role: true, reportsToId: true, lastSeenAt: true },
        orderBy: [{ designation: "asc" }, { name: "asc" }],
      }),
      prisma.goal.findMany({
        where: { deletedAt: null },
        select: {
          id: true, title: true, status: true,
          needsDomain: true, linkedFacilityId: true, needsClusterId: true,
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
        where: {
          deletedAt: null, scheduledAt: { gte: todayStart, lte: in14Days }, status: "Scheduled",
          pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null } } } },
        },
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
        where: {
          deletedAt: null, status: "Scheduled", scheduledAt: { lt: todayStart },
          pitstops: { some: { pitstop: { deletedAt: null, goal: { deletedAt: null } } } },
        },
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
      .filter(u =>
        u.designation === "RP" || u.designation === "ZL" || u.designation === "PM" || u.designation === "Leader"
        || u.role === "admin" || u.role === "super-admin"
      )
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
      rpOverdueTotal={rpOverdueTotal}
      rpDoneActivities={JSON.parse(JSON.stringify(rpDoneActivities))}
      rpClusterDeck={JSON.parse(JSON.stringify(rpClusterDeck))}
      facilityLayerConfigs={facilityLayerConfigs}
      pastTeamDoneActivities={JSON.parse(JSON.stringify(pastTeamDoneActivities))}
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
      leaderOverdueActivities={JSON.parse(JSON.stringify(leaderOverdueActivities))}
      leaderMyActivities={JSON.parse(JSON.stringify(leaderMyActivities))}
      leaderTeam={leaderTeam}
      leaderActivityCreated={leaderActivityCreated}
      adminDash={adminDash}
      addActivityPitstops={JSON.parse(JSON.stringify(addActivityPitstops))}
      addActivityUsers={JSON.parse(JSON.stringify(addActivityUsers))}
    />
  );
}
