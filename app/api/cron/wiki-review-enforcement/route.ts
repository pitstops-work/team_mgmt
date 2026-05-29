// Daily cron — quarterly review enforcement.
//
// For each non-retired page whose nextReviewDue has lapsed:
//   * Days 1–7 overdue:  daily reminder to the owner (idempotent ~22h window).
//   * Day 14 overdue:    one-shot escalation to every steward.
//   * Day 30+ overdue:   one-shot escalation + auto-flip status to under_review.
//   * Day 90+ overdue:   one-shot flip to "orphaned" + notify steward & curator.
//                        Maps to the 180-day-since-last-review threshold in
//                        module 8 of the practice-documentation training.
//
// Idempotency is enforced by querying WikiNotificationLog before each send.

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { dispatchWikiNotificationSafe } from "@/lib/notify/dispatch";
import { daysOverdue } from "@/lib/wiki/review";

const TWENTY_TWO_HOURS_MS = 22 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const overduePages = await prisma.wikiPage.findMany({
    where: {
      archivedAt: null,
      status: { not: "retired" },
      nextReviewDue: { lt: now },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      ownerId: true,
      status: true,
      nextReviewDue: true,
    },
  });

  if (overduePages.length === 0) {
    return Response.json({ ok: true, overdue: 0 });
  }

  const [stewards, curators] = await Promise.all([
    prisma.wikiStaff.findMany({
      where: { wikiRole: "steward" },
      select: { userId: true },
    }),
    prisma.wikiStaff.findMany({
      where: { wikiRole: "curator" },
      select: { userId: true },
    }),
  ]);
  const stewardIds = stewards.map((s) => s.userId);
  const curatorIds = curators.map((c) => c.userId);
  const stewardAndCuratorIds = Array.from(new Set([...stewardIds, ...curatorIds]));

  const counts = {
    overdue: overduePages.length,
    ownerReminders: 0,
    stewardEscalations14d: 0,
    stewardEscalations30d: 0,
    autoFlipped: 0,
    orphaned: 0,
  };

  for (const page of overduePages) {
    const overdue = daysOverdue(page.nextReviewDue, now);
    const link = `/wiki/${page.slug}`;

    // ── Owner daily reminders (days 1–7) ────────────────────────────
    if (overdue >= 1 && overdue <= 7 && page.ownerId) {
      const recent = await prisma.wikiNotificationLog.findFirst({
        where: {
          userId: page.ownerId,
          pageId: page.id,
          kind: "wiki_review_overdue",
          createdAt: { gte: new Date(now.getTime() - TWENTY_TWO_HOURS_MS) },
        },
        select: { id: true },
      });
      if (!recent) {
        await dispatchWikiNotificationSafe({
          userId: page.ownerId,
          kind: "wiki_review_overdue",
          pageId: page.id,
          title: `Review overdue: "${page.title}"`,
          body: `${overdue} day${overdue === 1 ? "" : "s"} past review date — read through and either edit or mark reviewed.`,
          link,
        });
        counts.ownerReminders++;
      }
    }

    // ── Steward 14-day escalation (one-shot per page) ───────────────
    if (overdue >= 14 && overdue < 30 && stewardIds.length > 0) {
      const already = await prisma.wikiNotificationLog.findFirst({
        where: { pageId: page.id, kind: "wiki_review_steward_14d" },
        select: { id: true },
      });
      if (!already) {
        for (const stewardId of stewardIds) {
          await dispatchWikiNotificationSafe({
            userId: stewardId,
            kind: "wiki_review_steward_14d",
            pageId: page.id,
            title: `Steward attention: "${page.title}"`,
            body: `Page is ${overdue} days overdue for review — owner hasn't acted.`,
            link,
          });
        }
        counts.stewardEscalations14d++;
      }
    }

    // ── 30-day auto-flip + steward escalation (one-shot per page) ───
    if (overdue >= 30 && overdue < 90) {
      const already = await prisma.wikiNotificationLog.findFirst({
        where: { pageId: page.id, kind: "wiki_review_steward_30d" },
        select: { id: true },
      });
      if (!already) {
        if (page.status !== "under_review") {
          await prisma.wikiPage.update({
            where: { id: page.id },
            data: { status: "under_review" },
          });
          counts.autoFlipped++;
        }
        for (const stewardId of stewardIds) {
          await dispatchWikiNotificationSafe({
            userId: stewardId,
            kind: "wiki_review_steward_30d",
            pageId: page.id,
            title: `Page flipped to under_review: "${page.title}"`,
            body: `30+ days overdue — auto-flipped. Consider reassigning the owner.`,
            link,
          });
        }
        counts.stewardEscalations30d++;
      }
    }

    // ── 90-day orphan flip (one-shot per page) ──────────────────────
    // 90 days past nextReviewDue ≈ 180 days since last review (default 90d
    // review window). Per module 8 we flip status to "orphaned" so readers
    // see the banner and the curator picks up the rehoming.
    if (overdue >= 90) {
      const already = await prisma.wikiNotificationLog.findFirst({
        where: { pageId: page.id, kind: "wiki_page_orphaned" },
        select: { id: true },
      });
      if (!already) {
        if (page.status !== "orphaned") {
          await prisma.wikiPage.update({
            where: { id: page.id },
            data: { status: "orphaned" },
          });
          counts.orphaned++;
        }
        for (const recipientId of stewardAndCuratorIds) {
          await dispatchWikiNotificationSafe({
            userId: recipientId,
            kind: "wiki_page_orphaned",
            pageId: page.id,
            title: `Page orphaned: "${page.title}"`,
            body: `${overdue} days past review (≈ 180d since last walked). Rehome to a new owner.`,
            link,
          });
        }
      }
    }
  }

  return Response.json({ ok: true, ...counts });
}
