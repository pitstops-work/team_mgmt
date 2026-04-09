import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import PitstopsList from "./PitstopsList";

export default async function PitstopsPage() {
  await auth();

  const [pitstops, goals, users] = await Promise.all([
    prisma.pitstop.findMany({
      where: { deletedAt: null, goal: { deletedAt: null } },
      select: {
        id: true, title: true, type: true, status: true,
        startDate: true, targetDate: true, completedAt: true,
        goal: { select: { id: true, title: true } },
        owner: { select: { id: true, name: true, image: true } },
        checklistItems: { select: { id: true, checked: true } },
      },
      orderBy: [{ goal: { title: "asc" } }, { order: "asc" }],
    }),
    prisma.goal.findMany({ where: { deletedAt: null }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true, image: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <PitstopsList
      pitstops={JSON.parse(JSON.stringify(pitstops))}
      goals={JSON.parse(JSON.stringify(goals))}
      users={JSON.parse(JSON.stringify(users))}
    />
  );
}
