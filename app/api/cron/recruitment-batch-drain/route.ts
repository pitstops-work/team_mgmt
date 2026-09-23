/**
 * The batch runner's worker.
 *
 * POST { runId }  — work ONE chunk of that run, then hand the next chunk to a
 *                   fresh invocation. Called by the run's own previous chunk
 *                   (the fast path) and by the sweep below. Authenticated with
 *                   a per-run HMAC, because a worker calling the next worker
 *                   has no session cookie.
 * GET            — Vercel cron. Sweeps up runs whose lease has gone stale,
 *                  i.e. whose chain broke because a function was killed
 *                  mid-chunk. This is the reason a run cannot silently die.
 *
 * It lives under /api/cron/ because that prefix is the one middleware lets
 * through unauthenticated (see PUBLIC_PREFIXES in middleware.ts).
 *
 * The chunk runs in `after()`: the response goes back in milliseconds so the
 * caller isn't holding a connection open for a multi-minute model call, while
 * the invocation stays alive for the work. Nothing nests, so no chunk shares
 * its 300s budget with another.
 */

import { NextRequest } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/prisma";
import {
  drainOneChunk,
  drainTokenValid,
  findStaleRuns,
  kickDrain,
  RETRY_BACKOFF_MS,
  selfOrigin,
} from "@/lib/recruitment/batchRunner";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The run's creator, so the desks this worker writes are attributed to the
 * recruiter who started the run and not to nobody. There is no session here.
 */
async function sessionForRun(runId: string) {
  const run = await prisma.recruitmentBatchRun.findUnique({
    where: { id: runId },
    select: { createdBy: { select: { id: true, name: true } } },
  });
  return run?.createdBy ? { user: { id: run.createdBy.id, name: run.createdBy.name } } : null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const runId = typeof body?.runId === "string" ? body.runId : "";
  const bearer = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
  const cronSecret = process.env.CRON_SECRET;
  const authed = drainTokenValid(runId, bearer) || (!!cronSecret && bearer === cronSecret);
  if (!runId || !authed) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const origin = selfOrigin(req.url);
  const session = await sessionForRun(runId);

  after(async () => {
    const { claimed, more, retrying } = await drainOneChunk(runId, session);
    // Not claimed => another worker already has it, and that worker owns the
    // handoff. Kicking again here is how you get two chains on one run.
    if (!claimed || !more) return;
    // Retrying the same chunk waits; moving on to the next one doesn't.
    if (retrying) await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
    await kickDrain(runId, origin);
  });

  return Response.json({ ok: true, accepted: runId });
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const origin = selfOrigin(req.url);
  const stale = await findStaleRuns();
  for (const id of stale) await kickDrain(id, origin);
  return Response.json({ ok: true, resumed: stale });
}
