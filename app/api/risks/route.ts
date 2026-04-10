import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const goalId = searchParams.get("goalId");

  const risks = await prisma.risk.findMany({
    where: { deletedAt: null, ...(goalId ? { goalId } : {}) },
    include: { createdBy: { select: { id: true, name: true, image: true } } },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(risks);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { title, description, likelihood, impact, mitigation, goalId, pitstopId } = await req.json();
  if (!title?.trim()) return Response.json({ error: "title required" }, { status: 400 });

  const risk = await prisma.risk.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      likelihood: likelihood ?? "Medium",
      impact: impact ?? "Medium",
      mitigation: mitigation?.trim() || null,
      goalId: goalId || null,
      pitstopId: pitstopId || null,
      createdById: session.user.id,
    },
    include: { createdBy: { select: { id: true, name: true, image: true } } },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "Risk",
      entityId: risk.id,
      userId: session.user.id,
      action: "created",
      field: null,
      oldValue: null,
      newValue: risk.title,
    },
  });

  return Response.json(risk);
}
