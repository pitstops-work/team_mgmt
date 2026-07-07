/**
 * Drill-down endpoint for the Accountability tab. Returns the action points
 * raised under one activity, bucketed via lib/accountability.ts.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildRbacContext, can, scopeWhere } from "@/lib/rbac";
import { bucketize, type StatusBucket } from "@/lib/accountability";

type APRow = {
  id: string;
  title: string;
  dueAt: string;
  rawStatus: string;
  status: StatusBucket;
  completedAt: string | null;
  daysLate: number;
  ownerId: string;
  ownerName: string | null;
  priority: string;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await buildRbacContext(session, { req });
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(ctx, "team_metrics", "read"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { eventId } = await params;

  // Activity must be in the caller's scope (uses pitstop_event scope, not AP — the
  // event is the addressable parent here).
  const eventScope = await scopeWhere(ctx, "pitstop_event", "read");
  if (eventScope === null) return Response.json({ error: "Forbidden" }, { status: 403 });
  const event = await prisma.pitstopEvent.findFirst({
    where: { id: eventId, deletedAt: null, ...eventScope },
    select: { id: true, title: true },
  });
  if (!event) return Response.json({ error: "Not found" }, { status: 404 });

  const aps = await prisma.actionPoint.findMany({
    where: { pitstopEventId: eventId, status: { not: "cancelled" } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, title: true, dueDate: true, status: true, priority: true,
      completedAt: true,
      ownerId: true, owner: { select: { id: true, name: true } },
    },
  });

  const now = new Date();
  const rows: APRow[] = aps.map(ap => {
    const b = bucketize({
      entity: "followup",
      rawStatus: ap.status,
      dueAt: ap.dueDate,
      completedAt: ap.completedAt,
      now,
    });
    return {
      id: ap.id,
      title: ap.title,
      dueAt: ap.dueDate.toISOString(),
      rawStatus: ap.status,
      status: b.status,
      completedAt: ap.completedAt ? ap.completedAt.toISOString() : null,
      daysLate: b.daysLate,
      ownerId: ap.ownerId,
      ownerName: ap.owner?.name ?? null,
      priority: ap.priority,
    };
  });

  rows.sort((a, b) => {
    const aP = a.status === "open_past_due" ? 0 : 1;
    const bP = b.status === "open_past_due" ? 0 : 1;
    if (aP !== bP) return aP - bP;
    return a.dueAt.localeCompare(b.dueAt);
  });

  return Response.json({
    event: { id: event.id, title: event.title },
    actionPoints: rows,
  });
}
