/**
 * Drill-down endpoint for the Accountability tab. Returns the checklists and
 * activities under one pitstop, each bucketed via lib/accountability.ts so the
 * UI can render the same Done-on-time / Done-late / Open-past-due chips as the
 * top-level row.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildRbacContext, can, scopeWhere } from "@/lib/rbac";
import { bucketize, type StatusBucket } from "@/lib/accountability";

type ChildRow = {
  entity: "activity" | "checklist";
  id: string;
  title: string;
  dueAt: string | null;
  /** Activity-only: current scheduledAt (post-reschedule). */
  dueAt2: string | null;
  rawStatus: string;
  status: StatusBucket | null;
  completedAt: string | null;
  daysLate: number;
  userId: string | null;
  userName: string | null;
  actionPointCount: number;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await buildRbacContext(session, { req });
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(ctx, "team_metrics", "read"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { pitstopId } = await params;

  // Pitstop must be in the caller's scope.
  const pitstopScope = await scopeWhere(ctx, "pitstop", "read");
  if (pitstopScope === null) return Response.json({ error: "Forbidden" }, { status: 403 });
  const pitstop = await prisma.pitstop.findFirst({
    where: { id: pitstopId, deletedAt: null, ...pitstopScope },
    select: { id: true, title: true, targetDate: true, ownerId: true },
  });
  if (!pitstop) return Response.json({ error: "Not found" }, { status: 404 });

  const [checklistRows, activityLinks] = await Promise.all([
    prisma.checklistItem.findMany({
      where: { pitstopId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: {
        id: true, text: true, status: true, completedAt: true,
        completedById: true, assigneeId: true,
        completedBy: { select: { id: true, name: true } },
        assignee:    { select: { id: true, name: true } },
        activities:  { select: { originalScheduledAt: true }, orderBy: { originalScheduledAt: "asc" }, take: 1 },
      },
    }),
    prisma.pitstopEventPitstop.findMany({
      where: { pitstopId },
      select: {
        event: {
          select: {
            id: true, title: true, status: true,
            originalScheduledAt: true, scheduledAt: true, completedAt: true,
            completedById: true, createdById: true,
            completedBy: { select: { id: true, name: true } },
            createdBy:   { select: { id: true, name: true } },
            _count: { select: { actionPoints: true } },
          },
        },
      },
    }),
  ]);

  const now = new Date();

  const checklists: ChildRow[] = checklistRows.map(ci => {
    const dueAt = ci.activities[0]?.originalScheduledAt ?? pitstop.targetDate ?? null;
    let bucket: StatusBucket | null = null;
    let daysLate = 0;
    if (dueAt) {
      const b = bucketize({
        entity: "checklist",
        rawStatus: ci.status,
        dueAt,
        completedAt: ci.completedAt,
        now,
      });
      bucket = b.status;
      daysLate = b.daysLate;
    }
    const attributed = ci.completedBy ?? ci.assignee ?? null;
    return {
      entity: "checklist",
      id: ci.id,
      title: ci.text,
      dueAt: dueAt ? dueAt.toISOString() : null,
      dueAt2: null,
      rawStatus: ci.status,
      status: bucket,
      completedAt: ci.completedAt ? ci.completedAt.toISOString() : null,
      daysLate,
      userId: attributed?.id ?? null,
      userName: attributed?.name ?? null,
      actionPointCount: 0,
    };
  });

  const activities: ChildRow[] = activityLinks
    .map(l => l.event)
    .filter(e => e !== null)
    .map(e => {
      const b = bucketize({
        entity: "activity",
        rawStatus: e.status,
        dueAt: e.originalScheduledAt,
        completedAt: e.completedAt,
        now,
      });
      const attributed = e.completedBy ?? e.createdBy ?? null;
      return {
        entity: "activity" as const,
        id: e.id,
        title: e.title,
        dueAt: e.originalScheduledAt.toISOString(),
        dueAt2: e.scheduledAt.toISOString(),
        rawStatus: e.status,
        status: b.status,
        completedAt: e.completedAt ? e.completedAt.toISOString() : null,
        daysLate: b.daysLate,
        userId: attributed?.id ?? null,
        userName: attributed?.name ?? null,
        actionPointCount: e._count.actionPoints,
      };
    });

  // Sort: open past-due first (most overdue first), then by due date asc.
  const sortByUrgency = (a: ChildRow, b: ChildRow) => {
    const aP = a.status === "open_past_due" ? 0 : 1;
    const bP = b.status === "open_past_due" ? 0 : 1;
    if (aP !== bP) return aP - bP;
    return (a.dueAt ?? "").localeCompare(b.dueAt ?? "");
  };
  checklists.sort(sortByUrgency);
  activities.sort(sortByUrgency);

  return Response.json({
    pitstop: { id: pitstop.id, title: pitstop.title, targetDate: pitstop.targetDate?.toISOString() ?? null },
    checklists,
    activities,
  });
}
