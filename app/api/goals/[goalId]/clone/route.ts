import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;

  const source = await prisma.goal.findUnique({
    where: { id: goalId, deletedAt: null },
    include: {
      pitstops: {
        where: { deletedAt: null },
        include: { checklistItems: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!source) return Response.json({ error: "Not found" }, { status: 404 });

  const newGoal = await prisma.goal.create({
    data: {
      title: `Copy of ${source.title}`,
      description: source.description,
      status: "Active",
      recurrence: source.recurrence,
      targetDate: source.targetDate,
      ownerId: session.user.id,
      pitstops: {
        create: source.pitstops.map((p) => ({
          title: p.title,
          type: p.type,
          customType: p.customType,
          notes: p.notes,
          status: "Upcoming",
          order: p.order,
          recurrence: p.recurrence,
          ownerId: p.ownerId,
          ownerInherited: p.ownerInherited,
          startDate: p.startDate,
          targetDate: p.targetDate,
          checklistItems: {
            create: p.checklistItems.map((c) => ({
              text: c.text,
              checked: false,
              order: c.order,
            })),
          },
        })),
      },
    },
  });

  // Auto-follow the new goal
  await prisma.goalFollow.create({
    data: { userId: session.user.id, goalId: newGoal.id },
  });

  return Response.json({ id: newGoal.id }, { status: 201 });
}
