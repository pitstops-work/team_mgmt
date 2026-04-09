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
  attendees: { select: { id: true, userId: true, user: { select: { id: true, name: true, image: true } } } },
} as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const { title, description, type, scheduledAt, endsAt, location, pitstopIds, attendeeIds } = await req.json();

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
      ...(attendeeIds !== undefined ? {
        attendees: {
          deleteMany: {},
          create: Array.from(new Set([...ownerIds, ...attendeeIds])).map((userId: string) => ({ userId })),
        },
      } : {}),
    },
    include,
  });

  // Notify newly added attendees
  if (attendeeIds !== undefined) {
    const prevAttendees = await prisma.pitstopEventAttendee.findMany({
      where: { eventId },
      select: { userId: true },
    });
    const prevIds = new Set(prevAttendees.map((a) => a.userId));
    const newIds = Array.from(new Set([...ownerIds, ...attendeeIds])).filter(
      (id) => !prevIds.has(id) && id !== session.user.id
    );
    if (newIds.length > 0) {
      const creatorName = session.user.name ?? "Someone";
      await prisma.notification.createMany({
        data: newIds.map((userId) => ({
          userId,
          type: "ActivityTagged" as const,
          title: `${creatorName} added you to "${event.title}"`,
          body: new Date(event.scheduledAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
          link: `/activities`,
        })),
      });
      sendPushToUsers(newIds, {
        title: `${creatorName} added you to "${event.title}"`,
        body: new Date(event.scheduledAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
        link: `/activities`,
      });
    }
  }

  return Response.json(event);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  await prisma.pitstopEvent.update({ where: { id: eventId }, data: { deletedAt: new Date() } });
  return Response.json({ ok: true });
}
