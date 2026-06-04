/**
 * Reschedule a pitstop "visit". Two modes:
 *
 *   1. In-window (preferred for windowed pitstops): if shifting all non-Done
 *      activities by deltaMs keeps every one inside the existing
 *      [pitstop.startDate, pitstop.targetDate] window, ONLY the activities
 *      move. The pitstop window stays put. No goal-deadline impact. This is
 *      what gives a windowed pitstop (SLA > 0) a real reschedule buffer —
 *      RP can move the visit day within the SLA without rippling forward.
 *
 *   2. Window-shift (fallback / SLA=0): if any activity would fall outside
 *      the current window after the shift, the whole visit moves — pitstop
 *      startDate + targetDate shift by deltaMs and activities cascade. This
 *      is the legacy behaviour; it still applies for SLA=0 pitstops (their
 *      window is a single day, so anything but unchanged is out-of-window)
 *      and for windowed pitstops that genuinely need to overflow. Subject
 *      to the newTarget > goal.targetDate guard.
 *
 * Body: { startDate: ISO }   — the new pitstop startDate (in window-shift
 *                              mode) OR the new anchor date (in-window mode).
 * Response: { ok, mode: "in_window" | "window_shift", ... }
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

  // Compute delta in milliseconds — same delta applied to every activity (and
  // to the window in window-shift mode).
  const deltaMs = newStart.getTime() - existing.startDate.getTime();
  if (deltaMs === 0) {
    return Response.json({ ok: true, unchanged: true });
  }

  const actorId = session.user.id;

  // Load non-Done / non-Cancelled activities once — both modes need them.
  const events = await prisma.$queryRaw<{ id: string; scheduledAt: Date }[]>`
    SELECT pe.id, pe."scheduledAt"
    FROM "PitstopEvent" pe
    JOIN "PitstopEventPitstop" pep ON pep."eventId" = pe.id
    WHERE pep."pitstopId" = ${pitstopId}
      AND pe."deletedAt" IS NULL
      AND pe.status NOT IN ('Done', 'Cancelled')
  `;

  // Decide mode: would shifting every activity by deltaMs keep all of them
  // inside the current pitstop window? If so, run in-window mode. The window
  // must have a real width (targetDate present and > startDate) for this to
  // mean anything — single-day pitstops fall through to window-shift.
  const winStart = existing.startDate.getTime();
  const winEnd = existing.targetDate ? existing.targetDate.getTime() : winStart;
  const hasWindow = winEnd > winStart;
  const allShiftedFitInWindow = events.length > 0 && hasWindow && events.every((ev) => {
    const t = ev.scheduledAt.getTime() + deltaMs;
    return t >= winStart && t <= winEnd;
  });

  if (allShiftedFitInWindow) {
    // ── In-window mode ──────────────────────────────────────────────────
    // Only activities move. Pitstop window untouched. Goal untouched.
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
        action: "visit_reschedule_in_window", field: "scheduledAt",
        oldValue: ev.scheduledAt.toISOString(), newValue: newSched.toISOString(),
      });
      activitiesShifted++;
    }
    return Response.json({
      ok: true,
      pitstopId,
      mode: "in_window",
      newStartDate: existing.startDate.toISOString(),
      newTargetDate: existing.targetDate?.toISOString() ?? null,
      activitiesShifted,
    });
  }

  // ── Window-shift mode (fallback) ──────────────────────────────────────
  // Either there are no activities, the pitstop has no real window (SLA=0),
  // or the shift would push at least one activity outside the window. Shift
  // the whole visit and apply the goal-deadline guard.
  const newTarget = existing.targetDate
    ? new Date(existing.targetDate.getTime() + deltaMs)
    : null;

  if (newTarget && existing.goal?.targetDate && newTarget > existing.goal.targetDate) {
    return Response.json({
      error: "New pitstop target would land after the goal deadline. Push the goal deadline first.",
    }, { status: 400 });
  }

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
    mode: "window_shift",
    newStartDate: newStart.toISOString(),
    newTargetDate: newTarget?.toISOString() ?? null,
    activitiesShifted,
  });
}
