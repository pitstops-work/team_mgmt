import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import QuartersView from "./QuartersView";

export default async function QuartersPage() {
  const session = await auth();

  const [quarters, allGoals] = await Promise.all([
    prisma.quarter.findMany({
      where: { deletedAt: null },
      include: {
        goals: {
          include: {
            goal: {
              where: { deletedAt: null },
              select: {
                id: true,
                title: true,
                status: true,
                pitstops: { where: { deletedAt: null }, select: { id: true, status: true } },
              },
            },
          },
        },
      },
      orderBy: [{ year: "desc" }, { quarter: "desc" }],
    }),
    prisma.goal.findMany({
      where: { deletedAt: null },
      select: { id: true, title: true, status: true },
      orderBy: { title: "asc" },
    }),
  ]);

  return (
    <QuartersView
      initialQuarters={JSON.parse(JSON.stringify(quarters))}
      allGoals={JSON.parse(JSON.stringify(allGoals))}
      currentUserId={session!.user!.id!}
    />
  );
}
