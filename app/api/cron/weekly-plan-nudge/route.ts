// Monday cron — runs at 2:30 UTC (8am IST).
// Sends a "Plan your week" nudge to all users.

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({ select: { id: true } });
  if (users.length === 0) return Response.json({ ok: true, sent: 0 });

  const userIds = users.map((u) => u.id);

  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: "WeeklyPlanNudge" as const,
      title: "Plan your week",
      body: "Which pitstops are you working on this week? Take 5 minutes to plan.",
      link: "/planner",
    })),
  });

  sendPushToUsers(userIds, {
    title: "Plan your week",
    body: "Which pitstops are you working on this week?",
    link: "/planner",
  });

  return Response.json({ ok: true, sent: userIds.length });
}
