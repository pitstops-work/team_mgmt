import prisma from "@/lib/prisma";
import { snapToWeekday } from "@/lib/scheduleActivities";

/**
 * Move `date` forward to the nearest occurrence of `dow` (0 = Sunday … 6 = Sat),
 * within ±3 days. Used by the recurring-clone path so the cloned pitstop lands
 * on the same weekday as its parent (e.g. "creche visit on Thursdays") instead
 * of drifting through the calendar by raw +30/+91/+7 day arithmetic.
 *
 * If `date` is already that DOW, returns it unchanged. Otherwise picks the
 * forward direction by default; if forward is >3 days, falls back to the
 * nearest-by-magnitude (could be backward by up to 3). Operates in UTC to match
 * how Pitstop dates are stored (snapToWeekday convention — see scheduleActivities.ts).
 */
function snapToSameDow(date: Date, dow: number): Date {
  const cur = date.getUTCDay();
  if (cur === dow) return date;
  let forward = (dow - cur + 7) % 7;            // 1..6
  let backward = (cur - dow + 7) % 7;            // 1..6
  // Prefer forward unless backward is strictly closer.
  const shift = backward < forward ? -backward : forward;
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + shift);
  return d;
}

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

  // Snap to the SAME day-of-week as the parent — so e.g. an Abdul creche visit
  // rescheduled Mon→Thu propagates as "Thursdays" to all future clones rather
  // than drifting via raw +30 day arithmetic. Falls back to snapToWeekday for
  // the rare case where parent's startDate is itself a weekend (shouldn't
  // happen but the data sometimes has it from older flows).
  const parentDow = existing.startDate.getUTCDay();
  const parentDowIsWeekday = parentDow >= 1 && parentDow <= 5;
  const newStart  = parentDowIsWeekday ? snapToSameDow(rawNewStart,  parentDow) : snapToWeekday(rawNewStart);
  // Preserve the window length: target shifts by the same number of days as start.
  const startShiftDays = Math.round((newStart.getTime() - rawNewStart.getTime()) / 86_400_000);
  rawNewTarget.setUTCDate(rawNewTarget.getUTCDate() + startShiftDays);
  const newTarget = parentDowIsWeekday ? rawNewTarget : snapToWeekday(rawNewTarget);

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
