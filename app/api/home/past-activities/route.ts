import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getTeamIds } from "@/lib/rbac";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const PITSTOP_EVENT_SELECT = {
  id: true, title: true, type: true, scheduledAt: true, location: true, status: true,
  attendees: { select: { user: { select: { id: true, name: true } } } },
  pitstops: {
    select: {
      pitstop: {
        select: {
          id: true, title: true, ownerId: true,
          goal: {
            select: {
              id: true, title: true, needsDomain: true,
              needsCluster:    { select: { id: true, name: true } },
              needsSettlement: { select: { id: true, name: true } },
              needsZone:       { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    take: 1,
  },
} as const;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const url = request.nextUrl;
  const scope = url.searchParams.get("scope") === "team" ? "team" : "own";
  const beforeRaw = url.searchParams.get("before");
  if (!beforeRaw) return Response.json({ error: "before is required" }, { status: 400 });
  const before = new Date(beforeRaw);
  if (Number.isNaN(before.getTime())) return Response.json({ error: "before must be an ISO date" }, { status: 400 });
  const pageSizeRaw = Number(url.searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.isFinite(pageSizeRaw) ? Math.trunc(pageSizeRaw) : DEFAULT_PAGE_SIZE));

  let whereScope: Record<string, unknown>;
  if (scope === "own") {
    whereScope = {
      OR: [
        { attendees: { some: { userId } } },
        { pitstops: { some: { pitstop: { deletedAt: null, OR: [{ ownerId: userId }, { coOwners: { some: { userId } } }] } } } },
      ],
    };
  } else {
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { designation: true } });
    const designation = me?.designation ?? "Other";
    let teamScopeIds: string[] = [];
    if (designation === "ZL") {
      const team = await prisma.user.findMany({ where: { reportsToId: userId }, select: { id: true } });
      teamScopeIds = team.map(m => m.id);
    } else if (designation === "PM") {
      const zls = await prisma.user.findMany({ where: { reportsToId: userId }, select: { id: true } });
      const zlIds = zls.map(m => m.id);
      const rps = zlIds.length > 0
        ? await prisma.user.findMany({ where: { reportsToId: { in: zlIds } }, select: { id: true } })
        : [];
      teamScopeIds = [...zlIds, ...rps.map(m => m.id)];
    } else if (!["RP"].includes(designation)) {
      const allDescendants = await getTeamIds(userId);
      teamScopeIds = allDescendants.filter(id => id !== userId);
    }
    if (teamScopeIds.length === 0) return Response.json({ items: [] });
    whereScope = {
      pitstops: {
        some: {
          pitstop: {
            deletedAt: null,
            OR: [
              { ownerId: { in: teamScopeIds } },
              { coOwners: { some: { userId: { in: teamScopeIds } } } },
            ],
          },
        },
      },
    };
  }

  const items = await prisma.pitstopEvent.findMany({
    where: { deletedAt: null, status: "Done", scheduledAt: { lt: before }, ...whereScope },
    select: PITSTOP_EVENT_SELECT,
    orderBy: { scheduledAt: "desc" },
    take: pageSize,
  });

  return Response.json({ items });
}
