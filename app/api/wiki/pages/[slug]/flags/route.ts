import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { dispatchWikiNotificationSafe } from "@/lib/notify/dispatch";
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
    select: { id: true },
  });
  if (!page) return Response.json({ error: "Not found" }, { status: 404 });

  const flags = await prisma.wikiFlag.findMany({
    where: { pageId: page.id },
    orderBy: { createdAt: "asc" },
    include: { flagger: { select: { id: true, name: true, image: true } } },
  });

  return Response.json({ flags });
}

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

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return Response.json({ error: "reason required" }, { status: 400 });

  const sectionAnchor = typeof body.sectionAnchor === "string" && body.sectionAnchor.trim()
    ? body.sectionAnchor.trim()
    : null;

  const flag = await prisma.wikiFlag.create({
    data: {
      pageId: page.id,
      flaggerId: userId,
      sectionAnchor,
      reason,
      status: "open",
    },
    include: { flagger: { select: { id: true, name: true, image: true } } },
  });

  // Notify the page owner — but not if they flagged their own page.
  if (page.ownerId && page.ownerId !== userId) {
    await dispatchWikiNotificationSafe({
      userId: page.ownerId,
      kind: "wiki_flag_created",
      pageId: page.id,
      title: `Flag on "${page.title}"`,
      body: reason.length > 140 ? reason.slice(0, 137) + "…" : reason,
      link: `/wiki/${page.slug}`,
    });
  }

  return Response.json({ flag }, { status: 201 });
}
