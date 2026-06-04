import { NextRequest } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getTeamIds } from "@/lib/rbac";
import { resolveWindow, type WindowKey } from "@/lib/periodWindow";

/**
 * GET /api/team-completions
 *
 * Powers the Home → Team Report tab. Returns completions credited to team
 * members in a date window, broken down by type, with enough metadata to
 * drill down per RP and per day.
 *
 * Credit rules (who "did" each thing):
 *   • Pitstop    → ownerId at completedAt
 *   • Activity   → completedById (fallback to first attendee if null — rare)
 *   • Checklist  → completedById (fallback to assigneeId)
 *   • Goal       → ownerId at closedAt
 *   • Follow-up  → completedById
 *
 * RBAC: scoped to the caller's recursive team via getTeamIds. The caller
 * themselves is always included so a supervisor sees their own + their team.
 *
 * Query params:
 *   window       — WindowKey (today/yesterday/this_week/last_week/last_7d/
 *                  last_15d/last_30d/this_month/last_month/this_quarter/custom)
 *   from, to     — YYYY-MM-DD, required when window=custom
 *   userIds      — comma-separated; if present, filters to this subset (must
 *                  be inside the caller's team scope)
 *   domain       — single domain string (matched on goal.needsDomain)
 *   cityId       — single id (goal.needsCityId)
 *   zoneId       — single id (goal.needsZoneId)
 *   clusterId    — single id (goal.needsClusterId OR pitstop.needsClusterId)
 *   type         — one of "pitstop" | "activity" | "checklist" | "goal" |
 *                  "followup" — restricts the result set to one entity
 *
 * Response: a flat list of CompletionItem rows. The client buckets by user
 * and by entity. Each row carries everything needed to render a one-line
 * drilldown + a link to the source entity.
 */

export type CompletionEntity = "pitstop" | "activity" | "checklist" | "goal" | "followup";

export type CompletionItem = {
  entity: CompletionEntity;
  id: string;
  title: string;
  completedAt: string;   // ISO
  userId: string;
  userName: string | null;
  designation: string;
  domain: string | null;
  clusterId: string | null;
  clusterName: string | null;
  cityId: string | null;
  zoneId: string | null;
  /** For drill-down link. Always set for activity/checklist/followup; goal-level rows have pitstopId=null. */
  pitstopId: string | null;
  goalId: string;
  goalTitle: string;
};

export type CompletionsResponse = {
  window: { from: string; to: string; label: string };
  items: CompletionItem[];
  /** Cheap to compute server-side and saves a client pass. */
  counts: { pitstop: number; activity: number; checklist: number; goal: number; followup: number };
};

type RawRow = {
  entity: CompletionEntity;
  id: string;
  title: string;
  completed_at: Date;
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
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const windowKey = (url.searchParams.get("window") ?? "last_7d") as WindowKey;
  const customFrom = url.searchParams.get("from");
  const customTo = url.searchParams.get("to");

  let range;
  try {
    range = resolveWindow({ key: windowKey, customFrom, customTo });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Invalid window" }, { status: 400 });
  }

  const teamIds = await getTeamIds(session.user.id);
  if (teamIds.length === 0) {
    return Response.json({
      window: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
      items: [],
      counts: { pitstop: 0, activity: 0, checklist: 0, goal: 0, followup: 0 },
    } satisfies CompletionsResponse);
  }

  // Optional userIds filter — intersect with the team so the caller can't
  // smuggle in someone outside their scope.
  const requestedUserIds = url.searchParams.get("userIds")?.split(",").filter(Boolean);
  const userIds = requestedUserIds && requestedUserIds.length > 0
    ? requestedUserIds.filter(id => teamIds.includes(id))
    : teamIds;
  if (userIds.length === 0) {
    return Response.json({
      window: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
      items: [],
      counts: { pitstop: 0, activity: 0, checklist: 0, goal: 0, followup: 0 },
    } satisfies CompletionsResponse);
  }

  const userArr = Prisma.sql`ARRAY[${Prisma.join(userIds)}]::text[]`;
  const fromTs = range.from;
  const toTs = range.to;

  // Optional slicers — apply uniformly across all entity queries via shared
  // sql fragments. Each fragment is either a no-op (empty) or a leading AND.
  const domain = url.searchParams.get("domain");
  const cityId = url.searchParams.get("cityId");
  const zoneId = url.searchParams.get("zoneId");
  const clusterId = url.searchParams.get("clusterId");

  const domainFilter = domain ? Prisma.sql`AND g."needsDomain" = ${domain}` : Prisma.empty;
  const cityFilter   = cityId ? Prisma.sql`AND g."needsCityId" = ${cityId}` : Prisma.empty;
  const zoneFilter   = zoneId ? Prisma.sql`AND g."needsZoneId" = ${zoneId}` : Prisma.empty;
  // Cluster: pitstop's overrides the goal's when present, mirroring team-overdue.
  const clusterFilterGoal     = clusterId ? Prisma.sql`AND g."needsClusterId" = ${clusterId}` : Prisma.empty;
  const clusterFilterPitstop  = clusterId ? Prisma.sql`AND COALESCE(p."needsClusterId", g."needsClusterId") = ${clusterId}` : Prisma.empty;

  const typeFilter = url.searchParams.get("type") as CompletionEntity | null;
  const want = (e: CompletionEntity) => !typeFilter || typeFilter === e;

  const parts: Promise<RawRow[]>[] = [];

  // ── PITSTOPS — credited to ownerId at completedAt ────────────────────────
  if (want("pitstop")) {
    parts.push(prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT
        'pitstop'::text   AS entity,
        p.id              AS id,
        p.title           AS title,
        p."completedAt"   AS completed_at,
        p."ownerId"       AS user_id,
        u.name            AS user_name,
        u.designation     AS designation,
        g."needsDomain"   AS domain,
        COALESCE(p."needsClusterId", g."needsClusterId") AS cluster_id,
        cl.name           AS cluster_name,
        g."needsCityId"   AS city_id,
        COALESCE(p."needsZoneId", g."needsZoneId") AS zone_id,
        p.id              AS pitstop_id,
        g.id              AS goal_id,
        g.title           AS goal_title
      FROM "Pitstop" p
      JOIN "Goal" g ON g.id = p."goalId"
      JOIN "User" u ON u.id = p."ownerId"
      LEFT JOIN "Cluster" cl ON cl.id = COALESCE(p."needsClusterId", g."needsClusterId")
      WHERE p."deletedAt" IS NULL
        AND g."deletedAt" IS NULL
        AND p."status" = 'Done'
        AND p."completedAt" IS NOT NULL
        AND p."completedAt" >= ${fromTs}
        AND p."completedAt" <= ${toTs}
        AND p."ownerId" = ANY(${userArr})
        ${domainFilter}
        ${cityFilter}
        ${zoneFilter}
        ${clusterFilterPitstop}
    `));
  }

  // ── ACTIVITIES — credited to completedById ───────────────────────────────
  // Activities can map to multiple pitstops via PitstopEventPitstop. We take
  // the first (lowest order) as the canonical context — same as team-overdue.
  if (want("activity")) {
    parts.push(prisma.$queryRaw<RawRow[]>(Prisma.sql`
      WITH ev AS (
        SELECT DISTINCT ON (e.id)
          e.id, e.title, e."completedAt", e."completedById",
          p.id  AS pitstop_id, g.id AS goal_id, g.title AS goal_title,
          g."needsDomain" AS domain,
          COALESCE(p."needsClusterId", g."needsClusterId") AS cluster_id,
          g."needsCityId"   AS city_id,
          COALESCE(p."needsZoneId", g."needsZoneId") AS zone_id
        FROM "PitstopEvent" e
        JOIN "PitstopEventPitstop" pep ON pep."eventId" = e.id
        JOIN "Pitstop" p ON p.id = pep."pitstopId"
        JOIN "Goal"    g ON g.id = p."goalId"
        WHERE e."deletedAt" IS NULL
          AND p."deletedAt" IS NULL
          AND g."deletedAt" IS NULL
          AND e."status" = 'Done'
          AND e."completedAt" IS NOT NULL
          AND e."completedAt" >= ${fromTs}
          AND e."completedAt" <= ${toTs}
          AND e."completedById" IS NOT NULL
          AND e."completedById" = ANY(${userArr})
          ${domainFilter}
          ${cityFilter}
          ${zoneFilter}
          ${clusterFilterPitstop}
        ORDER BY e.id, p."order" ASC, p."startDate" ASC
      )
      SELECT
        'activity'::text  AS entity,
        ev.id             AS id,
        ev.title          AS title,
        ev."completedAt"  AS completed_at,
        ev."completedById" AS user_id,
        u.name            AS user_name,
        u.designation     AS designation,
        ev.domain         AS domain,
        ev.cluster_id     AS cluster_id,
        cl.name           AS cluster_name,
        ev.city_id        AS city_id,
        ev.zone_id        AS zone_id,
        ev.pitstop_id     AS pitstop_id,
        ev.goal_id        AS goal_id,
        ev.goal_title     AS goal_title
      FROM ev
      JOIN "User" u ON u.id = ev."completedById"
      LEFT JOIN "Cluster" cl ON cl.id = ev.cluster_id
    `));
  }

  // ── CHECKLISTS — credited to completedById, fallback assigneeId ──────────
  if (want("checklist")) {
    parts.push(prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT
        'checklist'::text AS entity,
        ci.id             AS id,
        ci.text           AS title,
        ci."completedAt"  AS completed_at,
        COALESCE(ci."completedById", ci."assigneeId") AS user_id,
        u.name            AS user_name,
        u.designation     AS designation,
        g."needsDomain"   AS domain,
        COALESCE(p."needsClusterId", g."needsClusterId") AS cluster_id,
        cl.name           AS cluster_name,
        g."needsCityId"   AS city_id,
        COALESCE(p."needsZoneId", g."needsZoneId") AS zone_id,
        p.id              AS pitstop_id,
        g.id              AS goal_id,
        g.title           AS goal_title
      FROM "ChecklistItem" ci
      JOIN "Pitstop" p ON p.id = ci."pitstopId"
      JOIN "Goal" g    ON g.id = p."goalId"
      JOIN "User" u    ON u.id = COALESCE(ci."completedById", ci."assigneeId")
      LEFT JOIN "Cluster" cl ON cl.id = COALESCE(p."needsClusterId", g."needsClusterId")
      WHERE p."deletedAt" IS NULL
        AND g."deletedAt" IS NULL
        AND ci."status" = 'Done'
        AND ci."completedAt" IS NOT NULL
        AND ci."completedAt" >= ${fromTs}
        AND ci."completedAt" <= ${toTs}
        AND COALESCE(ci."completedById", ci."assigneeId") = ANY(${userArr})
        ${domainFilter}
        ${cityFilter}
        ${zoneFilter}
        ${clusterFilterPitstop}
    `));
  }

  // ── GOALS — credited to ownerId at closedAt ──────────────────────────────
  if (want("goal")) {
    parts.push(prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT
        'goal'::text      AS entity,
        g.id              AS id,
        g.title           AS title,
        g."closedAt"      AS completed_at,
        g."ownerId"       AS user_id,
        u.name            AS user_name,
        u.designation     AS designation,
        g."needsDomain"   AS domain,
        g."needsClusterId" AS cluster_id,
        cl.name           AS cluster_name,
        g."needsCityId"   AS city_id,
        g."needsZoneId"   AS zone_id,
        NULL::text        AS pitstop_id,
        g.id              AS goal_id,
        g.title           AS goal_title
      FROM "Goal" g
      JOIN "User" u ON u.id = g."ownerId"
      LEFT JOIN "Cluster" cl ON cl.id = g."needsClusterId"
      WHERE g."deletedAt" IS NULL
        AND g."status" = 'Complete'
        AND g."closedAt" IS NOT NULL
        AND g."closedAt" >= ${fromTs}
        AND g."closedAt" <= ${toTs}
        AND g."ownerId" = ANY(${userArr})
        ${domainFilter}
        ${cityFilter}
        ${zoneFilter}
        ${clusterFilterGoal}
    `));
  }

  // ── FOLLOW-UPS (ActionPoint) — credited to completedById ─────────────────
  if (want("followup")) {
    parts.push(prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT
        'followup'::text  AS entity,
        ap.id             AS id,
        ap.title          AS title,
        ap."completedAt"  AS completed_at,
        ap."completedById" AS user_id,
        u.name            AS user_name,
        u.designation     AS designation,
        g."needsDomain"   AS domain,
        COALESCE(p."needsClusterId", g."needsClusterId") AS cluster_id,
        cl.name           AS cluster_name,
        g."needsCityId"   AS city_id,
        COALESCE(p."needsZoneId", g."needsZoneId") AS zone_id,
        ap."pitstopId"    AS pitstop_id,
        g.id              AS goal_id,
        g.title           AS goal_title
      FROM "ActionPoint" ap
      JOIN "Pitstop" p ON p.id = ap."pitstopId"
      JOIN "Goal" g    ON g.id = p."goalId"
      JOIN "User" u    ON u.id = ap."completedById"
      LEFT JOIN "Cluster" cl ON cl.id = COALESCE(p."needsClusterId", g."needsClusterId")
      WHERE ap."status" = 'done'
        AND ap."completedAt" IS NOT NULL
        AND ap."completedAt" >= ${fromTs}
        AND ap."completedAt" <= ${toTs}
        AND ap."completedById" = ANY(${userArr})
        ${domainFilter}
        ${cityFilter}
        ${zoneFilter}
        ${clusterFilterPitstop}
    `));
  }

  const buckets = await Promise.all(parts);

  const items: CompletionItem[] = buckets.flat().map(r => ({
    entity: r.entity,
    id: r.id,
    title: r.title,
    completedAt: new Date(r.completed_at).toISOString(),
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
  }));

  // Sort newest first — drilldowns read top-down by recency.
  items.sort((a, b) => b.completedAt.localeCompare(a.completedAt));

  const counts = {
    pitstop:   items.filter(i => i.entity === "pitstop").length,
    activity:  items.filter(i => i.entity === "activity").length,
    checklist: items.filter(i => i.entity === "checklist").length,
    goal:      items.filter(i => i.entity === "goal").length,
    followup:  items.filter(i => i.entity === "followup").length,
  };

  return Response.json({
    window: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    items,
    counts,
  } satisfies CompletionsResponse);
}
