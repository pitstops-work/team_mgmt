import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { auditLog } from "@/lib/auditLog";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;

  const source = await prisma.pitstop.findUnique({
    where: { id: pitstopId, deletedAt: null },
    include: {
      checklistItems: { orderBy: { order: "asc" } },
    },
  });

  if (!source) return Response.json({ error: "Not found" }, { status: 404 });

  const sibling = await prisma.pitstop.findFirst({
    where: { goalId: source.goalId, deletedAt: null },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const clone = await prisma.pitstop.create({
    data: {
      title: `${source.title} (Copy)`,
      type: source.type,
      customType: source.customType,
      notes: source.notes,
      status: "Upcoming",
      recurrence: source.recurrence,
      goalId: source.goalId,
      ownerId: source.ownerId,
      ownerInherited: source.ownerInherited,
      startDate: source.startDate,
      targetDate: source.targetDate,
      order: (sibling?.order ?? 0) + 1,
      checklistItems: {
        create: source.checklistItems.map((c) => ({
          text: c.text,
          checked: false,
          order: c.order,
        })),
      },
    },
    include: {
      attachments: true,
      threads: { select: { id: true, name: true, _count: { select: { messages: true } } } },
      checklistItems: { select: { id: true, text: true, checked: true }, orderBy: { order: "asc" } },
      owner: { select: { id: true, name: true, image: true } },
    },
  });

  auditLog({
    entityType: "Pitstop", entityId: clone.id, userId: session.user.id,
    action: "created", newValue: `${clone.title} (cloned from ${pitstopId})`,
  });

  return Response.json(clone, { status: 201 });
}
