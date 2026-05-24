import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import { templateFor, WIKI_PAGE_TYPES, type WikiPageType } from "@/lib/wiki/templates";
import { slugifyTitle } from "@/lib/wiki/slug";
import { nextReviewFromNow } from "@/lib/wiki/review";
import type { NextRequest } from "next/server";

const SUPPORTED_LANGS = ["en", "ta", "kn", "ml", "hi", "bn"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const tagType = searchParams.get("tagType");
  const tagValue = searchParams.get("tagValue");
  const q = searchParams.get("q")?.trim();

  // Cross-language search: when q is set, also search through translatedContent
  // JSON via raw SQL. We pre-resolve matching page IDs and use them as a filter
  // on the regular findMany so the rest of the query (orderBy, select, count
  // aggregates) keeps working unchanged.
  let restrictIds: string[] | null = null;
  if (q) {
    const pattern = `%${q}%`;
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "WikiPage"
      WHERE "archivedAt" IS NULL
        AND title ILIKE ${pattern}
        OR "canonicalContent" ILIKE ${pattern}
        OR "translatedContent"::text ILIKE ${pattern}
    `;
    restrictIds = rows.map((r) => r.id);
    if (restrictIds.length === 0) {
      return Response.json({ pages: [] });
    }
  }

  const pages = await prisma.wikiPage.findMany({
    where: {
      archivedAt: null,
      ...(type ? { type } : {}),
      ...(status ? { status } : { status: { not: "retired" } }),
      ...(restrictIds ? { id: { in: restrictIds } } : {}),
      ...(tagType && tagValue
        ? { tags: { some: { tagType, tagValue } } }
        : {}),
    },
    orderBy: { lastEditedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      type: true,
      canonicalLang: true,
      status: true,
      lastEditedAt: true,
      nextReviewDue: true,
      owner: { select: { id: true, name: true, image: true } },
      tags: { select: { tagType: true, tagValue: true } },
      _count: {
        select: {
          flags: { where: { status: { not: "resolved" } } },
          comments: { where: { resolvedAt: null } },
        },
      },
    },
    take: 200,
  });

  // Project to the same decorated shape the server page uses, so the client
  // search path doesn't have to re-derive flag/comment counts.
  const decorated = pages.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    type: p.type,
    canonicalLang: p.canonicalLang,
    status: p.status,
    lastEditedAt: p.lastEditedAt,
    nextReviewDue: p.nextReviewDue,
    owner: p.owner,
    tags: p.tags,
    openFlagCount: p._count.flags,
    unresolvedCommentCount: p._count.comments,
  }));

  return Response.json({ pages: decorated });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const steward = await isWikiSteward(userId);
  if (!steward) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const type = String(body.type ?? "") as WikiPageType;
  const canonicalLang = String(body.canonicalLang ?? "en");
  const ownerId = body.ownerId ? String(body.ownerId) : null;
  const tags: Array<{ tagType: string; tagValue: string }> = Array.isArray(body.tags)
    ? body.tags.filter((t: unknown): t is { tagType: string; tagValue: string } =>
        !!t && typeof t === "object" && typeof (t as { tagType?: unknown }).tagType === "string" && typeof (t as { tagValue?: unknown }).tagValue === "string")
    : [];

  if (!title) return Response.json({ error: "title required" }, { status: 400 });
  if (!WIKI_PAGE_TYPES.includes(type)) {
    return Response.json({ error: "type must be principle | playbook | runbook" }, { status: 400 });
  }
  if (!SUPPORTED_LANGS.includes(canonicalLang)) {
    return Response.json({ error: "unsupported canonicalLang" }, { status: 400 });
  }

  // Slug with collision suffix
  const base = slugifyTitle(title) || "page";
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const exists = await prisma.wikiPage.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) break;
    slug = `${base}-${i}`;
  }

  const content = templateFor(type);

  const page = await prisma.wikiPage.create({
    data: {
      slug,
      title,
      type,
      canonicalLang,
      canonicalContent: content,
      ownerId,
      ownerTermStart: ownerId ? new Date() : null,
      ownerTermEnd: ownerId
        ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 30 * 6) // 6 months
        : null,
      // Review clock starts as soon as there's an owner.
      nextReviewDue: ownerId ? nextReviewFromNow() : null,
      lastEditedById: userId,
      status: "draft",
      tags: {
        create: tags.map((t) => ({ tagType: t.tagType, tagValue: t.tagValue })),
      },
      versions: {
        create: {
          versionNumber: 1,
          contentSnapshot: content,
          language: canonicalLang,
          editedById: userId,
          changeNote: "Initial template",
        },
      },
    },
    select: { id: true, slug: true },
  });

  return Response.json({ page }, { status: 201 });
}
