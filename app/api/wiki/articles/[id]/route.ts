import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { auditLog } from "@/lib/auditLog";
import { getArticleById } from "@/lib/wiki/articles";
import type { TipTapDoc } from "@/lib/wiki/tiptap";
import type { NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const article = await getArticleById(id);
  if (!article) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ article });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json()) as { title?: string; contentJson?: TipTapDoc; summary?: string };
  if (!body.contentJson) {
    return Response.json({ error: "contentJson is required" }, { status: 400 });
  }

  const existing = await prisma.wikiArticle.findUnique({
    where: { id },
    include: { _count: { select: { versions: true } } },
  });
  if (!existing || existing.archivedAt) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const newTitle = body.title?.trim() || existing.title;
  const nextVersion = existing._count.versions + 1;

  const [, version] = await prisma.$transaction([
    prisma.wikiArticle.update({
      where: { id: existing.id },
      data: {
        title: newTitle,
        contentJson: body.contentJson as unknown as object,
        updatedById: userId,
      },
    }),
    prisma.wikiArticleVersion.create({
      data: {
        articleId: existing.id,
        versionNumber: nextVersion,
        title: newTitle,
        contentJson: body.contentJson as unknown as object,
        savedById: userId,
        summary: body.summary?.trim() || null,
      },
    }),
  ]);

  auditLog({
    entityType: "WikiArticle",
    entityId: existing.id,
    userId,
    action: "updated",
    newValue: `v${version.versionNumber}`,
  });

  return Response.json({ ok: true, versionNumber: version.versionNumber });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.wikiArticle.findUnique({ where: { id }, select: { id: true, archivedAt: true, slug: true } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
  if (existing.archivedAt) return Response.json({ error: "Already archived" }, { status: 409 });

  await prisma.wikiArticle.update({
    where: { id: existing.id },
    data: { archivedAt: new Date(), archivedById: userId },
  });

  auditLog({
    entityType: "WikiArticle",
    entityId: existing.id,
    userId,
    action: "archived",
    oldValue: existing.slug,
  });

  return Response.json({ ok: true });
}
