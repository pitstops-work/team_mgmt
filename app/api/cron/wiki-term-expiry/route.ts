// Daily cron — owner term expiry rhythm.
//
// For each non-retired page with an owner + ownerTermEnd:
//   * Within 30d of expiry  → notify owner + every steward (one-shot per page)
//   * Past expiry, no pending or accepted handover, no renewal
//     → flip status to "orphaned", clear ownerId/term, notify stewards (one-shot)
//
// Idempotency is enforced by querying WikiNotificationLog before each
// kind-specific send.

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { dispatchWikiNotificationSafe } from "@/lib/notify/dispatch";

const DAY_MS = 24 * 60 * 60 * 1000;
const WARN_WINDOW_MS = 30 * DAY_MS;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const warnCutoff = new Date(now.getTime() + WARN_WINDOW_MS);

  const candidatePages = await prisma.wikiPage.findMany({
    where: {
      archivedAt: null,
      status: { not: "retired" },
      ownerId: { not: null },
      ownerTermEnd: { not: null, lte: warnCutoff },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      ownerId: true,
      ownerTermEnd: true,
      status: true,
    },
  });

  if (candidatePages.length === 0) {
    return Response.json({ ok: true, candidates: 0 });
  }

  const stewards = await prisma.wikiStaff.findMany({
    where: { wikiRole: "steward" },
    select: { userId: true },
  });
  const stewardIds = stewards.map((s) => s.userId);

  const counts = {
    candidates: candidatePages.length,
    expiringWarnings: 0,
    orphaned: 0,
  };

  for (const page of candidatePages) {
    if (!page.ownerTermEnd || !page.ownerId) continue;
    const link = `/wiki/${page.slug}`;
    const daysToEnd = Math.ceil(
      (new Date(page.ownerTermEnd).getTime() - now.getTime()) / DAY_MS,
    );

    // ── Warning window: 0–30 days until term end ──────────────────
    if (daysToEnd >= 0 && daysToEnd <= 30) {
      const already = await prisma.wikiNotificationLog.findFirst({
        where: { pageId: page.id, kind: "wiki_owner_term_expiring" },
        select: { id: true },
      });
      if (!already) {
        const recipients = [page.ownerId, ...stewardIds.filter((id) => id !== page.ownerId)];
        for (const rid of recipients) {
          await dispatchWikiNotificationSafe({
            userId: rid,
            kind: "wiki_owner_term_expiring",
            pageId: page.id,
            title: `Owner term ending: "${page.title}"`,
            body:
              rid === page.ownerId
                ? `Your 6-month term ends in ${daysToEnd} day${daysToEnd === 1 ? "" : "s"}. Renew or hand the page over.`
                : `Owner term ends in ${daysToEnd} day${daysToEnd === 1 ? "" : "s"} — make sure they renew or hand over.`,
            link,
          });
        }
        counts.expiringWarnings++;
      }
    }

    // ── Expired window: term ended, no handover or renewal ────────
    if (daysToEnd < 0) {
      const pendingHandover = await prisma.wikiOwnerHandover.findFirst({
        where: { pageId: page.id, status: "pending" },
        select: { id: true },
      });
      if (pendingHandover) continue; // owner is actively trying to hand over

      const already = await prisma.wikiNotificationLog.findFirst({
        where: { pageId: page.id, kind: "wiki_owner_term_expired" },
        select: { id: true },
      });
      if (already) continue; // already orphaned in a previous run

      await prisma.wikiPage.update({
        where: { id: page.id },
        data: { status: "orphaned", ownerId: null },
      });
      counts.orphaned++;

      for (const sid of stewardIds) {
        await dispatchWikiNotificationSafe({
          userId: sid,
          kind: "wiki_owner_term_expired",
          pageId: page.id,
          title: `Page orphaned: "${page.title}"`,
          body: `Owner term expired with no renewal or handover — needs reassignment.`,
          link,
        });
      }
    }
  }

  return Response.json({ ok: true, ...counts });
}
