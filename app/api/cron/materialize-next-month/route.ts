// Monthly cron — pre-fills recurring visits through the end of NEXT month so
// the Operations month-end planner opens pre-populated. Auto-clone-on-done
// still runs the steady-state rhythm; this only guarantees the planner isn't
// empty when someone plans ahead before completing the current cycle.
//
// Idempotent: only the latest instance of each recurring series is advanced,
// and creation stops once coverage reaches next month (bounded per series).

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { ensureRecurrenceThroughNextMonth } from "@/lib/recurringPitstop";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // All active recurring pitstops with a real start date.
  const pitstops = await prisma.pitstop.findMany({
    where: {
      deletedAt: null,
      recurrence: { not: "None" },
      startDate: { not: null },
      goal: { deletedAt: null, status: { not: "Complete" } },
    },
    select: { id: true, goalId: true, templateKey: true, title: true, recurrence: true, startDate: true },
  });

  // Group into series and keep only the latest instance of each — that's the
  // one we extend forward. Manually-created series (null templateKey) group by
  // title so they don't collide across distinct recurring pitstops on a goal.
  const latestBySeries = new Map<string, { id: string; startDate: Date }>();
  for (const p of pitstops) {
    if (!p.startDate) continue;
    const key = `${p.goalId}::${p.templateKey ?? "t:" + p.title}::${p.recurrence}`;
    const cur = latestBySeries.get(key);
    if (!cur || p.startDate > cur.startDate) latestBySeries.set(key, { id: p.id, startDate: p.startDate });
  }

  const now = new Date();
  let created = 0;
  for (const { id } of latestBySeries.values()) {
    created += await ensureRecurrenceThroughNextMonth(id, now);
  }

  return Response.json({ ok: true, series: latestBySeries.size, created });
}
