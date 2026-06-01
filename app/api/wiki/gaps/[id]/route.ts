import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiCurator } from "@/lib/wiki/auth";
import { isGapStatus, DRAFTING_WINDOW_DAYS } from "@/lib/wiki/gaps";
import { dispatchWikiNotificationSafe } from "@/lib/notify/dispatch";
import type { NextRequest } from "next/server";

/**
 * PATCH /api/wiki/gaps/[id] — triage transition.
 *
 * Allowed transitions (curator unless noted):
 *   open → assigned    body: { action: "assign", ownerId, draftingDeadline? }
 *   open → merged      body: { action: "merge", linkedPageId }
 *   open → declined    body: { action: "decline", declineReason }
 *   assigned → drafted body: { action: "draft" }  (owner only)
 *   assigned/drafted → published  body: { action: "publish", linkedPageId } (owner or curator)
 *
 * Curators may force-assign even on already-assigned rows (re-assignment).
 * Owners can transition their own gaps to drafted/published.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const gap = await prisma.wikiPracticeGap.findUnique({ where: { id } });
  if (!gap) return Response.json({ error: "Not found" }, { status: 404 });

  const curator = await isWikiCurator(userId);
  const isAssignedOwner = gap.assignedOwnerId === userId;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action : "";
  const now = new Date();

  switch (action) {
    case "assign": {
      if (!curator) return Response.json({ error: "Curator only" }, { status: 403 });
      const ownerId = typeof body.ownerId === "string" ? body.ownerId : "";
      if (!ownerId) return Response.json({ error: "ownerId required" }, { status: 400 });
      const ownerExists = await prisma.user.findUnique({
        where: { id: ownerId },
        select: { id: true },
      });
      if (!ownerExists) return Response.json({ error: "ownerId not found" }, { status: 400 });

      // Default drafting deadline: pick playbook window unless caller supplies one.
      const windowDays =
        typeof body.windowDays === "number" && body.windowDays > 0
          ? body.windowDays
          : DRAFTING_WINDOW_DAYS.playbook;
      const deadline =
        typeof body.draftingDeadline === "string" && body.draftingDeadline
          ? new Date(body.draftingDeadline)
          : new Date(now.getTime() + windowDays * DAY_MS);

      const updated = await prisma.wikiPracticeGap.update({
        where: { id },
        data: {
          status: "assigned",
          assignedOwnerId: ownerId,
          curatorTriagerId: userId,
          triagedAt: now,
          draftingDeadline: deadline,
        },
      });

      // Filer + owner both want to know. See module 5 of the training.
      const verticalShort = gap.vertical;
      const link = "/wiki/gaps";
      const deadlineText = deadline.toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
      });
      await Promise.all([
        dispatchWikiNotificationSafe({
          userId: gap.filerId,
          kind: "wiki_gap_assigned",
          title: `Your gap was picked up — ${verticalShort}`,
          body: `A curator routed your gap to an owner. Draft due ${deadlineText}.`,
          link,
        }),
        dispatchWikiNotificationSafe({
          userId: ownerId,
          kind: "wiki_gap_assigned",
          title: `Gap assigned to you — ${verticalShort}`,
          body: gap.oneLineNeed.slice(0, 200),
          link,
        }),
      ]);
      return Response.json({ gap: updated });
    }

    case "merge": {
      if (!curator) return Response.json({ error: "Curator only" }, { status: 403 });
      const linkedPageId = typeof body.linkedPageId === "string" ? body.linkedPageId : "";
      if (!linkedPageId) return Response.json({ error: "linkedPageId required" }, { status: 400 });
      const page = await prisma.wikiPage.findUnique({
        where: { id: linkedPageId },
        select: { id: true },
      });
      if (!page) return Response.json({ error: "linkedPageId not found" }, { status: 400 });

      const updated = await prisma.wikiPracticeGap.update({
        where: { id },
        data: {
          status: "merged",
          linkedPageId,
          curatorTriagerId: userId,
          triagedAt: now,
          resolvedAt: now,
        },
      });
      const mergedInto = await prisma.wikiPage.findUnique({
        where: { id: linkedPageId },
        select: { slug: true, title: true },
      });
      await dispatchWikiNotificationSafe({
        userId: gap.filerId,
        kind: "wiki_gap_resolved",
        pageId: linkedPageId,
        title: `Your gap was merged into an existing page`,
        body: mergedInto?.title
          ? `Merged into "${mergedInto.title}". File a flag if it still does not cover your case.`
          : "Merged into an existing page.",
        link: mergedInto?.slug ? `/wiki/${mergedInto.slug}` : "/wiki/gaps",
      });
      return Response.json({ gap: updated });
    }

    case "decline": {
      if (!curator) return Response.json({ error: "Curator only" }, { status: 403 });
      const declineReason =
        typeof body.declineReason === "string" ? body.declineReason.trim() : "";
      if (!declineReason || declineReason.length < 5) {
        return Response.json(
          { error: "declineReason required (≥5 chars)" },
          { status: 400 },
        );
      }
      const updated = await prisma.wikiPracticeGap.update({
        where: { id },
        data: {
          status: "declined",
          declineReason,
          curatorTriagerId: userId,
          triagedAt: now,
          resolvedAt: now,
        },
      });
      await dispatchWikiNotificationSafe({
        userId: gap.filerId,
        kind: "wiki_gap_resolved",
        title: `Your gap was declined`,
        body: declineReason,
        link: "/wiki/gaps",
      });
      return Response.json({ gap: updated });
    }

    case "draft": {
      if (!isAssignedOwner && !curator) {
        return Response.json({ error: "Assigned owner only" }, { status: 403 });
      }
      if (gap.status !== "assigned") {
        return Response.json({ error: "Gap is not in 'assigned' state" }, { status: 400 });
      }
      const updated = await prisma.wikiPracticeGap.update({
        where: { id },
        data: { status: "drafted" },
      });
      return Response.json({ gap: updated });
    }

    case "publish": {
      if (!isAssignedOwner && !curator) {
        return Response.json({ error: "Assigned owner only" }, { status: 403 });
      }
      const linkedPageId = typeof body.linkedPageId === "string" ? body.linkedPageId : "";
      if (!linkedPageId) return Response.json({ error: "linkedPageId required" }, { status: 400 });
      const page = await prisma.wikiPage.findUnique({
        where: { id: linkedPageId },
        select: { id: true },
      });
      if (!page) return Response.json({ error: "linkedPageId not found" }, { status: 400 });

      const updated = await prisma.wikiPracticeGap.update({
        where: { id },
        data: {
          status: "published",
          linkedPageId,
          resolvedAt: now,
        },
      });
      const newPage = await prisma.wikiPage.findUnique({
        where: { id: linkedPageId },
        select: { slug: true, title: true },
      });
      await dispatchWikiNotificationSafe({
        userId: gap.filerId,
        kind: "wiki_gap_published",
        pageId: linkedPageId,
        title: `The page from your gap is live`,
        body: newPage?.title
          ? `"${newPage.title}" is now published — take a look.`
          : "The page is published.",
        link: newPage?.slug ? `/wiki/${newPage.slug}` : "/wiki/gaps",
      });
      return Response.json({ gap: updated });
    }

    default:
      return Response.json({ error: "Unknown action" }, { status: 400 });
  }
}

// Soft-delete (archive). Filer (only while still open + unassigned) OR curator.
// Once a gap has been triaged or resolved, only the curator can archive — the
// filer-loop notifications have already gone out and a stray retraction would
// break the audit trail of "this gap was raised."
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const gap = await prisma.wikiPracticeGap.findUnique({
    where: { id },
    select: { id: true, filerId: true, status: true, archivedAt: true },
  });
  if (!gap) return Response.json({ error: "Not found" }, { status: 404 });
  if (gap.archivedAt) return Response.json({ error: "Already archived" }, { status: 409 });

  const curator = await isWikiCurator(userId);
  const filerCanArchive = gap.filerId === userId && gap.status === "open";
  if (!filerCanArchive && !curator) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.wikiPracticeGap.update({
    where: { id: gap.id },
    data: { archivedAt: new Date(), archivedById: userId },
  });
  return Response.json({ ok: true });
}
