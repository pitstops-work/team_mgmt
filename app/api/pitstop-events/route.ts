import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

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

  const { title, description, type, scheduledAt, endsAt, location, pitstopIds = [], attendeeIds = [] } = await req.json();
  if (!title || !scheduledAt) return Response.json({ error: "Title and date required" }, { status: 400 });

  // Auto-add owners of all linked pitstops as attendees
  let ownerIds: string[] = [];
  if (pitstopIds.length > 0) {
    const linked = await prisma.pitstop.findMany({
      where: { id: { in: pitstopIds } },
      select: { ownerId: true },
    });
    ownerIds = linked.filter(p => p.ownerId).map(p => p.ownerId!);
  }

  const allAttendeeIds = Array.from(new Set([...ownerIds, ...attendeeIds]));

  const event = await prisma.pitstopEvent.create({
    data: {
      title,
      description: description || null,
      type: type ?? "Meeting",
      scheduledAt: new Date(scheduledAt),
      endsAt: endsAt ? new Date(endsAt) : null,
      location: location || null,
      createdById: session.user.id,
      pitstops: {
        create: pitstopIds.map((pitstopId: string) => ({ pitstopId })),
      },
      attendees: {
        create: allAttendeeIds.map((userId: string) => ({ userId })),
      },
    },
    include,
  });

  return Response.json(event, { status: 201 });
}
