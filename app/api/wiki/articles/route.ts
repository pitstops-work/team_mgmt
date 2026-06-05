import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { auditLog } from "@/lib/auditLog";
import type { TipTapDoc } from "@/lib/wiki/tiptap";
import { EMPTY_DOC } from "@/lib/wiki/tiptap";
import type { NextRequest } from "next/server";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    title: string;
    kind: string;
    programDomain: string;
    contentJson?: TipTapDoc;
    naturalOrder?: number;
    slug?: string;
  };
  const title = body.title?.trim();
  if (!title || !body.kind || !body.programDomain) {
    return Response.json({ error: "title, kind, programDomain required" }, { status: 400 });
  }

  // Build a unique slug. If user-provided slug collides, append -2, -3, ...
  const baseSlug = body.slug?.trim() || `${body.programDomain.toLowerCase()}-${slugify(title)}`;
  let slug = baseSlug;
  for (let i = 2; await prisma.wikiArticle.findUnique({ where: { slug }, select: { id: true } }); i++) {
    slug = `${baseSlug}-${i}`;
  }

  const doc = body.contentJson ?? EMPTY_DOC;
  const article = await prisma.wikiArticle.create({
    data: {
      slug,
      title,
      kind: body.kind,
      programDomain: body.programDomain,
      contentJson: doc as unknown as object,
      naturalOrder: body.naturalOrder ?? 0,
      createdById: userId,
      updatedById: userId,
    },
  });
  await prisma.wikiArticleVersion.create({
    data: {
      articleId: article.id,
      versionNumber: 1,
      title,
      contentJson: doc as unknown as object,
      savedById: userId,
      summary: "Initial version",
    },
  });

  auditLog({
    entityType: "WikiArticle",
    entityId: article.id,
    userId,
    action: "created",
    newValue: slug,
  });

  return Response.json({ article: { id: article.id, slug, title } });
}
