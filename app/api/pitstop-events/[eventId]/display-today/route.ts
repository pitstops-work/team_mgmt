import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { viewerForbidden } from "@/lib/roleGuard";
import { auditLog } from "@/lib/auditLog";
import { buildRbacContext, scopeWhere } from "@/lib/rbac";

/**
 * Add-to-today / remove-from-today for a single PitstopEvent.
 *
 * Sets the `displayDate` override on a single event:
 *   POST   → displayDate = start-of-today (server tz; matches the home loader
 *            which uses the same midnight boundary for its today query)
 *   DELETE → displayDate = NULL
 *
 * Crucially, neither method touches `scheduledAt`. The event's committed date
 * stays put — delay is still computed from `originalScheduledAt`, so an RP
 * pulling an overdue activity to today does NOT launder its lateness. The
 * pulled activity just *also* shows on today's list.
 *
 * Today-bound auto-clearing is implicit: a stale displayDate (yesterday's,
 * last week's) never matches tomorrow's today-window so it has no effect on
 * future renders. The value is kept as an audit-style breadcrumb of intent.
 *
 * Permission mirrors completion / reschedule: `pitstop_event.update` scope so
 * leads can do this on behalf of their RP.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;
  const actorId = session.user.id;
  const { eventId } = await params;

  if (!(await canUpdateEvent(session, eventId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  await prisma.$executeRaw`
    UPDATE "PitstopEvent"
    SET "displayDate" = ${todayStart},
        "lastUpdatedById" = ${actorId},
        "updatedAt" = NOW()
    WHERE id = ${eventId} AND "deletedAt" IS NULL
  `;
  auditLog({
    entityType: "Activity", entityId: eventId, userId: actorId,
    action: "add_to_today", field: "displayDate",
    oldValue: null, newValue: todayStart.toISOString(),
  });
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;
  const actorId = session.user.id;
  const { eventId } = await params;

  if (!(await canUpdateEvent(session, eventId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.$executeRaw`
    UPDATE "PitstopEvent"
    SET "displayDate" = NULL,
        "lastUpdatedById" = ${actorId},
        "updatedAt" = NOW()
    WHERE id = ${eventId} AND "deletedAt" IS NULL
  `;
  auditLog({
    entityType: "Activity", entityId: eventId, userId: actorId,
    action: "remove_from_today", field: "displayDate",
    oldValue: null, newValue: null,
  });
  return Response.json({ ok: true });
}

// scopeWhere yields a Prisma `where` fragment for the rows this user can
// update. A direct findFirst with the eventId AND that fragment is the cheapest
// way to gate: 0 rows ⇒ forbidden (or not found, treated the same here).
async function canUpdateEvent(session: Parameters<typeof viewerForbidden>[0], eventId: string): Promise<boolean> {
  const ctx = await buildRbacContext(session);
  if (!ctx) return false;
  const scope = await scopeWhere(ctx, "pitstop_event", "update");
  if (scope === null) return false;
  const row = await prisma.pitstopEvent.findFirst({
    where: { id: eventId, deletedAt: null, ...scope },
    select: { id: true },
  });
  return row !== null;
}
