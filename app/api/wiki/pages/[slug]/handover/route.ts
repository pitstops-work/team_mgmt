import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import { dispatchWikiNotificationSafe } from "@/lib/notify/dispatch";
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
    select: { id: true, slug: true, title: true, ownerId: true },
  });
  if (!page) return Response.json({ error: "Not found" }, { status: 404 });

  // Owner or steward can propose. Stewards can hand over an orphaned page
  // even though there's no fromUser per se — we record them as the source.
  const steward = await isWikiSteward(userId);
  const canPropose = page.ownerId === userId || steward;
  if (!canPropose) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const toUserId = typeof body.toUserId === "string" ? body.toUserId : null;
  if (!toUserId) {
    return Response.json({ error: "toUserId required" }, { status: 400 });
  }
  if (toUserId === userId) {
    return Response.json({ error: "Cannot hand over to yourself" }, { status: 400 });
  }
  const proposed = await prisma.user.findUnique({
    where: { id: toUserId },
    select: { id: true, name: true, email: true },
  });
  if (!proposed) return Response.json({ error: "Proposed user not found" }, { status: 400 });

  const handoverNote =
    typeof body.handoverNote === "string" ? body.handoverNote.trim() || null : null;

  // Reject if a pending handover already exists on this page.
  const existing = await prisma.wikiOwnerHandover.findFirst({
    where: { pageId: page.id, status: "pending" },
    select: { id: true },
  });
  if (existing) {
    return Response.json(
      { error: "A handover for this page is already pending" },
      { status: 409 },
    );
  }

  const handover = await prisma.wikiOwnerHandover.create({
    data: {
      pageId: page.id,
      fromUserId: page.ownerId ?? userId,
      toUserId,
      handoverNote,
      status: "pending",
    },
    select: { id: true },
  });

  await dispatchWikiNotificationSafe({
    userId: toUserId,
    kind: "wiki_handover_proposed",
    pageId: page.id,
    title: `Owner handover proposed: "${page.title}"`,
    body:
      handoverNote ||
      `${session.user?.name ?? "Someone"} is proposing you take over ownership of this page.`,
    link: `/wiki/${page.slug}`,
  });

  return Response.json({ handover }, { status: 201 });
}
