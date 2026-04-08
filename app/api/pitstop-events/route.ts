import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

const include = {
  pitstop: {
    select: {
      id: true, title: true,
      owner: { select: { id: true, name: true, image: true } },
      goal: { select: { id: true, title: true } },
    },
  },
  createdBy: { select: { id: true, name: true, image: true } },
  attendees: { select: { id: true, userId: true, user: { select: { id: true, name: true, image: true } } } },
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

  const { title, description, type, scheduledAt, location, pitstopId, attendeeIds = [] } = await req.json();
  if (!title || !scheduledAt) return Response.json({ error: "Title and date required" }, { status: 400 });
  if (!pitstopId) return Response.json({ error: "Pitstop is required" }, { status: 400 });

  // Get pitstop owner to auto-add as attendee
  const pitstop = await prisma.pitstop.findUnique({
    where: { id: pitstopId },
    select: { ownerId: true },
  });

  // Build deduplicated attendee set: owner + any extras
  const allAttendeeIds = Array.from(new Set([
    ...(pitstop?.ownerId ? [pitstop.ownerId] : []),
    ...attendeeIds,
  ]));

  const event = await prisma.pitstopEvent.create({
    data: {
      title,
      description: description || null,
      type: type ?? "Meeting",
      scheduledAt: new Date(scheduledAt),
      location: location || null,
      pitstopId,
      createdById: session.user.id,
      attendees: {
        create: allAttendeeIds.map((userId: string) => ({ userId })),
      },
    },
    include,
  });

  return Response.json(event, { status: 201 });
}
