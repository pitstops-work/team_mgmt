import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import ProgramsList from "./ProgramsList";

export default async function ProgramsPage() {
  const session = await auth();

  const [programs, goals] = await Promise.all([
    prisma.program.findMany({
      where: { deletedAt: null },
      include: {
        owner: { select: { id: true, name: true, image: true } },
        goals: {
          include: {
            goal: {
              include: {
                owner: { select: { id: true, name: true, image: true } },
                pitstops: { where: { deletedAt: null }, select: { id: true, status: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.goal.findMany({
      where: { deletedAt: null },
      select: { id: true, title: true, owner: { select: { id: true, name: true, image: true } } },
      orderBy: { title: "asc" },
    }),
  ]);

  return (
    <ProgramsList
      programs={JSON.parse(JSON.stringify(programs))}
      goals={JSON.parse(JSON.stringify(goals))}
      currentUserId={session!.user!.id!}
    />
  );
}
