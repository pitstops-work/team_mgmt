import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import PeopleDashboard from "./PeopleDashboard";

export default async function PeoplePage() {
  const session = await auth();
  const currentUserId = session!.user!.id!;

  const me = await prisma.user.findUnique({ where: { id: currentUserId }, select: { designation: true } });
  const designation = me?.designation ?? "Other";

  let teamIds: string[] = [];
  if (designation === "ZL") {
    const team = await prisma.user.findMany({ where: { reportsToId: currentUserId }, select: { id: true } });
    teamIds = [currentUserId, ...team.map(m => m.id)];
  }
  const isScoped = designation === "ZL";
  const userFilter = isScoped ? { id: { in: teamIds } } : {};
  const ownerFilter = isScoped ? { ownerId: { in: teamIds } } : {};

  const [users, goals, partners] = await Promise.all([
    prisma.user.findMany({
      where: userFilter,
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
      where: { deletedAt: null, ...ownerFilter },
      select: { id: true, title: true, status: true, targetDate: true },
      orderBy: { title: "asc" },
    }),
    prisma.mapPartner.findMany({ orderBy: [{ isBuiltIn: "desc" }, { label: "asc" }] }),
  ]);

  return (
    <PeopleDashboard
      users={JSON.parse(JSON.stringify(users))}
      goals={JSON.parse(JSON.stringify(goals))}
      partners={partners.map(p => ({ id: p.id, key: p.key, label: p.label, color: p.color, isBuiltIn: p.isBuiltIn }))}
    />
  );
}
