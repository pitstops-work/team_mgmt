// Weekly cron — grants that should have closed and have not.
//
// Nothing ever ended: `lapse.ts` reported unspent money as a sizing signal and
// no grant reached a final state, so a grant that finished two years ago still
// counts as live in every portfolio total. This is the list that makes that
// visible, and it also commits the next grant year where one has rolled over.
//
// The year-boundary recompute lives here rather than in a separate cron on
// purpose: both need the same read of utilisation and reallocations, and running
// them apart would mean a window where the schedule has been restated but the
// closure view has not caught up.
//
// Idempotency: GrantClosureReminderLog, one row per (closure, threshold), the
// same shape as BudgetReportReminderLog.

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { overdueForClosure } from "@/lib/budget/closure";
import { recomputeGrantYear } from "@/lib/budget/tranches";
import { auditLog } from "@/lib/auditLog";

/** Escalation steps, in days past the grant end date. */
const THRESHOLDS = [30, 60, 120] as const;

function thresholdFor(daysOverdue: number): number | null {
  // The highest threshold passed, so a grant 200 days overdue fires the 120-day
  // notice once rather than all three in sequence.
  const passed = THRESHOLDS.filter((t) => daysOverdue >= t);
  return passed.length ? passed[passed.length - 1] : null;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const overdue = await overdueForClosure({ graceDays: 30 });
  const notified: { budgetId: string; threshold: number; daysOverdue: number }[] = [];

  for (const g of overdue) {
    if (g.daysOverdue === null) continue;
    const threshold = thresholdFor(g.daysOverdue);
    if (threshold === null) continue;

    // The closure row may not exist yet — a grant nobody has started winding up
    // is exactly the case this cron is for — so create it in `open` state to
    // hang the reminder log off. It is not `closing`: nobody has initiated it.
    const closure = await prisma.grantClosure.upsert({
      where: { budgetId: g.budgetId },
      create: { budgetId: g.budgetId, status: "open" },
      update: {},
      select: { id: true },
    });

    const key = `overdue_${threshold}d`;
    const existing = await prisma.grantClosureReminderLog.findUnique({
      where: { closureId_threshold: { closureId: closure.id, threshold: key } },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.grantClosureReminderLog.create({
      data: { closureId: closure.id, threshold: key },
    });
    auditLog({
      entityType: "GrantClosure",
      entityId: closure.id,
      userId: "system",
      action: "closure_overdue",
      field: `${g.name}${g.partnerName ? ` — ${g.partnerName}` : ""}`,
      oldValue: g.endedOn ? g.endedOn.toISOString().slice(0, 10) : null,
      newValue: `${g.daysOverdue} days overdue`,
    });
    notified.push({ budgetId: g.budgetId, threshold, daysOverdue: g.daysOverdue });
  }

  // Year rollover: commit the indicative schedule for any grant year that has
  // started. One failure must not stop the others, so each is caught.
  const rolled: { budgetId: string; grantYear: number; newTotal: string }[] = [];
  const rollFailures: { budgetId: string; grantYear: number; error: string }[] = [];

  const dueForRecompute = await prisma.grantTranche.findMany({
    where: {
      isCommitted: false,
      status: { not: "cancelled" },
      plannedOn: { lte: new Date() },
    },
    select: { budgetId: true, grantYear: true },
    distinct: ["budgetId", "grantYear"],
  });

  for (const t of dueForRecompute) {
    try {
      const result = await recomputeGrantYear("system", t.budgetId, t.grantYear);
      rolled.push({ budgetId: t.budgetId, grantYear: t.grantYear, newTotal: result.newTotal });
    } catch (err) {
      rollFailures.push({
        budgetId: t.budgetId,
        grantYear: t.grantYear,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({
    ok: true,
    overdue: overdue.length,
    notified: notified.length,
    thresholds: notified,
    yearsCommitted: rolled,
    // Surfaced rather than swallowed: a year that cannot be recomputed is a
    // grant whose schedule is now wrong, and silence is how that goes unnoticed.
    recomputeFailures: rollFailures,
  });
}
