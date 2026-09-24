/**
 * Worker for AI first reads of screening applications (lib/seeding/screening/draft.ts).
 *
 * POST — draft one batch, then hand the rest to a fresh invocation. Called by
 *        the previous batch, by intake/import, and by the sweep below.
 * GET  — Vercel cron. Restarts the chain if nothing is drafting but work is
 *        waiting, e.g. after a worker was killed mid-batch.
 */

import { NextRequest, after } from "next/server";
import { drainDrafts, drainTokenValid, draftsInFlight, kickDrafts } from "@/lib/seeding/screening/draft";
import { selfOrigin } from "@/lib/recruitment/batchRunner";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
  if (!drainTokenValid(bearer)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const origin = selfOrigin(req.url);
  after(async () => {
    if (await drainDrafts()) await kickDrafts(origin);
  });
  return Response.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const waiting = await prisma.screeningApplication.count({ where: { aiStatus: { in: ["pending", "failed"] }, aiAttempts: { lt: 3 } } });
  // One chain at a time is enough to keep up; only restart a stalled one.
  if (waiting > 0 && (await draftsInFlight()) === 0) await kickDrafts(selfOrigin(req.url));
  return Response.json({ ok: true, waiting });
}
