import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import { nextReviewFromNow } from "@/lib/wiki/review";
import type { NextRequest } from "next/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const page = await prisma.wikiPage.findUnique({
    where: { slug },
    select: { id: true, slug: true, ownerId: true, status: true },
  });
  if (!page) return Response.json({ error: "Not found" }, { status: 404 });
  if (page.status !== "draft") {
    return Response.json({ error: "Not a draft" }, { status: 400 });
  }

  const steward = await isWikiSteward(userId);
  const canPublish = page.ownerId === userId || steward;
  if (!canPublish) return Response.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const updated = await prisma.wikiPage.update({
    where: { id: page.id },
    data: {
      status: "published",
      lastReviewedAt: now,
      nextReviewDue: nextReviewFromNow(now),
    },
    select: { id: true, slug: true, status: true, lastReviewedAt: true, nextReviewDue: true },
  });

  return Response.json({ page: updated });
}
