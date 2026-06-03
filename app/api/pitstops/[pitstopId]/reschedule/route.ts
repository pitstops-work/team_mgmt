/**
 * Reschedule a whole pitstop "visit" — shift its startDate + targetDate by a
 * day delta and cascade the same shift to every non-Done activity's
 * scheduledAt (time-of-day preserved per activity).
 *
 * Designed for the field-RP pattern where a pitstop represents one site visit
 * (e.g. Abdul's monthly creche round). One date picker, one click, the whole
 * visit moves. For SLA=0 pitstops the window collapses to the new day; for
 * windowed pitstops the relative spread of activities is preserved.
 *
 * Body: { startDate: ISO }   — the new pitstop startDate
 *
 * Auth: PATCH /api/pitstop-events/[id] has no scope check today (known gap per
 * [[pitstop-event-update-scope]]); we match that surface here. viewerForbidden
 * + the broad PATCH-level write is the existing model. Tighten in the RBAC
 * Phase 1c continuation, not this PR.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { viewerForbidden } from "@/lib/roleGuard";
import { auditLog } from "@/lib/auditLog";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;

  const { pitstopId } = await params;
  const body = await req.json().catch(() => ({}));
  const newStartIso = body?.startDate;
  if (!newStartIso || typeof newStartIso !== "string") {
    return Response.json({ error: "startDate (ISO) required" }, { status: 400 });
  }
  const newStart = new Date(newStartIso);
  if (Number.isNaN(newStart.getTime())) {
    return Response.json({ error: "startDate is not a valid ISO timestamp" }, { status: 400 });
  }

  const existing = await prisma.pitstop.findUnique({
    where: { id: pitstopId, deletedAt: null },
    select: {
      id: true, title: true, startDate: true, targetDate: true,
      goal: { select: { id: true, targetDate: true } },
    },
  });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
  if (!existing.startDate) {
    return Response.json({ error: "Cannot reschedule a pitstop without a startDate" }, { status: 400 });
  }

  // Compute delta in milliseconds — same delta applied to target + every activity.
  const deltaMs = newStart.getTime() - existing.startDate.getTime();
  if (deltaMs === 0) {
    return Response.json({ ok: true, unchanged: true });
  }

  const newTarget = existing.targetDate
    ? new Date(existing.targetDate.getTime() + deltaMs)
    : null;

  // Soft validation: new target shouldn't push past the goal deadline. Pitstop
  // PATCH does this same check; mirror it here so the user sees the same error
  // shape whether they used the inline edit or the visit-reschedule button.
  if (newTarget && existing.goal?.targetDate && newTarget > existing.goal.targetDate) {
    return Response.json({
      error: "New pitstop target would land after the goal deadline. Push the goal deadline first.",
    }, { status: 400 });
  }

  const actorId = session.user.id;

  // 1. Update the pitstop
  await prisma.pitstop.update({
    where: { id: pitstopId },
    data: {
      startDate: newStart,
      ...(newTarget ? { targetDate: newTarget } : {}),
      updatedAt: new Date(),
    },
  });
  auditLog({
    entityType: "Pitstop", entityId: pitstopId, userId: actorId,
    action: "visit_reschedule", field: "startDate",
    oldValue: existing.startDate.toISOString(), newValue: newStart.toISOString(),
  });

  // 2. Cascade to non-Done / non-Cancelled activities. Time-of-day preserved
  //    per activity (just shift the millisecond delta).
  const events = await prisma.$queryRaw<{ id: string; scheduledAt: Date }[]>`
    SELECT pe.id, pe."scheduledAt"
    FROM "PitstopEvent" pe
    JOIN "PitstopEventPitstop" pep ON pep."eventId" = pe.id
    WHERE pep."pitstopId" = ${pitstopId}
      AND pe."deletedAt" IS NULL
      AND pe.status NOT IN ('Done', 'Cancelled')
  `;
  let activitiesShifted = 0;
  for (const ev of events) {
    const newSched = new Date(ev.scheduledAt.getTime() + deltaMs);
    await prisma.$executeRaw`
      UPDATE "PitstopEvent"
      SET "scheduledAt" = ${newSched}, "updatedAt" = NOW()
      WHERE id = ${ev.id}
    `;
    auditLog({
      entityType: "Activity", entityId: ev.id, userId: actorId,
      action: "visit_reschedule_cascade", field: "scheduledAt",
      oldValue: ev.scheduledAt.toISOString(), newValue: newSched.toISOString(),
    });
    activitiesShifted++;
  }

  return Response.json({
    ok: true,
    pitstopId,
    newStartDate: newStart.toISOString(),
    newTargetDate: newTarget?.toISOString() ?? null,
    activitiesShifted,
  });
}
