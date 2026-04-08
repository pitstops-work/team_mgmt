// Daily cron — sends due-date reminders at 10d / 3d / 0d before target date.
// Called by Vercel Cron (or any HTTP scheduler) with Authorization: Bearer $CRON_SECRET

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
  today.setHours(0, 0, 0, 0);

  // All active pitstops with a target date and an owner
  const pitstops = await prisma.pitstop.findMany({
    where: {
      deletedAt: null,
      status: { not: "Done" },
      targetDate: { not: null },
      ownerId: { not: null },
      goal: { deletedAt: null },
    },
    select: {
      id: true,
      title: true,
      targetDate: true,
      ownerId: true,
      goal: { select: { id: true, title: true } },
      reminderLogs: { select: { type: true } },
    },
  });

  const THRESHOLDS = [
    { type: "10d", days: 10, label: "10 days" },
    { type: "3d",  days: 3,  label: "3 days"  },
    { type: "due", days: 0,  label: "today"    },
  ];

  let sent = 0;

  for (const p of pitstops) {
    if (!p.targetDate || !p.ownerId) continue;
    const target = new Date(p.targetDate);
    target.setHours(0, 0, 0, 0);
    const daysLeft = daysBetween(today, target);
    const alreadySent = new Set(p.reminderLogs.map((l) => l.type));

    for (const { type, days, label } of THRESHOLDS) {
      if (daysLeft !== days) continue;
      if (alreadySent.has(type)) continue;

      const link = `/goals/${p.goal.id}/pitstops/${p.id}`;
      const title = daysLeft === 0
        ? `"${p.title}" is due today`
        : `"${p.title}" is due in ${label}`;
      const body = `in ${p.goal.title}`;

      await prisma.$transaction([
        prisma.notification.create({
          data: { userId: p.ownerId!, type: "NewMessage", title, body, link },
        }),
        prisma.pitstopReminderLog.create({
          data: { pitstopId: p.id, type },
        }),
      ]);

      sendPushToUsers([p.ownerId!], { title, body, link });
      sent++;
    }
  }

  return Response.json({ ok: true, sent });
}
