import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildRbacContext, can, checklistUpdatablePitstopIds } from "@/lib/rbac";
import PitstopsList from "./PitstopsList";

export default async function PitstopsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; noDate?: string }>;
}) {
  const session = await auth();
  const { status, noDate } = await searchParams;

  const [pitstops, goals, users] = await Promise.all([
    prisma.pitstop.findMany({
      where: { deletedAt: null, goal: { deletedAt: null } },
      select: {
        id: true, title: true, type: true, status: true,
        startDate: true, targetDate: true, completedAt: true,
        goal: { select: { id: true, title: true, needsZoneId: true, needsClusterId: true } },
        owner: { select: { id: true, name: true, image: true } },
        checklistItems: { select: { id: true, checked: true } },
      },
      orderBy: [{ goal: { title: "asc" } }, { order: "asc" }],
    }),
    prisma.goal.findMany({ where: { deletedAt: null }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true, image: true }, orderBy: { name: "asc" } }),
  ]);

  // Per-pitstop checklist-tick gate (scope = own/team/all) + flat activity-completion
  // gate, threaded to the quick sheet so it matches the full pitstop page.
  const ctx = await buildRbacContext(session);
  const updatable = await checklistUpdatablePitstopIds(ctx, pitstops.map((p) => p.id));
  const canCompleteActivity = ctx ? await can(ctx, "pitstop_event", "update") : false;

  return (
    <PitstopsList
      pitstops={JSON.parse(JSON.stringify(pitstops))}
      goals={JSON.parse(JSON.stringify(goals))}
      users={JSON.parse(JSON.stringify(users))}
      initialStatus={status ?? ""}
      initialNoDate={noDate === "1"}
      checklistUpdatablePitstopIds={Array.from(updatable)}
      canCompleteActivity={canCompleteActivity}
    />
  );
}
