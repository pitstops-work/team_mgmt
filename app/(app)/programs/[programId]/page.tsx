import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import ProgramDetail from "./ProgramDetail";

export default async function ProgramPage({ params }: { params: Promise<{ programId: string }> }) {
  const session = await auth();
  const { programId } = await params;

  const [program, allGoals] = await Promise.all([
    prisma.program.findUnique({
      where: { id: programId, deletedAt: null },
      include: {
        owner: { select: { id: true, name: true, image: true } },
        goals: {
          include: {
            goal: {
              include: {
                owner: { select: { id: true, name: true, image: true } },
                pitstops: {
                  where: { deletedAt: null },
                  select: { id: true, status: true, title: true, targetDate: true, startDate: true, owner: { select: { id: true, name: true, image: true } } },
                  orderBy: { order: "asc" },
                },
              },
            },
          },
        },
      },
    }),
    prisma.goal.findMany({
      where: { deletedAt: null },
      select: { id: true, title: true, owner: { select: { id: true, name: true, image: true } } },
      orderBy: { title: "asc" },
    }),
  ]);

  if (!program) notFound();

  return (
    <ProgramDetail
      program={JSON.parse(JSON.stringify(program))}
      allGoals={JSON.parse(JSON.stringify(allGoals))}
      currentUserId={session!.user!.id!}
    />
  );
}
