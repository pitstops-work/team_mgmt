import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const { title, description, type, scheduledAt, location, pitstopId } = await req.json();

  const event = await prisma.pitstopEvent.update({
    where: { id: eventId },
    data: {
      title: title ?? undefined,
      description: description !== undefined ? (description || null) : undefined,
      type: type ?? undefined,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      location: location !== undefined ? (location || null) : undefined,
      pitstopId: pitstopId !== undefined ? (pitstopId || null) : undefined,
    },
    include: {
      pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } } } },
      createdBy: { select: { id: true, name: true, image: true } },
    },
  });

  return Response.json(event);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  await prisma.pitstopEvent.update({ where: { id: eventId }, data: { deletedAt: new Date() } });
  return Response.json({ ok: true });
}
