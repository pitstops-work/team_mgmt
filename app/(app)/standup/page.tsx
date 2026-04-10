import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import StandupView from "./StandupView";

export default async function StandupPage() {
  const session = await auth();
  const currentUserId = session!.user!.id!;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [logs, inProgressPitstops, users] = await Promise.all([
    prisma.standupLog.findMany({
      where: { date: { gte: since } },
      include: {
        user: { select: { id: true, name: true, image: true } },
        pitstops: {
          include: {
            pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } } } },
          },
        },
      },
      orderBy: { date: "desc" },
      take: 50,
    }),

    prisma.pitstop.findMany({
      where: {
        deletedAt: null,
        ownerId: currentUserId,
        status: "InProgress",
        goal: { deletedAt: null },
      },
      select: { id: true, title: true, goal: { select: { id: true, title: true } } },
      orderBy: { updatedAt: "desc" },
    }),

    prisma.user.findMany({
      select: { id: true, name: true, image: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <StandupView
      initialLogs={JSON.parse(JSON.stringify(logs))}
      inProgressPitstops={JSON.parse(JSON.stringify(inProgressPitstops))}
      users={JSON.parse(JSON.stringify(users))}
      currentUserId={currentUserId}
    />
  );
}
