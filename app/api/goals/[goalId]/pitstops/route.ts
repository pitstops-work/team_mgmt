import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  const { title, type, notes, status, startDate, targetDate } = await req.json();
  if (!title) return Response.json({ error: "Title required" }, { status: 400 });

  // Validate pitstop targetDate doesn't exceed goal's targetDate
  if (targetDate) {
    const goal = await prisma.goal.findUnique({ where: { id: goalId }, select: { targetDate: true } });
    if (goal?.targetDate && new Date(targetDate) > goal.targetDate) {
      return Response.json({ error: "Pitstop target date cannot be after the goal deadline" }, { status: 400 });
    }
  }

  const existingCount = await prisma.pitstop.count({ where: { goalId, deletedAt: null } });

  // Inherit owner from goal
  const goalRecord = await prisma.goal.findUnique({ where: { id: goalId }, select: { ownerId: true } });

  const [pitstop, goal] = await Promise.all([
    prisma.pitstop.create({
      data: {
        title, type: type ?? "Discussion", notes, status: status ?? "Upcoming", goalId, order: existingCount,
        ownerId: goalRecord?.ownerId ?? null,
        startDate: startDate ? new Date(startDate) : undefined,
        targetDate: targetDate ? new Date(targetDate) : undefined,
        completedAt: status === "Done" ? new Date() : undefined,
      },
      include: {
        attachments: true,
        threads: { select: { id: true, name: true, _count: { select: { messages: true } } } },
      },
    }),
    prisma.goal.findUnique({
      where: { id: goalId },
      select: { title: true, followers: { select: { userId: true } } },
    }),
  ]);

  if (goal) {
    const link = `/goals/${goalId}/pitstops/${pitstop.id}`;
    const authorName = session.user.name ?? "Someone";
    const notifications = goal.followers
      .filter((f) => f.userId !== session.user.id)
      .map((f) => ({
        userId: f.userId,
        type: "NewPitstop" as const,
        title: `New pitstop in "${goal.title}"`,
        body: `${authorName} added "${title}"`,
        link,
      }));
    if (notifications.length > 0) {
      await prisma.notification.createMany({ data: notifications });
    }
  }

  return Response.json(pitstop, { status: 201 });
}
