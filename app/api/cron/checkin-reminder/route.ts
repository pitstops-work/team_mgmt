// Wednesday cron — runs at 4:00 UTC (9:30am IST).
// Sends a check-in reminder for each InProgress pitstop the user owns.

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find all InProgress pitstops that have an owner
  const pitstops = await prisma.pitstop.findMany({
    where: {
      deletedAt: null,
      status: "InProgress",
      ownerId: { not: null },
      goal: { deletedAt: null },
    },
    select: {
      id: true,
      title: true,
      ownerId: true,
      goal: { select: { id: true, title: true } },
    },
  });

  if (pitstops.length === 0) return Response.json({ ok: true, sent: 0 });

  // Group by owner
  const byOwner = new Map<string, typeof pitstops>();
  for (const p of pitstops) {
    if (!p.ownerId) continue;
    if (!byOwner.has(p.ownerId)) byOwner.set(p.ownerId, []);
    byOwner.get(p.ownerId)!.push(p);
  }

  const notifs: { userId: string; type: "CheckinReminder"; title: string; body: string; link: string }[] = [];
  for (const [userId, userPitstops] of byOwner) {
    for (const p of userPitstops) {
      notifs.push({
        userId,
        type: "CheckinReminder",
        title: `Check in: ${p.title}`,
        body: `How is "${p.title}" going? Log a quick status update.`,
        link: `/goals/${p.goal.id}?checkin=${p.id}`,
      });
    }
  }

  await prisma.notification.createMany({ data: notifs });

  const uniqueUserIds = [...byOwner.keys()];
  sendPushToUsers(uniqueUserIds, {
    title: "Weekly check-in reminder",
    body: `You have ${pitstops.length} pitstop${pitstops.length === 1 ? "" : "s"} in progress. Log a quick update.`,
    link: "/home",
  });

  return Response.json({ ok: true, sent: notifs.length });
}
