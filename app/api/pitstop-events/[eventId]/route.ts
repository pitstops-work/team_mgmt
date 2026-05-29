import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";
import { autoAdvancePitstopFromItem } from "@/lib/autoAdvancePitstop";
import { viewerForbidden } from "@/lib/roleGuard";
import { auditLog } from "@/lib/auditLog";

const include = {
  pitstops: {
    select: {
      pitstop: {
        select: {
          id: true, title: true,
          owner: { select: { id: true, name: true, image: true } },
          goal: { select: { id: true, title: true } },
        },
      },
    },
  },
  createdBy: { select: { id: true, name: true, image: true } },
  attendees: { select: { id: true, userId: true, status: true, user: { select: { id: true, name: true, image: true } } } },
} as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;

  const { eventId } = await params;
  const actorId = session.user.id;
  const {
    title, description, type, scheduledAt, endsAt, location, pitstopIds, attendeeIds,
    // Lifecycle fields
    status, cancellationReason, rescheduleReason, rescheduleReasonCode, reschedule,
  } = await req.json();

  // ── Lifecycle shortcuts ──────────────────────────────────────────────────────

  if (status === "Done" || status === "Cancelled" || status === "Scheduled" || reschedule) {
    // Fetch current event for rescheduledFrom + checklistItemId
    const current = await prisma.$queryRaw<{
      scheduledAt: Date; checklistItemId: string | null;
    }[]>`SELECT "scheduledAt", "checklistItemId" FROM "PitstopEvent" WHERE id = ${eventId} LIMIT 1`;
    if (!current[0]) return Response.json({ error: "Not found" }, { status: 404 });

    if (status === "Done") {
      await prisma.$executeRaw`
        UPDATE "PitstopEvent"
        SET status = 'Done'::"PitstopEventStatus",
            "completedAt" = NOW(),
            "completedById" = ${actorId},
            "lastUpdatedById" = ${actorId},
            "updatedAt" = NOW()
        WHERE id = ${eventId}
      `;
      auditLog({ entityType: "Activity", entityId: eventId, userId: actorId, action: "status_change", field: "status", newValue: "Done" });
      if (current[0].checklistItemId) {
        const [ci] = await prisma.$queryRaw<{ completionType: string }[]>`
          SELECT "completionType"::text FROM "ChecklistItem" WHERE id = ${current[0].checklistItemId}
        `;
        if (!ci || ci.completionType === 'Activity') {
          // Only auto-complete the parent ChecklistItem when no other activities
          // on the same item are still pending. A checklist item may have multiple
          // activities (e.g. "Hold 3 meetings") — completing one shouldn't close the
          // whole row. Pending = Scheduled or Rescheduled. Cancelled/Done don't block.
          const [{ pending }] = await prisma.$queryRaw<{ pending: bigint }[]>`
            SELECT COUNT(*)::bigint AS pending
            FROM "PitstopEvent"
            WHERE "checklistItemId" = ${current[0].checklistItemId}
              AND "deletedAt" IS NULL
              AND id != ${eventId}
              AND status IN ('Scheduled'::"PitstopEventStatus", 'Rescheduled'::"PitstopEventStatus")
          `;
          if (Number(pending) === 0) {
            await prisma.$executeRaw`
              UPDATE "ChecklistItem"
              SET status = 'Done'::"ChecklistItemStatus",
                  checked = TRUE,
                  "completedAt" = NOW(),
                  "completedById" = ${actorId},
                  "lastUpdatedById" = ${actorId},
                  "updatedAt" = NOW()
              WHERE id = ${current[0].checklistItemId}
            `;
            await autoAdvancePitstopFromItem(current[0].checklistItemId);
          } else {
            // Still pending siblings — keep the checklist item "InProgress" so the
            // user can see progress, but don't close it.
            await prisma.$executeRaw`
              UPDATE "ChecklistItem"
              SET status = 'InProgress'::"ChecklistItemStatus",
                  "lastUpdatedById" = ${actorId},
                  "updatedAt" = NOW()
              WHERE id = ${current[0].checklistItemId}
                AND status NOT IN ('Done'::"ChecklistItemStatus", 'Cancelled'::"ChecklistItemStatus")
            `;
          }
        }
      }
    } else if (status === "Scheduled") {
      // Undo path — re-open a Done or Cancelled event. Clears completion stamp
      // and snaps it back to Scheduled. Parent ChecklistItem follows: if any
      // sibling is still Done, the item stays InProgress; otherwise back to
      // Scheduled (the activity is still on the calendar, just not finished).
      await prisma.$executeRaw`
        UPDATE "PitstopEvent"
        SET status = 'Scheduled'::"PitstopEventStatus",
            "completedAt" = NULL,
            "completedById" = NULL,
            "cancellationReason" = NULL,
            "lastUpdatedById" = ${actorId},
            "updatedAt" = NOW()
        WHERE id = ${eventId}
      `;
      auditLog({ entityType: "Activity", entityId: eventId, userId: actorId, action: "status_change", field: "status", newValue: "Scheduled" });
      if (current[0].checklistItemId) {
        const [ci] = await prisma.$queryRaw<{ completionType: string }[]>`
          SELECT "completionType"::text FROM "ChecklistItem" WHERE id = ${current[0].checklistItemId}
        `;
        if (!ci || ci.completionType === 'Activity') {
          const [{ doneSiblings }] = await prisma.$queryRaw<{ doneSiblings: bigint }[]>`
            SELECT COUNT(*)::bigint AS "doneSiblings"
            FROM "PitstopEvent"
            WHERE "checklistItemId" = ${current[0].checklistItemId}
              AND "deletedAt" IS NULL
              AND id != ${eventId}
              AND status = 'Done'::"PitstopEventStatus"
          `;
          if (Number(doneSiblings) === 0) {
            await prisma.$executeRaw`
              UPDATE "ChecklistItem"
              SET status = 'Scheduled'::"ChecklistItemStatus",
                  checked = FALSE,
                  "completedAt" = NULL,
                  "completedById" = NULL,
                  "lastUpdatedById" = ${actorId},
                  "updatedAt" = NOW()
              WHERE id = ${current[0].checklistItemId}
            `;
          } else {
            await prisma.$executeRaw`
              UPDATE "ChecklistItem"
              SET status = 'InProgress'::"ChecklistItemStatus",
                  checked = FALSE,
                  "completedAt" = NULL,
                  "completedById" = NULL,
                  "lastUpdatedById" = ${actorId},
                  "updatedAt" = NOW()
              WHERE id = ${current[0].checklistItemId}
            `;
          }
        }
      }
    } else if (status === "Cancelled") {
      const reason: string = cancellationReason ?? null;
      await prisma.$executeRaw`
        UPDATE "PitstopEvent"
        SET status = 'Cancelled'::"PitstopEventStatus",
            "cancellationReason" = ${reason},
            "lastUpdatedById" = ${actorId},
            "updatedAt" = NOW()
        WHERE id = ${eventId}
      `;
      auditLog({ entityType: "Activity", entityId: eventId, userId: actorId, action: "status_change", field: "status", newValue: "Cancelled" });
      if (current[0].checklistItemId) {
        await prisma.$executeRaw`
          UPDATE "ChecklistItem"
          SET status = 'Cancelled'::"ChecklistItemStatus",
              "lastUpdatedById" = ${actorId},
              "updatedAt" = NOW()
          WHERE id = ${current[0].checklistItemId}
        `;
      }
    } else if (reschedule && scheduledAt) {
      const newDate = new Date(scheduledAt);
      const oldDate = current[0].scheduledAt;
      const reason: string = rescheduleReason ?? null;
      const reasonCode: string | null = rescheduleReasonCode ?? null;

      // Resolve activity owner + their manager up front so the notify policy
      // has all the inputs it needs after the update lands.
      const [ownerRow] = await prisma.$queryRaw<{ ownerId: string | null; managerId: string | null }[]>`
        SELECT p."ownerId", u."managerId"
        FROM "PitstopEvent" pe
        LEFT JOIN "PitstopEventPitstop" pep ON pep."eventId" = pe.id
        LEFT JOIN "Pitstop" p ON p.id = pep."pitstopId" AND p."deletedAt" IS NULL
        LEFT JOIN "User" u ON u.id = p."ownerId"
        WHERE pe.id = ${eventId}
        LIMIT 1
      `;

      await prisma.$executeRaw`
        UPDATE "PitstopEvent"
        SET status = 'Rescheduled'::"PitstopEventStatus",
            "scheduledAt" = ${newDate},
            "rescheduledFrom" = ${oldDate},
            "rescheduleReason" = ${reason},
            "rescheduleReasonCode" = ${reasonCode},
            "rescheduleCount" = "rescheduleCount" + 1,
            "lastUpdatedById" = ${actorId},
            "updatedAt" = NOW()
        WHERE id = ${eventId}
      `;
      auditLog({
        entityType: "Activity", entityId: eventId, userId: actorId,
        action: "scheduledAt_change", field: "scheduledAt",
        oldValue: oldDate.toISOString(), newValue: newDate.toISOString(),
      });
      if (current[0].checklistItemId) {
        await prisma.$executeRaw`
          UPDATE "ChecklistItem"
          SET status = 'Rescheduled'::"ChecklistItemStatus",
              "lastUpdatedById" = ${actorId},
              "updatedAt" = NOW()
          WHERE id = ${current[0].checklistItemId}
        `;
      }

      // ── Notify the RP's ZL on the pattern-alert policy ─────────────────────
      // Per-reason policy:
      //   - other         → always
      //   - double_booked → always
      //   - desk_work     → ≥2 occurrences by same RP in trailing 7 days
      //   - team_meeting  → suppress unless delayDays > 2 OR rescheduleCount ≥ 2
      //   - weather       → suppress unless rescheduleCount ≥ 2 on same activity
      // Overlays (always trigger regardless of reason):
      //   - delayDays > 2
      //   - rescheduleCount ≥ 2 after this PATCH (3rd+ slip on same activity)
      //   - activity was already overdue when rescheduled
      const [countRow] = await prisma.$queryRaw<{ rescheduleCount: number }[]>`
        SELECT "rescheduleCount" FROM "PitstopEvent" WHERE id = ${eventId} LIMIT 1
      `;
      const newCount = countRow?.rescheduleCount ?? 0;
      const nowMs = Date.now();
      const delayDays = (newDate.getTime() - oldDate.getTime()) / 86_400_000;
      const wasAlreadyOverdue = oldDate.getTime() < nowMs;
      const overlay = delayDays > 2 || newCount >= 2 || wasAlreadyOverdue;

      let trigger = overlay;
      if (!trigger) {
        if (reasonCode === "other" || reasonCode === "double_booked") {
          trigger = true;
        } else if (reasonCode === "desk_work") {
          const weekAgo = new Date(nowMs - 7 * 86_400_000);
          const [{ ct }] = await prisma.$queryRaw<{ ct: bigint }[]>`
            SELECT COUNT(*)::bigint AS ct
            FROM "PitstopEvent"
            WHERE "lastUpdatedById" = ${actorId}
              AND "rescheduleReasonCode" = 'desk_work'
              AND "updatedAt" > ${weekAgo}
          `;
          trigger = Number(ct) >= 2;
        }
        // team_meeting + weather: only escalate via overlay, handled above.
      }

      if (trigger && ownerRow?.managerId && ownerRow.managerId !== actorId) {
        const dateLabel = newDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
        const codeLabel: Record<string, string> = {
          desk_work:     "Desk work pending",
          double_booked: "Double booked",
          weather:       "Weather",
          team_meeting:  "Team meeting",
          other:         "Other",
        };
        const reasonLabel = reasonCode ? (codeLabel[reasonCode] ?? reasonCode) : "Unspecified";
        const slipBadge = newCount >= 2 ? ` (${newCount}× slipped)` : "";
        const title = `Activity rescheduled to ${dateLabel}${slipBadge}`;
        const detail = reasonCode === "other" && reason ? `: ${reason}` : "";
        const body = `${reasonLabel}${detail}`;
        await prisma.notification.create({
          data: {
            userId: ownerRow.managerId,
            type: "ActivityRescheduled" as const,
            title, body,
            link: `/activities?event=${eventId}`,
          },
        });
        sendPushToUsers([ownerRow.managerId], { title, body, link: `/activities?event=${eventId}` });
      }
    }

    // Return updated event via raw to avoid Lambda cache issues
    const updated = await prisma.$queryRaw<{ id: string; status: string; scheduledAt: Date }[]>`
      SELECT id, status::text, "scheduledAt" FROM "PitstopEvent" WHERE id = ${eventId} LIMIT 1
    `;
    return Response.json(updated[0] ?? { ok: true });
  }

  // ── Standard field updates ───────────────────────────────────────────────────

  // Resolve owners of all linked pitstops when pitstops or attendees change
  let ownerIds: string[] = [];
  if (pitstopIds !== undefined || attendeeIds !== undefined) {
    const resolvedIds: string[] = pitstopIds ?? (
      await prisma.pitstopEventPitstop.findMany({ where: { eventId }, select: { pitstopId: true } })
    ).map((r: { pitstopId: string }) => r.pitstopId);

    if (resolvedIds.length > 0) {
      const linked = await prisma.pitstop.findMany({
        where: { id: { in: resolvedIds } },
        select: { ownerId: true },
      });
      ownerIds = linked.filter(p => p.ownerId).map(p => p.ownerId!);
    }
  }

  // Capture existing attendees with their statuses BEFORE we wipe them
  const prevAttendees = attendeeIds !== undefined
    ? await prisma.pitstopEventAttendee.findMany({ where: { eventId }, select: { userId: true, status: true } })
    : [];
  const prevStatusMap = new Map(prevAttendees.map(a => [a.userId, a.status]));

  const desiredIds = attendeeIds !== undefined
    ? Array.from(new Set([...ownerIds, ...attendeeIds]))
    : undefined;

  const event = await prisma.pitstopEvent.update({
    where: { id: eventId },
    data: {
      title: title ?? undefined,
      description: description !== undefined ? (description || null) : undefined,
      type: type ?? undefined,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      endsAt: endsAt !== undefined ? (endsAt ? new Date(endsAt) : null) : undefined,
      location: location !== undefined ? (location || null) : undefined,
      lastUpdatedById: actorId,
      ...(pitstopIds !== undefined ? {
        pitstops: {
          deleteMany: {},
          create: pitstopIds.map((pitstopId: string) => ({ pitstopId })),
        },
      } : {}),
      ...(desiredIds !== undefined ? {
        attendees: {
          deleteMany: {},
          create: desiredIds.map((userId: string) => ({
            userId,
            // Preserve existing status; new attendees who aren't the editor → pending
            status: prevStatusMap.get(userId) ?? (userId === session.user.id ? "accepted" : "pending"),
          })),
        },
      } : {}),
    },
    include,
  });

  // Invite newly added attendees (anyone not in prev list, excluding the editor)
  if (desiredIds !== undefined) {
    const newIds = desiredIds.filter(id => !prevStatusMap.has(id) && id !== session.user.id);
    if (newIds.length > 0) {
      const creatorName = session.user.name ?? "Someone";
      const dateLabel = new Date(event.scheduledAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      await prisma.notification.createMany({
        data: newIds.map((userId) => ({
          userId,
          type: "ActivityTagged" as const,
          title: `${creatorName} invited you to "${event.title}"`,
          body: dateLabel,
          link: `/activities?invite=${eventId}`,
        })),
      });
      sendPushToUsers(newIds, {
        title: `${creatorName} invited you to "${event.title}"`,
        body: dateLabel,
        link: `/activities?invite=${eventId}`,
      });
    }
  }

  return Response.json(event);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;

  const { eventId } = await params;
  await prisma.pitstopEvent.update({
    where: { id: eventId },
    data: { deletedAt: new Date(), lastUpdatedById: session.user.id },
  });
  auditLog({ entityType: "Activity", entityId: eventId, userId: session.user.id, action: "deleted" });
  return Response.json({ ok: true });
}
