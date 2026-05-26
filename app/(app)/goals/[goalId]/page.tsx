import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { buildRbacContext, can } from "@/lib/rbac";
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
        coOwners: { select: { userId: true, user: { select: { id: true, name: true, image: true } } } },
        pitstops: {
          where: { deletedAt: null },
          include: {
            owner: { select: { id: true, name: true, image: true } },
            attachments: true,
            threads: {
              where: { deletedAt: null },
              select: { id: true, name: true, _count: { select: { messages: { where: { deletedAt: null } } } } },
            },
            checklistItems: { select: { id: true, text: true, checked: true }, orderBy: { order: "asc" } },
            // updatedAt and priority included automatically as scalars
          },
          orderBy: { order: "asc" },
        },
      },
    }),
    prisma.user.findMany({ select: { id: true, name: true, image: true }, orderBy: { name: "asc" } }),
  ]);

  if (!goal) notFound();

  const isFollowing = goal.followers.some((f) => f.userId === session!.user!.id);
  const currentUserRole = (session as { user?: { role?: string } } | null)?.user?.role ?? "member";

  // Manual checklist ticks (incl. from the Route Map drill-down panel) require
  // the checklist_item.update permission — mirror the full pitstop page gate.
  const ctx = await buildRbacContext(session);
  const canUpdateChecklist = ctx ? await can(ctx, "checklist_item", "update") : false;

  return (
    <GoalDetail
      goal={JSON.parse(JSON.stringify(goal))}
      users={JSON.parse(JSON.stringify(users))}
      currentUserId={session!.user!.id!}
      currentUserRole={currentUserRole}
      canUpdateChecklist={canUpdateChecklist}
      isFollowing={isFollowing}
    />
  );
}
