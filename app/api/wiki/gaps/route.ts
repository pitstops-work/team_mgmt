import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiCurator } from "@/lib/wiki/auth";
import { suggestAssignedOwnerId, isGapStatus } from "@/lib/wiki/gaps";
import type { NextRequest } from "next/server";

/**
 * GET /api/wiki/gaps
 *   ?status=open|assigned|drafted|merged|published|declined
 *   ?vertical=<v>
 *   ?mine=1   (assigned to me OR filed by me)
 *
 * Any authenticated user can list (so the filer-loop in module 5 stays
 * honest — the CO who filed the gap can find it). Curators see every gap.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const vertical = searchParams.get("vertical");
  const mine = searchParams.get("mine") === "1";

  const curator = await isWikiCurator(userId);

  const gaps = await prisma.wikiPracticeGap.findMany({
    where: {
      archivedAt: null,
      ...(status && isGapStatus(status) ? { status } : {}),
      ...(vertical ? { vertical } : {}),
      ...(mine
        ? { OR: [{ assignedOwnerId: userId }, { filerId: userId }] }
        : curator
        ? {}
        : { OR: [{ assignedOwnerId: userId }, { filerId: userId }] }),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      filer: { select: { id: true, name: true, image: true } },
      assignedOwner: { select: { id: true, name: true, image: true } },
      curatorTriager: { select: { id: true, name: true } },
      partnerOrg: { select: { id: true, name: true, slug: true } },
      linkedPage: { select: { id: true, slug: true, title: true } },
    },
  });

  return Response.json({ gaps, viewerIsCurator: curator });
}

/**
 * POST /api/wiki/gaps — file a gap.
 *   body: { vertical, oneLineNeed, suggestedTitle?, city?, partnerOrgId? }
 *
 * Any authenticated user can file. The route auto-suggests an owner via
 * `suggestAssignedOwnerId` but leaves status at "open" — assignment is an
 * explicit triage step. Setting `assignedOwnerId` at file time would skip
 * the curator's weekly walk and defeat the routing protocol.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const vertical =
    typeof body.vertical === "string" ? body.vertical.trim().toLowerCase() : "";
  const oneLineNeed =
    typeof body.oneLineNeed === "string" ? body.oneLineNeed.trim() : "";
  const suggestedTitle =
    typeof body.suggestedTitle === "string" && body.suggestedTitle.trim()
      ? body.suggestedTitle.trim()
      : null;
  const city =
    typeof body.city === "string" && body.city.trim()
      ? body.city.trim().toLowerCase()
      : null;
  const partnerOrgId =
    typeof body.partnerOrgId === "string" && body.partnerOrgId
      ? body.partnerOrgId
      : null;

  if (!vertical) {
    return Response.json({ error: "vertical required" }, { status: 400 });
  }
  if (!oneLineNeed || oneLineNeed.length < 10) {
    return Response.json(
      { error: "oneLineNeed required (≥10 chars)" },
      { status: 400 },
    );
  }
  if (oneLineNeed.length > 600) {
    return Response.json(
      { error: "oneLineNeed too long (≤600 chars)" },
      { status: 400 },
    );
  }

  if (partnerOrgId) {
    const exists = await prisma.org.findUnique({
      where: { id: partnerOrgId },
      select: { id: true },
    });
    if (!exists) {
      return Response.json({ error: "partnerOrgId not found" }, { status: 400 });
    }
  }

  // We compute a suggested owner so the curator's triage view can pre-fill
  // the assignment dropdown. Not auto-assigned — curator confirms.
  const suggestedOwnerId = await suggestAssignedOwnerId({
    vertical,
    partnerOrgId,
  });

  const gap = await prisma.wikiPracticeGap.create({
    data: {
      vertical,
      oneLineNeed,
      suggestedTitle,
      city,
      partnerOrgId,
      filerId: userId,
      status: "open",
    },
    include: {
      filer: { select: { id: true, name: true } },
    },
  });

  return Response.json({ gap, suggestedOwnerId }, { status: 201 });
}
