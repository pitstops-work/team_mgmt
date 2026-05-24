import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
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

  const comments = await prisma.wikiComment.findMany({
    where: { pageId: page.id },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, name: true, image: true } },
      resolvedBy: { select: { id: true, name: true } },
    },
  });

  return Response.json({ comments });
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
    select: { id: true, canonicalLang: true },
  });
  if (!page) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return Response.json({ error: "body required" }, { status: 400 });

  const sectionAnchor = typeof body.sectionAnchor === "string" && body.sectionAnchor.trim()
    ? body.sectionAnchor.trim()
    : null;

  // Default comment language to user's preferred language
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferredLang: true },
  });
  const language =
    (typeof body.language === "string" && body.language.trim()) ||
    me?.preferredLang ||
    page.canonicalLang ||
    "en";

  const comment = await prisma.wikiComment.create({
    data: {
      pageId: page.id,
      authorId: userId,
      sectionAnchor,
      body: text,
      language,
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
      resolvedBy: { select: { id: true, name: true } },
    },
  });

  return Response.json({ comment }, { status: 201 });
}
