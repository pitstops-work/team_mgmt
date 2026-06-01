import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward, requireSteward } from "@/lib/wiki/auth";
import { slugifyTitle } from "@/lib/wiki/slug";
import { nextReviewFromNow, nextOwnerTermEnd } from "@/lib/wiki/review";
import {
  MANUAL_TYPE,
  SECTION_NUMBERS,
  MATURITY_VALUES,
  isValidMaturity,
  type Maturity,
} from "@/lib/wiki/manual";

/**
 * POST /api/manual — create a new response module.
 *
 * Steward-only (matches /api/wiki/pages). Creates a WikiPage with type="manual"
 * plus 8 empty WikiManualSection rows so the reader / editor sees the full
 * skeleton immediately. Owner defaults to the current user; reassign via the
 * existing handover flow.
 *
 * Body:
 *   {
 *     title: string,
 *     slug?: string,           // auto from title if omitted
 *     maturity?: Maturity,     // defaults to "mostly_theory"
 *     isSensitive?: boolean,
 *     sensitiveNote?: string,
 *     lede?: string,           // canonicalContent — 1-2 sentence intro
 *     ownerId?: string,        // defaults to current user
 *   }
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const steward = await isWikiSteward(userId);
  const forbidden = requireSteward(steward);
  if (forbidden) return forbidden;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    title,
    slug: rawSlug,
    maturity,
    isSensitive,
    sensitiveNote,
    lede,
    ownerId,
  } = (payload ?? {}) as {
    title?: string;
    slug?: string;
    maturity?: string;
    isSensitive?: boolean;
    sensitiveNote?: string;
    lede?: string;
    ownerId?: string;
  };

  if (!title?.trim()) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }
  const slug = (rawSlug?.trim() || slugifyTitle(title));
  if (!slug) {
    return Response.json({ error: "Invalid slug" }, { status: 400 });
  }

  const resolvedMaturity: Maturity = isValidMaturity(maturity) ? maturity : "mostly_theory";
  const resolvedOwnerId = ownerId?.trim() || userId;

  // Validate owner exists
  const owner = await prisma.user.findUnique({
    where: { id: resolvedOwnerId },
    select: { id: true },
  });
  if (!owner) {
    return Response.json({ error: "Owner user not found" }, { status: 400 });
  }

  const existing = await prisma.wikiPage.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing) {
    return Response.json({ error: `Slug already in use: ${slug}` }, { status: 409 });
  }

  const now = new Date();

  // Single transaction: create the page + 8 empty sections together so the
  // module never exists in a half-formed state.
  const page = await prisma.$transaction(async (tx) => {
    const created = await tx.wikiPage.create({
      data: {
        slug,
        title: title.trim(),
        type: MANUAL_TYPE,
        maturity: resolvedMaturity,
        isSensitive: !!isSensitive,
        sensitiveNote: isSensitive ? (sensitiveNote?.trim() || null) : null,
        canonicalLang: "en",
        canonicalContent: lede?.trim() || "",
        translatedContent: {},
        ownerId: resolvedOwnerId,
        ownerTermStart: now,
        ownerTermEnd: nextOwnerTermEnd(now),
        nextReviewDue: nextReviewFromNow(now),
        lastReviewedAt: now,
        lastEditedAt: now,
        lastEditedById: userId,
        status: "draft",
      },
      select: { id: true, slug: true },
    });

    await tx.wikiManualSection.createMany({
      data: SECTION_NUMBERS.map((sectionNumber) => ({
        pageId: created.id,
        sectionNumber,
        content: "",
        lastEditedAt: now,
        lastEditedById: userId,
      })),
    });

    return created;
  });

  return Response.json(
    { manual: { id: page.id, slug: page.slug } },
    { status: 201 },
  );
}
