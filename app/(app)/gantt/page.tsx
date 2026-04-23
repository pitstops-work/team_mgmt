import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import GanttChart from "./GanttChart";

export default async function GanttPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { designation: true } });
  const designation = me?.designation ?? "Other";

  let teamIds: string[] = [userId];
  if (designation === "ZL") {
    const team = await prisma.user.findMany({ where: { reportsToId: userId }, select: { id: true } });
    teamIds = [userId, ...team.map(m => m.id)];
  }
  const ownerFilter = (designation === "RP" || designation === "ZL") ? { ownerId: { in: teamIds } } : {};

  const goals = await prisma.goal.findMany({
    where: { deletedAt: null, ...ownerFilter },
    include: {
      owner: { select: { id: true, name: true, image: true } },
      needsZone: { select: { id: true, name: true, cityId: true } },
      needsCluster: { select: { id: true, name: true, zoneId: true } },
      pitstops: {
        where: { deletedAt: null },
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          order: true,
          startDate: true,
          targetDate: true,
          completedAt: true,
          ownerId: true,
          owner: { select: { id: true, name: true, image: true } },
          checklistItems: { select: { id: true, text: true, checked: true }, orderBy: { order: "asc" } },
        },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return <GanttChart goals={JSON.parse(JSON.stringify(goals))} />;
}
