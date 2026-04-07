import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const data = await req.json();

  // Validate targetDate against goal deadline
  if (data.targetDate) {
    const existing = await prisma.pitstop.findUnique({ where: { id: pitstopId }, select: { goal: { select: { targetDate: true } } } });
    if (existing?.goal?.targetDate && new Date(data.targetDate) > existing.goal.targetDate) {
      return Response.json({ error: "Pitstop target date cannot be after the goal deadline" }, { status: 400 });
    }
  }

  // Auto-set completedAt when status flips to Done
  const completedAt = data.status === "Done" ? (data.completedAt ?? new Date()) : data.status ? null : undefined;

  const pitstop = await prisma.pitstop.update({
    where: { id: pitstopId },
    data: {
      title: data.title,
      type: data.type,
      customType: data.type === "Custom" ? (data.customType?.trim() || null) : data.type !== undefined ? null : undefined,
      notes: data.notes,
      status: data.status,
      ownerId: data.ownerId !== undefined ? (data.ownerId || null) : undefined,
      ownerInherited: data.ownerId !== undefined ? false : undefined,
      startDate: data.startDate !== undefined ? (data.startDate ? new Date(data.startDate) : null) : undefined,
      targetDate: data.targetDate !== undefined ? (data.targetDate ? new Date(data.targetDate) : null) : undefined,
      completedAt: completedAt instanceof Date ? completedAt : completedAt === null ? null : undefined,
    },
    include: {
      attachments: true,
      threads: { select: { id: true, name: true, _count: { select: { messages: true } } } },
    },
  });

  // Save custom type for reuse
  if (data.type === "Custom" && data.customType?.trim()) {
    await prisma.customPitstopType.upsert({
      where: { name: data.customType.trim() },
      create: { name: data.customType.trim() },
      update: {},
    });
  }

  // New pitstop owner auto-follows the goal
  if (data.ownerId && pitstop.ownerId) {
    await prisma.goalFollow.upsert({
      where: { userId_goalId: { userId: pitstop.ownerId, goalId: pitstop.goalId } },
      create: { userId: pitstop.ownerId, goalId: pitstop.goalId },
      update: {},
    });
  }

  return Response.json(pitstop);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  await prisma.pitstop.update({ where: { id: pitstopId }, data: { deletedAt: new Date() } });
  return Response.json({ ok: true });
}
