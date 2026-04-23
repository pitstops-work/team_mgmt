import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import QuartersView from "./QuartersView";

export default async function QuartersPage() {
  const session = await auth();
  const currentUserId = session!.user!.id!;

  const me = await prisma.user.findUnique({ where: { id: currentUserId }, select: { designation: true } });
  const designation = me?.designation ?? "Other";

  let teamIds: string[] = [currentUserId];
  if (designation === "ZL") {
    const team = await prisma.user.findMany({ where: { reportsToId: currentUserId }, select: { id: true } });
    teamIds = [currentUserId, ...team.map(m => m.id)];
  }
  const ownerFilter = (designation === "RP" || designation === "ZL") ? { ownerId: { in: teamIds } } : {};
  const isScoped = designation === "RP" || designation === "ZL";

  const [quarters, allGoals] = await Promise.all([
    prisma.quarter.findMany({
      where: { deletedAt: null },
      include: {
        goals: {
          ...(isScoped ? { where: { goal: ownerFilter } } : {}),
          include: {
            goal: {
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
      where: { deletedAt: null, ...ownerFilter },
      select: {
        id: true, title: true, status: true,
        pitstops: { where: { deletedAt: null }, select: { id: true, status: true } },
      },
      orderBy: { title: "asc" },
    }),
  ]);

  return (
    <QuartersView
      initialQuarters={JSON.parse(JSON.stringify(quarters))}
      allGoals={JSON.parse(JSON.stringify(allGoals))}
      currentUserId={currentUserId}
    />
  );
}
