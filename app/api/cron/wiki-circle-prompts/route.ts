// Daily cron — turns completed circles + partner-review meetings into
// per-linked-page review prompts.
//
// For each event completed in the last 24h:
//   * For each linked page that has an owner:
//     - Create a WikiReviewCycle (type=post_circle | post_partner_review,
//       scheduledFor=now+7d) if one doesn't already exist for the (page,
//       event) pair.
//     - Dispatch a notification to the page owner.
//
// Idempotency is enforced by the @@unique([pageId, triggerCircleId]) and
// @@unique([pageId, triggerPartnerReviewMeetingId]) constraints — the
// existence check below is for the notification side so we don't re-spam
// owners if the cron runs more than once after the same event.

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { dispatchWikiNotificationSafe } from "@/lib/notify/dispatch";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - ONE_DAY_MS);
  const now = new Date();
  const due = new Date(now.getTime() + SEVEN_DAYS_MS);

  const [circles, meetings] = await Promise.all([
    prisma.wikiPracticeCircle.findMany({
      where: { completedAt: { gte: since } },
      select: {
        id: true,
        completedAt: true,
        linkedPages: {
          select: { id: true, slug: true, title: true, ownerId: true },
        },
      },
    }),
    prisma.wikiPartnerReviewMeeting.findMany({
      where: { completedAt: { gte: since } },
      select: {
        id: true,
        completedAt: true,
        partnerOrg: { select: { name: true } },
        linkedPages: {
          select: { id: true, slug: true, title: true, ownerId: true },
        },
      },
    }),
  ]);

  let cyclesCreated = 0;
  let notifSent = 0;

  for (const c of circles) {
    for (const page of c.linkedPages) {
      if (!page.ownerId) continue;
      const created = await ensureCycle({
        pageId: page.id,
        ownerId: page.ownerId,
        type: "post_circle",
        triggerCircleId: c.id,
        scheduledFor: due,
      });
      if (created) {
        cyclesCreated++;
        await dispatchWikiNotificationSafe({
          userId: page.ownerId,
          kind: "wiki_circle_prompt",
          pageId: page.id,
          title: `Practice circle: "${page.title}"`,
          body: `Discussed in a circle on ${fmtDate(c.completedAt!)} — review the page and either update or mark reviewed within 7 days.`,
          link: `/wiki/${page.slug}`,
        });
        notifSent++;
      }
    }
  }

  for (const m of meetings) {
    for (const page of m.linkedPages) {
      if (!page.ownerId) continue;
      const created = await ensureCycle({
        pageId: page.id,
        ownerId: page.ownerId,
        type: "post_partner_review",
        triggerPartnerReviewMeetingId: m.id,
        scheduledFor: due,
      });
      if (created) {
        cyclesCreated++;
        await dispatchWikiNotificationSafe({
          userId: page.ownerId,
          kind: "wiki_circle_prompt",
          pageId: page.id,
          title: `Partner review (${m.partnerOrg.name}): "${page.title}"`,
          body: `Discussed in the ${fmtDate(m.completedAt!)} partner review — review the page within 7 days.`,
          link: `/wiki/${page.slug}`,
        });
        notifSent++;
      }
    }
  }

  return Response.json({
    ok: true,
    circles: circles.length,
    meetings: meetings.length,
    cycles_created: cyclesCreated,
    notifications_sent: notifSent,
  });
}

async function ensureCycle(input: {
  pageId: string;
  ownerId: string;
  type: "post_circle" | "post_partner_review";
  triggerCircleId?: string;
  triggerPartnerReviewMeetingId?: string;
  scheduledFor: Date;
}): Promise<boolean> {
  try {
    await prisma.wikiReviewCycle.create({
      data: {
        pageId: input.pageId,
        ownerId: input.ownerId,
        type: input.type,
        scheduledFor: input.scheduledFor,
        triggerCircleId: input.triggerCircleId,
        triggerPartnerReviewMeetingId: input.triggerPartnerReviewMeetingId,
      },
    });
    return true;
  } catch {
    // Unique constraint hit — already created on a previous tick. Idempotent.
    return false;
  }
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
