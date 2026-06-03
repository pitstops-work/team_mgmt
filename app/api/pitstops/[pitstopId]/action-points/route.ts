/**
 * List action points for one pitstop. Powers the Follow-ups panel on the
 * pitstop detail page (grouped by activity, Open/Done filter).
 *
 *   GET ?status=open|done|cancelled  (default = open)
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildRbacContext, scopeWhere } from "@/lib/rbac";

const select = {
  id: true,
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
  owner:       { select: { id: true, name: true, image: true } },
  createdBy:   { select: { id: true, name: true, image: true } },
  completedBy: { select: { id: true, name: true, image: true } },
  pitstopEvent: { select: { id: true, title: true, scheduledAt: true, status: true } },
} as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await buildRbacContext(session);
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "open";

  // Layer the per-AP RBAC scope on top of the pitstopId filter. For most
  // members this collapses to the same set the pitstop detail page would have
  // shown anyway (since pitstop access is TEAM), but it keeps the route honest
  // if a member somehow knows a pitstopId outside their tree.
  const rbacWhere = await scopeWhere(ctx, "action_point", "list");
  if (rbacWhere === null) return Response.json([], { status: 200 });

  const rows = await prisma.actionPoint.findMany({
    where: { pitstopId, status, ...rbacWhere },
    orderBy: status === "done"
      ? [{ completedAt: "desc" }]
      : [{ dueDate: "asc" }, { createdAt: "asc" }],
    select,
    take: 500,
  });

  return Response.json(rows);
}
