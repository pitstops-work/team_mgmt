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
      notes: data.notes,
      status: data.status,
      startDate: data.startDate !== undefined ? (data.startDate ? new Date(data.startDate) : null) : undefined,
      targetDate: data.targetDate !== undefined ? (data.targetDate ? new Date(data.targetDate) : null) : undefined,
      completedAt: completedAt instanceof Date ? completedAt : completedAt === null ? null : undefined,
    },
    include: {
      attachments: true,
      threads: { select: { id: true, name: true, _count: { select: { messages: true } } } },
    },
  });

  return Response.json(pitstop);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  await prisma.pitstop.update({ where: { id: pitstopId }, data: { deletedAt: new Date() } });
  return Response.json({ ok: true });
}
