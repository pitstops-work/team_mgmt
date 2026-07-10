import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getSeedingAccess } from "@/lib/seeding/access";
import { ownerMatchesRole, seedingRoleLabel } from "@/lib/seeding/roles";
import { currentWeek } from "@/lib/seeding/weeks";
import MyTasksList from "./MyTasksList";

export default async function MyTasksPage() {
  const session = await auth();
  const access = await getSeedingAccess(session);

  const [config, allSubs] = await Promise.all([
    prisma.seedingConfig.findUnique({ where: { id: 1 } }),
    prisma.seedingSubtask.findMany({ include: { task: { include: { workstream: true } } }, orderBy: { dueWeek: "asc" } }),
  ]);
  const week0 = config?.week0Date ?? new Date("2026-06-22T00:00:00Z");
  const nowWeek = currentWeek(week0);

  const roles = [...new Set(access.memberships.map((m) => m.role))];
  const mine = allSubs.filter((s) => roles.some((r) => ownerMatchesRole(s.ownerRole, r)));

  const dto = mine.map((s) => ({
    id: s.id, title: s.title, ownerRole: s.ownerRole, dueWeek: s.dueWeek, status: s.status,
    workstreamLabel: s.task.workstream.label, workstreamKey: s.task.workstream.key, taskTitle: s.task.title, doneMetric: s.doneMetric,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">My tasks</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          {roles.length ? `Tasks owned by: ${roles.map(seedingRoleLabel).join(", ")}` : "You have no seeding role yet — ask an admin to add you."}
          {access.geoIds.length > 0 && " · geo-scoped"}
        </p>
      </div>
      <MyTasksList tasks={dto} week0ISO={week0.toISOString()} nowWeek={nowWeek} canEdit={access.canEdit} />
    </div>
  );
}
