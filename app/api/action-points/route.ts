/**
 * ActionPoint list + batch-create.
 *
 *   GET    ?scope=mine|team        — defaults to "mine" (status=open ∧ owner=me)
 *          &bucket=overdue|today|week|done
 *          &pitstopId=…  &goalId=…
 *          &status=open|done|cancelled
 *
 *   POST   batch create. Body: { items: [{ pitstopEventId, title, dueDate, … }] }
 *          The RP raising the APs is set as both owner and creator. Goal + pitstop
 *          are looked up from the referenced PitstopEvent so callers don't have
 *          to know the hierarchy. See model docstring in schema.prisma.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { viewerForbidden } from "@/lib/roleGuard";
import { buildRbacContext, scopeWhere } from "@/lib/rbac";
import { auditLog } from "@/lib/auditLog";

const selectFull = {
  id: true,
  goalId: true,
  pitstopId: true,
  pitstopEventId: true,
  title: true,
  detail: true,
  partnerStaffLabel: true,
  ownerId: true,
  dueDate: true,
  priority: true,
  status: true,
  closureNote: true,
  closureProofUrl: true,
  completedAt: true,
  completedById: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  lastUpdatedById: true,
  owner:       { select: { id: true, name: true, image: true } },
  createdBy:   { select: { id: true, name: true, image: true } },
  completedBy: { select: { id: true, name: true, image: true } },
  pitstop:     { select: { id: true, title: true, goalId: true } },
  goal:        { select: { id: true, title: true } },
  pitstopEvent: { select: { id: true, title: true, scheduledAt: true } },
} as const;

// IST-aware day boundaries — same convention as Home today/overdue queries.
// Activities in this app are bucketed by IST calendar day; we mirror that here
// so an AP due "today" lines up with the activities the RP sees on Today.
function istDayBounds(now = new Date()): { dayStart: Date; dayEnd: Date } {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000); // shift to IST clock
  const y = ist.getUTCFullYear(), m = ist.getUTCMonth(), d = ist.getUTCDate();
  // Day boundaries in IST → convert back to UTC for the query
  const dayStart = new Date(Date.UTC(y, m, d, 0, 0, 0) - 5.5 * 60 * 60 * 1000);
  const dayEnd = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - 5.5 * 60 * 60 * 1000);
  return { dayStart, dayEnd };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await buildRbacContext(session, { req });
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const scope     = (url.searchParams.get("scope") ?? "mine") as "mine" | "team";
  const bucket    = url.searchParams.get("bucket"); // overdue|today|week|done|null
  const statusArg = url.searchParams.get("status"); // open|done|cancelled|null
  const pitstopId = url.searchParams.get("pitstopId");
  const goalId    = url.searchParams.get("goalId");

  // "mine" → just my own APs (ownerId=me). "team" → use RBAC team scope
  // (TEAM expands to reportsToId tree, which is what ZL/PM/Leader want).
  let where: Record<string, unknown> = {};
  if (scope === "team") {
    const rbacWhere = await scopeWhere(ctx, "action_point", "list");
    if (rbacWhere === null) return Response.json([], { status: 200 });
    where = { ...rbacWhere };
  } else {
    where = { ownerId: ctx.userId };
  }

  if (pitstopId) where.pitstopId = pitstopId;
  if (goalId)    where.goalId    = goalId;

  // Bucket filter: shapes status + dueDate range together so the four Home
  // panels (Overdue/Today/Week/Done) map to one query each.
  const { dayStart, dayEnd } = istDayBounds();
  if (bucket === "overdue") {
    where.status = "open";
    where.dueDate = { lt: dayStart };
  } else if (bucket === "today") {
    where.status = "open";
    where.dueDate = { gte: dayStart, lte: dayEnd };
  } else if (bucket === "week") {
    where.status = "open";
    const weekEnd = new Date(dayEnd.getTime() + 6 * 24 * 60 * 60 * 1000);
    where.dueDate = { gte: dayStart, lte: weekEnd };
  } else if (bucket === "done") {
    where.status = "done";
    const thirtyAgo = new Date(dayStart.getTime() - 30 * 24 * 60 * 60 * 1000);
    where.completedAt = { gte: thirtyAgo };
  } else if (statusArg) {
    where.status = statusArg;
  } else {
    where.status = "open";
  }

  const orderBy = bucket === "done"
    ? [{ completedAt: "desc" as const }]
    : [{ dueDate: "asc" as const }, { createdAt: "asc" as const }];

  const rows = await prisma.actionPoint.findMany({ where, orderBy, select: selectFull, take: 500 });
  return Response.json(rows);
}

type ApInput = {
  pitstopEventId: string;
  title: string;
  detail?: string | null;
  dueDate: string; // ISO
  priority?: "routine" | "urgent";
  partnerStaffLabel?: string | null;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;
  const actorId = session.user.id;

  const body = await req.json();
  // Accept either a single item or an array — close-out modal posts an array
  // even when there's one row, but we let other callers (e.g. quick-add on a
  // pitstop) post a single object too.
  const items: ApInput[] = Array.isArray(body) ? body : (body?.items ?? [body]);
  if (!Array.isArray(items) || items.length === 0) {
    return Response.json({ error: "No items provided" }, { status: 400 });
  }

  // Resolve goalId + pitstopId for every distinct pitstopEventId in one shot.
  // The first linked pitstop wins — APs nest under the activity, and an activity
  // sometimes has multiple pitstops; we anchor to the canonical first for the
  // hierarchy denormalization.
  const eventIds = Array.from(new Set(items.map((i) => i.pitstopEventId).filter(Boolean)));
  if (eventIds.length === 0) {
    return Response.json({ error: "pitstopEventId required" }, { status: 400 });
  }
  const events = await prisma.pitstopEvent.findMany({
    where: { id: { in: eventIds } },
    select: {
      id: true,
      pitstops: {
        select: { pitstop: { select: { id: true, goalId: true } } },
        take: 1,
      },
    },
  });
  const hierarchy = new Map<string, { pitstopId: string; goalId: string }>();
  for (const ev of events) {
    const p = ev.pitstops[0]?.pitstop;
    if (p) hierarchy.set(ev.id, { pitstopId: p.id, goalId: p.goalId });
  }

  // Validate first — if any row is bad, fail the whole batch (close-out flow
  // shouldn't half-create APs and leave the RP with an unclear state).
  const prepared: {
    pitstopEventId: string; pitstopId: string; goalId: string;
    title: string; detail: string | null; dueDate: Date;
    priority: string; partnerStaffLabel: string | null;
  }[] = [];
  for (const it of items) {
    if (!it.pitstopEventId || !it.title?.trim() || !it.dueDate) {
      return Response.json({ error: "Each item needs pitstopEventId, title, dueDate" }, { status: 400 });
    }
    const h = hierarchy.get(it.pitstopEventId);
    if (!h) return Response.json({ error: `Unknown pitstopEvent: ${it.pitstopEventId}` }, { status: 400 });
    const due = new Date(it.dueDate);
    if (Number.isNaN(due.getTime())) return Response.json({ error: "Invalid dueDate" }, { status: 400 });
    prepared.push({
      pitstopEventId: it.pitstopEventId,
      pitstopId: h.pitstopId,
      goalId:    h.goalId,
      title: it.title.trim(),
      detail: it.detail?.trim() || null,
      dueDate: due,
      priority: it.priority === "urgent" ? "urgent" : "routine",
      partnerStaffLabel: it.partnerStaffLabel?.trim() || null,
    });
  }

  // Sequential creates so we can capture ids for the audit log; the batch is
  // typically 1–5 rows so the cost is fine.
  const created = [];
  for (const p of prepared) {
    const row = await prisma.actionPoint.create({
      data: {
        ...p,
        ownerId: actorId,       // RP raising the AP owns it (locked: always self at creation)
        createdById: actorId,
        status: "open",
      },
      select: selectFull,
    });
    created.push(row);
    auditLog({
      entityType: "ActionPoint", entityId: row.id, userId: actorId,
      action: "created", newValue: row.title,
    });
  }

  return Response.json(created, { status: 201 });
}
