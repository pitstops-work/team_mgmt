import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canEditPage, isWikiSteward } from "@/lib/wiki/auth";
import { nextReviewFromNow } from "@/lib/wiki/review";
import type { NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const page = await prisma.wikiPage.findUnique({
    where: { slug },
    include: {
      owner: { select: { id: true, name: true, image: true } },
      lastEditor: { select: { id: true, name: true } },
      tags: { select: { tagType: true, tagValue: true } },
    },
  });
  if (!page || page.archivedAt) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ page });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const page = await prisma.wikiPage.findUnique({
    where: { slug },
    select: { id: true, ownerId: true, canonicalContent: true, canonicalLang: true, title: true, status: true },
  });
  if (!page) return Response.json({ error: "Not found" }, { status: 404 });

  const steward = await isWikiSteward(userId);
  if (!canEditPage(page, session, steward)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const newTitle = typeof body.title === "string" ? body.title.trim() : null;
  const newContent = typeof body.canonicalContent === "string" ? body.canonicalContent : null;
  const changeNote = typeof body.changeNote === "string" ? body.changeNote.trim() : null;

  if (newTitle === null && newContent === null) {
    return Response.json({ error: "no editable fields supplied" }, { status: 400 });
  }

  const contentChanged = newContent !== null && newContent !== page.canonicalContent;

  const now = new Date();

  // Run page update + optional version snapshot in a transaction. A content
  // edit also counts as a review per spec — pushes nextReviewDue forward and
  // clears under_review status if the page was sitting in escalation.
  const updated = await prisma.$transaction(async (tx) => {
    const page2 = await tx.wikiPage.update({
      where: { id: page.id },
      data: {
        ...(newTitle ? { title: newTitle } : {}),
        ...(newContent !== null ? { canonicalContent: newContent } : {}),
        lastEditedAt: now,
        lastEditedById: userId,
        ...(contentChanged
          ? {
              lastReviewedAt: now,
              nextReviewDue: nextReviewFromNow(now),
              // If the page was flipped to under_review by the enforcement
              // cron, an actual edit takes it back to published.
              status: page.status === "under_review" ? "published" : page.status,
            }
          : {}),
      },
      select: { id: true, slug: true, title: true, lastEditedAt: true },
    });

    if (contentChanged) {
      const latest = await tx.wikiPageVersion.findFirst({
        where: { pageId: page.id },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      await tx.wikiPageVersion.create({
        data: {
          pageId: page.id,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          contentSnapshot: newContent!,
          language: page.canonicalLang,
          editedById: userId,
          changeNote,
        },
      });

      // Editing the content also resolves any pending post-event review prompts.
      await tx.wikiReviewCycle.updateMany({
        where: {
          pageId: page.id,
          completedAt: null,
          type: { in: ["post_circle", "post_partner_review"] },
        },
        data: { completedAt: now, completionNote: changeNote },
      });
    }

    return page2;
  });

  return Response.json({ page: updated });
}
