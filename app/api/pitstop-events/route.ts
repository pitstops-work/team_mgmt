import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";
import { auditLog } from "@/lib/auditLog";

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
  // Must mirror the /activities page seed shape: handleSaved swaps the POST
  // response into calendar state wholesale, so a missing checklistItem here
  // makes the edit modal lose the link when a just-created event is edited.
  checklistItem: { select: { id: true, completionType: true, text: true } },
} as const;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const events = await prisma.pitstopEvent.findMany({
    where: { deletedAt: null },
    include,
    orderBy: { scheduledAt: "asc" },
  });

  return Response.json(events);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { title, description, type, scheduledAt, endsAt, location, pitstopIds = [], attendeeIds = [], checklistItemId } = await req.json();
  if (!title || !scheduledAt) return Response.json({ error: "Title and date required" }, { status: 400 });

  // Auto-add pitstop owners + goal co-owners as attendees. Goal co-owners get
  // the same downward visibility as goal owners (see RBAC scope flow); putting
  // them on the attendee list keeps the activity visible on their calendar
  // and lined up for their participation, not just for read-access.
  let ownerIds: string[] = [];
  let goalCoOwnerIds: string[] = [];
  if (pitstopIds.length > 0) {
    const linked = await prisma.pitstop.findMany({
      where: { id: { in: pitstopIds } },
      select: {
        ownerId: true,
        goal: { select: { coOwners: { select: { userId: true } } } },
      },
    });
    ownerIds = linked.filter(p => p.ownerId).map(p => p.ownerId!);
    goalCoOwnerIds = linked.flatMap(p => p.goal?.coOwners?.map(co => co.userId) ?? []);
  }

  const creatorId = session.user.id;
  // Only the creator is auto-accepted; everyone else (owners + co-owners + tagged) needs to confirm
  const allInvitedIds = Array.from(new Set([...ownerIds, ...goalCoOwnerIds, ...attendeeIds])).filter(id => id !== creatorId);

  const newScheduledAt = new Date(scheduledAt);
  const event = await prisma.pitstopEvent.create({
    data: {
      title,
      description: description || null,
      type: type ?? "Meeting",
      scheduledAt: newScheduledAt,
      originalScheduledAt: newScheduledAt,
      endsAt: endsAt ? new Date(endsAt) : null,
      location: location || null,
      createdById: creatorId,
      checklistItemId: checklistItemId ?? null,
      pitstops: { create: pitstopIds.map((pitstopId: string) => ({ pitstopId })) },
      attendees: {
        create: [
          { userId: creatorId, status: "accepted" },
          ...allInvitedIds.map((userId: string) => ({ userId, status: "pending" })),
        ],
      },
    },
    include,
  });

  if (checklistItemId) {
    await prisma.$executeRaw`
      UPDATE "ChecklistItem"
      SET status = 'Scheduled'::"ChecklistItemStatus",
          "lastUpdatedById" = ${creatorId},
          "updatedAt" = NOW()
      WHERE id = ${checklistItemId}
        AND status = 'NotStarted'::"ChecklistItemStatus"
    `;
  }

  auditLog({
    entityType: "Activity", entityId: event.id, userId: creatorId,
    action: "created", newValue: title,
  });

  const creatorName = session.user.name ?? "Someone";
  const dateLabel = new Date(scheduledAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  if (allInvitedIds.length > 0) {
    await prisma.notification.createMany({
      data: allInvitedIds.map((userId: string) => ({
        userId,
        type: "ActivityTagged" as const,
        title: `${creatorName} invited you to "${title}"`,
        body: dateLabel,
        link: `/activities?invite=${event.id}`,
      })),
    });
    sendPushToUsers(allInvitedIds, {
      title: `${creatorName} invited you to "${title}"`,
      body: dateLabel,
      link: `/activities?invite=${event.id}`,
    });
  }

  return Response.json(event, { status: 201 });
}
