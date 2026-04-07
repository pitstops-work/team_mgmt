import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

const RECURRENCE_DAYS: Record<string, number> = {
  Weekly: 7,
  Monthly: 30,
  Quarterly: 91,
  Yearly: 365,
};

export async function POST(_req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;

  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      pitstops: {
        where: { deletedAt: null },
        include: { checklistItems: true },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!goal) return Response.json({ error: "Not found" }, { status: 404 });
  if (goal.recurrence === "None") return Response.json({ error: "Goal has no recurrence set" }, { status: 400 });

  const days = RECURRENCE_DAYS[goal.recurrence];
  const newTargetDate = goal.targetDate
    ? new Date(goal.targetDate.getTime() + days * 86400000)
    : new Date(Date.now() + days * 86400000);

  // Create next goal instance
  const newGoal = await prisma.goal.create({
    data: {
      title: goal.title,
      description: goal.description,
      status: "Active",
      recurrence: goal.recurrence,
      ownerId: goal.ownerId,
      targetDate: newTargetDate,
    },
  });

  // Auto-follow for owner
  await prisma.goalFollow.upsert({
    where: { userId_goalId: { userId: goal.ownerId, goalId: newGoal.id } },
    create: { userId: goal.ownerId, goalId: newGoal.id },
    update: {},
  });

  // Clone pitstops (reset status, keep structure)
  for (const p of goal.pitstops) {
    const newPitstop = await prisma.pitstop.create({
      data: {
        title: p.title,
        type: p.type,
        notes: p.notes,
        status: "Upcoming",
        goalId: newGoal.id,
        ownerId: p.ownerId,
        ownerInherited: p.ownerInherited,
        order: p.order,
      },
    });

    // Clone checklist items (unchecked)
    if (p.checklistItems.length > 0) {
      await prisma.checklistItem.createMany({
        data: p.checklistItems.map((item) => ({
          pitstopId: newPitstop.id,
          text: item.text,
          checked: false,
          order: item.order,
        })),
      });
    }
  }

  return Response.json({ goalId: newGoal.id }, { status: 201 });
}
