import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// POST: toggle confirmation on a goal
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ goalId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;

  const goal = await prisma.goal.findUnique({
    where: { id: goalId, deletedAt: null },
    select: { id: true, confirmedById: true, ownerId: true, title: true },
  });
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isRemoving = goal.confirmedById === session.user.id;

  const updated = await prisma.goal.update({
    where: { id: goalId },
    data: {
      confirmedById: isRemoving ? null : session.user.id,
      confirmedAt: isRemoving ? null : new Date(),
    },
    select: {
      id: true,
      confirmedById: true,
      confirmedAt: true,
      confirmedBy: { select: { id: true, name: true, image: true } },
    },
  });

  // Notify goal owner that their goal was confirmed (if someone else confirmed it)
  if (!isRemoving && goal.ownerId !== session.user.id) {
    await prisma.notification.create({
      data: {
        userId: goal.ownerId,
        type: "GoalConfirmed",
        title: "Goal confirmed",
        body: `"${goal.title}" has been confirmed.`,
        link: `/goals/${goalId}`,
      },
    });
  }

  return NextResponse.json(updated);
}
