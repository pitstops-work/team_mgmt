// Weekly cron: one digest per page owner summarising open flags,
// unresolved comments, and pages reaching their review window.
//
// Idempotent within a 24h window via WikiNotificationLog — if a digest of
// kind=wiki_weekly_digest was already logged for the user in the last 24h,
// we skip them.

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

  // Find every distinct owner who has at least one live page.
  const ownerRows = await prisma.wikiPage.findMany({
    where: {
      archivedAt: null,
      status: { not: "retired" },
      ownerId: { not: null },
    },
    select: { ownerId: true },
    distinct: ["ownerId"],
  });
  const ownerIds = ownerRows
    .map((r) => r.ownerId)
    .filter((id): id is string => !!id);

  if (ownerIds.length === 0) {
    return Response.json({ ok: true, owners: 0, dispatched: 0 });
  }

  // Skip owners who already got a digest in the past 24h.
  const cutoff = new Date(Date.now() - ONE_DAY_MS);
  const recentLogs = await prisma.wikiNotificationLog.findMany({
    where: {
      kind: "wiki_weekly_digest",
      createdAt: { gte: cutoff },
      userId: { in: ownerIds },
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  const recentlyNotified = new Set(recentLogs.map((r) => r.userId));
  const eligible = ownerIds.filter((id) => !recentlyNotified.has(id));

  let dispatched = 0;
  const now = new Date();
  const reviewSoonCutoff = new Date(now.getTime() + SEVEN_DAYS_MS);

  for (const ownerId of eligible) {
    const [openFlags, unresolvedComments, reviewDueSoon] = await Promise.all([
      prisma.wikiFlag.count({
        where: {
          status: { not: "resolved" },
          page: { ownerId, archivedAt: null, status: { not: "retired" } },
        },
      }),
      prisma.wikiComment.count({
        where: {
          resolvedAt: null,
          page: { ownerId, archivedAt: null, status: { not: "retired" } },
        },
      }),
      prisma.wikiPage.count({
        where: {
          ownerId,
          archivedAt: null,
          status: { not: "retired" },
          nextReviewDue: { lte: reviewSoonCutoff },
        },
      }),
    ]);

    // Nothing actionable — still send a quiet "no action needed" so the
    // rhythm itself stays visible. Skip only if the user owns no live pages
    // (already filtered above).
    const summary = formatDigestBody({ openFlags, unresolvedComments, reviewDueSoon });

    await dispatchWikiNotificationSafe({
      userId: ownerId,
      kind: "wiki_weekly_digest",
      title: "Your weekly wiki digest",
      body: summary,
      link: "/wiki",
    });
    dispatched++;
  }

  return Response.json({
    ok: true,
    owners: ownerIds.length,
    skipped_recent: recentlyNotified.size,
    dispatched,
  });
}

function formatDigestBody({
  openFlags,
  unresolvedComments,
  reviewDueSoon,
}: {
  openFlags: number;
  unresolvedComments: number;
  reviewDueSoon: number;
}): string {
  const parts: string[] = [];
  if (openFlags > 0) parts.push(`${openFlags} open flag${openFlags === 1 ? "" : "s"}`);
  if (unresolvedComments > 0)
    parts.push(`${unresolvedComments} unresolved comment${unresolvedComments === 1 ? "" : "s"}`);
  if (reviewDueSoon > 0)
    parts.push(`${reviewDueSoon} page${reviewDueSoon === 1 ? "" : "s"} due for review`);

  if (parts.length === 0) return "Nothing pending on your pages — nice.";
  return parts.join(" · ");
}
