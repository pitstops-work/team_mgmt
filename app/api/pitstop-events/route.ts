import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";

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

  // Auto-add owners of all linked pitstops as attendees (accepted — they're already on the work)
  let ownerIds: string[] = [];
  if (pitstopIds.length > 0) {
    const linked = await prisma.pitstop.findMany({
      where: { id: { in: pitstopIds } },
      select: { ownerId: true },
    });
    ownerIds = linked.filter(p => p.ownerId).map(p => p.ownerId!);
  }

  const creatorId = session.user.id;
  // Everyone who is auto-added (owner) or the creator → accepted
  const acceptedIds = Array.from(new Set([creatorId, ...ownerIds]));
  // Explicitly tagged others who aren't already accepted → pending (need to approve)
  const pendingIds = attendeeIds.filter((id: string) => !acceptedIds.includes(id));

  const event = await prisma.pitstopEvent.create({
    data: {
      title,
      description: description || null,
      type: type ?? "Meeting",
      scheduledAt: new Date(scheduledAt),
      endsAt: endsAt ? new Date(endsAt) : null,
      location: location || null,
      createdById: creatorId,
      checklistItemId: checklistItemId ?? null,
      pitstops: { create: pitstopIds.map((pitstopId: string) => ({ pitstopId })) },
      attendees: {
        create: [
          ...acceptedIds.map((userId: string) => ({ userId, status: "accepted" })),
          ...pendingIds.map((userId: string) => ({ userId, status: "pending" })),
        ],
      },
    },
    include,
  });

  if (checklistItemId) {
    await prisma.$executeRaw`
      UPDATE "ChecklistItem"
      SET status = 'Scheduled'::"ChecklistItemStatus", "updatedAt" = NOW()
      WHERE id = ${checklistItemId}
        AND status = 'NotStarted'::"ChecklistItemStatus"
    `;
  }

  const creatorName = session.user.name ?? "Someone";
  const dateLabel = new Date(scheduledAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  // Invite (pending) attendees — they need to accept or decline
  if (pendingIds.length > 0) {
    await prisma.notification.createMany({
      data: pendingIds.map((userId: string) => ({
        userId,
        type: "ActivityTagged" as const,
        title: `${creatorName} invited you to "${title}"`,
        body: dateLabel,
        link: `/activities?invite=${event.id}`,
      })),
    });
    sendPushToUsers(pendingIds, {
      title: `${creatorName} invited you to "${title}"`,
      body: dateLabel,
      link: `/activities?invite=${event.id}`,
    });
  }

  // Notify auto-added owners (not the creator) — informational, no action needed
  const notifyOwnerIds = ownerIds.filter(id => id !== creatorId);
  if (notifyOwnerIds.length > 0) {
    await prisma.notification.createMany({
      data: notifyOwnerIds.map((userId: string) => ({
        userId,
        type: "ActivityTagged" as const,
        title: `${creatorName} added you to "${title}"`,
        body: dateLabel,
        link: `/activities`,
      })),
    });
    sendPushToUsers(notifyOwnerIds, {
      title: `${creatorName} added you to "${title}"`,
      body: dateLabel,
      link: `/activities`,
    });
  }

  return Response.json(event, { status: 201 });
}
