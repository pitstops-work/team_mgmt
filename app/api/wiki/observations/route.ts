import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { dispatchWikiNotificationSafe } from "@/lib/notify/dispatch";
import type { NextRequest } from "next/server";

const KINDS = ["shadow", "onboarding"] as const;
type Kind = (typeof KINDS)[number];
function isKind(s: unknown): s is Kind {
  return typeof s === "string" && (KINDS as readonly string[]).includes(s);
}

/**
 * GET /api/wiki/observations
 *   ?kind=shadow|onboarding
 *   ?vertical=<v>
 *   ?mine=1   (observer is me)
 *
 * Any authenticated user can list.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind");
  const vertical = searchParams.get("vertical");
  const mine = searchParams.get("mine") === "1";

  const rows = await prisma.wikiPracticeObservation.findMany({
    where: {
      archivedAt: null,
      ...(kind && isKind(kind) ? { kind } : {}),
      ...(vertical ? { vertical } : {}),
      ...(mine ? { observerId: userId } : {}),
    },
    orderBy: { happenedAt: "desc" },
    take: 200,
    include: {
      observer: { select: { id: true, name: true, image: true } },
      observed: { select: { id: true, name: true } },
      partnerOrg: { select: { id: true, name: true } },
      primaryPage: { select: { id: true, slug: true, title: true } },
    },
  });
  return Response.json({ observations: rows });
}

/**
 * POST /api/wiki/observations
 *   body: {
 *     kind: "shadow" | "onboarding",
 *     vertical, happenedAt,
 *     observedUserId?, partnerOrgId?, city?,
 *     notes, openQuestions?, driftFlagged?, primaryPageId?
 *   }
 *
 * The observer is always the caller. If `primaryPageId` is set and the
 * caller is not the page owner, the page owner gets a notification — keeps
 * shadow visits visible to the people accountable for the page.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const kind = body.kind;
  if (!isKind(kind)) {
    return Response.json({ error: "kind must be 'shadow' or 'onboarding'" }, { status: 400 });
  }

  const vertical =
    typeof body.vertical === "string" ? body.vertical.trim().toLowerCase() : "";
  if (!vertical) return Response.json({ error: "vertical required" }, { status: 400 });

  const happenedAt =
    typeof body.happenedAt === "string" ? new Date(body.happenedAt) : new Date();
  if (isNaN(happenedAt.getTime())) {
    return Response.json({ error: "happenedAt invalid" }, { status: 400 });
  }

  const observedUserId =
    typeof body.observedUserId === "string" && body.observedUserId
      ? body.observedUserId
      : null;
  const partnerOrgId =
    typeof body.partnerOrgId === "string" && body.partnerOrgId
      ? body.partnerOrgId
      : null;
  const city =
    typeof body.city === "string" && body.city.trim() ? body.city.trim().toLowerCase() : null;
  const notes = typeof body.notes === "string" ? body.notes : "";
  const openQuestions =
    typeof body.openQuestions === "string" && body.openQuestions.trim()
      ? body.openQuestions.trim()
      : null;
  const driftFlagged = body.driftFlagged === true;
  const primaryPageId =
    typeof body.primaryPageId === "string" && body.primaryPageId
      ? body.primaryPageId
      : null;

  const obs = await prisma.wikiPracticeObservation.create({
    data: {
      kind,
      observerId: userId,
      observedUserId,
      partnerOrgId,
      vertical,
      city,
      happenedAt,
      notes,
      openQuestions,
      driftFlagged,
      primaryPageId,
    },
  });

  // Owner-of-page sees their page got a shadow/onboarding visit, unless
  // they were the observer themselves.
  if (primaryPageId) {
    const page = await prisma.wikiPage.findUnique({
      where: { id: primaryPageId },
      select: { ownerId: true, slug: true, title: true },
    });
    if (page?.ownerId && page.ownerId !== userId) {
      await dispatchWikiNotificationSafe({
        userId: page.ownerId,
        kind: "wiki_shadow_recorded",
        pageId: primaryPageId,
        title:
          kind === "shadow"
            ? `Shadow visit recorded against your page`
            : `Onboarding session recorded against your page`,
        body:
          driftFlagged && page.title
            ? `Drift flagged on "${page.title}". Notes available.`
            : page.title
            ? `Notes added to "${page.title}".`
            : "Notes added.",
        link: `/wiki/${page.slug}`,
      });
    }
  }

  return Response.json({ observation: obs }, { status: 201 });
}
