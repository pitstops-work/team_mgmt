import { NextRequest } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildRbacContext, can, getTeamIds } from "@/lib/rbac";
import { resolveWindow, type WindowKey } from "@/lib/periodWindow";

/**
 * GET /api/team-accountability
 *
 * Sibling to /api/team-completions. Same RBAC scope (team), same filters, same
 * window resolution — but anchored on each entity's canonical DUE date, not
 * completedAt. Answers "what was my team supposed to do in this window, and
 * did they do it" with the status broken into 4 buckets:
 *
 *   done_on_time     — completedAt <= dueAt
 *   done_late        — completedAt > dueAt (still counts as done; slippedPastWindow flags if also > range.to)
 *   open_past_due    — open AND dueAt < today
 *   open             — open AND dueAt >= today (in range or future)
 *
 * Canonical due field per layer:
 *   goal       → targetDate
 *   pitstop    → targetDate
 *   activity   → originalScheduledAt (frozen; reschedule cannot launder lateness)
 *   checklist  → earliest linked activity originalScheduledAt, fallback pitstop.targetDate
 *   followup   → dueDate
 *
 * Ownership filter is OR — `userIds` matches primary owner OR co-owner OR
 * (for activities) creator/attendee/parent-pitstop ownership. Attribution
 * (the userId on each row) is the primary owner / completedBy / createdBy —
 * the matched user may differ on co-owned rows.
 */

export type AccountabilityEntity = "goal" | "pitstop" | "checklist" | "activity" | "followup";

export type StatusBucket = "done_on_time" | "done_late" | "open_past_due" | "open";

export type AccountabilityRow = {
  entity: AccountabilityEntity;
  id: string;
  title: string;
  /** Canonical due date (ISO). */
  dueAt: string;
  /** Second date column for activities only — current scheduledAt; null for other entities. */
  dueAt2: string | null;
  status: StatusBucket;
  /** Raw entity status (e.g. "Done", "Scheduled", "Cancelled"). */
  rawStatus: string;
  completedAt: string | null;
  /** completed > range.to OR (open and dueAt < today AND past range.to). */
  slippedPastWindow: boolean;
  /** Days late at completion (done) or days overdue today (open). 0 otherwise. */
  daysLate: number;
  userId: string;
  userName: string | null;
  designation: string;
  domain: string | null;
  clusterId: string | null;
  clusterName: string | null;
  cityId: string | null;
  zoneId: string | null;
  pitstopId: string | null;
  goalId: string;
  goalTitle: string;
  /** Hint for drill-down chevron — # of child rows under this row (best-effort). */
  childCount: number;
};

export type AccountabilitySummary = Record<AccountabilityEntity, {
  total: number;
  done_on_time: number;
  done_late: number;
  open_past_due: number;
  open: number;
  slipped_past_window: number;
}>;

export type AccountabilityResponse = {
  window: { from: string; to: string; label: string };
  goals: AccountabilityRow[];
  pitstops: AccountabilityRow[];
  checklists: AccountabilityRow[];
  activities: AccountabilityRow[];
  followUps: AccountabilityRow[];
  summary: AccountabilitySummary;
};

type RawRow = {
  entity: AccountabilityEntity;
  id: string;
  title: string;
  due_at: Date;
  due_at_2: Date | null;
  raw_status: string;
  completed_at: Date | null;
  user_id: string;
  user_name: string | null;
  designation: string;
  domain: string | null;
  cluster_id: string | null;
  cluster_name: string | null;
  city_id: string | null;
  zone_id: string | null;
  pitstop_id: string | null;
  goal_id: string;
  goal_title: string;
  child_count: number | bigint;
};

const emptyResp = (range: { from: Date; to: Date; label: string }): AccountabilityResponse => ({
  window: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
  goals: [], pitstops: [], checklists: [], activities: [], followUps: [],
  summary: emptySummary(),
});

function emptySummary(): AccountabilitySummary {
  const z = { total: 0, done_on_time: 0, done_late: 0, open_past_due: 0, open: 0, slipped_past_window: 0 };
  return { goal: { ...z }, pitstop: { ...z }, checklist: { ...z }, activity: { ...z }, followup: { ...z } };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await buildRbacContext(session, { req });
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Gate on team_metrics.read — same gate Team Report / SLA / Overdue use.
  if (!(await can(ctx, "team_metrics", "read"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const windowKey = (url.searchParams.get("window") ?? "this_week") as WindowKey;
  const customFrom = url.searchParams.get("from");
  const customTo = url.searchParams.get("to");

  let range;
  try {
    range = resolveWindow({ key: windowKey, customFrom, customTo });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Invalid window" }, { status: 400 });
  }

  const teamIds = await getTeamIds(session.user.id);
  if (teamIds.length === 0) return Response.json(emptyResp(range) satisfies AccountabilityResponse);

  const requestedUserIds = url.searchParams.get("userIds")?.split(",").filter(Boolean);
  const userIds = requestedUserIds && requestedUserIds.length > 0
    ? requestedUserIds.filter(id => teamIds.includes(id))
    : teamIds;
  if (userIds.length === 0) return Response.json(emptyResp(range) satisfies AccountabilityResponse);

  const userArr = Prisma.sql`ARRAY[${Prisma.join(userIds)}]::text[]`;
  const fromTs = range.from;
  const toTs = range.to;
  const now = new Date();

  // Optional slicers — match team-completions semantics.
  const domain = url.searchParams.get("domain");
  const cityId = url.searchParams.get("cityId");
  const zoneId = url.searchParams.get("zoneId");
  const clusterId = url.searchParams.get("clusterId");

  const domainFilter = domain ? Prisma.sql`AND g."needsDomain" = ${domain}` : Prisma.empty;
  const cityFilter   = cityId ? Prisma.sql`AND g."needsCityId" = ${cityId}` : Prisma.empty;
  const zoneFilter   = zoneId ? Prisma.sql`AND g."needsZoneId" = ${zoneId}` : Prisma.empty;
  const clusterFilterGoal    = clusterId ? Prisma.sql`AND g."needsClusterId" = ${clusterId}` : Prisma.empty;
  const clusterFilterPitstop = clusterId ? Prisma.sql`AND COALESCE(p."needsClusterId", g."needsClusterId") = ${clusterId}` : Prisma.empty;

  const layerFilter = url.searchParams.get("layer") as AccountabilityEntity | null;
  const want = (e: AccountabilityEntity) => !layerFilter || layerFilter === e;

  const parts: Array<Promise<{ entity: AccountabilityEntity; rows: RawRow[] }>> = [];

  // ── GOALS — anchor on targetDate ─────────────────────────────────────────
  if (want("goal")) {
    parts.push(prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT
        'goal'::text     AS entity,
        g.id             AS id,
        g.title          AS title,
        g."targetDate"   AS due_at,
        NULL::timestamp  AS due_at_2,
        g."status"::text AS raw_status,
        g."closedAt"     AS completed_at,
        g."ownerId"      AS user_id,
        u.name           AS user_name,
        u.designation    AS designation,
        g."needsDomain"  AS domain,
        g."needsClusterId" AS cluster_id,
        cl.name          AS cluster_name,
        g."needsCityId"  AS city_id,
        g."needsZoneId"  AS zone_id,
        NULL::text       AS pitstop_id,
        g.id             AS goal_id,
        g.title          AS goal_title,
        (SELECT COUNT(*)::int FROM "Pitstop" pp WHERE pp."goalId" = g.id AND pp."deletedAt" IS NULL) AS child_count
      FROM "Goal" g
      JOIN "User" u ON u.id = g."ownerId"
      LEFT JOIN "Cluster" cl ON cl.id = g."needsClusterId"
      WHERE g."deletedAt" IS NULL
        AND g."targetDate" IS NOT NULL
        AND g."targetDate" >= ${fromTs}
        AND g."targetDate" <= ${toTs}
        AND (
          g."ownerId" = ANY(${userArr})
          OR EXISTS (SELECT 1 FROM "GoalCoOwner" co WHERE co."goalId" = g.id AND co."userId" = ANY(${userArr}))
        )
        ${domainFilter} ${cityFilter} ${zoneFilter} ${clusterFilterGoal}
    `).then(rows => ({ entity: "goal" as const, rows })));
  }

  // ── PITSTOPS — anchor on targetDate ──────────────────────────────────────
  if (want("pitstop")) {
    parts.push(prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT
        'pitstop'::text  AS entity,
        p.id             AS id,
        p.title          AS title,
        p."targetDate"   AS due_at,
        NULL::timestamp  AS due_at_2,
        p."status"::text AS raw_status,
        p."completedAt"  AS completed_at,
        COALESCE(p."ownerId", g."ownerId") AS user_id,
        u.name           AS user_name,
        u.designation    AS designation,
        g."needsDomain"  AS domain,
        COALESCE(p."needsClusterId", g."needsClusterId") AS cluster_id,
        cl.name          AS cluster_name,
        g."needsCityId"  AS city_id,
        COALESCE(p."needsZoneId", g."needsZoneId") AS zone_id,
        p.id             AS pitstop_id,
        g.id             AS goal_id,
        g.title          AS goal_title,
        (SELECT COUNT(*)::int FROM "PitstopEventPitstop" pep
          JOIN "PitstopEvent" e ON e.id = pep."eventId"
          WHERE pep."pitstopId" = p.id AND e."deletedAt" IS NULL AND e."status" != 'Cancelled') AS child_count
      FROM "Pitstop" p
      JOIN "Goal" g ON g.id = p."goalId"
      JOIN "User" u ON u.id = COALESCE(p."ownerId", g."ownerId")
      LEFT JOIN "Cluster" cl ON cl.id = COALESCE(p."needsClusterId", g."needsClusterId")
      WHERE p."deletedAt" IS NULL
        AND g."deletedAt" IS NULL
        AND p."targetDate" IS NOT NULL
        AND p."targetDate" >= ${fromTs}
        AND p."targetDate" <= ${toTs}
        AND (
          COALESCE(p."ownerId", g."ownerId") = ANY(${userArr})
          OR EXISTS (SELECT 1 FROM "PitstopCoOwner" co WHERE co."pitstopId" = p.id AND co."userId" = ANY(${userArr}))
        )
        ${domainFilter} ${cityFilter} ${zoneFilter} ${clusterFilterPitstop}
    `).then(rows => ({ entity: "pitstop" as const, rows })));
  }

  // ── ACTIVITIES — anchor on originalScheduledAt ───────────────────────────
  // Attribution: completedById fallback createdById fallback first attendee.
  // Filter: matches creator OR attendee OR parent pitstop owner/coOwner.
  if (want("activity")) {
    parts.push(prisma.$queryRaw<RawRow[]>(Prisma.sql`
      WITH ev AS (
        SELECT DISTINCT ON (e.id)
          e.id, e.title, e."originalScheduledAt", e."scheduledAt", e."status",
          e."completedAt", e."completedById", e."createdById",
          p.id  AS pitstop_id, p."ownerId" AS pitstop_owner_id,
          g.id  AS goal_id, g.title AS goal_title,
          g."needsDomain" AS domain,
          COALESCE(p."needsClusterId", g."needsClusterId") AS cluster_id,
          g."needsCityId" AS city_id,
          COALESCE(p."needsZoneId", g."needsZoneId") AS zone_id
        FROM "PitstopEvent" e
        JOIN "PitstopEventPitstop" pep ON pep."eventId" = e.id
        JOIN "Pitstop" p ON p.id = pep."pitstopId"
        JOIN "Goal"    g ON g.id = p."goalId"
        WHERE e."deletedAt" IS NULL
          AND p."deletedAt" IS NULL
          AND g."deletedAt" IS NULL
          AND e."status" != 'Cancelled'
          AND e."originalScheduledAt" >= ${fromTs}
          AND e."originalScheduledAt" <= ${toTs}
          AND (
            e."createdById" = ANY(${userArr})
            OR e."completedById" = ANY(${userArr})
            OR EXISTS (SELECT 1 FROM "PitstopEventAttendee" att WHERE att."eventId" = e.id AND att."userId" = ANY(${userArr}))
            OR p."ownerId" = ANY(${userArr})
            OR EXISTS (SELECT 1 FROM "PitstopCoOwner" co WHERE co."pitstopId" = p.id AND co."userId" = ANY(${userArr}))
          )
          ${domainFilter} ${cityFilter} ${zoneFilter} ${clusterFilterPitstop}
        ORDER BY e.id, p."order" ASC, p."startDate" ASC
      )
      SELECT
        'activity'::text                  AS entity,
        ev.id                             AS id,
        ev.title                          AS title,
        ev."originalScheduledAt"          AS due_at,
        ev."scheduledAt"                  AS due_at_2,
        ev."status"::text                 AS raw_status,
        ev."completedAt"                  AS completed_at,
        COALESCE(
          ev."completedById",
          ev."createdById",
          ev.pitstop_owner_id,
          (SELECT att."userId" FROM "PitstopEventAttendee" att WHERE att."eventId" = ev.id LIMIT 1)
        )                                 AS user_id,
        u.name                            AS user_name,
        u.designation                     AS designation,
        ev.domain                         AS domain,
        ev.cluster_id                     AS cluster_id,
        cl.name                           AS cluster_name,
        ev.city_id                        AS city_id,
        ev.zone_id                        AS zone_id,
        ev.pitstop_id                     AS pitstop_id,
        ev.goal_id                        AS goal_id,
        ev.goal_title                     AS goal_title,
        (SELECT COUNT(*)::int FROM "ActionPoint" ap WHERE ap."pitstopEventId" = ev.id) AS child_count
      FROM ev
      LEFT JOIN "User" u ON u.id = COALESCE(
        ev."completedById",
        ev."createdById",
        ev.pitstop_owner_id,
        (SELECT att."userId" FROM "PitstopEventAttendee" att WHERE att."eventId" = ev.id LIMIT 1)
      )
      LEFT JOIN "Cluster" cl ON cl.id = ev.cluster_id
    `).then(rows => ({ entity: "activity" as const, rows })));
  }

  // ── CHECKLISTS — anchor on earliest linked activity originalScheduledAt,
  // fallback parent pitstop targetDate. Inherits scope from parent pitstop.
  if (want("checklist")) {
    parts.push(prisma.$queryRaw<RawRow[]>(Prisma.sql`
      WITH ci_due AS (
        SELECT
          ci.id, ci.text, ci."status", ci."completedAt",
          ci."completedById", ci."assigneeId",
          COALESCE(
            (SELECT MIN(e."originalScheduledAt") FROM "PitstopEvent" e WHERE e."checklistItemId" = ci.id AND e."deletedAt" IS NULL),
            p."targetDate"
          ) AS due_at,
          p.id  AS pitstop_id, p."ownerId" AS pitstop_owner_id,
          g.id  AS goal_id, g.title AS goal_title,
          g."needsDomain" AS domain,
          COALESCE(p."needsClusterId", g."needsClusterId") AS cluster_id,
          g."needsCityId" AS city_id,
          COALESCE(p."needsZoneId", g."needsZoneId") AS zone_id
        FROM "ChecklistItem" ci
        JOIN "Pitstop" p ON p.id = ci."pitstopId"
        JOIN "Goal"    g ON g.id = p."goalId"
        WHERE p."deletedAt" IS NULL
          AND g."deletedAt" IS NULL
          AND ci."status" != 'Cancelled'
          AND (
            p."ownerId" = ANY(${userArr})
            OR EXISTS (SELECT 1 FROM "PitstopCoOwner" co WHERE co."pitstopId" = p.id AND co."userId" = ANY(${userArr}))
          )
          ${domainFilter} ${cityFilter} ${zoneFilter} ${clusterFilterPitstop}
      )
      SELECT
        'checklist'::text AS entity,
        ci_due.id         AS id,
        ci_due.text       AS title,
        ci_due.due_at     AS due_at,
        NULL::timestamp   AS due_at_2,
        ci_due."status"::text AS raw_status,
        ci_due."completedAt" AS completed_at,
        COALESCE(ci_due."completedById", ci_due."assigneeId", ci_due.pitstop_owner_id) AS user_id,
        u.name            AS user_name,
        u.designation     AS designation,
        ci_due.domain     AS domain,
        ci_due.cluster_id AS cluster_id,
        cl.name           AS cluster_name,
        ci_due.city_id    AS city_id,
        ci_due.zone_id    AS zone_id,
        ci_due.pitstop_id AS pitstop_id,
        ci_due.goal_id    AS goal_id,
        ci_due.goal_title AS goal_title,
        0                 AS child_count
      FROM ci_due
      LEFT JOIN "User" u ON u.id = COALESCE(ci_due."completedById", ci_due."assigneeId", ci_due.pitstop_owner_id)
      WHERE ci_due.due_at IS NOT NULL
        AND ci_due.due_at >= ${fromTs}
        AND ci_due.due_at <= ${toTs}
    `).then(rows => ({ entity: "checklist" as const, rows })));
  }

  // ── FOLLOW-UPS (ActionPoint) — anchor on dueDate ─────────────────────────
  if (want("followup")) {
    parts.push(prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT
        'followup'::text  AS entity,
        ap.id             AS id,
        ap.title          AS title,
        ap."dueDate"      AS due_at,
        NULL::timestamp   AS due_at_2,
        ap."status"::text AS raw_status,
        ap."completedAt"  AS completed_at,
        ap."ownerId"      AS user_id,
        u.name            AS user_name,
        u.designation     AS designation,
        g."needsDomain"   AS domain,
        COALESCE(p."needsClusterId", g."needsClusterId") AS cluster_id,
        cl.name           AS cluster_name,
        g."needsCityId"   AS city_id,
        COALESCE(p."needsZoneId", g."needsZoneId") AS zone_id,
        ap."pitstopId"    AS pitstop_id,
        g.id              AS goal_id,
        g.title           AS goal_title,
        0                 AS child_count
      FROM "ActionPoint" ap
      JOIN "Pitstop" p ON p.id = ap."pitstopId"
      JOIN "Goal" g    ON g.id = p."goalId"
      JOIN "User" u    ON u.id = ap."ownerId"
      LEFT JOIN "Cluster" cl ON cl.id = COALESCE(p."needsClusterId", g."needsClusterId")
      WHERE ap."status" != 'cancelled'
        AND ap."dueDate" >= ${fromTs}
        AND ap."dueDate" <= ${toTs}
        AND ap."ownerId" = ANY(${userArr})
        ${domainFilter} ${cityFilter} ${zoneFilter} ${clusterFilterPitstop}
    `).then(rows => ({ entity: "followup" as const, rows })));
  }

  const buckets = await Promise.all(parts);

  // Bucket per layer + build summary in one pass.
  const out: Record<AccountabilityEntity, AccountabilityRow[]> = {
    goal: [], pitstop: [], checklist: [], activity: [], followup: [],
  };
  const summary = emptySummary();

  for (const { entity, rows } of buckets) {
    for (const r of rows) {
      const dueAt = new Date(r.due_at);
      const completedAt = r.completed_at ? new Date(r.completed_at) : null;
      const isDone = isDoneStatus(entity, r.raw_status);

      let bucket: StatusBucket;
      if (isDone && completedAt) {
        bucket = completedAt.getTime() <= dueAt.getTime() ? "done_on_time" : "done_late";
      } else {
        bucket = dueAt.getTime() < startOfToday(now).getTime() ? "open_past_due" : "open";
      }

      const slipped = isDone && completedAt ? completedAt.getTime() > range.to.getTime() : false;
      const daysLate = computeDaysLate(bucket, dueAt, completedAt, now);

      const row: AccountabilityRow = {
        entity,
        id: r.id,
        title: r.title,
        dueAt: dueAt.toISOString(),
        dueAt2: r.due_at_2 ? new Date(r.due_at_2).toISOString() : null,
        status: bucket,
        rawStatus: r.raw_status,
        completedAt: completedAt ? completedAt.toISOString() : null,
        slippedPastWindow: slipped,
        daysLate,
        userId: r.user_id,
        userName: r.user_name,
        designation: r.designation,
        domain: r.domain,
        clusterId: r.cluster_id,
        clusterName: r.cluster_name,
        cityId: r.city_id,
        zoneId: r.zone_id,
        pitstopId: r.pitstop_id,
        goalId: r.goal_id,
        goalTitle: r.goal_title,
        childCount: Number(r.child_count ?? 0),
      };

      out[entity].push(row);
      summary[entity].total += 1;
      summary[entity][bucket] += 1;
      if (slipped) summary[entity].slipped_past_window += 1;
    }
  }

  // Optional status post-filter (applied after bucketing).
  const statusFilter = url.searchParams.get("status") as StatusBucket | null;
  if (statusFilter) {
    for (const k of Object.keys(out) as AccountabilityEntity[]) {
      out[k] = out[k].filter(r => r.status === statusFilter);
    }
  }

  // Sort each list: open_past_due first (most overdue first), then due-soonest.
  for (const k of Object.keys(out) as AccountabilityEntity[]) {
    out[k].sort((a, b) => {
      const aP = a.status === "open_past_due" ? 0 : 1;
      const bP = b.status === "open_past_due" ? 0 : 1;
      if (aP !== bP) return aP - bP;
      return a.dueAt.localeCompare(b.dueAt);
    });
  }

  return Response.json({
    window: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    goals: out.goal,
    pitstops: out.pitstop,
    checklists: out.checklist,
    activities: out.activity,
    followUps: out.followup,
    summary,
  } satisfies AccountabilityResponse);
}

function isDoneStatus(entity: AccountabilityEntity, raw: string): boolean {
  if (entity === "goal")     return raw === "Complete";
  if (entity === "followup") return raw === "done";
  return raw === "Done";
}

function startOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function computeDaysLate(bucket: StatusBucket, dueAt: Date, completedAt: Date | null, now: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  if (bucket === "done_late" && completedAt) {
    return Math.max(0, Math.floor((completedAt.getTime() - dueAt.getTime()) / MS));
  }
  if (bucket === "open_past_due") {
    return Math.max(0, Math.floor((startOfToday(now).getTime() - dueAt.getTime()) / MS));
  }
  return 0;
}
