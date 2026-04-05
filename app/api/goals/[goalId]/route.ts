import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  const goal = await prisma.goal.findUnique({
    where: { id: goalId, deletedAt: null },
    include: {
      owner: { select: { id: true, name: true, image: true } },
      attachments: { where: { goalId: { not: null } }, orderBy: { createdAt: "asc" } },
      followers: { select: { userId: true } },
      pitstops: {
        where: { deletedAt: null },
        include: {
          attachments: true,
          threads: {
            where: { deletedAt: null },
            select: { id: true, name: true, _count: { select: { messages: { where: { deletedAt: null } } } } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!goal) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(goal);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  const data = await req.json();

  // Check if status is changing so we can notify followers
  const existing = data.status
    ? await prisma.goal.findUnique({ where: { id: goalId }, select: { status: true, title: true, followers: { select: { userId: true } } } })
    : null;

  const goal = await prisma.goal.update({
    where: { id: goalId },
    data: { title: data.title, description: data.description, status: data.status },
    include: { owner: { select: { id: true, name: true, image: true } }, pitstops: { select: { id: true, status: true } } },
  });

  if (existing && data.status && existing.status !== data.status) {
    const link = `/goals/${goalId}`;
    const notifications = existing.followers
      .filter((f) => f.userId !== session.user.id)
      .map((f) => ({
        userId: f.userId,
        type: "GoalStatusChange" as const,
        title: `"${existing.title}" is now ${data.status}`,
        body: `Status changed from ${existing.status} to ${data.status}`,
        link,
      }));
    if (notifications.length > 0) {
      await prisma.notification.createMany({ data: notifications });
    }
  }

  return Response.json(goal);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  await prisma.goal.update({ where: { id: goalId }, data: { deletedAt: new Date() } });
  return Response.json({ ok: true });
}
