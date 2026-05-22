import { NextRequest } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getTeamIds } from "@/lib/rbac";

// GET /api/team-overdue
//
// Returns currently-open + past-due entities (goal, pitstop, checklist,
// activity) across the leader's reportees, with enough metadata for a
// role → cluster/domain → pitstop drill-down.

export type OverdueEntity = "goal" | "pitstop" | "checklist" | "activity";

export type OverdueItem = {
  entity: OverdueEntity;
  id: string;
  title: string;
  userId: string;
  userName: string | null;
  designation: string;
  domain: string | null;
  clusterId: string | null;
  clusterName: string | null;
  pitstopId: string | null;
  goalId: string;
  dueAt: string;       // ISO
  daysOverdue: number;
};

export type OverdueResponse = {
  items: OverdueItem[];
};

type RawGoal = {
  entity: "goal";
  id: string;
  title: string;
  user_id: string;
  user_name: string | null;
  designation: string;
  domain: string | null;
  cluster_id: string | null;
  cluster_name: string | null;
  pitstop_id: null;
  goal_id: string;
  due_at: Date;
};
type RawPitstop = Omit<RawGoal, "entity" | "pitstop_id"> & { entity: "pitstop"; pitstop_id: string };
type RawChecklist = Omit<RawGoal, "entity" | "pitstop_id"> & { entity: "checklist"; pitstop_id: string };
type RawActivity = Omit<RawGoal, "entity" | "pitstop_id"> & { entity: "activity"; pitstop_id: string };
type RawRow = RawGoal | RawPitstop | RawChecklist | RawActivity;

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tree = await getTeamIds(session.user.id);
  const teamIds = tree.filter((id) => id !== session.user.id);
  if (teamIds.length === 0) return Response.json({ items: [] } satisfies OverdueResponse);

  const teamArr = Prisma.sql`ARRAY[${Prisma.join(teamIds)}]::text[]`;
  const now = new Date();

  // ── GOALS ─────────────────────────────────────────────────────────────────
  const goals = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    WITH overdue AS (
      SELECT g.id, g.title, g."needsDomain" AS domain, g.id AS goal_id,
             g."ownerId" AS owner_id, g."needsClusterId" AS cluster_id,
             g."targetDate" AS due_at
      FROM "Goal" g
      WHERE g."deletedAt" IS NULL
        AND g."status" != 'Complete'
        AND g."targetDate" IS NOT NULL
        AND g."targetDate" < ${now}
    ),
    credits AS (
      SELECT o.*, owner_id AS user_id FROM overdue o WHERE owner_id IS NOT NULL
      UNION ALL
      SELECT o.*, co."userId" AS user_id FROM overdue o JOIN "GoalCoOwner" co ON co."goalId" = o.id
    )
    SELECT DISTINCT
      'goal'::text AS entity,
      c.id, c.title, c.user_id, u.name AS user_name, u.designation,
      c.domain, c.cluster_id, cl.name AS cluster_name,
      NULL::text AS pitstop_id, c.goal_id, c.due_at
    FROM credits c
    JOIN "User" u ON u.id = c.user_id
    LEFT JOIN "Cluster" cl ON cl.id = c.cluster_id
    WHERE c.user_id = ANY(${teamArr})
  `);

  // ── PITSTOPS ──────────────────────────────────────────────────────────────
  const pitstops = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    WITH overdue AS (
      SELECT p.id, p.title, g."needsDomain" AS domain, g.id AS goal_id,
             p."ownerId" AS owner_id,
             COALESCE(p."needsClusterId", g."needsClusterId") AS cluster_id,
             p."targetDate" AS due_at
      FROM "Pitstop" p
      JOIN "Goal" g ON g.id = p."goalId"
      WHERE p."deletedAt" IS NULL
        AND p."status" != 'Done'
        AND p."targetDate" IS NOT NULL
        AND p."targetDate" < ${now}
        AND g."deletedAt" IS NULL
    ),
    credits AS (
      SELECT o.*, owner_id AS user_id FROM overdue o WHERE owner_id IS NOT NULL
      UNION ALL
      SELECT o.*, co."userId" AS user_id FROM overdue o JOIN "PitstopCoOwner" co ON co."pitstopId" = o.id
    )
    SELECT DISTINCT
      'pitstop'::text AS entity,
      c.id, c.title, c.user_id, u.name AS user_name, u.designation,
      c.domain, c.cluster_id, cl.name AS cluster_name,
      c.id AS pitstop_id, c.goal_id, c.due_at
    FROM credits c
    JOIN "User" u ON u.id = c.user_id
    LEFT JOIN "Cluster" cl ON cl.id = c.cluster_id
    WHERE c.user_id = ANY(${teamArr})
  `);

  // ── CHECKLISTS ────────────────────────────────────────────────────────────
  // Overdue = earliest linked activity's scheduledAt < now AND checklist not Done.
  const checklists = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    WITH overdue AS (
      SELECT ci.id, ci.text AS title, g."needsDomain" AS domain, g.id AS goal_id,
             p.id AS pitstop_id, p."ownerId" AS owner_id,
             COALESCE(p."needsClusterId", g."needsClusterId") AS cluster_id,
             first_act."scheduledAt" AS due_at
      FROM "ChecklistItem" ci
      JOIN "Pitstop" p ON p.id = ci."pitstopId"
      JOIN "Goal" g ON g.id = p."goalId"
      LEFT JOIN LATERAL (
        SELECT pe."scheduledAt"
        FROM "PitstopEvent" pe
        WHERE pe."checklistItemId" = ci.id
        ORDER BY pe."createdAt" ASC
        LIMIT 1
      ) first_act ON TRUE
      WHERE ci.status NOT IN ('Done', 'Cancelled')
        AND p."deletedAt" IS NULL
        AND g."deletedAt" IS NULL
        AND first_act."scheduledAt" IS NOT NULL
        AND first_act."scheduledAt" < ${now}
    ),
    credits AS (
      SELECT o.*, owner_id AS user_id FROM overdue o WHERE owner_id IS NOT NULL
      UNION ALL
      SELECT o.*, co."userId" AS user_id FROM overdue o JOIN "PitstopCoOwner" co ON co."pitstopId" = o.pitstop_id
    )
    SELECT DISTINCT
      'checklist'::text AS entity,
      c.id, c.title, c.user_id, u.name AS user_name, u.designation,
      c.domain, c.cluster_id, cl.name AS cluster_name,
      c.pitstop_id, c.goal_id, c.due_at
    FROM credits c
    JOIN "User" u ON u.id = c.user_id
    LEFT JOIN "Cluster" cl ON cl.id = c.cluster_id
    WHERE c.user_id = ANY(${teamArr})
  `);

  // ── ACTIVITIES ────────────────────────────────────────────────────────────
  const activities = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    WITH overdue AS (
      SELECT DISTINCT ON (e.id)
        e.id, e.title, g."needsDomain" AS domain, g.id AS goal_id,
        p.id AS pitstop_id, p."ownerId" AS owner_id,
        COALESCE(p."needsClusterId", g."needsClusterId") AS cluster_id,
        e."scheduledAt" AS due_at
      FROM "PitstopEvent" e
      JOIN "PitstopEventPitstop" pep ON pep."eventId" = e.id
      JOIN "Pitstop" p ON p.id = pep."pitstopId"
      JOIN "Goal" g ON g.id = p."goalId"
      WHERE e.status NOT IN ('Done', 'Cancelled')
        AND e."scheduledAt" < ${now}
        AND p."deletedAt" IS NULL
        AND g."deletedAt" IS NULL
      ORDER BY e.id, p."order" ASC, p."startDate" ASC
    ),
    credits AS (
      SELECT o.*, owner_id AS user_id FROM overdue o WHERE owner_id IS NOT NULL
      UNION ALL
      SELECT o.*, co."userId" AS user_id FROM overdue o JOIN "PitstopCoOwner" co ON co."pitstopId" = o.pitstop_id
    )
    SELECT DISTINCT
      'activity'::text AS entity,
      c.id, c.title, c.user_id, u.name AS user_name, u.designation,
      c.domain, c.cluster_id, cl.name AS cluster_name,
      c.pitstop_id, c.goal_id, c.due_at
    FROM credits c
    JOIN "User" u ON u.id = c.user_id
    LEFT JOIN "Cluster" cl ON cl.id = c.cluster_id
    WHERE c.user_id = ANY(${teamArr})
  `);

  const nowMs = now.getTime();
  const items: OverdueItem[] = [...goals, ...pitstops, ...checklists, ...activities].map((r) => ({
    entity: r.entity as OverdueEntity,
    id: r.id,
    title: r.title,
    userId: r.user_id,
    userName: r.user_name,
    designation: r.designation,
    domain: r.domain,
    clusterId: r.cluster_id,
    clusterName: r.cluster_name,
    pitstopId: r.pitstop_id,
    goalId: r.goal_id,
    dueAt: new Date(r.due_at).toISOString(),
    daysOverdue: Math.max(0, Math.floor((nowMs - new Date(r.due_at).getTime()) / 86_400_000)),
  }));

  return Response.json({ items } satisfies OverdueResponse);
}
