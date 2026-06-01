import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { DEFAULT_CAPTURE_SECTION, MANUAL_TYPE, isValidSectionNumber } from "@/lib/wiki/manual";
import type { NextRequest } from "next/server";

/**
 * POST /api/wiki/capture
 *
 * Unified capture endpoint for the "Document what we learned" flow. One UI
 * over three intake models — the facilitator never sees the routing:
 *
 *   target.kind = "manual"  → WikiPracticeEntry on the picked module/section
 *   target.kind = "page"    → WikiPracticeObservation kind="circle_note"
 *   target.kind = "gap"     → WikiPracticeGap
 *
 * Body shape:
 *   {
 *     target:
 *       | { kind: "manual", pageId: string, sectionNumber?: number }
 *       | { kind: "page",   pageId: string }
 *       | { kind: "gap",    vertical: string, suggestedTitle?: string,
 *                           city?: string },
 *     body: string,
 *     attribution?: {
 *       settlement?: string,
 *       partnerOrgId?: string,
 *       happenedAt?: string,   // ISO; defaults to now
 *       circleId?: string,
 *     }
 *   }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { target, body, attribution } = (payload ?? {}) as {
    target?: { kind?: string; pageId?: string; sectionNumber?: number; vertical?: string; suggestedTitle?: string; city?: string };
    body?: string;
    attribution?: { settlement?: string; partnerOrgId?: string; happenedAt?: string; circleId?: string };
  };

  if (!target?.kind || typeof body !== "string" || !body.trim()) {
    return Response.json({ error: "target.kind and body are required" }, { status: 400 });
  }

  const happenedAt = attribution?.happenedAt ? new Date(attribution.happenedAt) : new Date();
  if (Number.isNaN(happenedAt.getTime())) {
    return Response.json({ error: "Invalid happenedAt" }, { status: 400 });
  }

  // ── Manual: append a WikiPracticeEntry on the target section ──────────────
  if (target.kind === "manual") {
    if (!target.pageId) {
      return Response.json({ error: "target.pageId is required" }, { status: 400 });
    }
    const page = await prisma.wikiPage.findUnique({
      where: { id: target.pageId },
      select: { id: true, slug: true, type: true, archivedAt: true },
    });
    if (!page || page.archivedAt || page.type !== MANUAL_TYPE) {
      return Response.json({ error: "Target manual not found" }, { status: 404 });
    }
    const sectionNumber = target.sectionNumber ?? DEFAULT_CAPTURE_SECTION;
    if (!isValidSectionNumber(sectionNumber)) {
      return Response.json({ error: "Invalid sectionNumber" }, { status: 400 });
    }

    const entry = await prisma.wikiPracticeEntry.create({
      data: {
        pageId: page.id,
        sectionNumber,
        body: body.trim(),
        observerId: userId,
        settlement: attribution?.settlement?.trim() || null,
        partnerOrgId: attribution?.partnerOrgId || null,
        happenedAt,
        circleId: attribution?.circleId || null,
      },
      select: { id: true },
    });

    return Response.json(
      {
        kind: "manual",
        id: entry.id,
        destination: {
          url: `/manual/${page.slug}#section-${sectionNumber}`,
          label: `Section ${sectionNumber}`,
        },
      },
      { status: 201 },
    );
  }

  // ── Page: create a "circle_note" WikiPracticeObservation ──────────────────
  if (target.kind === "page") {
    if (!target.pageId) {
      return Response.json({ error: "target.pageId is required" }, { status: 400 });
    }
    const page = await prisma.wikiPage.findUnique({
      where: { id: target.pageId },
      select: {
        id: true, slug: true, title: true, type: true, archivedAt: true,
        tags: { select: { tagType: true, tagValue: true } },
      },
    });
    if (!page || page.archivedAt) {
      return Response.json({ error: "Target page not found" }, { status: 404 });
    }
    if (page.type === MANUAL_TYPE) {
      return Response.json({ error: "Use target.kind='manual' for manual pages" }, { status: 400 });
    }
    // Infer vertical from page tags; fall back to "general" so observation
    // creation never blocks the facilitator on a missing tag.
    const vertical = page.tags.find((t) => t.tagType === "vertical")?.tagValue ?? "general";

    const obs = await prisma.wikiPracticeObservation.create({
      data: {
        kind: "circle_note",
        observerId: userId,
        vertical,
        notes: body.trim(),
        happenedAt,
        partnerOrgId: attribution?.partnerOrgId || null,
        primaryPageId: page.id,
      },
      select: { id: true },
    });

    return Response.json(
      {
        kind: "page",
        id: obs.id,
        destination: {
          url: `/wiki/${page.slug}`,
          label: page.title,
        },
      },
      { status: 201 },
    );
  }

  // ── Gap: file a new WikiPracticeGap ───────────────────────────────────────
  if (target.kind === "gap") {
    if (!target.vertical?.trim()) {
      return Response.json({ error: "target.vertical is required for gaps" }, { status: 400 });
    }
    const gap = await prisma.wikiPracticeGap.create({
      data: {
        vertical: target.vertical.trim(),
        oneLineNeed: body.trim(),
        suggestedTitle: target.suggestedTitle?.trim() || null,
        city: target.city?.trim() || null,
        partnerOrgId: attribution?.partnerOrgId || null,
        filerId: userId,
        status: "open",
      },
      select: { id: true },
    });

    return Response.json(
      {
        kind: "gap",
        id: gap.id,
        destination: {
          url: `/wiki/gaps`,
          label: "Gaps queue",
        },
      },
      { status: 201 },
    );
  }

  return Response.json({ error: "Invalid target.kind" }, { status: 400 });
}
