import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";

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

  const existing = await prisma.pitstop.findUnique({
    where: { id: pitstopId },
    select: { recurrence: true, startDate: true, targetDate: true, status: true, goalId: true, order: true, priority: true, ownerId: true },
  });

  const pitstop = await prisma.pitstop.update({
    where: { id: pitstopId },
    data: {
      title: data.title,
      type: data.type,
      customType: data.type === "Custom" ? (data.customType?.trim() || null) : data.type !== undefined ? null : undefined,
      notes: data.notes,
      status: data.status,
      recurrence: data.recurrence,
      ownerId: data.ownerId !== undefined ? (data.ownerId || null) : undefined,
      ownerInherited: data.ownerId !== undefined ? false : undefined,
      priority: data.priority ?? undefined,
      estimatedHours: data.estimatedHours !== undefined ? (data.estimatedHours === null ? null : Number(data.estimatedHours)) : undefined,
      startDate: data.startDate !== undefined ? (data.startDate ? new Date(data.startDate) : null) : undefined,
      targetDate: data.targetDate !== undefined ? (data.targetDate ? new Date(data.targetDate) : null) : undefined,
      completedAt: completedAt instanceof Date ? completedAt : completedAt === null ? null : undefined,
    },
    include: {
      attachments: true,
      threads: { select: { id: true, name: true, _count: { select: { messages: true } } } },
      checklistItems: { select: { id: true, text: true, checked: true }, orderBy: { order: "asc" } },
    },
  });

  // Audit logging for changed fields
  if (existing) {
    const auditEntries: Array<{ entityType: string; entityId: string; userId: string; action: string; field: string; oldValue: string | null; newValue: string | null }> = [];
    const addAudit = (field: string, oldVal: string | null | undefined, newVal: string | null | undefined) => {
      if (newVal !== undefined && String(newVal ?? "") !== String(oldVal ?? "")) {
        auditEntries.push({
          entityType: "Pitstop",
          entityId: pitstopId,
          userId: session.user.id!,
          action: `${field}_change`,
          field,
          oldValue: oldVal ? String(oldVal) : null,
          newValue: newVal ? String(newVal) : null,
        });
      }
    };
    if (data.status !== undefined) addAudit("status", existing.status, data.status);
    if (data.priority !== undefined) addAudit("priority", existing.priority, data.priority);
    if (data.ownerId !== undefined) addAudit("ownerId", existing.ownerId, data.ownerId || null);
    if (data.targetDate !== undefined) addAudit("targetDate", existing.targetDate?.toISOString() ?? null, data.targetDate);
    if (data.startDate !== undefined) addAudit("startDate", existing.startDate?.toISOString() ?? null, data.startDate);
    if (auditEntries.length > 0) {
      await prisma.auditLog.createMany({ data: auditEntries });
    }
  }

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

  // Recurring pitstop — clone with next window when marked Done
  const recurrence = data.recurrence ?? existing?.recurrence ?? "None";
  if (data.status === "Done" && recurrence !== "None" && existing?.status !== "Done") {
    const DAYS: Record<string, number> = { Weekly: 7, Monthly: 30, Quarterly: 91 };
    const shift = DAYS[recurrence] ?? 0;
    if (shift > 0 && existing?.startDate && existing?.targetDate) {
      const newStart = new Date(existing.startDate);
      newStart.setDate(newStart.getDate() + shift);
      const newTarget = new Date(existing.targetDate);
      newTarget.setDate(newTarget.getDate() + shift);

      const sibling = await prisma.pitstop.findFirst({
        where: { goalId: existing.goalId, deletedAt: null },
        orderBy: { order: "desc" },
        select: { order: true },
      });

      const cloneData = await prisma.pitstop.findUnique({
        where: { id: pitstopId },
        select: { title: true, type: true, customType: true, notes: true, ownerId: true, ownerInherited: true, goalId: true },
      });

      if (cloneData) {
        const clone = await prisma.pitstop.create({
          data: {
            ...cloneData,
            status: "Upcoming",
            recurrence,
            startDate: newStart,
            targetDate: newTarget,
            order: (sibling?.order ?? 0) + 1,
          },
        });

        // Clone checklist items (unchecked)
        const items = await prisma.checklistItem.findMany({
          where: { pitstopId },
          orderBy: { order: "asc" },
        });
        if (items.length > 0) {
          await prisma.checklistItem.createMany({
            data: items.map((item) => ({
              pitstopId: clone.id,
              text: item.text,
              order: item.order,
              checked: false,
            })),
          });
        }
      }
    }
  }

  // Notify goal followers when pitstop status changes
  if (data.status && existing?.status && data.status !== existing.status) {
    const goal = await prisma.goal.findUnique({
      where: { id: pitstop.goalId },
      select: { title: true, followers: { select: { userId: true } } },
    });
    if (goal) {
      const notifications = goal.followers
        .filter((f) => f.userId !== session.user.id)
        .map((f) => ({
          userId: f.userId,
          type: "PitstopStatusChange" as const,
          title: `"${pitstop.title}" is now ${data.status}`,
          body: `in ${goal.title}`,
          link: `/goals/${pitstop.goalId}/pitstops/${pitstopId}`,
        }));
      if (notifications.length > 0) {
        await prisma.notification.createMany({ data: notifications });
        sendPushToUsers(notifications.map((n) => n.userId), {
          title: notifications[0].title,
          body: notifications[0].body!,
          link: notifications[0].link!,
        });
      }
    }
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
