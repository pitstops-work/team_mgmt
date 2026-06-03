import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { viewerForbidden } from "@/lib/roleGuard";
import { buildRbacContext, scopeWhere } from "@/lib/rbac";
import { auditLog } from "@/lib/auditLog";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await buildRbacContext(session, { req });
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const scope = await scopeWhere(ctx, "goal", "list");
  if (scope === null) return Response.json([], { status: 200 });
  const where = { deletedAt: null, ...scope };

  const goals = await prisma.goal.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true, image: true } },
      coOwners: { select: { userId: true } },
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

  const { title, description, status, startDate, targetDate, needsDomain, parameter, recurrence, needsSettlementId, needsClusterId, needsZoneId, needsCityId } = await req.json();
  if (!title) return Response.json({ error: "Title required" }, { status: 400 });
  if (!targetDate) return Response.json({ error: "Target date required" }, { status: 400 });

  const goal = await prisma.goal.create({
    data: {
      title, description, status: status ?? "Active", ownerId: session.user.id,
      startDate: startDate ? new Date(startDate) : new Date(),
      targetDate: new Date(targetDate),
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

  auditLog({
    entityType: "Goal", entityId: goal.id, userId: session.user.id,
    action: "created", newValue: title,
  });

  return Response.json(goal, { status: 201 });
}
