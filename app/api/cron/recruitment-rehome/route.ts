/**
 * Worker for an Unplaced desk's re-home queue (lib/recruitment/rehome.ts).
 *
 * POST { slug } — move one group, then hand the next to a fresh invocation.
 * Under /api/cron/ because a worker calling the next worker has no session
 * cookie; it authenticates with a per-desk HMAC instead.
 */

import { NextRequest } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/prisma";
import { selfOrigin } from "@/lib/recruitment/batchRunner";
import { kickRehome, rehomeStep, rehomeTokenValid } from "@/lib/recruitment/rehome";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const slug = typeof body?.slug === "string" ? body.slug : "";
  const bearer = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
  if (!slug || !rehomeTokenValid(slug, bearer)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // A new desk opened by a move is credited to whoever made the source desk.
  const day = await prisma.recruitmentScoutingDay.findUnique({
    where: { slug },
    select: { createdBy: { select: { id: true, name: true } } },
  });
  const session = day?.createdBy ? { user: { id: day.createdBy.id, name: day.createdBy.name } } : null;
  const origin = selfOrigin(req.url);

  after(async () => {
    const { claimed, more } = await rehomeStep(slug, session);
    if (claimed && more) await kickRehome(slug, origin);
  });
  return Response.json({ ok: true });
}
