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

  const pitstopSelect = {
    where: { deletedAt: null },
    orderBy: { targetDate: "asc" as const },
    select: {
      id: true, title: true, status: true, targetDate: true, startDate: true, progressTag: true,
      checklistItems: {
        orderBy: { order: "asc" as const },
        select: {
          id: true, text: true, status: true, completionType: true, order: true,
          activities: {
            where: { deletedAt: null },
            select: { id: true, title: true, status: true, scheduledAt: true, type: true },
          },
        },
      },
    },
  };

  const goalSelect = {
    id: true, title: true, status: true, targetDate: true, needsDomain: true,
    owner: { select: { id: true, name: true } },
    needsCity:    { select: { id: true, name: true } },
    needsZone:    { select: { id: true, name: true, city: { select: { id: true, name: true } } } },
    needsCluster: { select: { id: true, name: true, zone: { select: { id: true, name: true, city: { select: { id: true, name: true } } } } } },
    needsSettlement: { select: { id: true, name: true, cluster: { select: { id: true, name: true, zone: { select: { id: true, name: true, city: { select: { id: true, name: true } } } } } } } },
    pitstops: pitstopSelect,
  };

  const [rawGoals, completedGoals] = await Promise.all([
    prisma.goal.findMany({
      where: { deletedAt: null, status: { not: "Complete" }, ...ownerFilter },
      select: goalSelect,
      orderBy: { title: "asc" },
    }),
    prisma.goal.findMany({
      where: {
        deletedAt: null, status: "Complete", ...ownerFilter,
        targetDate: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      select: goalSelect,
      orderBy: { title: "asc" },
    }),
  ]);

  type RawGoal = typeof rawGoals[0];
  const transform = (g: RawGoal) => {
    const effectiveCluster = g.needsCluster ?? g.needsSettlement?.cluster ?? null;
    const effectiveZone    = g.needsZone    ?? effectiveCluster?.zone    ?? null;
    const effectiveCity    = g.needsCity    ?? effectiveZone?.city       ?? null;
    return {
      id: g.id,
      title: g.title,
      status: g.status as string,
      targetDate: g.targetDate?.toISOString() ?? null,
      needsDomain: g.needsDomain,
      owner: { id: g.owner.id, name: g.owner.name },
      needsCity:    effectiveCity    ? { id: effectiveCity.id,    name: effectiveCity.name    } : null,
      needsZone:    effectiveZone    ? { id: effectiveZone.id,    name: effectiveZone.name    } : null,
      needsCluster: effectiveCluster ? { id: effectiveCluster.id, name: effectiveCluster.name } : null,
      pitstops: g.pitstops.map(p => ({
        id: p.id, title: p.title, status: p.status as string,
        targetDate: p.targetDate?.toISOString() ?? null,
        startDate:  p.startDate?.toISOString()  ?? null,
        progressTag: p.progressTag,
        checklistTotal: p.checklistItems.length,
        checklistDone:  p.checklistItems.filter(ci => ci.status === "Done").length,
        activityCount:      p.checklistItems.reduce((s, ci) => s + ci.activities.length, 0),
        activityDoneCount:  p.checklistItems.reduce((s, ci) => s + ci.activities.filter(a => a.status === "Done").length, 0),
        checklistItems: p.checklistItems.map(ci => ({
          id: ci.id, text: ci.text, status: ci.status as string,
          completionType: ci.completionType as string, order: ci.order,
          activities: ci.activities.map(a => ({
            id: a.id, title: a.title, status: a.status as string,
            scheduledAt: a.scheduledAt.toISOString(), type: a.type as string,
          })),
        })),
      })),
    };
  };

  const goals = [...rawGoals.map(transform), ...completedGoals.map(transform)];
  return <QuartersView goals={goals} />;
}
