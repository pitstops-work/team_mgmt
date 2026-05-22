import { NextRequest } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getTeamIds } from "@/lib/rbac";
import { rollingCutoff, round2, type SlaEntity, type SlaMode } from "@/lib/sla";

// GET /api/team-sla/drill?userId=...&entity=goal|pitstop|checklist|activity
//                       &domain=...&mode=rolling|allTime
//                       [&goalId=...]
//
// Without goalId  → per-goal breakdown for (user, entity, domain).
// With    goalId  → per-pitstop breakdown for (user, entity, goalId).
//                   Pitstop entity at this level always groups by pitstop;
//                   the goal-level view for entity=goal degenerates to a list
//                   of individual goals (n=1 each), which is still useful.

export type DrillRow = {
  id: string;        // goalId or pitstopId
  parentId: string | null; // for pitstop rows: the goalId; null for goal rows
  label: string;
  actualAvgDays: number;
  targetAvgDays: number;
  breachDays: number;
  n: number;
};

export type DrillResponse = {
  level: "goal" | "pitstop";
  rows: DrillRow[];
};

type RawDrill = {
  id: string;
  parent_id: string | null;
  label: string;
  actual_avg_days: number | null;
  target_avg_days: number | null;
  n: bigint;
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const userId = sp.get("userId");
  const entity = sp.get("entity") as SlaEntity | null;
  const domain = sp.get("domain");
  const goalId = sp.get("goalId");
  const mode: SlaMode = sp.get("mode") === "allTime" ? "allTime" : "rolling";

  if (!userId || !entity) {
    return Response.json({ error: "userId and entity required" }, { status: 400 });
  }
  if (!["goal", "pitstop", "checklist", "activity"].includes(entity)) {
    return Response.json({ error: "invalid entity" }, { status: 400 });
  }

  // Authorise: target user must be in the leader's team.
  const tree = await getTeamIds(session.user.id);
  if (!tree.includes(userId)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const cutoff = mode === "rolling" ? rollingCutoff() : null;
  const level: "goal" | "pitstop" = goalId ? "pitstop" : "goal";

  // Build the cutoff fragment per entity (timestamp column differs).
  const goalCutoff = cutoff ? Prisma.sql`AND e."closedAt" >= ${cutoff}` : Prisma.empty;
  const otherCutoff = cutoff ? Prisma.sql`AND e."completedAt" >= ${cutoff}` : Prisma.empty;

  let raw: RawDrill[] = [];

  // ── ENTITY = GOAL ─────────────────────────────────────────────────────────
  // At goal-drill level: one row per goal. At pitstop-drill level: caller
  // passed goalId — for entity=goal this is meaningless; we return [].
  if (entity === "goal") {
    if (level === "pitstop") {
      return Response.json({ level, rows: [] } satisfies DrillResponse);
    }
    raw = await prisma.$queryRaw<RawDrill[]>(Prisma.sql`
      WITH completed AS (
        SELECT e.id, e.title, e."closedAt" AS actual_end, e."targetDate" AS target_end,
               e."startDate" AS anchor, e."needsDomain" AS domain, e."ownerId" AS owner_id
        FROM "Goal" e
        WHERE e."deletedAt" IS NULL AND e."status" = 'Complete'
          AND e."closedAt" IS NOT NULL AND e."startDate" IS NOT NULL
          AND e."targetDate" IS NOT NULL
          ${goalCutoff}
      ),
      credits AS (
        SELECT id, title, actual_end, target_end, anchor, domain, owner_id AS user_id
        FROM completed WHERE owner_id IS NOT NULL
        UNION ALL
        SELECT c.id, c.title, c.actual_end, c.target_end, c.anchor, c.domain, co."userId"
        FROM completed c JOIN "GoalCoOwner" co ON co."goalId" = c.id
      )
      SELECT
        c.id, NULL::text AS parent_id, c.title AS label,
        AVG(EXTRACT(EPOCH FROM (c.actual_end - c.anchor)) / 86400)::float8 AS actual_avg_days,
        AVG(EXTRACT(EPOCH FROM (c.target_end - c.anchor)) / 86400)::float8 AS target_avg_days,
        COUNT(*)::bigint AS n
      FROM credits c
      WHERE c.user_id = ${userId}
        ${domain === null ? Prisma.empty : domain === "" ? Prisma.sql`AND c.domain IS NULL` : Prisma.sql`AND c.domain = ${domain}`}
      GROUP BY c.id, c.title
      ORDER BY c.title ASC
    `);
  }

  // ── ENTITY = PITSTOP ──────────────────────────────────────────────────────
  else if (entity === "pitstop") {
    if (level === "goal") {
      raw = await prisma.$queryRaw<RawDrill[]>(Prisma.sql`
        WITH completed AS (
          SELECT e.id, g.id AS goal_id, g.title AS goal_title,
                 e."completedAt" AS actual_end, e."targetDate" AS target_end,
                 e."startDate" AS anchor, g."needsDomain" AS domain, e."ownerId" AS owner_id
          FROM "Pitstop" e JOIN "Goal" g ON g.id = e."goalId"
          WHERE e."deletedAt" IS NULL AND e."status" = 'Done'
            AND e."completedAt" IS NOT NULL AND e."startDate" IS NOT NULL
            AND e."targetDate" IS NOT NULL AND g."deletedAt" IS NULL
            ${otherCutoff}
        ),
        credits AS (
          SELECT id, goal_id, goal_title, actual_end, target_end, anchor, domain, owner_id AS user_id
          FROM completed WHERE owner_id IS NOT NULL
          UNION ALL
          SELECT c.id, c.goal_id, c.goal_title, c.actual_end, c.target_end, c.anchor, c.domain, co."userId"
          FROM completed c JOIN "PitstopCoOwner" co ON co."pitstopId" = c.id
        )
        SELECT
          c.goal_id AS id, NULL::text AS parent_id, c.goal_title AS label,
          AVG(EXTRACT(EPOCH FROM (c.actual_end - c.anchor)) / 86400)::float8 AS actual_avg_days,
          AVG(EXTRACT(EPOCH FROM (c.target_end - c.anchor)) / 86400)::float8 AS target_avg_days,
          COUNT(*)::bigint AS n
        FROM credits c
        WHERE c.user_id = ${userId}
          ${domain === null ? Prisma.empty : domain === "" ? Prisma.sql`AND c.domain IS NULL` : Prisma.sql`AND c.domain = ${domain}`}
        GROUP BY c.goal_id, c.goal_title
        ORDER BY c.goal_title ASC
      `);
    } else {
      raw = await prisma.$queryRaw<RawDrill[]>(Prisma.sql`
        WITH completed AS (
          SELECT e.id, e.title AS pitstop_title, e."goalId" AS goal_id,
                 e."completedAt" AS actual_end, e."targetDate" AS target_end,
                 e."startDate" AS anchor, e."ownerId" AS owner_id
          FROM "Pitstop" e
          WHERE e."deletedAt" IS NULL AND e."status" = 'Done'
            AND e."completedAt" IS NOT NULL AND e."startDate" IS NOT NULL
            AND e."targetDate" IS NOT NULL AND e."goalId" = ${goalId}
            ${otherCutoff}
        ),
        credits AS (
          SELECT id, pitstop_title, goal_id, actual_end, target_end, anchor, owner_id AS user_id
          FROM completed WHERE owner_id IS NOT NULL
          UNION ALL
          SELECT c.id, c.pitstop_title, c.goal_id, c.actual_end, c.target_end, c.anchor, co."userId"
          FROM completed c JOIN "PitstopCoOwner" co ON co."pitstopId" = c.id
        )
        SELECT
          c.id, c.goal_id AS parent_id, c.pitstop_title AS label,
          AVG(EXTRACT(EPOCH FROM (c.actual_end - c.anchor)) / 86400)::float8 AS actual_avg_days,
          AVG(EXTRACT(EPOCH FROM (c.target_end - c.anchor)) / 86400)::float8 AS target_avg_days,
          COUNT(*)::bigint AS n
        FROM credits c
        WHERE c.user_id = ${userId}
        GROUP BY c.id, c.goal_id, c.pitstop_title
        ORDER BY c.pitstop_title ASC
      `);
    }
  }

  // ── ENTITY = CHECKLIST ────────────────────────────────────────────────────
  else if (entity === "checklist") {
    if (level === "goal") {
      raw = await prisma.$queryRaw<RawDrill[]>(Prisma.sql`
        WITH completed AS (
          SELECT e.id, g.id AS goal_id, g.title AS goal_title,
                 e."completedAt" AS actual_end, first_act."scheduledAt" AS target_end,
                 p."startDate" AS anchor, p.id AS pitstop_id, p."ownerId" AS owner_id,
                 g."needsDomain" AS domain
          FROM "ChecklistItem" e
          JOIN "Pitstop" p ON p.id = e."pitstopId"
          JOIN "Goal" g ON g.id = p."goalId"
          LEFT JOIN LATERAL (
            SELECT pe."scheduledAt" FROM "PitstopEvent" pe
            WHERE pe."checklistItemId" = e.id
            ORDER BY pe."createdAt" ASC LIMIT 1
          ) first_act ON TRUE
          WHERE e."status" = 'Done' AND e."completedAt" IS NOT NULL
            AND p."deletedAt" IS NULL AND p."startDate" IS NOT NULL
            AND first_act."scheduledAt" IS NOT NULL AND g."deletedAt" IS NULL
            ${otherCutoff}
        ),
        credits AS (
          SELECT id, goal_id, goal_title, actual_end, target_end, anchor, pitstop_id, domain, owner_id AS user_id
          FROM completed WHERE owner_id IS NOT NULL
          UNION ALL
          SELECT c.id, c.goal_id, c.goal_title, c.actual_end, c.target_end, c.anchor, c.pitstop_id, c.domain, co."userId"
          FROM completed c JOIN "PitstopCoOwner" co ON co."pitstopId" = c.pitstop_id
        )
        SELECT
          c.goal_id AS id, NULL::text AS parent_id, c.goal_title AS label,
          AVG(EXTRACT(EPOCH FROM (c.actual_end - c.anchor)) / 86400)::float8 AS actual_avg_days,
          AVG(EXTRACT(EPOCH FROM (c.target_end - c.anchor)) / 86400)::float8 AS target_avg_days,
          COUNT(*)::bigint AS n
        FROM credits c
        WHERE c.user_id = ${userId}
          ${domain === null ? Prisma.empty : domain === "" ? Prisma.sql`AND c.domain IS NULL` : Prisma.sql`AND c.domain = ${domain}`}
        GROUP BY c.goal_id, c.goal_title
        ORDER BY c.goal_title ASC
      `);
    } else {
      raw = await prisma.$queryRaw<RawDrill[]>(Prisma.sql`
        WITH completed AS (
          SELECT e.id, p.id AS pitstop_id, p.title AS pitstop_title, p."goalId" AS goal_id,
                 e."completedAt" AS actual_end, first_act."scheduledAt" AS target_end,
                 p."startDate" AS anchor, p."ownerId" AS owner_id
          FROM "ChecklistItem" e
          JOIN "Pitstop" p ON p.id = e."pitstopId"
          LEFT JOIN LATERAL (
            SELECT pe."scheduledAt" FROM "PitstopEvent" pe
            WHERE pe."checklistItemId" = e.id
            ORDER BY pe."createdAt" ASC LIMIT 1
          ) first_act ON TRUE
          WHERE e."status" = 'Done' AND e."completedAt" IS NOT NULL
            AND p."deletedAt" IS NULL AND p."startDate" IS NOT NULL
            AND first_act."scheduledAt" IS NOT NULL AND p."goalId" = ${goalId}
            ${otherCutoff}
        ),
        credits AS (
          SELECT id, pitstop_id, pitstop_title, goal_id, actual_end, target_end, anchor, owner_id AS user_id
          FROM completed WHERE owner_id IS NOT NULL
          UNION ALL
          SELECT c.id, c.pitstop_id, c.pitstop_title, c.goal_id, c.actual_end, c.target_end, c.anchor, co."userId"
          FROM completed c JOIN "PitstopCoOwner" co ON co."pitstopId" = c.pitstop_id
        )
        SELECT
          c.pitstop_id AS id, c.goal_id AS parent_id, c.pitstop_title AS label,
          AVG(EXTRACT(EPOCH FROM (c.actual_end - c.anchor)) / 86400)::float8 AS actual_avg_days,
          AVG(EXTRACT(EPOCH FROM (c.target_end - c.anchor)) / 86400)::float8 AS target_avg_days,
          COUNT(*)::bigint AS n
        FROM credits c
        WHERE c.user_id = ${userId}
        GROUP BY c.pitstop_id, c.goal_id, c.pitstop_title
        ORDER BY c.pitstop_title ASC
      `);
    }
  }

  // ── ENTITY = ACTIVITY ─────────────────────────────────────────────────────
  else if (entity === "activity") {
    if (level === "goal") {
      raw = await prisma.$queryRaw<RawDrill[]>(Prisma.sql`
        WITH completed AS (
          SELECT DISTINCT ON (e.id)
            e.id, g.id AS goal_id, g.title AS goal_title,
            e."completedAt" AS actual_end, e."scheduledAt" AS target_end,
            p."startDate" AS anchor, p.id AS pitstop_id, p."ownerId" AS owner_id,
            g."needsDomain" AS domain
          FROM "PitstopEvent" e
          JOIN "PitstopEventPitstop" pep ON pep."eventId" = e.id
          JOIN "Pitstop" p ON p.id = pep."pitstopId"
          JOIN "Goal" g ON g.id = p."goalId"
          WHERE e."completedAt" IS NOT NULL
            AND p."deletedAt" IS NULL AND p."startDate" IS NOT NULL
            AND g."deletedAt" IS NULL
            ${otherCutoff}
          ORDER BY e.id, p."order" ASC, p."startDate" ASC
        ),
        credits AS (
          SELECT id, goal_id, goal_title, actual_end, target_end, anchor, pitstop_id, domain, owner_id AS user_id
          FROM completed WHERE owner_id IS NOT NULL
          UNION ALL
          SELECT c.id, c.goal_id, c.goal_title, c.actual_end, c.target_end, c.anchor, c.pitstop_id, c.domain, co."userId"
          FROM completed c JOIN "PitstopCoOwner" co ON co."pitstopId" = c.pitstop_id
        )
        SELECT
          c.goal_id AS id, NULL::text AS parent_id, c.goal_title AS label,
          AVG(EXTRACT(EPOCH FROM (c.actual_end - c.anchor)) / 86400)::float8 AS actual_avg_days,
          AVG(EXTRACT(EPOCH FROM (c.target_end - c.anchor)) / 86400)::float8 AS target_avg_days,
          COUNT(*)::bigint AS n
        FROM credits c
        WHERE c.user_id = ${userId}
          ${domain === null ? Prisma.empty : domain === "" ? Prisma.sql`AND c.domain IS NULL` : Prisma.sql`AND c.domain = ${domain}`}
        GROUP BY c.goal_id, c.goal_title
        ORDER BY c.goal_title ASC
      `);
    } else {
      raw = await prisma.$queryRaw<RawDrill[]>(Prisma.sql`
        WITH completed AS (
          SELECT DISTINCT ON (e.id)
            e.id, p.id AS pitstop_id, p.title AS pitstop_title, p."goalId" AS goal_id,
            e."completedAt" AS actual_end, e."scheduledAt" AS target_end,
            p."startDate" AS anchor, p."ownerId" AS owner_id
          FROM "PitstopEvent" e
          JOIN "PitstopEventPitstop" pep ON pep."eventId" = e.id
          JOIN "Pitstop" p ON p.id = pep."pitstopId"
          WHERE e."completedAt" IS NOT NULL
            AND p."deletedAt" IS NULL AND p."startDate" IS NOT NULL
            AND p."goalId" = ${goalId}
            ${otherCutoff}
          ORDER BY e.id, p."order" ASC, p."startDate" ASC
        ),
        credits AS (
          SELECT id, pitstop_id, pitstop_title, goal_id, actual_end, target_end, anchor, owner_id AS user_id
          FROM completed WHERE owner_id IS NOT NULL
          UNION ALL
          SELECT c.id, c.pitstop_id, c.pitstop_title, c.goal_id, c.actual_end, c.target_end, c.anchor, co."userId"
          FROM completed c JOIN "PitstopCoOwner" co ON co."pitstopId" = c.pitstop_id
        )
        SELECT
          c.pitstop_id AS id, c.goal_id AS parent_id, c.pitstop_title AS label,
          AVG(EXTRACT(EPOCH FROM (c.actual_end - c.anchor)) / 86400)::float8 AS actual_avg_days,
          AVG(EXTRACT(EPOCH FROM (c.target_end - c.anchor)) / 86400)::float8 AS target_avg_days,
          COUNT(*)::bigint AS n
        FROM credits c
        WHERE c.user_id = ${userId}
        GROUP BY c.pitstop_id, c.goal_id, c.pitstop_title
        ORDER BY c.pitstop_title ASC
      `);
    }
  }

  const rows: DrillRow[] = raw.map((r) => {
    const actual = r.actual_avg_days ?? 0;
    const target = r.target_avg_days ?? 0;
    return {
      id: r.id,
      parentId: r.parent_id,
      label: r.label,
      actualAvgDays: round2(actual),
      targetAvgDays: round2(target),
      breachDays: round2(actual - target),
      n: Number(r.n),
    };
  });

  return Response.json({ level, rows } satisfies DrillResponse);
}
