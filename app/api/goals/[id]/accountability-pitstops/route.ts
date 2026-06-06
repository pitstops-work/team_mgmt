/**
 * Drill-down endpoint for the Accountability tab. Lists ALL pitstops under one
 * goal — including ones outside the leader's selected date range, per the
 * "expand a Goal row to see the whole pitstop spine" requirement.
 *
 * Bucketing uses lib/accountability.ts so labels line up with the top-level
 * /api/team-accountability rows.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildRbacContext, can, scopeWhere } from "@/lib/rbac";
import { bucketize, type StatusBucket } from "@/lib/accountability";

type PitstopChild = {
  id: string;
  title: string;
  dueAt: string | null;
  rawStatus: string;
  status: StatusBucket | null;
  completedAt: string | null;
  daysLate: number;
  ownerId: string | null;
  ownerName: string | null;
  activityCount: number;
  checklistCount: number;
  doneActivities: number;
  doneChecklists: number;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await buildRbacContext(session, { req });
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(ctx, "team_metrics", "read"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: goalId } = await params;

  // Goal must be in the caller's scope; bail early otherwise.
  const goalScope = await scopeWhere(ctx, "goal", "read");
  if (goalScope === null) return Response.json({ error: "Forbidden" }, { status: 403 });
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, deletedAt: null, ...goalScope },
    select: { id: true, title: true, targetDate: true },
  });
  if (!goal) return Response.json({ error: "Not found" }, { status: 404 });

  const pitstops = await prisma.pitstop.findMany({
    where: { goalId, deletedAt: null },
    orderBy: [{ order: "asc" }, { startDate: "asc" }],
    select: {
      id: true, title: true, targetDate: true, status: true, completedAt: true,
      ownerId: true, owner: { select: { id: true, name: true } },
      _count: {
        select: {
          checklistItems: true,
          events: true,
        },
      },
    },
  });

  if (pitstops.length === 0) {
    return Response.json({ goal, pitstops: [] satisfies PitstopChild[] });
  }

  const pitstopIds = pitstops.map(p => p.id);

  // Per-pitstop done counts: checklists + activities in one pass each.
  const [doneChecklistRows, doneActivityRows] = await Promise.all([
    prisma.checklistItem.groupBy({
      by: ["pitstopId"],
      where: { pitstopId: { in: pitstopIds }, status: "Done" },
      _count: { _all: true },
    }),
    prisma.pitstopEventPitstop.groupBy({
      by: ["pitstopId"],
      where: {
        pitstopId: { in: pitstopIds },
        event: { deletedAt: null, status: "Done" },
      },
      _count: { _all: true },
    }),
  ]);
  const doneChecklistByPitstop = new Map(doneChecklistRows.map(r => [r.pitstopId, r._count._all]));
  const doneActivityByPitstop = new Map(doneActivityRows.map(r => [r.pitstopId, r._count._all]));

  const now = new Date();
  const rows: PitstopChild[] = pitstops.map(p => {
    let bucket: StatusBucket | null = null;
    let daysLate = 0;
    if (p.targetDate) {
      const b = bucketize({
        entity: "pitstop",
        rawStatus: p.status,
        dueAt: p.targetDate,
        completedAt: p.completedAt,
        now,
      });
      bucket = b.status;
      daysLate = b.daysLate;
    }
    return {
      id: p.id,
      title: p.title,
      dueAt: p.targetDate ? p.targetDate.toISOString() : null,
      rawStatus: p.status,
      status: bucket,
      completedAt: p.completedAt ? p.completedAt.toISOString() : null,
      daysLate,
      ownerId: p.ownerId,
      ownerName: p.owner?.name ?? null,
      activityCount: p._count.events,
      checklistCount: p._count.checklistItems,
      doneActivities: doneActivityByPitstop.get(p.id) ?? 0,
      doneChecklists: doneChecklistByPitstop.get(p.id) ?? 0,
    };
  });

  return Response.json({
    goal: { id: goal.id, title: goal.title, targetDate: goal.targetDate?.toISOString() ?? null },
    pitstops: rows,
  });
}
