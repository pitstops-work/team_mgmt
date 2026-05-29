import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { viewerForbidden } from "@/lib/roleGuard";
import { auditLog } from "@/lib/auditLog";
import { buildRbacContext, scopeWhere } from "@/lib/rbac";

/**
 * Cluster-consolidation batch reschedule.
 *
 * The cluster split banner surfaces logistical reality ("today has 4 in A and
 * 4 in B"); this endpoint is the action behind it. The RP (or their lead, via
 * pitstop_event.update scope = team) picks a target date for one cluster's
 * worth of activities; each event keeps its time-of-day but moves to the new
 * date.
 *
 * Difference vs single-event PATCH (the slippage path):
 *   - reasonCode is fixed to "cluster_consolidation" — distinguishes proactive
 *     route-planning moves from slippage, which would inflate pattern alerts.
 *   - No per-event manager notification. Batch moves aren't a behaviour signal
 *     the way one-off slips are; the audit log still captures every move so a
 *     manager can reconstruct intent if needed.
 *   - rescheduleCount still increments (kept symmetric with single-event PATCH
 *     so the chronic-slippage badge counts every move consistently).
 *
 * Done and Cancelled events are silently ineligible — moving them would change
 * what already happened.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;
  const actorId = session.user.id;

  const { eventIds, targetDate } = await req.json();
  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    return Response.json({ error: "eventIds required" }, { status: 400 });
  }
  if (typeof targetDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return Response.json({ error: "targetDate (YYYY-MM-DD) required" }, { status: 400 });
  }

  const ctx = await buildRbacContext(session);
  if (!ctx) return Response.json({ error: "Forbidden" }, { status: 403 });
  const scope = await scopeWhere(ctx, "pitstop_event", "update");
  if (scope === null) return Response.json({ error: "Forbidden" }, { status: 403 });

  // Filter to events the caller can update AND are still movable (not Done/Cancelled).
  // If anything in the input list drops out, fail loud — the RP confirmed N moves,
  // partially fulfilling that would surprise them.
  const allowed = await prisma.pitstopEvent.findMany({
    where: {
      id: { in: eventIds },
      deletedAt: null,
      status: { in: ["Scheduled", "Rescheduled"] },
      ...scope,
    },
    select: { id: true, scheduledAt: true, checklistItemId: true },
  });
  if (allowed.length !== eventIds.length) {
    return Response.json({
      error: `${eventIds.length - allowed.length} of ${eventIds.length} activities are not eligible or not permitted to reschedule`,
    }, { status: 403 });
  }

  let rescheduled = 0;
  try {
    for (const ev of allowed) {
      const oldDate = ev.scheduledAt;
      const newDate = mergeYmdWithTime(targetDate, oldDate);
      if (newDate.getTime() === oldDate.getTime()) continue;

      await prisma.$executeRaw`
        UPDATE "PitstopEvent"
        SET status = 'Rescheduled'::"PitstopEventStatus",
            "scheduledAt" = ${newDate},
            "rescheduledFrom" = ${oldDate},
            "rescheduleReason" = NULL,
            "rescheduleReasonCode" = 'cluster_consolidation',
            "rescheduleCount" = "rescheduleCount" + 1,
            "lastUpdatedById" = ${actorId},
            "updatedAt" = NOW()
        WHERE id = ${ev.id}
      `;
      if (ev.checklistItemId) {
        await prisma.$executeRaw`
          UPDATE "ChecklistItem"
          SET status = 'Rescheduled'::"ChecklistItemStatus",
              "lastUpdatedById" = ${actorId},
              "updatedAt" = NOW()
          WHERE id = ${ev.checklistItemId}
        `;
      }
      auditLog({
        entityType: "Activity", entityId: ev.id, userId: actorId,
        action: "scheduledAt_change", field: "scheduledAt",
        oldValue: oldDate.toISOString(), newValue: newDate.toISOString(),
      });
      rescheduled++;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Batch reschedule failed:", msg);
    return Response.json({ error: `Batch reschedule failed: ${msg}` }, { status: 500 });
  }

  return Response.json({ rescheduled });
}

// Preserve time-of-day from baseDate; replace just the calendar date with targetYmd.
// Local-tz reads from baseDate's getFullYear/Month/Date are what we replace via
// setFullYear, so the resulting Date represents (target day) at (original local time).
function mergeYmdWithTime(targetYmd: string, baseDate: Date): Date {
  const [y, m, d] = targetYmd.split("-").map(Number);
  const r = new Date(baseDate);
  r.setFullYear(y, m - 1, d);
  return r;
}
