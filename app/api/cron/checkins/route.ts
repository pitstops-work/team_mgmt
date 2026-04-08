// Daily cron — sends "Any blockers on X?" check-ins when a pitstop has gone
// stale: no update since start, OR last update was > half the pitstop's duration ago.
// Won't re-send until at least half-duration days have passed since last check-in.

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  // Active pitstops with both dates set and an owner
  const pitstops = await prisma.pitstop.findMany({
    where: {
      deletedAt: null,
      status: { not: "Done" },
      startDate: { not: null },
      targetDate: { not: null },
      ownerId: { not: null },
      goal: { deletedAt: null },
    },
    select: {
      id: true,
      title: true,
      startDate: true,
      targetDate: true,
      updatedAt: true,
      ownerId: true,
      goal: { select: { id: true, title: true } },
      checkinLog: { select: { lastSentAt: true } },
      threads: {
        where: { deletedAt: null },
        select: {
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      },
    },
  });

  let sent = 0;

  for (const p of pitstops) {
    if (!p.startDate || !p.targetDate || !p.ownerId) continue;

    const start = new Date(p.startDate);
    const end = new Date(p.targetDate);
    const durationDays = daysBetween(start, end);
    if (durationDays <= 0) continue;

    const halfDuration = Math.ceil(durationDays / 2);

    // Find last meaningful update: pitstop.updatedAt or latest message
    let lastUpdate = new Date(p.updatedAt);
    for (const thread of p.threads) {
      for (const msg of thread.messages) {
        if (new Date(msg.createdAt) > lastUpdate) lastUpdate = new Date(msg.createdAt);
      }
    }

    const daysSinceStart = daysBetween(start, today);
    const daysSinceUpdate = daysBetween(lastUpdate, today);

    // Condition: no update since start OR last update > half-duration ago
    const isStale =
      lastUpdate <= start ||
      (daysSinceUpdate > halfDuration && daysSinceStart >= halfDuration);

    if (!isStale) continue;

    // Don't re-send until at least halfDuration days since last check-in
    if (p.checkinLog) {
      const daysSinceCheckin = daysBetween(new Date(p.checkinLog.lastSentAt), today);
      if (daysSinceCheckin < halfDuration) continue;
    }

    const link = `/goals/${p.goal.id}/pitstops/${p.id}`;
    const title = `Any blockers on "${p.title}"?`;
    const body = `No update in ${daysSinceUpdate} day${daysSinceUpdate !== 1 ? "s" : ""} — in ${p.goal.title}`;

    await prisma.$transaction([
      prisma.notification.create({
        data: { userId: p.ownerId!, type: "NewMessage", title, body, link },
      }),
      prisma.pitstopCheckinLog.upsert({
        where: { pitstopId: p.id },
        create: { pitstopId: p.id, lastSentAt: today },
        update: { lastSentAt: today },
      }),
    ]);

    sendPushToUsers([p.ownerId!], { title, body, link });
    sent++;
  }

  return Response.json({ ok: true, sent });
}
