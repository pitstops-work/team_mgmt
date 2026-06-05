import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { auditLog } from "@/lib/auditLog";
import { PANELS, type Panel } from "@/lib/wiki/articles";
import type { NextRequest } from "next/server";

// List links FROM this article (i.e. what this question shows in its 3 panels).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const links = await prisma.wikiArticleLink.findMany({
    where: { fromArticleId: id },
    orderBy: [{ panel: "asc" }, { ordinal: "asc" }],
    include: {
      to: { select: { id: true, slug: true, title: true, kind: true, archivedAt: true } },
    },
  });
  return Response.json({
    links: links
      .filter((l) => !l.to.archivedAt)
      .map((l) => ({ id: l.id, panel: l.panel, ordinal: l.ordinal, to: l.to })),
  });
}

// Add a link FROM this article TO another article in a given panel.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json()) as { toArticleId: string; panel: Panel; ordinal?: number };
  if (!body.toArticleId || !PANELS.includes(body.panel)) {
    return Response.json({ error: "toArticleId and valid panel required" }, { status: 400 });
  }
  if (body.toArticleId === id) {
    return Response.json({ error: "Cannot link article to itself" }, { status: 400 });
  }

  const [from, to] = await Promise.all([
    prisma.wikiArticle.findUnique({ where: { id }, select: { id: true, archivedAt: true } }),
    prisma.wikiArticle.findUnique({ where: { id: body.toArticleId }, select: { id: true, archivedAt: true, slug: true } }),
  ]);
  if (!from || from.archivedAt) return Response.json({ error: "From article not found" }, { status: 404 });
  if (!to || to.archivedAt) return Response.json({ error: "Target article not found" }, { status: 404 });

  // Default ordinal: append to end.
  let ordinal = body.ordinal;
  if (ordinal === undefined || ordinal === null) {
    const max = await prisma.wikiArticleLink.aggregate({
      where: { fromArticleId: id, panel: body.panel },
      _max: { ordinal: true },
    });
    ordinal = (max._max.ordinal ?? -1) + 1;
  }

  try {
    const link = await prisma.wikiArticleLink.create({
      data: { fromArticleId: id, toArticleId: to.id, panel: body.panel, ordinal },
    });
    auditLog({
      entityType: "WikiArticle",
      entityId: id,
      userId,
      action: "link_added",
      field: body.panel,
      newValue: to.slug,
    });
    return Response.json({ link });
  } catch {
    return Response.json({ error: "Link already exists" }, { status: 409 });
  }
}
