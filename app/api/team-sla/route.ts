import { NextRequest } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getTeamIds } from "@/lib/rbac";
import {
  ROLLING_WINDOW_DAYS,
  rollingCutoff,
  round2,
  type SlaMode,
  type SlaResponse,
  type SlaRow,
} from "@/lib/sla";

// GET /api/team-sla?mode=rolling|allTime
//
// Returns per-(user, role, domain, entity) average actual vs. target completion
// time in days. Credits goal completions to owner + co-owners, and credits
// pitstop / checklist / activity completions to the parent pitstop's owner +
// co-owners (RP-level responsibility for the pitstop window).

type RawRow = {
  user_id: string;
  user_name: string | null;
  designation: string;
  domain: string | null;
  actual_avg_days: number | null;
  target_avg_days: number | null;
  n: bigint;
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const mode: SlaMode = req.nextUrl.searchParams.get("mode") === "allTime" ? "allTime" : "rolling";
  const cutoff = mode === "rolling" ? rollingCutoff() : null;

  // Team = leader's transitive reports, EXCLUDING the leader themselves so the
  // matrix shows reportees only.
  const tree = await getTeamIds(session.user.id);
  const teamIds = tree.filter((id) => id !== session.user.id);
  if (teamIds.length === 0) {
    const empty: SlaResponse = { mode, windowDays: mode === "rolling" ? ROLLING_WINDOW_DAYS : null, rows: [] };
    return Response.json(empty);
  }

  const teamArr = Prisma.sql`ARRAY[${Prisma.join(teamIds)}]::text[]`;
  const cutoffClause = cutoff ? Prisma.sql`AND e."completedAt" >= ${cutoff}` : Prisma.empty;

  // ── GOALS ─────────────────────────────────────────────────────────────────
  // Credits = goal owner + GoalCoOwner. Domain = goal.needsDomain.
  // Only goals with explicit startDate AND closedAt count (we backfilled
  // startDate=createdAt and closedAt=updatedAt on already-Complete rows).
  const goalRows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    WITH completed AS (
      SELECT
        e.id,
        e."closedAt" AS actual_end,
        e."targetDate" AS target_end,
        e."startDate" AS anchor,
        e."needsDomain" AS domain,
        e."ownerId" AS owner_id
      FROM "Goal" e
      WHERE e."deletedAt" IS NULL
        AND e."status" = 'Complete'
        AND e."closedAt" IS NOT NULL
        AND e."startDate" IS NOT NULL
        AND e."targetDate" IS NOT NULL
        ${cutoff ? Prisma.sql`AND e."closedAt" >= ${cutoff}` : Prisma.empty}
    ),
    credits AS (
      SELECT id, actual_end, target_end, anchor, domain, owner_id AS user_id
      FROM completed WHERE owner_id IS NOT NULL
      UNION ALL
      SELECT c.id, c.actual_end, c.target_end, c.anchor, c.domain, co."userId"
      FROM completed c JOIN "GoalCoOwner" co ON co."goalId" = c.id
    )
    SELECT
      c.user_id,
      u.name AS user_name,
      u.designation,
      c.domain,
      AVG(EXTRACT(EPOCH FROM (c.actual_end - c.anchor)) / 86400)::float8 AS actual_avg_days,
      AVG(EXTRACT(EPOCH FROM (c.target_end - c.anchor)) / 86400)::float8 AS target_avg_days,
      COUNT(*)::bigint AS n
    FROM credits c
    JOIN "User" u ON u.id = c.user_id
    WHERE c.user_id = ANY(${teamArr})
    GROUP BY c.user_id, u.name, u.designation, c.domain
  `);

  // ── PITSTOPS ──────────────────────────────────────────────────────────────
  // Credits = pitstop owner + PitstopCoOwner. Domain = parent goal.
  const pitstopRows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    WITH completed AS (
      SELECT
        e.id,
        e."completedAt" AS actual_end,
        e."targetDate" AS target_end,
        e."startDate" AS anchor,
        g."needsDomain" AS domain,
        e."ownerId" AS owner_id
      FROM "Pitstop" e
      JOIN "Goal" g ON g.id = e."goalId"
      WHERE e."deletedAt" IS NULL
        AND e."status" = 'Done'
        AND e."completedAt" IS NOT NULL
        AND e."startDate" IS NOT NULL
        AND e."targetDate" IS NOT NULL
        AND g."deletedAt" IS NULL
        ${cutoffClause}
    ),
    credits AS (
      SELECT id, actual_end, target_end, anchor, domain, owner_id AS user_id
      FROM completed WHERE owner_id IS NOT NULL
      UNION ALL
      SELECT c.id, c.actual_end, c.target_end, c.anchor, c.domain, co."userId"
      FROM completed c JOIN "PitstopCoOwner" co ON co."pitstopId" = c.id
    )
    SELECT
      c.user_id,
      u.name AS user_name,
      u.designation,
      c.domain,
      AVG(EXTRACT(EPOCH FROM (c.actual_end - c.anchor)) / 86400)::float8 AS actual_avg_days,
      AVG(EXTRACT(EPOCH FROM (c.target_end - c.anchor)) / 86400)::float8 AS target_avg_days,
      COUNT(*)::bigint AS n
    FROM credits c
    JOIN "User" u ON u.id = c.user_id
    WHERE c.user_id = ANY(${teamArr})
    GROUP BY c.user_id, u.name, u.designation, c.domain
  `);

  // ── CHECKLISTS ────────────────────────────────────────────────────────────
  // Target = earliest-by-createdAt linked activity's scheduledAt - pitstop.startDate.
  // Credits = pitstop owner + PitstopCoOwner.
  const checklistRows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    WITH completed AS (
      SELECT
        e.id,
        e."completedAt" AS actual_end,
        p."startDate" AS anchor,
        first_act."scheduledAt" AS target_end,
        g."needsDomain" AS domain,
        p.id AS pitstop_id,
        p."ownerId" AS owner_id
      FROM "ChecklistItem" e
      JOIN "Pitstop" p ON p.id = e."pitstopId"
      JOIN "Goal" g ON g.id = p."goalId"
      LEFT JOIN LATERAL (
        SELECT pe."scheduledAt"
        FROM "PitstopEvent" pe
        WHERE pe."checklistItemId" = e.id
        ORDER BY pe."createdAt" ASC
        LIMIT 1
      ) first_act ON TRUE
      WHERE e."status" = 'Done'
        AND e."completedAt" IS NOT NULL
        AND p."deletedAt" IS NULL
        AND p."startDate" IS NOT NULL
        AND first_act."scheduledAt" IS NOT NULL
        AND g."deletedAt" IS NULL
        ${cutoffClause}
    ),
    credits AS (
      SELECT id, actual_end, target_end, anchor, domain, owner_id AS user_id
      FROM completed WHERE owner_id IS NOT NULL
      UNION ALL
      SELECT c.id, c.actual_end, c.target_end, c.anchor, c.domain, co."userId"
      FROM completed c JOIN "PitstopCoOwner" co ON co."pitstopId" = c.pitstop_id
    )
    SELECT
      c.user_id,
      u.name AS user_name,
      u.designation,
      c.domain,
      AVG(EXTRACT(EPOCH FROM (c.actual_end - c.anchor)) / 86400)::float8 AS actual_avg_days,
      AVG(EXTRACT(EPOCH FROM (c.target_end - c.anchor)) / 86400)::float8 AS target_avg_days,
      COUNT(*)::bigint AS n
    FROM credits c
    JOIN "User" u ON u.id = c.user_id
    WHERE c.user_id = ANY(${teamArr})
    GROUP BY c.user_id, u.name, u.designation, c.domain
  `);

  // ── ACTIVITIES ────────────────────────────────────────────────────────────
  // PitstopEvent ↔ Pitstop is many-to-many; we take the FIRST linked pitstop
  // (lowest order, then earliest start) so an event is counted once.
  const activityRows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    WITH completed AS (
      SELECT DISTINCT ON (e.id)
        e.id,
        e."completedAt" AS actual_end,
        e."scheduledAt" AS target_end,
        p."startDate" AS anchor,
        g."needsDomain" AS domain,
        p.id AS pitstop_id,
        p."ownerId" AS owner_id
      FROM "PitstopEvent" e
      JOIN "PitstopEventPitstop" pep ON pep."eventId" = e.id
      JOIN "Pitstop" p ON p.id = pep."pitstopId"
      JOIN "Goal" g ON g.id = p."goalId"
      WHERE e."completedAt" IS NOT NULL
        AND p."deletedAt" IS NULL
        AND p."startDate" IS NOT NULL
        AND g."deletedAt" IS NULL
        ${cutoffClause}
      ORDER BY e.id, p."order" ASC, p."startDate" ASC
    ),
    credits AS (
      SELECT id, actual_end, target_end, anchor, domain, owner_id AS user_id
      FROM completed WHERE owner_id IS NOT NULL
      UNION ALL
      SELECT c.id, c.actual_end, c.target_end, c.anchor, c.domain, co."userId"
      FROM completed c JOIN "PitstopCoOwner" co ON co."pitstopId" = c.pitstop_id
    )
    SELECT
      c.user_id,
      u.name AS user_name,
      u.designation,
      c.domain,
      AVG(EXTRACT(EPOCH FROM (c.actual_end - c.anchor)) / 86400)::float8 AS actual_avg_days,
      AVG(EXTRACT(EPOCH FROM (c.target_end - c.anchor)) / 86400)::float8 AS target_avg_days,
      COUNT(*)::bigint AS n
    FROM credits c
    JOIN "User" u ON u.id = c.user_id
    WHERE c.user_id = ANY(${teamArr})
    GROUP BY c.user_id, u.name, u.designation, c.domain
  `);

  const pack = (raw: RawRow[], entity: SlaRow["entity"]): SlaRow[] =>
    raw.map((r) => {
      const actual = r.actual_avg_days ?? 0;
      const target = r.target_avg_days ?? 0;
      return {
        userId: r.user_id,
        userName: r.user_name,
        designation: r.designation,
        domain: r.domain,
        entity,
        actualAvgDays: round2(actual),
        targetAvgDays: round2(target),
        breachDays: round2(actual - target),
        n: Number(r.n),
      };
    });

  const rows: SlaRow[] = [
    ...pack(goalRows, "goal"),
    ...pack(pitstopRows, "pitstop"),
    ...pack(checklistRows, "checklist"),
    ...pack(activityRows, "activity"),
  ];

  const body: SlaResponse = {
    mode,
    windowDays: mode === "rolling" ? ROLLING_WINDOW_DAYS : null,
    rows,
  };
  return Response.json(body);
}
