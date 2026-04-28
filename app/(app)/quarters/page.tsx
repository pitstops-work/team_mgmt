import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import QuartersView from "./QuartersView";

export const dynamic = "force-dynamic";

export default async function QuartersPage() {
  const session = await auth();
  const currentUserId = session!.user!.id!;

  const me = await prisma.user.findUnique({ where: { id: currentUserId }, select: { designation: true } });
  const designation = me?.designation ?? "Other";

  let teamIds: string[] = [currentUserId];
  if (designation === "ZL") {
    const team = await prisma.user.findMany({ where: { reportsToId: currentUserId }, select: { id: true } });
    teamIds = [currentUserId, ...team.map(m => m.id)];
  }
  const ownerFilter = (designation === "RP" || designation === "ZL") ? { ownerId: { in: teamIds } } : {};

  const rawGoals = await prisma.goal.findMany({
    where: { deletedAt: null, status: { not: "Complete" }, ...ownerFilter },
    select: {
      id: true, title: true, status: true, targetDate: true,
      pitstops: {
        where: { deletedAt: null },
        orderBy: { targetDate: "asc" },
        select: {
          id: true, title: true, status: true, targetDate: true, startDate: true, progressTag: true,
          checklistItems: {
            select: { id: true, status: true },
          },
          events: {
            select: {
              event: { select: { id: true, status: true, scheduledAt: true, deletedAt: true } },
            },
          },
        },
      },
    },
    orderBy: { title: "asc" },
  });

  // Also fetch recently completed goals (last 90 days) so done quarters still show context
  const completedGoals = await prisma.goal.findMany({
    where: {
      deletedAt: null, status: "Complete", ...ownerFilter,
      targetDate: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    },
    select: {
      id: true, title: true, status: true, targetDate: true,
      pitstops: {
        where: { deletedAt: null },
        orderBy: { targetDate: "asc" },
        select: {
          id: true, title: true, status: true, targetDate: true, startDate: true, progressTag: true,
          checklistItems: { select: { id: true, status: true } },
          events: {
            select: { event: { select: { id: true, status: true, scheduledAt: true, deletedAt: true } } },
          },
        },
      },
    },
    orderBy: { title: "asc" },
  });

  type RawGoal = typeof rawGoals[0];
  const transform = (g: RawGoal) => ({
    id: g.id,
    title: g.title,
    status: g.status as string,
    targetDate: g.targetDate?.toISOString() ?? null,
    pitstops: g.pitstops.map(p => ({
      id: p.id,
      title: p.title,
      status: p.status as string,
      targetDate: p.targetDate?.toISOString() ?? null,
      startDate: p.startDate?.toISOString() ?? null,
      progressTag: p.progressTag,
      checklistTotal: p.checklistItems.length,
      checklistDone: p.checklistItems.filter(ci => ci.status === "Done").length,
      activityCount: p.events.filter(e => !e.event.deletedAt).length,
      activityDoneCount: p.events.filter(e => !e.event.deletedAt && e.event.status === "Done").length,
    })),
  });

  const goals = [...rawGoals.map(transform), ...completedGoals.map(transform)];

  return <QuartersView goals={goals} />;
}
