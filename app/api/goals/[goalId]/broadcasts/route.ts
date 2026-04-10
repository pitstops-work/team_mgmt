import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  const broadcasts = await prisma.goalBroadcast.findMany({
    where: { goalId, deletedAt: null },
    include: { author: { select: { id: true, name: true, image: true } } },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(broadcasts);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  const { title, body } = await req.json();

  if (!title?.trim() || !body?.trim()) {
    return Response.json({ error: "title and body required" }, { status: 400 });
  }

  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    select: { title: true, followers: { select: { userId: true } } },
  });
  if (!goal) return Response.json({ error: "Not found" }, { status: 404 });

  const broadcast = await prisma.goalBroadcast.create({
    data: {
      goalId,
      authorId: session.user.id,
      title: title.trim(),
      body: body.trim(),
    },
    include: { author: { select: { id: true, name: true, image: true } } },
  });

  // Notify all goal followers
  const recipientIds = goal.followers
    .filter((f) => f.userId !== session.user.id)
    .map((f) => f.userId);

  if (recipientIds.length > 0) {
    await prisma.notification.createMany({
      data: recipientIds.map((userId) => ({
        userId,
        type: "BroadcastUpdate" as const,
        title: `Update: ${title.trim()}`,
        body: body.trim().substring(0, 200),
        link: `/goals/${goalId}`,
      })),
    });
    sendPushToUsers(recipientIds, {
      title: `Update: ${title.trim()}`,
      body: body.trim().substring(0, 200),
      link: `/goals/${goalId}`,
    });
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      entityType: "Goal",
      entityId: goalId,
      userId: session.user.id,
      action: "broadcast",
      field: null,
      oldValue: null,
      newValue: title.trim(),
    },
  });

  return Response.json(broadcast);
}
