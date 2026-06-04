import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canEditPage, isWikiSteward } from "@/lib/wiki/auth";
import {
  MANUAL_TYPE,
  isValidMaturity,
  isValidSectionNumber,
  type SectionNumber,
} from "@/lib/wiki/manual";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  const page = await prisma.wikiPage.findUnique({
    where: { slug },
    include: {
      owner: { select: { id: true, name: true, image: true } },
      lastEditor: { select: { id: true, name: true } },
      manualSections: {
        orderBy: { sectionNumber: "asc" },
        select: { sectionNumber: true, content: true, lastEditedAt: true },
      },
      boundariesFrom: {
        select: {
          id: true,
          kind: true,
          note: true,
          toPage: { select: { slug: true, title: true, maturity: true, type: true } },
        },
        orderBy: { kind: "asc" },
      },
      boundariesTo: {
        select: {
          id: true,
          kind: true,
          note: true,
          fromPage: { select: { slug: true, title: true, maturity: true, type: true } },
        },
        orderBy: { kind: "asc" },
      },
      practiceEntries: {
        where: { archivedAt: null },
        orderBy: { createdAt: "desc" },
        include: {
          observer: { select: { id: true, name: true, image: true } },
          partnerOrg: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!page || page.archivedAt || page.type !== MANUAL_TYPE) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ manual: page });
}

/**
 * PATCH /api/manual/[slug] — edit a module.
 *
 * Owner OR steward. Single endpoint covers both meta edits (title, lede,
 * maturity, sensitive) and section edits — the form posts the full payload
 * in one request so a save action atomically updates the whole module.
 *
 * Body (all fields optional, only present fields are written):
 *   {
 *     title?: string,
 *     lede?: string,            // canonicalContent
 *     maturity?: Maturity,
 *     isSensitive?: boolean,
 *     sensitiveNote?: string | null,
 *     sections?: [{ sectionNumber: 1..8, content: string }, ...]
 *   }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const page = await prisma.wikiPage.findUnique({
    where: { slug },
    select: { id: true, type: true, ownerId: true, archivedAt: true },
  });
  if (!page || page.archivedAt || page.type !== MANUAL_TYPE) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const steward = await isWikiSteward(userId);
  if (!canEditPage(page, session, steward)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    title,
    lede,
    maturity,
    isSensitive,
    sensitiveNote,
    sections,
  } = (payload ?? {}) as {
    title?: string;
    lede?: string;
    maturity?: string;
    isSensitive?: boolean;
    sensitiveNote?: string | null;
    sections?: { sectionNumber?: number; content?: string }[];
  };

  // Validate sections payload up front so we don't half-write.
  const sectionUpdates: { sectionNumber: SectionNumber; content: string }[] = [];
  if (Array.isArray(sections)) {
    for (const s of sections) {
      if (!isValidSectionNumber(s.sectionNumber ?? -1)) {
        return Response.json(
          { error: `Invalid sectionNumber: ${s.sectionNumber}` },
          { status: 400 },
        );
      }
      sectionUpdates.push({
        sectionNumber: s.sectionNumber as SectionNumber,
        content: typeof s.content === "string" ? s.content : "",
      });
    }
  }

  const pageData: Record<string, unknown> = {};
  if (typeof title === "string" && title.trim()) pageData.title = title.trim();
  if (typeof lede === "string") pageData.canonicalContent = lede;
  if (typeof maturity === "string") {
    if (!isValidMaturity(maturity)) {
      return Response.json({ error: "Invalid maturity" }, { status: 400 });
    }
    pageData.maturity = maturity;
  }
  if (typeof isSensitive === "boolean") {
    pageData.isSensitive = isSensitive;
    if (!isSensitive) pageData.sensitiveNote = null;
  }
  if (typeof sensitiveNote === "string" || sensitiveNote === null) {
    pageData.sensitiveNote = sensitiveNote;
  }

  const now = new Date();
  const touched = Object.keys(pageData).length > 0 || sectionUpdates.length > 0;
  if (touched) {
    pageData.lastEditedAt = now;
    pageData.lastEditedById = userId;
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(pageData).length > 0) {
      await tx.wikiPage.update({ where: { id: page.id }, data: pageData });
    }
    for (const s of sectionUpdates) {
      await tx.wikiManualSection.update({
        where: { pageId_sectionNumber: { pageId: page.id, sectionNumber: s.sectionNumber } },
        data: { content: s.content, lastEditedAt: now, lastEditedById: userId },
      });
    }
  });

  return Response.json({ ok: true });
}
