import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  await prisma.goalFollow.upsert({
    where: { userId_goalId: { userId: session.user.id, goalId } },
    create: { userId: session.user.id, goalId },
    update: {},
  });

  // Notify goal owner that someone is now following their goal
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    select: { title: true, ownerId: true },
  });
  if (goal && goal.ownerId && goal.ownerId !== session.user.id) {
    const followerName = session.user.name ?? "Someone";
    await prisma.notification.create({
      data: {
        userId: goal.ownerId,
        type: "GoalFollowed",
        title: `${followerName} is now following "${goal.title}"`,
        body: null,
        link: `/goals/${goalId}`,
      },
    });
    sendPushToUsers([goal.ownerId], {
      title: `${followerName} is now following "${goal.title}"`,
      body: "",
      link: `/goals/${goalId}`,
    });
  }

  return Response.json({ following: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  await prisma.goalFollow.deleteMany({
    where: { userId: session.user.id, goalId },
  });
  return Response.json({ following: false });
}
