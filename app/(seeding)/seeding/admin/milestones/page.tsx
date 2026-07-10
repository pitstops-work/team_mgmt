import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSeedingAccess } from "@/lib/seeding/access";
import MilestonesClient from "./MilestonesClient";

export default async function MilestonesAdminPage() {
  const session = await auth();
  const access = await getSeedingAccess(session);
  if (!access.canManageStructure) redirect("/seeding");

  const [milestones, phases] = await Promise.all([
    prisma.seedingLaunchMilestone.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { phases: true } } } }),
    prisma.seedingPhase.findMany({
      orderBy: [{ workstream: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      include: { workstream: { select: { label: true, color: true } } },
    }),
  ]);

  return (
    <MilestonesClient
      milestones={milestones.map((m) => ({ id: m.id, title: m.title, phaseCount: m._count.phases }))}
      phases={phases.map((p) => ({ id: p.id, label: p.label, milestoneId: p.milestoneId, workstreamLabel: p.workstream.label, color: p.workstream.color }))}
    />
  );
}
