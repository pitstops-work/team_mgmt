// Evening cron — runs at 12:30 UTC (6pm IST).
// Sends "Did you do X?" to attendees of activities that happened today.
// Skips activities already with a followup record.

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  // Activities scheduled today that are not cancelled/done
  const events = await prisma.pitstopEvent.findMany({
    where: {
      deletedAt: null,
      status: { in: ["Scheduled", "Flagged"] },
      scheduledAt: { gte: todayStart, lte: todayEnd },
    },
    select: {
      id: true,
      title: true,
      attendees: { select: { userId: true } },
      followups: { select: { userId: true } },
    },
  });

  let sent = 0;
  const sentFollowupUserIds = new Set<string>();

  for (const event of events) {
    const alreadySentUserIds = new Set(event.followups.map((f) => f.userId));
    const pendingUserIds = event.attendees
      .map((a) => a.userId)
      .filter((id) => !alreadySentUserIds.has(id));

    if (pendingUserIds.length === 0) continue;

    const link = `/activities?followup=${event.id}`;

    await prisma.$transaction([
      prisma.notification.createMany({
        data: pendingUserIds.map((userId) => ({
          userId,
          type: "ActivityFollowup" as const,
          title: `Did you complete "${event.title}"?`,
          body: "Tap Yes or No to update the activity",
          link,
        })),
      }),
      prisma.pitstopEventFollowup.createMany({
        data: pendingUserIds.map((userId) => ({
          eventId: event.id,
          userId,
          sentAt: now,
        })),
        skipDuplicates: true,
      }),
    ]);

    sendPushToUsers(pendingUserIds, {
      title: `Did you complete "${event.title}"?`,
      body: "Tap to respond",
      link,
    });

    sent += pendingUserIds.length;
    pendingUserIds.forEach((id) => sentFollowupUserIds.add(id));
  }

  return Response.json({ ok: true, sent });
}
