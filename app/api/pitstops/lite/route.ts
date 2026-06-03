/**
 * Slim pitstop list for the AddActivityModal attendee/pitstop picker.
 * Returns only the fields the picker needs (id, title, owner, goal) scoped
 * to the caller's RBAC pitstop.list scope.
 *
 * Was previously eager-loaded at /activities page-render — for Leaders /
 * admins with thousands of pitstops in scope this was several MB of JSON
 * shipped on every page open even though the modal might never open.
 * Lazy-loading on first modal open eliminates that cost.
 *
 * Cached client-side after first fetch; never refetched unless the user
 * navigates away and back.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildRbacContext, scopeWhere } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await buildRbacContext(session, { req });
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const pitstopScope = await scopeWhere(ctx, "pitstop", "list");
  const pitstopOwnerFilter: Record<string, unknown> = pitstopScope ?? {};

  const pitstops = await prisma.pitstop.findMany({
    where: { deletedAt: null, goal: { deletedAt: null }, ...pitstopOwnerFilter },
    select: {
      id: true,
      title: true,
      owner: { select: { id: true, name: true, image: true } },
      goal: {
        select: {
          id: true, title: true,
          needsCluster: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ goal: { title: "asc" } }, { order: "asc" }],
    take: 2000,
  });

  return Response.json(pitstops);
}
