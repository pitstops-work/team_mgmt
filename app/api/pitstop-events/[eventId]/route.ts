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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const { title, description, type, scheduledAt, endsAt, location, pitstopId, attendeeIds } = await req.json();

  // Resolve pitstop owner if pitstop is changing or if attendeeIds are being updated
  let ownerIdToAdd: string | null = null;
  if (pitstopId !== undefined || attendeeIds !== undefined) {
    const resolvedPitstopId = pitstopId ?? (await prisma.pitstopEvent.findUnique({ where: { id: eventId }, select: { pitstopId: true } }))?.pitstopId;
    if (resolvedPitstopId) {
      const p = await prisma.pitstop.findUnique({ where: { id: resolvedPitstopId }, select: { ownerId: true } });
      ownerIdToAdd = p?.ownerId ?? null;
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
      pitstopId: pitstopId !== undefined ? (pitstopId || null) : undefined,
      ...(attendeeIds !== undefined ? {
        attendees: {
          deleteMany: {},
          create: Array.from(new Set([
            ...(ownerIdToAdd ? [ownerIdToAdd] : []),
            ...attendeeIds,
          ])).map((userId: string) => ({ userId })),
        },
      } : {}),
    },
    include,
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
