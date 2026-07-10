import prisma from "@/lib/prisma";
import type { SeedingTaskStatus } from "@/app/generated/prisma/client";

export type MilestoneTask = {
  id: string; title: string; status: SeedingTaskStatus; subDone: number; subTotal: number;
  workstreamKey: string; workstreamLabel: string; color: string;
};
export type MilestoneNode = {
  id: string; key: string; title: string; sortOrder: number;
  targetWeek: number | null; // override ?? computed (latest sub-task due across phases)
  subDone: number; subTotal: number; blocked: number;
  tasks: MilestoneTask[];
};

/** Curated Road-to-Launch milestones with rolled-up progress, ordered by
 *  target week (then sortOrder). Milestones with no dated work sort last. */
export async function loadLaunchMilestones(): Promise<MilestoneNode[]> {
  const rows = await prisma.seedingLaunchMilestone.findMany({
    include: {
      phases: {
        include: {
          workstream: { select: { key: true, label: true, color: true } },
          tasks: { orderBy: { sortOrder: "asc" }, include: { subtasks: { select: { status: true, dueWeek: true } } } },
        },
      },
    },
  });

  const nodes: MilestoneNode[] = rows.map((m) => {
    const allSubs = m.phases.flatMap((p) => p.tasks.flatMap((t) => t.subtasks));
    const dues = allSubs.map((s) => s.dueWeek).filter((d): d is number => d != null);
    const tasks: MilestoneTask[] = m.phases.flatMap((p) =>
      p.tasks.map((t) => ({
        id: t.id, title: t.title, status: t.status,
        subDone: t.subtasks.filter((s) => s.status === "done").length, subTotal: t.subtasks.length,
        workstreamKey: p.workstream.key, workstreamLabel: p.workstream.label, color: p.workstream.color,
      })),
    );
    return {
      id: m.id, key: m.key, title: m.title, sortOrder: m.sortOrder,
      targetWeek: m.targetWeek ?? (dues.length ? Math.max(...dues) : null),
      subDone: allSubs.filter((s) => s.status === "done").length,
      subTotal: allSubs.length,
      blocked: allSubs.filter((s) => s.status === "blocked").length,
      tasks,
    };
  });

  return nodes.sort((a, b) => {
    const aw = a.targetWeek ?? 9999, bw = b.targetWeek ?? 9999;
    return aw - bw || a.sortOrder - b.sortOrder;
  });
}
