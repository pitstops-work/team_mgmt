import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import GoalDetail from "./GoalDetail";

export default async function GoalPage({ params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  const { goalId } = await params;

  const [goal, users] = await Promise.all([
    prisma.goal.findUnique({
      where: { id: goalId, deletedAt: null },
      include: {
        owner: { select: { id: true, name: true, image: true } },
        // recurrence is a scalar — included automatically
        attachments: { where: { goalId: { not: null } }, orderBy: { createdAt: "asc" } },
        followers: { select: { userId: true } },
        pitstops: {
          where: { deletedAt: null },
          include: {
            owner: { select: { id: true, name: true, image: true } },
            attachments: true,
            threads: {
              where: { deletedAt: null },
              select: { id: true, name: true, _count: { select: { messages: { where: { deletedAt: null } } } } },
            },
          },
          orderBy: { order: "asc" },
        },
      },
    }),
    prisma.user.findMany({ select: { id: true, name: true, image: true }, orderBy: { name: "asc" } }),
  ]);

  if (!goal) notFound();

  const isFollowing = goal.followers.some((f) => f.userId === session!.user!.id);

  return (
    <GoalDetail
      goal={JSON.parse(JSON.stringify(goal))}
      users={JSON.parse(JSON.stringify(users))}
      currentUserId={session!.user!.id!}
      isFollowing={isFollowing}
    />
  );
}
