import prisma from "@/lib/prisma";
import { snapToWeekday } from "@/lib/scheduleActivities";

/**
 * When a pitstop transitions to Done, clone the next occurrence if recurrence is
 * set. Caller passes the pitstop's prior status so a second call (e.g. an idem-
 * potent re-PATCH) doesn't clone twice. Also extends the parent goal's
 * targetDate to track the latest pitstop.
 */
export async function cloneRecurringPitstopOnDone(
  pitstopId: string,
  previousStatus: string,
): Promise<void> {
  if (previousStatus === "Done") return;

  const existing = await prisma.pitstop.findUnique({
    where: { id: pitstopId },
    select: {
      recurrence: true, startDate: true, targetDate: true, goalId: true,
      title: true, type: true, customType: true, notes: true,
      ownerId: true, ownerInherited: true,
      templateSlug: true, templateKey: true,
    },
  });
  if (!existing || existing.recurrence === "None") return;

  const DAYS: Record<string, number> = { Weekly: 7, Monthly: 30, Quarterly: 91 };
  const shift = DAYS[existing.recurrence] ?? 0;
  if (shift === 0 || !existing.startDate || !existing.targetDate) return;

  const rawNewStart  = new Date(existing.startDate);  rawNewStart.setDate(rawNewStart.getDate() + shift);
  const rawNewTarget = new Date(existing.targetDate); rawNewTarget.setDate(rawNewTarget.getDate() + shift);
  const newStart  = snapToWeekday(rawNewStart);
  const newTarget = snapToWeekday(rawNewTarget);

  const sibling = await prisma.pitstop.findFirst({
    where: { goalId: existing.goalId, deletedAt: null },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const clone = await prisma.pitstop.create({
    data: {
      title: existing.title,
      type: existing.type,
      customType: existing.customType,
      notes: existing.notes,
      ownerId: existing.ownerId,
      ownerInherited: existing.ownerInherited,
      goalId: existing.goalId,
      templateSlug: existing.templateSlug,
      templateKey: existing.templateKey,
      status: "Upcoming",
      recurrence: existing.recurrence,
      startDate: newStart,
      targetDate: newTarget,
      order: (sibling?.order ?? 0) + 1,
    },
  });

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
        key: item.key,
        templateSlug: item.templateSlug,
        completionType: item.completionType,
      })),
    });
  }

  const parentGoal = await prisma.goal.findUnique({
    where: { id: existing.goalId },
    select: { targetDate: true },
  });
  if (parentGoal && (!parentGoal.targetDate || newTarget > parentGoal.targetDate)) {
    await prisma.goal.update({
      where: { id: existing.goalId },
      data: { targetDate: newTarget },
    });
  }
}
