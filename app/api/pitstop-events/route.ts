import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const events = await prisma.pitstopEvent.findMany({
    where: { deletedAt: null },
    include: {
      pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } } } },
      createdBy: { select: { id: true, name: true, image: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  return Response.json(events);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { title, description, type, scheduledAt, location, pitstopId } = await req.json();
  if (!title || !scheduledAt) return Response.json({ error: "Title and date required" }, { status: 400 });

  const event = await prisma.pitstopEvent.create({
    data: {
      title,
      description: description || null,
      type: type ?? "Meeting",
      scheduledAt: new Date(scheduledAt),
      location: location || null,
      pitstopId: pitstopId || null,
      createdById: session.user.id,
    },
    include: {
      pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } } } },
      createdBy: { select: { id: true, name: true, image: true } },
    },
  });

  return Response.json(event, { status: 201 });
}
