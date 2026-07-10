import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getSeedingAccess } from "@/lib/seeding/access";
import { SEEDING_ROLES } from "@/lib/seeding/roles";
import WorkstreamBoard from "./WorkstreamBoard";

export default async function WorkstreamPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const session = await auth();
  const access = await getSeedingAccess(session);

  const [config, ws] = await Promise.all([
    prisma.seedingConfig.findUnique({ where: { id: 1 } }),
    prisma.seedingWorkstream.findUnique({
      where: { key: decodeURIComponent(key) },
      include: {
        phases: { orderBy: { sortOrder: "asc" } },
        tasks: { orderBy: { sortOrder: "asc" } },
      },
    }),
  ]);
  if (!ws) notFound();

  const week0 = (config?.week0Date ?? new Date("2026-06-22T00:00:00Z")).toISOString();

  return (
    <WorkstreamBoard
      workstreamId={ws.id}
      workstreamKey={ws.key}
      label={ws.label}
      color={ws.color}
      phases={ws.phases.map((p) => ({ id: p.id, label: p.label }))}
      tasks={ws.tasks.map((t) => ({
        id: t.id, code: t.code, title: t.title, detail: t.detail, ownerRole: t.ownerRole,
        supportRoles: t.supportRoles, startWeek: t.startWeek, dueWeek: t.dueWeek, dependsOn: t.dependsOn,
        doneMetric: t.doneMetric, status: t.status, notes: t.notes, phaseId: t.phaseId,
      }))}
      canEdit={access.canEdit}
      canManageStructure={access.canManageStructure}
      week0ISO={week0}
      roleOptions={SEEDING_ROLES.map((r) => r.label)}
    />
  );
}
