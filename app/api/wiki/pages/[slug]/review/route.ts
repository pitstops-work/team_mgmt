import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import { nextReviewFromNow } from "@/lib/wiki/review";
import type { NextRequest } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const page = await prisma.wikiPage.findUnique({
    where: { slug },
    select: { id: true, ownerId: true, status: true },
  });
  if (!page) return Response.json({ error: "Not found" }, { status: 404 });

  const steward = await isWikiSteward(userId);
  const canReview = page.ownerId === userId || steward;
  if (!canReview) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const note = typeof body?.completionNote === "string" ? body.completionNote.trim() : null;

  const now = new Date();
  const next = nextReviewFromNow(now);

  const updated = await prisma.$transaction(async (tx) => {
    const next_status = page.status === "under_review" ? "published" : page.status;
    const updatedPage = await tx.wikiPage.update({
      where: { id: page.id },
      data: {
        lastReviewedAt: now,
        nextReviewDue: next,
        status: next_status,
      },
      select: { id: true, slug: true, lastReviewedAt: true, nextReviewDue: true, status: true },
    });

    await tx.wikiReviewCycle.create({
      data: {
        pageId: page.id,
        ownerId: page.ownerId ?? userId,
        scheduledFor: now,
        completedAt: now,
        completionNote: note,
        type: "quarterly",
      },
    });

    return updatedPage;
  });

  return Response.json({ page: updated });
}
