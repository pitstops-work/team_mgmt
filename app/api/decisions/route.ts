import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const goalId = searchParams.get("goalId");

  const decisions = await prisma.decision.findMany({
    where: { deletedAt: null, ...(goalId ? { goalId } : {}) },
    include: { createdBy: { select: { id: true, name: true, image: true } } },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(decisions);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { title, description, rationale, goalId, status } = await req.json();
  if (!title?.trim()) return Response.json({ error: "title required" }, { status: 400 });

  const decision = await prisma.decision.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      rationale: rationale?.trim() || null,
      goalId: goalId || null,
      status: status ?? "Open",
      createdById: session.user.id,
    },
    include: { createdBy: { select: { id: true, name: true, image: true } } },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "Decision",
      entityId: decision.id,
      userId: session.user.id,
      action: "created",
      field: null,
      oldValue: null,
      newValue: decision.title,
    },
  });

  return Response.json(decision);
}
