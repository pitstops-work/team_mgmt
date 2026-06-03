/**
 * Monthly visit-planner data. Returns pitstops whose startDate falls in the
 * requested window, owned by one of the requested user(s), with goal + geo +
 * owner context — the /visits page renders each row as a draggable card.
 *
 *   GET /api/pitstops/planner?from=YYYY-MM-DD&to=YYYY-MM-DD&userIds=u1,u2,…
 *
 * Visibility (designation-anchored, see lib/rbac.ts:getVisibleUserIds):
 *   - RP                    → {self} only (any requested userIds outside that
 *                              set are silently dropped)
 *   - ZL / PM               → {self} ∪ direct reports (one hop)
 *   - Leader / admin / super → recursive descendants
 *   - Other                 → {self}
 *
 * If `userIds` is omitted, defaults to {self}. The intersection of requested
 * and allowed is what gets queried — passing IDs you can't see returns no
 * extra rows; passing only IDs you can see returns just those. Same shape as
 * the picker on the UI uses.
 *
 * Skips Done / Cancelled pitstops (no point dragging a historical visit) and
 * soft-deleted goals / pitstops. Results capped at 500 — UI gets unusable
 * beyond that anyway.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildRbacContext } from "@/lib/rbac";
import { getVisibleUserIds } from "@/lib/visibilityScope";

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
  const ctx = await buildRbacContext(session, { req });
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) {
    return Response.json({ error: "from and to (YYYY-MM-DD) required" }, { status: 400 });
  }
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T23:59:59`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return Response.json({ error: "from/to must be YYYY-MM-DD" }, { status: 400 });
  }

  // Parse + validate requested user ids against the caller's allowed set.
  // Silent filtering (vs 403) keeps the picker UX forgiving when a user is
  // removed from the org while the page is open.
  const requestedRaw = url.searchParams.get("userIds");
  const requestedIds = requestedRaw
    ? requestedRaw.split(",").map(s => s.trim()).filter(Boolean)
    : [ctx.userId];
  const allowed = new Set(await getVisibleUserIds(ctx));
  const userIds = requestedIds.filter(id => allowed.has(id));
  if (userIds.length === 0) return Response.json([], { status: 200 });

  const rows = await prisma.pitstop.findMany({
    where: {
      ownerId: { in: userIds },
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
