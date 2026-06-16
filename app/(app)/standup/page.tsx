import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import StandupView from "./StandupView";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";
import { pitstopOwnedByAnyOf } from "@/lib/ownership";

export default async function StandupPage() {
  const session = await auth();
  const currentUserId = session!.user!.id!;

  const me = await prisma.user.findUnique({ where: { id: currentUserId }, select: { designation: true } });
  const designation = me?.designation ?? "Other";

  let teamIds: string[] = [currentUserId];
  if (designation === "ZL") {
    const team = await prisma.user.findMany({ where: { reportsToId: currentUserId }, select: { id: true } });
    teamIds = [currentUserId, ...team.map(m => m.id)];
  }
  const logUserFilter = (designation === "RP" || designation === "ZL") ? { userId: { in: teamIds } } : {};
  const userFilter = (designation === "RP" || designation === "ZL") ? { id: { in: teamIds } } : {};

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [logs, inProgressPitstops, users] = await Promise.all([
    prisma.standupLog.findMany({
      where: { date: { gte: since }, ...logUserFilter },
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
        status: "InProgress",
        goal: { deletedAt: null },
        ...pitstopOwnedByAnyOf([currentUserId]),
      },
      select: { id: true, title: true, goal: { select: { id: true, title: true } } },
      orderBy: { updatedAt: "desc" },
    }),

    prisma.user.findMany({
      where: userFilter,
      select: { id: true, name: true, image: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <SurfaceProvider id="standup.view">
      <StandupView
        initialLogs={JSON.parse(JSON.stringify(logs))}
        inProgressPitstops={JSON.parse(JSON.stringify(inProgressPitstops))}
        users={JSON.parse(JSON.stringify(users))}
        currentUserId={currentUserId}
      />
    </SurfaceProvider>
  );
}
