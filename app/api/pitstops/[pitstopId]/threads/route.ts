import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const threads = await prisma.thread.findMany({
    where: { pitstopId },
    include: {
      messages: {
        include: {
          author: { select: { id: true, name: true, image: true } },
          attachments: true,
          mentions: { include: { user: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return Response.json(threads);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const { name, checklistItemId, eventId } = await req.json();
  if (!name) return Response.json({ error: "Name required" }, { status: 400 });

  const thread = await prisma.thread.create({
    data: {
      name,
      pitstopId,
      ...(checklistItemId ? { checklistItemId } : {}),
      ...(eventId ? { eventId } : {}),
    },
    include: {
      messages: true,
      pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } }, owner: { select: { id: true, name: true, image: true } } } },
      goal: { select: { id: true, title: true, owner: { select: { id: true, name: true, image: true } } } },
      event: { select: { id: true, title: true, scheduledAt: true } },
      checklistItem: { select: { id: true, text: true } },
      _count: { select: { messages: { where: { deletedAt: null } } } },
    },
  });

  return Response.json(thread, { status: 201 });
}
