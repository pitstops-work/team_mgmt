import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import GanttChart from "./GanttChart";

export default async function GanttPage() {
  await auth();

  const goals = await prisma.goal.findMany({
    where: { deletedAt: null },
    include: {
      owner: { select: { id: true, name: true, image: true } },
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
