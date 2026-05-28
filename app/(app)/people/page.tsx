import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import PeopleDashboard from "./PeopleDashboard";
import { buildRbacContext, scopeWhere } from "@/lib/rbac";

export default async function PeoplePage() {
  const session = await auth();

  // RBAC: user.list scope drives the directory; goal.list drives the goals
  // chip list. Both fall back to `{}` (no rows) when the role has no perm —
  // the nav gate in `navGates.ts` hides /people for users without reports,
  // so an unauth'd visitor here genuinely should see nothing.
  const ctx = await buildRbacContext(session);
  const userScope = ctx ? await scopeWhere(ctx, "user", "list") : null;
  const goalScope = ctx ? await scopeWhere(ctx, "goal", "list") : null;
  const userWhere: Record<string, unknown> = userScope ?? { id: "__none__" };
  const goalWhere: Record<string, unknown> = goalScope ?? { id: "__none__" };

  const [users, goals, partners] = await Promise.all([
    prisma.user.findMany({
      where: userWhere,
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
      where: { deletedAt: null, ...goalWhere },
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
