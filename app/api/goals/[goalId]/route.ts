import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";
import { viewerForbidden } from "@/lib/roleGuard";
import { auditLog, auditLogMany, diffAudit } from "@/lib/auditLog";
import { snapToWeekday, dayDeltaUTC, addDaysUTC } from "@/lib/scheduleActivities";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  const goal = await prisma.goal.findUnique({
    where: { id: goalId, deletedAt: null },
    include: {
      owner: { select: { id: true, name: true, image: true } },
      // Needs fields exposed so GoalDetail can pass to EditGoalModal
      // (needsDomain, parameter, outcomeCount selected via findUnique — all scalar fields included by default)
      attachments: { where: { goalId: { not: null } }, orderBy: { createdAt: "asc" } },
      followers: { select: { userId: true } },
      coOwners: { select: { userId: true, user: { select: { id: true, name: true, image: true } } } },
      confirmedBy: { select: { id: true, name: true, image: true } },
      pitstops: {
        where: { deletedAt: null },
        include: {
          attachments: true,
          threads: {
            where: { deletedAt: null },
            select: { id: true, name: true, _count: { select: { messages: { where: { deletedAt: null } } } } },
          },
          checklistItems: { select: { id: true, text: true, checked: true, completionType: true }, orderBy: { order: "asc" } },
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!goal) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(goal);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;

  const { goalId } = await params;
  const data = await req.json();

  // Fetch existing goal for change detection
  const existing = await prisma.goal.findUnique({
    where: { id: goalId },
    select: {
      status: true, title: true, description: true,
      ownerId: true, recurrence: true,
      startDate: true, targetDate: true, closedAt: true,
      needsDomain: true, needsCityId: true, needsZoneId: true, needsClusterId: true,
      outcomeCount: true,
      followers: { select: { userId: true } },
    },
  });

  const wasComplete = existing?.status === "Complete";
  const willBeComplete = data.status === "Complete";

  // ── Cascade pre-compute: figure out the delta to shift pitstops/activities by ──
  // delta = (new start - old start) if start changed; else (new target - old target).
  // Computed in WHOLE UTC DAYS — not raw ms — because stored dates often carry a
  // creation-time-of-day stamp (e.g. 12:43:55Z) while the modal sends "YYYY-MM-DD"
  // which Node parses as UTC midnight. Comparing in ms would treat that as a
  // "changed" date (delta ±X hours) and either suppress the goal-target auto-shift
  // (bug #2) or shift pitstops by partial days that snapToWeekday then nudges
  // across midnight unpredictably (bug #1 — "random dates").
  //
  // If only start was edited, also slide goal.targetDate by the same delta to keep
  // the goal endpoints aligned (and honor the goal.targetDate >= MAX(pitstop.targetDate)
  // invariant noted in memory).
  const oldStart  = existing?.startDate  ?? null;
  const oldTarget = existing?.targetDate ?? null;
  const newStart  = data.startDate  ? new Date(data.startDate)  : oldStart;
  const newTarget = data.targetDate ? new Date(data.targetDate) : oldTarget;
  const startDeltaDays  = oldStart  && newStart  ? dayDeltaUTC(oldStart,  newStart)  : 0;
  const targetDeltaDays = oldTarget && newTarget ? dayDeltaUTC(oldTarget, newTarget) : 0;
  const startChanged  = startDeltaDays  !== 0;
  const targetChanged = targetDeltaDays !== 0;
  const cascadeDeltaDays = data.cascadeDates && (startChanged || targetChanged)
    ? (startChanged ? startDeltaDays : targetDeltaDays)
    : 0;
  const goalTargetAutoShift =
    cascadeDeltaDays !== 0 && startChanged && !targetChanged && oldTarget
      ? snapToWeekday(addDaysUTC(oldTarget, cascadeDeltaDays))
      : null;

  // The modal always sends targetDate in the body. If the user only moved the start,
  // we override the sent target with the auto-shifted value so endpoints stay aligned.
  const finalTargetDate = goalTargetAutoShift
    ?? (data.targetDate ? new Date(data.targetDate) : undefined);

  const goal = await prisma.goal.update({
    where: { id: goalId },
    data: {
      title: data.title,
      description: data.description,
      status: data.status,
      ownerId: data.ownerId !== undefined ? (data.ownerId || null) : undefined,
      recurrence: data.recurrence,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      targetDate: finalTargetDate,
      ...(willBeComplete && !wasComplete ? { closedAt: new Date() } : {}),
      ...(!willBeComplete && wasComplete ? { closedAt: null } : {}),
      ...(data.outcomeCount !== undefined ? { outcomeCount: data.outcomeCount } : {}),
      ...("needsDomain"    in data ? { needsDomain:    data.needsDomain    ?? null } : {}),
      ...("needsCityId"    in data ? { needsCityId:    data.needsCityId    ?? null } : {}),
      ...("needsZoneId"    in data ? { needsZoneId:    data.needsZoneId    ?? null } : {}),
      ...("needsClusterId" in data ? { needsClusterId: data.needsClusterId ?? null } : {}),
    },
    include: { owner: { select: { id: true, name: true, image: true } }, pitstops: { select: { id: true, status: true } } },
  });

  // ── Cascade: shift incomplete pitstops and scheduled activities by delta ──
  if (cascadeDeltaDays !== 0) {
    const incompletePitstops = await prisma.pitstop.findMany({
      where: { goalId, deletedAt: null, status: { not: "Done" } },
      select: { id: true, startDate: true, targetDate: true },
    });
    const pitstopIds = incompletePitstops.map(p => p.id);

    const scheduledEvents = pitstopIds.length > 0
      ? await prisma.pitstopEvent.findMany({
          where: {
            deletedAt: null,
            status: "Scheduled",
            OR: [
              { pitstops: { some: { pitstopId: { in: pitstopIds } } } },
              { checklistItem: { pitstopId: { in: pitstopIds } } },
            ],
          },
          select: { id: true, scheduledAt: true, endsAt: true },
        })
      : [];

    if (incompletePitstops.length > 0 || scheduledEvents.length > 0) {
      await prisma.$transaction([
        ...incompletePitstops.map(p =>
          prisma.pitstop.update({
            where: { id: p.id },
            data: {
              // Snap shifted dates to weekdays — never let cascade produce a Sat/Sun deadline.
              startDate:  p.startDate  ? snapToWeekday(addDaysUTC(p.startDate,  cascadeDeltaDays)) : undefined,
              targetDate: p.targetDate ? snapToWeekday(addDaysUTC(p.targetDate, cascadeDeltaDays)) : undefined,
            },
          }),
        ),
        ...scheduledEvents.map(e =>
          prisma.pitstopEvent.update({
            where: { id: e.id },
            data: {
              scheduledAt: snapToWeekday(addDaysUTC(e.scheduledAt, cascadeDeltaDays)),
              endsAt: e.endsAt ? snapToWeekday(addDaysUTC(e.endsAt, cascadeDeltaDays)) : undefined,
            },
          }),
        ),
      ]);
    }

    auditLog({
      entityType: "Goal",
      entityId: goalId,
      userId: session.user.id,
      action: "cascade_dates",
      field: startChanged ? "startDate" : "targetDate",
      oldValue: null,
      newValue: `${cascadeDeltaDays > 0 ? "+" : ""}${cascadeDeltaDays}d shifted ${incompletePitstops.length} pitstops + ${scheduledEvents.length} activities`,
    });
  }

  // ── GoalOutcome: write settlement attributions when marking a domain goal Complete ──
  // attributions = [{ settlementId, count }] sent from the completion modal.
  // Replace any existing outcomes for this goal (idempotent re-complete).
  if (
    data.status === "Complete" &&
    data.attributions &&
    Array.isArray(data.attributions) &&
    data.attributions.length > 0
  ) {
    await prisma.goalOutcome.deleteMany({ where: { goalId } });
    await prisma.goalOutcome.createMany({
      data: (data.attributions as { settlementId: string; count: number }[]).map(a => ({
        id: `${goalId}_${a.settlementId}`.replace(/[^a-z0-9_]/gi, "_"),
        goalId,
        settlementId: a.settlementId,
        count: Math.round(a.count),
      })),
    });
  }

  // Audit field changes (status/owner/dates/etc) — diff of supplied fields vs existing.
  if (existing) {
    auditLogMany(diffAudit("Goal", goalId, session.user.id,
      {
        title: existing.title,
        status: existing.status,
        description: existing.description,
        ownerId: existing.ownerId,
        recurrence: existing.recurrence,
        startDate: existing.startDate,
        targetDate: existing.targetDate,
        needsDomain: existing.needsDomain,
        needsCityId: existing.needsCityId,
        needsZoneId: existing.needsZoneId,
        needsClusterId: existing.needsClusterId,
        outcomeCount: existing.outcomeCount,
      },
      {
        title: data.title,
        status: data.status,
        description: data.description,
        ownerId: data.ownerId !== undefined ? (data.ownerId || null) : undefined,
        recurrence: data.recurrence,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        targetDate: finalTargetDate,
        needsDomain: "needsDomain"    in data ? (data.needsDomain    ?? null) : undefined,
        needsCityId: "needsCityId"    in data ? (data.needsCityId    ?? null) : undefined,
        needsZoneId: "needsZoneId"    in data ? (data.needsZoneId    ?? null) : undefined,
        needsClusterId: "needsClusterId" in data ? (data.needsClusterId ?? null) : undefined,
        outcomeCount: data.outcomeCount,
      },
    ));
  }

  // Cascade owner change to pitstops that haven't been manually reassigned
  if (data.ownerId !== undefined) {
    await prisma.pitstop.updateMany({
      where: { goalId, deletedAt: null, ownerInherited: true },
      data: { ownerId: data.ownerId || null },
    });
    if (data.ownerId) {
      await prisma.goalFollow.upsert({
        where: { userId_goalId: { userId: data.ownerId, goalId } },
        create: { userId: data.ownerId, goalId },
        update: {},
      });
    }
  }

  const link = `/goals/${goalId}`;

  // ── Deadline change: log decision + notify all users ──────────────────────
  if (
    existing &&
    data.targetDate &&
    data.deadlineChangeReason &&
    existing.targetDate &&
    new Date(data.targetDate).toDateString() !== new Date(existing.targetDate).toDateString()
  ) {
    const oldDate = existing.targetDate.toISOString().slice(0, 10);
    const newDate = new Date(data.targetDate).toISOString().slice(0, 10);
    const changer = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true } });

    // Log as a Decision record
    await prisma.decision.create({
      data: {
        goalId,
        createdById: session.user.id,
        title: `Deadline changed: "${existing.title}"`,
        description: data.deadlineChangeReason,
        rationale: `Changed from ${oldDate} to ${newDate} by ${changer?.name ?? "someone"}`,
        status: "Made",
      },
    });

    // Notify every user except the one making the change
    const allUsers = await prisma.user.findMany({ select: { id: true } });
    const notifyUsers = allUsers.filter((u) => u.id !== session.user.id);
    if (notifyUsers.length > 0) {
      await prisma.notification.createMany({
        data: notifyUsers.map((u) => ({
          userId: u.id,
          type: "EscalationAlert" as const,
          title: `Deadline changed: "${existing.title}"`,
          body: `${changer?.name ?? "Someone"} moved the deadline from ${oldDate} to ${newDate}. Reason: ${data.deadlineChangeReason}`,
          link,
        })),
      });
      sendPushToUsers(notifyUsers.map((u) => u.id), {
        title: `Deadline changed: "${existing.title}"`,
        body: `${changer?.name ?? "Someone"}: ${data.deadlineChangeReason}`,
        link,
      });
    }
  }

  // ── Status change: notify followers ───────────────────────────────────────
  if (existing && data.status && existing.status !== data.status) {
    const notifications = existing.followers
      .filter((f) => f.userId !== session.user.id)
      .map((f) => ({
        userId: f.userId,
        type: "GoalStatusChange" as const,
        title: `"${existing.title}" is now ${data.status}`,
        body: `Status changed from ${existing.status} to ${data.status}`,
        link,
      }));
    if (notifications.length > 0) {
      await prisma.notification.createMany({ data: notifications });
      sendPushToUsers(notifications.map((n) => n.userId), {
        title: `"${existing.title}" is now ${data.status}`,
        body: `Status changed from ${existing.status} to ${data.status}`,
        link,
      });
    }
  }

  return Response.json(goal);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;

  const { goalId } = await params;
  const now = new Date();

  // Capture pitstop ids up front — once they're soft-deleted, we still need to
  // sweep their child rows (activities + checklist items).
  const pitstops = await prisma.pitstop.findMany({
    where: { goalId, deletedAt: null },
    select: { id: true },
  });
  const pitstopIds = pitstops.map(p => p.id);

  // Soft-delete pitstops
  if (pitstopIds.length > 0) {
    await prisma.pitstop.updateMany({
      where: { id: { in: pitstopIds } },
      data: { deletedAt: now },
    });

    // Soft-delete every PitstopEvent (activity) tied to this goal — either via
    // the pitstops junction table OR via a checklistItem that belongs to one
    // of these pitstops. Covers events that lost their pitstop link.
    await prisma.pitstopEvent.updateMany({
      where: {
        deletedAt: null,
        OR: [
          { pitstops: { some: { pitstopId: { in: pitstopIds } } } },
          { checklistItem: { pitstopId: { in: pitstopIds } } },
        ],
      },
      data: { deletedAt: now },
    });

    // Hard-delete checklist items — they have no `deletedAt` column, and
    // their parent pitstop is now soft-deleted, so they should not linger.
    // FKs from PitstopEvent.checklistItemId, Thread.checklistItemId and
    // Attachment.checklistItemId are all `SetNull`, so this is safe.
    await prisma.checklistItem.deleteMany({
      where: { pitstopId: { in: pitstopIds } },
    });
  }

  await prisma.goal.update({ where: { id: goalId }, data: { deletedAt: now } });
  auditLog({ entityType: "Goal", entityId: goalId, userId: session.user.id, action: "deleted" });
  return Response.json({ ok: true });
}
