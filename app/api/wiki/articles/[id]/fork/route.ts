import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { auditLog } from "@/lib/auditLog";
import { PANELS, type Panel } from "@/lib/wiki/articles";
import type { NextRequest } from "next/server";

/**
 * Fork an article into a question-specific copy.
 *
 * Body: { fromQuestionArticleId, panel }
 *
 * 1. Duplicate the article (new slug = oldSlug + '-fork-<n>'), preserving
 *    contentJson + kind + programDomain + naturalOrder + title. Sets
 *    forkedFromId = original.id, createdBy/updatedBy = current user, fresh
 *    version 1 with summary "Forked from <oldSlug>".
 * 2. Find the link from fromQuestionArticleId → original via panel and
 *    repoint it to the new article (same ordinal).
 *
 * Other questions linked to the original are NOT touched — they keep
 * showing the original.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json()) as { fromQuestionArticleId: string; panel: Panel };
  if (!body.fromQuestionArticleId || !PANELS.includes(body.panel)) {
    return Response.json({ error: "fromQuestionArticleId + valid panel required" }, { status: 400 });
  }

  const original = await prisma.wikiArticle.findUnique({ where: { id } });
  if (!original || original.archivedAt) return Response.json({ error: "Article not found" }, { status: 404 });

  const link = await prisma.wikiArticleLink.findUnique({
    where: {
      fromArticleId_toArticleId_panel: {
        fromArticleId: body.fromQuestionArticleId,
        toArticleId: id,
        panel: body.panel,
      },
    },
  });
  if (!link) return Response.json({ error: "No link from that question via that panel" }, { status: 404 });

  // Pick a unique slug.
  const baseSlug = `${original.slug}-fork`;
  let slug = baseSlug;
  for (let i = 2; await prisma.wikiArticle.findUnique({ where: { slug }, select: { id: true } }); i++) {
    slug = `${baseSlug}-${i}`;
  }

  const fork = await prisma.wikiArticle.create({
    data: {
      slug,
      title: original.title,
      kind: original.kind,
      programDomain: original.programDomain,
      contentJson: original.contentJson as object,
      naturalOrder: original.naturalOrder,
      forkedFromId: original.id,
      createdById: userId,
      updatedById: userId,
    },
  });

  await prisma.$transaction([
    prisma.wikiArticleVersion.create({
      data: {
        articleId: fork.id,
        versionNumber: 1,
        title: fork.title,
        contentJson: fork.contentJson as object,
        savedById: userId,
        summary: `Forked from ${original.slug}`,
      },
    }),
    prisma.wikiArticleLink.update({
      where: { id: link.id },
      data: { toArticleId: fork.id },
    }),
  ]);

  auditLog({
    entityType: "WikiArticle",
    entityId: fork.id,
    userId,
    action: "forked",
    oldValue: original.slug,
    newValue: fork.slug,
  });

  return Response.json({ article: { id: fork.id, slug: fork.slug, title: fork.title } });
}
