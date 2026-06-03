/**
 * Monthly visit-planner data. Returns the pitstops whose startDate falls in
 * the requested window, with goal + geo + owner context, so the /planner page
 * can render them as draggable cards on a calendar grid.
 *
 *   GET /api/pitstops/planner?from=YYYY-MM-DD&to=YYYY-MM-DD&scope=mine|team
 *
 *   - `mine` (default): pitstops owned by the caller (or whose goal they own/co-own)
 *   - `team`: RBAC team scope on `pitstop` (expands via reportsToId tree)
 *
 * Skips Done / Cancelled pitstops (no point dragging a historical visit) and
 * soft-deleted goals / pitstops. Results are capped at 500 — beyond that the
 * UI gets unusable anyway.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildRbacContext, scopeWhere } from "@/lib/rbac";

const select = {
  id: true,
  title: true,
  status: true,
  recurrence: true,
  startDate: true,
  targetDate: true,
  ownerId: true,
  goalId: true,
  goal: {
    select: {
      id: true,
      title: true,
      needsDomain: true,
      needsCluster:    { select: { id: true, name: true } },
      needsSettlement: { select: { id: true, name: true } },
    },
  },
  owner: { select: { id: true, name: true, image: true } },
} as const;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await buildRbacContext(session);
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const scope = (url.searchParams.get("scope") ?? "mine") as "mine" | "team";
  if (!from || !to) {
    return Response.json({ error: "from and to (YYYY-MM-DD) required" }, { status: 400 });
  }
  // Interpret the YMD bounds as local-midnight → end-of-day so a visit at
  // 9 AM IST on the boundary day shows on the right cell.
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T23:59:59`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return Response.json({ error: "from/to must be YYYY-MM-DD" }, { status: 400 });
  }

  // Scope filter — RP path is fast (just ownerId), team path goes through
  // the standard pitstop scope builder.
  let where: Record<string, unknown> = {};
  if (scope === "team") {
    const rbac = await scopeWhere(ctx, "pitstop", "list");
    if (rbac === null) return Response.json([], { status: 200 });
    where = { ...rbac };
  } else {
    where = {
      OR: [
        { ownerId: ctx.userId },
        { coOwners: { some: { userId: ctx.userId } } },
        { goal: { ownerId: ctx.userId } },
        { goal: { coOwners: { some: { userId: ctx.userId } } } },
      ],
    };
  }

  const rows = await prisma.pitstop.findMany({
    where: {
      ...where,
      deletedAt: null,
      goal: { deletedAt: null },
      startDate: { gte: fromDate, lte: toDate },
      status: { in: ["Upcoming", "InProgress"] },
    },
    select,
    orderBy: { startDate: "asc" },
    take: 500,
  });

  return Response.json(rows);
}
