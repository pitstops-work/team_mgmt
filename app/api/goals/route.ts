import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { goalCityFilter } from "@/lib/goalCityFilter";
import { viewerForbidden } from "@/lib/roleGuard";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const isSuperAdmin = (session as { user?: { role?: string } } | null)?.user?.role === "super-admin";
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { cityId: true, designation: true } });
  const designation = me?.designation ?? "Other";

  let teamIds: string[] = [session.user.id];
  if (designation === "ZL") {
    const team = await prisma.user.findMany({ where: { reportsToId: session.user.id }, select: { id: true } });
    teamIds = [session.user.id, ...team.map(m => m.id)];
  } else if (designation === "PM") {
    const zls = await prisma.user.findMany({ where: { reportsToId: session.user.id }, select: { id: true } });
    const zlIds = zls.map(m => m.id);
    const rps = zlIds.length > 0
      ? await prisma.user.findMany({ where: { reportsToId: { in: zlIds } }, select: { id: true } })
      : [];
    teamIds = [session.user.id, ...zlIds, ...rps.map(m => m.id)];
  }
  const isScoped = designation === "RP" || designation === "ZL" || designation === "PM";
  const ownerFilter = isScoped ? { ownerId: { in: teamIds } } : {};
  const cityFilter = (isSuperAdmin || isScoped) ? {} : goalCityFilter(me?.cityId);

  const goals = await prisma.goal.findMany({
    where: { deletedAt: null, ...cityFilter, ...ownerFilter },
    include: {
      owner: { select: { id: true, name: true, image: true } },
      pitstops: { where: { deletedAt: null }, select: { id: true, status: true } },
      programs: { include: { program: { select: { id: true, title: true } } } },
      needsCity: { select: { id: true, name: true } },
      needsZone: { select: { id: true, name: true, city: { select: { id: true, name: true } } } },
      needsCluster: { select: { id: true, name: true, zone: { select: { id: true, name: true, city: { select: { id: true, name: true } } } } } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return Response.json(goals);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;

  const { title, description, status, targetDate, needsDomain, parameter, recurrence, needsSettlementId, needsClusterId, needsZoneId, needsCityId } = await req.json();
  if (!title) return Response.json({ error: "Title required" }, { status: 400 });
  if (!targetDate) return Response.json({ error: "Target date required" }, { status: 400 });

  const goal = await prisma.goal.create({
    data: {
      title, description, status: status ?? "Active", ownerId: session.user.id, targetDate: new Date(targetDate),
      ...(needsDomain && { needsDomain }),
      ...(parameter != null && { parameter: Number(parameter) }),
      ...(recurrence && recurrence !== "None" && { recurrence }),
      ...(needsSettlementId && { needsSettlementId }),
      ...(needsClusterId && { needsClusterId }),
      ...(needsZoneId && { needsZoneId }),
      ...(needsCityId && { needsCityId }),
    },
    include: {
      owner: { select: { id: true, name: true, image: true } },
      pitstops: { select: { id: true, status: true } },
    },
  });

  // Goal owner auto-follows their own goal
  await prisma.goalFollow.upsert({
    where: { userId_goalId: { userId: session.user.id, goalId: goal.id } },
    create: { userId: session.user.id, goalId: goal.id },
    update: {},
  });

  return Response.json(goal, { status: 201 });
}
