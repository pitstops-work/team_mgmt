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
  const forward = (dow - cur + 7) % 7;            // 1..6
  const backward = (cur - dow + 7) % 7;            // 1..6
  // Prefer forward unless backward is strictly closer.
  const shift = backward < forward ? -backward : forward;
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + shift);
  return d;
}

const DAYS: Record<string, number> = { Weekly: 7, Monthly: 30, Quarterly: 91 };

type RecurrenceSource = {
  recurrence: string;
  startDate: Date | null;
  targetDate: Date | null;
};

/**
 * Given a recurring pitstop's cadence + current window, compute the next
 * occurrence's start/target — cadence shift + same-weekday snapping, preserving
 * window length. Returns null when the pitstop isn't recurring or lacks dates.
 */
function computeNextWindow(src: RecurrenceSource): { newStart: Date; newTarget: Date } | null {
  if (src.recurrence === "None" || !src.startDate || !src.targetDate) return null;
  const shift = DAYS[src.recurrence] ?? 0;
  if (shift === 0) return null;

  const rawNewStart = new Date(src.startDate); rawNewStart.setDate(rawNewStart.getDate() + shift);
  const rawNewTarget = new Date(src.targetDate); rawNewTarget.setDate(rawNewTarget.getDate() + shift);

  // Snap to the SAME day-of-week as the parent so e.g. a creche visit that runs
  // on Thursdays stays on Thursdays rather than drifting via raw +30 arithmetic.
  // Falls back to snapToWeekday when the parent's startDate is itself a weekend.
  const parentDow = src.startDate.getUTCDay();
  const parentDowIsWeekday = parentDow >= 1 && parentDow <= 5;
  const newStart = parentDowIsWeekday ? snapToSameDow(rawNewStart, parentDow) : snapToWeekday(rawNewStart);
  // Preserve the window length: target shifts by the same number of days as start.
  const startShiftDays = Math.round((newStart.getTime() - rawNewStart.getTime()) / 86_400_000);
  rawNewTarget.setUTCDate(rawNewTarget.getUTCDate() + startShiftDays);
  const newTarget = parentDowIsWeekday ? rawNewTarget : snapToWeekday(rawNewTarget);
  return { newStart, newTarget };
}

type CloneSource = {
  id: string;
  goalId: string;
  title: string;
  type: import("@/app/generated/prisma/client").PitstopType;
  customType: string | null;
  notes: string | null;
  ownerId: string | null;
  ownerInherited: boolean;
  recurrence: import("@/app/generated/prisma/client").PitstopRecurrence;
  templateSlug: string | null;
  templateKey: string | null;
};

/**
 * Create the next recurring instance from `src` at the given window, cloning the
 * source's checklist items and extending the parent goal's targetDate. Shared by
 * the on-done clone and the month-end pre-fill so date math + checklist copy
 * stay identical.
 */
async function createRecurrenceInstance(
  src: CloneSource,
  newStart: Date,
  newTarget: Date,
): Promise<{ id: string; startDate: Date; targetDate: Date }> {
  const sibling = await prisma.pitstop.findFirst({
    where: { goalId: src.goalId, deletedAt: null },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const clone = await prisma.pitstop.create({
    data: {
      title: src.title,
      type: src.type,
      customType: src.customType,
      notes: src.notes,
      ownerId: src.ownerId,
      ownerInherited: src.ownerInherited,
      goalId: src.goalId,
      templateSlug: src.templateSlug,
      templateKey: src.templateKey,
      status: "Upcoming",
      recurrence: src.recurrence,
      startDate: newStart,
      targetDate: newTarget,
      order: (sibling?.order ?? 0) + 1,
    },
    select: { id: true, startDate: true, targetDate: true },
  });

  const items = await prisma.checklistItem.findMany({
    where: { pitstopId: src.id },
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
    where: { id: src.goalId },
    select: { targetDate: true },
  });
  if (parentGoal && (!parentGoal.targetDate || newTarget > parentGoal.targetDate)) {
    await prisma.goal.update({ where: { id: src.goalId }, data: { targetDate: newTarget } });
  }

  return { id: clone.id, startDate: clone.startDate!, targetDate: clone.targetDate! };
}

const CLONE_SELECT = {
  id: true, recurrence: true, startDate: true, targetDate: true, goalId: true,
  title: true, type: true, customType: true, notes: true,
  ownerId: true, ownerInherited: true, templateSlug: true, templateKey: true,
} as const;

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

  const existing = await prisma.pitstop.findUnique({ where: { id: pitstopId }, select: CLONE_SELECT });
  if (!existing || existing.recurrence === "None") return;

  const next = computeNextWindow(existing);
  if (!next) return;

  await createRecurrenceInstance(existing, next.newStart, next.newTarget);
}

/**
 * Pre-fill: ensure a recurring series has instances materialised through the end
 * of NEXT month, so the month-end planner opens pre-populated even before the
 * current instance is completed. Idempotent — computes the series' latest
 * instance and only creates forward from it, stopping once coverage reaches next
 * month (or a safety cap). Bounded to avoid runaway clone chains.
 *
 * Pass the LATEST pitstop in the series (max startDate for the goal+template
 * slot). Returns the number of instances created.
 */
export async function ensureRecurrenceThroughNextMonth(
  latestPitstopId: string,
  now: Date = new Date(),
): Promise<number> {
  const latest = await prisma.pitstop.findUnique({ where: { id: latestPitstopId }, select: CLONE_SELECT });
  if (!latest || latest.recurrence === "None" || !latest.startDate || !latest.targetDate) return 0;

  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);
  let curStart = latest.startDate;
  let curTarget = latest.targetDate;
  let created = 0;

  // Advance from the latest instance, materialising only the occurrences that
  // land WITHIN next month. Occurrences that fall in the past/current month
  // (stale series that never got completed) are stepped over, not created — the
  // existing overdue machinery already surfaces the un-done current instance.
  for (let i = 0; i < 6; i++) {
    const next = computeNextWindow({ recurrence: latest.recurrence, startDate: curStart, targetDate: curTarget });
    if (!next) break;
    curStart = next.newStart;
    curTarget = next.newTarget;
    if (curStart > endOfNextMonth) break;
    if (curStart < startOfNextMonth) continue; // still before next month — keep advancing

    // Day-level idempotency: skip if an instance for this series already sits on
    // this day (defends against re-runs + latest-detection races).
    const dayStart = new Date(curStart); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(curStart); dayEnd.setHours(23, 59, 59, 999);
    const exists = await prisma.pitstop.findFirst({
      where: {
        goalId: latest.goalId, deletedAt: null,
        templateKey: latest.templateKey, title: latest.title,
        startDate: { gte: dayStart, lte: dayEnd },
      },
      select: { id: true },
    });
    if (exists) continue;

    await createRecurrenceInstance(latest, curStart, curTarget);
    created++;
  }

  return created;
}
