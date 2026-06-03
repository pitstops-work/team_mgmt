/**
 * Calendar-page event fetch — bounded by date window + caller's RBAC list scope.
 * Powers the on-demand window expansion on /activities when the user navigates
 * outside the server-rendered range (today−30d to today+90d).
 *
 *   GET /api/pitstop-events/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns the same include shape the /activities page seeds at first render:
 * pitstops → pitstop → owner + goal + needsCluster (for the cluster-split banner),
 * createdBy, attendees → user, checklistItem. Cancelled + soft-deleted excluded.
 *
 * Capped at 1000 rows so a runaway range can't pull the whole table. Most
 * sensible windows (a month or three) stay well under.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildRbacContext, scopeWhere } from "@/lib/rbac";

const include = {
  pitstops: {
    select: {
      pitstop: {
        select: {
          id: true, title: true,
          owner: { select: { id: true, name: true, image: true } },
          goal: {
            select: {
              id: true, title: true,
              needsCluster: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  },
  createdBy: { select: { id: true, name: true, image: true } },
  attendees: { select: { id: true, userId: true, status: true, user: { select: { id: true, name: true, image: true } } } },
  checklistItem: { select: { id: true, completionType: true, text: true } },
} as const;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await buildRbacContext(session, { req });
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) return Response.json({ error: "from and to (YYYY-MM-DD) required" }, { status: 400 });

  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T23:59:59`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return Response.json({ error: "from/to must be YYYY-MM-DD" }, { status: 400 });
  }

  const eventScope = await scopeWhere(ctx, "pitstop_event", "list");
  const eventAttendeeFilter: Record<string, unknown> = eventScope ?? {};

  const events = await prisma.pitstopEvent.findMany({
    where: {
      deletedAt: null,
      status: { not: "Cancelled" },
      scheduledAt: { gte: fromDate, lte: toDate },
      ...eventAttendeeFilter,
    },
    include,
    orderBy: { scheduledAt: "asc" },
    take: 1000,
  });

  // Pulled-to-today AuditLog counts — same enrichment the page does, kept
  // in sync so the "Pulled N×" chip works on lazy-loaded events too.
  if (events.length > 0) {
    const rows = await prisma.auditLog.groupBy({
      by: ["entityId"],
      where: {
        entityType: "Activity",
        action: "add_to_today",
        entityId: { in: events.map(e => e.id) },
      },
      _count: { _all: true },
    });
    const addCountMap = new Map(rows.map(r => [r.entityId, r._count._all]));
    for (const ev of events) {
      const n = addCountMap.get(ev.id);
      if (n) (ev as { addedToTodayCount?: number }).addedToTodayCount = n;
    }
  }

  return Response.json(events);
}
