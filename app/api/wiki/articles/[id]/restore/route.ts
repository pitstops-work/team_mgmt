import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { auditLog } from "@/lib/auditLog";
import type { NextRequest } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json()) as { versionNumber: number };
  if (!body.versionNumber || body.versionNumber < 1) {
    return Response.json({ error: "versionNumber required" }, { status: 400 });
  }

  const [article, source] = await Promise.all([
    prisma.wikiArticle.findUnique({
      where: { id },
      include: { _count: { select: { versions: true } } },
    }),
    prisma.wikiArticleVersion.findUnique({
      where: { articleId_versionNumber: { articleId: id, versionNumber: body.versionNumber } },
    }),
  ]);
  if (!article || article.archivedAt) return Response.json({ error: "Not found" }, { status: 404 });
  if (!source) return Response.json({ error: "Version not found" }, { status: 404 });

  const nextVersion = article._count.versions + 1;

  await prisma.$transaction([
    prisma.wikiArticle.update({
      where: { id: article.id },
      data: {
        title: source.title,
        contentJson: source.contentJson as object,
        updatedById: userId,
      },
    }),
    prisma.wikiArticleVersion.create({
      data: {
        articleId: article.id,
        versionNumber: nextVersion,
        title: source.title,
        contentJson: source.contentJson as object,
        savedById: userId,
        summary: `Restored from v${source.versionNumber}`,
      },
    }),
  ]);

  auditLog({
    entityType: "WikiArticle",
    entityId: article.id,
    userId,
    action: "restored",
    oldValue: `v${source.versionNumber}`,
    newValue: `v${nextVersion}`,
  });

  return Response.json({ ok: true, versionNumber: nextVersion });
}
