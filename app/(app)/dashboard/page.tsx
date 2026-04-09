import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import GoalsDashboard from "./GoalsDashboard";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  const { q } = await searchParams;

  const [goals, users, programs] = await Promise.all([
    prisma.goal.findMany({
      where: { deletedAt: null },
      include: {
        owner: { select: { id: true, name: true, image: true } },
        pitstops: { where: { deletedAt: null }, select: { id: true, status: true } },
        programs: { include: { program: { select: { id: true, title: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.user.findMany({ select: { id: true, name: true, image: true }, orderBy: { name: "asc" } }),
    prisma.program.findMany({ where: { deletedAt: null }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
  ]);

  let searchResults = null;
  if (q?.trim()) {
    const [matchingGoals, matchingPitstops] = await Promise.all([
      prisma.goal.findMany({
        where: {
          deletedAt: null,
          OR: [
            { title: { contains: q } },
            { description: { contains: q } },
          ],
        },
        include: { owner: { select: { id: true, name: true, image: true } }, pitstops: { where: { deletedAt: null }, select: { id: true, status: true } } },
        take: 10,
      }),
      prisma.pitstop.findMany({
        where: {
          deletedAt: null,
          OR: [{ title: { contains: q } }, { notes: { contains: q } }],
        },
        include: { goal: { select: { id: true, title: true } } },
        take: 10,
      }),
    ]);
    searchResults = { query: q, goals: matchingGoals, pitstops: matchingPitstops };
  }

  return (
    <GoalsDashboard
      initialGoals={JSON.parse(JSON.stringify(goals))}
      currentUserId={session!.user!.id!}
      searchResults={searchResults ? JSON.parse(JSON.stringify(searchResults)) : null}
      users={users}
      programs={programs}
    />
  );
}
