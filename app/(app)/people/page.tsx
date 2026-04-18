import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import PeopleDashboard from "./PeopleDashboard";

export default async function PeoplePage() {
  await auth();

  const [users, goals, partners] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        image: true,
        ownedPitstops: {
          where: { deletedAt: null, goal: { deletedAt: null } },
          select: {
            id: true,
            title: true,
            status: true,
            targetDate: true,
            startDate: true,
            completedAt: true,
            goalId: true,
            goal: { select: { id: true, title: true, status: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.goal.findMany({
      where: { deletedAt: null },
      select: { id: true, title: true, status: true, targetDate: true },
      orderBy: { title: "asc" },
    }),
    prisma.mapPartner.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <PeopleDashboard
      users={JSON.parse(JSON.stringify(users))}
      goals={JSON.parse(JSON.stringify(goals))}
      partners={JSON.parse(JSON.stringify(partners))}
    />
  );
}
