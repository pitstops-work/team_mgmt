import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";
import { autoAdvancePitstopFromItem } from "@/lib/autoAdvancePitstop";
import { viewerForbidden } from "@/lib/roleGuard";

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
  const {
    title, description, type, scheduledAt, endsAt, location, pitstopIds, attendeeIds,
    // Lifecycle fields
    status, cancellationReason, rescheduleReason, reschedule,
  } = await req.json();

  // ── Lifecycle shortcuts ──────────────────────────────────────────────────────

  if (status === "Done" || status === "Cancelled" || reschedule) {
    // Fetch current event for rescheduledFrom + checklistItemId
    const current = await prisma.$queryRaw<{
      scheduledAt: Date; checklistItemId: string | null;
    }[]>`SELECT "scheduledAt", "checklistItemId" FROM "PitstopEvent" WHERE id = ${eventId} LIMIT 1`;
    if (!current[0]) return Response.json({ error: "Not found" }, { status: 404 });

    if (status === "Done") {
      await prisma.$executeRaw`
        UPDATE "PitstopEvent"
        SET status = 'Done'::"PitstopEventStatus", "completedAt" = NOW(), "updatedAt" = NOW()
        WHERE id = ${eventId}
      `;
      if (current[0].checklistItemId) {
        const [ci] = await prisma.$queryRaw<{ completionType: string }[]>`
          SELECT "completionType"::text FROM "ChecklistItem" WHERE id = ${current[0].checklistItemId}
        `;
        if (!ci || ci.completionType === 'Activity') {
          await prisma.$executeRaw`
            UPDATE "ChecklistItem"
            SET status = 'Done'::"ChecklistItemStatus", checked = TRUE, "completedAt" = NOW(), "updatedAt" = NOW()
            WHERE id = ${current[0].checklistItemId}
          `;
          await autoAdvancePitstopFromItem(current[0].checklistItemId);
        }
      }
    } else if (status === "Cancelled") {
      const reason: string = cancellationReason ?? null;
      await prisma.$executeRaw`
        UPDATE "PitstopEvent"
        SET status = 'Cancelled'::"PitstopEventStatus",
            "cancellationReason" = ${reason},
            "updatedAt" = NOW()
        WHERE id = ${eventId}
      `;
      if (current[0].checklistItemId) {
        await prisma.$executeRaw`
          UPDATE "ChecklistItem"
          SET status = 'Cancelled'::"ChecklistItemStatus", "updatedAt" = NOW()
          WHERE id = ${current[0].checklistItemId}
        `;
      }
    } else if (reschedule && scheduledAt) {
      const newDate = new Date(scheduledAt);
      const oldDate = current[0].scheduledAt;
      const reason: string = rescheduleReason ?? null;
      await prisma.$executeRaw`
        UPDATE "PitstopEvent"
        SET status = 'Rescheduled'::"PitstopEventStatus",
            "scheduledAt" = ${newDate},
            "rescheduledFrom" = ${oldDate},
            "rescheduleReason" = ${reason},
            "updatedAt" = NOW()
        WHERE id = ${eventId}
      `;
      if (current[0].checklistItemId) {
        await prisma.$executeRaw`
          UPDATE "ChecklistItem"
          SET status = 'Rescheduled'::"ChecklistItemStatus", "updatedAt" = NOW()
          WHERE id = ${current[0].checklistItemId}
        `;
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
  await prisma.pitstopEvent.update({ where: { id: eventId }, data: { deletedAt: new Date() } });
  return Response.json({ ok: true });
}
