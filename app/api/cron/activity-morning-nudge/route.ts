// Morning cron — runs at 3:30 UTC (9am IST).
// Re-asks attendees who didn't respond to yesterday's follow-up.
// If still no response after the nudge, flags the activity.

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const yesterdayStart = new Date(now);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setHours(23, 59, 59, 999);

  // Follow-ups sent yesterday with no response and no nudge yet
  const pendingFollowups = await prisma.pitstopEventFollowup.findMany({
    where: {
      response: null,
      nudgeSentAt: null,
      sentAt: { gte: yesterdayStart, lte: yesterdayEnd },
      event: { deletedAt: null, status: { in: ["Scheduled", "Flagged"] } },
    },
    select: {
      id: true,
      userId: true,
      event: { select: { id: true, title: true } },
    },
  });

  if (pendingFollowups.length === 0) return Response.json({ ok: true, nudged: 0, flagged: 0 });

  // Group by event
  const byEvent = new Map<string, { eventTitle: string; userIds: string[]; followupIds: string[] }>();
  for (const f of pendingFollowups) {
    const existing = byEvent.get(f.event.id);
    if (existing) {
      existing.userIds.push(f.userId);
      existing.followupIds.push(f.id);
    } else {
      byEvent.set(f.event.id, { eventTitle: f.event.title, userIds: [f.userId], followupIds: [f.id] });
    }
  }

  let nudged = 0;

  for (const [eventId, { eventTitle, userIds, followupIds }] of byEvent) {
    const link = `/activities?followup=${eventId}`;

    await prisma.$transaction([
      // Send nudge notifications
      prisma.notification.createMany({
        data: userIds.map((userId) => ({
          userId,
          type: "ActivityMorningNudge" as const,
          title: `Still waiting — did you complete "${eventTitle}"?`,
          body: "No response yet. Tap to update.",
          link,
        })),
      }),
      // Record nudge time
      ...followupIds.map((id) =>
        prisma.pitstopEventFollowup.update({ where: { id }, data: { nudgeSentAt: now } })
      ),
    ]);

    sendPushToUsers(userIds, {
      title: `Still waiting — did you complete "${eventTitle}"?`,
      body: "No response yet. Tap to update.",
      link,
    });

    nudged += userIds.length;
  }

  // Flag events where ALL attendees have follow-ups but none responded
  // (check after today's nudge cycle — flag if nudge was sent >2h ago with no response)
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const stillNoResponse = await prisma.pitstopEventFollowup.groupBy({
    by: ["eventId"],
    where: {
      response: null,
      nudgeSentAt: { lt: twoHoursAgo },
      event: { deletedAt: null, status: "Scheduled" },
    },
  });

  let flagged = 0;
  for (const { eventId } of stillNoResponse) {
    await prisma.pitstopEvent.update({
      where: { id: eventId },
      data: { status: "Flagged" },
    });
    flagged++;
  }

  return Response.json({ ok: true, nudged, flagged });
}
