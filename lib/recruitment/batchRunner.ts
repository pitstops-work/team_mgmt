/**
 * The batch runner: a multi-city scouting run, owned by the server.
 *
 * ## Why this exists
 *
 * A multi-city run builds one desk per city, and each desk is built in chunks
 * of CVs — a single Claude call for a 40-CV pool cannot finish inside the
 * 300s function ceiling, which is Vercel's maximum and cannot be raised. An
 * 89-CV run is therefore ~25 minutes of model calls spread over a dozen
 * requests.
 *
 * That sequence used to be a for-loop in the recruiter's browser, with
 * progress held in a React ref. It had three failure modes, and the 89-CV run
 * of 2026-09-22 hit the first two at once:
 *
 *   1. One dropped connection ended the run. The failure surfaced as a bare
 *      `TypeError: Failed to fetch` after 48 of 89 CVs — no 5xx, no timeout,
 *      nothing in the server logs at all, because the request never reached
 *      the server.
 *   2. Progress died with the tab. A refresh meant re-uploading all 89 CVs.
 *   3. The client's idea of "done" could lag the server's. A chunk whose
 *      RESPONSE was lost after it had already committed would be re-sent on
 *      retry, and `appendCandidates` dedupes ids by renaming — so the retry
 *      appended duplicate candidates rather than skipping them.
 *
 * ## How it works now
 *
 * The browser posts the plan once and is then free to close. The plan lives in
 * RecruitmentBatchRun.planJson and is the single source of truth for what has
 * run. A drain worker takes a lease on the run, executes ONE chunk, records
 * progress only after that chunk has COMMITTED, and hands off to a fresh
 * invocation for the next chunk — so no chunk ever shares a 300s budget with
 * another, and resume is exact rather than approximate.
 *
 * Two things drive it: each drain kicks the next one (fast path), and a cron
 * sweeps up any run whose lease has gone stale (recovery path, for when a
 * function is killed mid-chunk and the chain breaks).
 */

import { createHmac, timingSafeEqual } from "crypto";
import { del } from "@vercel/blob";
import prisma from "@/lib/prisma";
import { generateDesk } from "@/lib/recruitment/generateDesk";
import { appendCandidates, type CvRef } from "@/lib/recruitment/scoutingDayOps";
import type { RecruitmentBatchRun } from "@/app/generated/prisma/client";

type SessionLike = { user?: { id?: string; name?: string | null } | null } | null;

/**
 * CVs per model call when building a desk.
 *
 * Bounded by OUTPUT tokens against the 300s ceiling, not by input size: a
 * rendered candidate costs ~830-1,540 output tokens (measured on real desks)
 * and Opus streams on the order of 50-80 tokens/sec, so eight candidates is
 * roughly 7-12k tokens — comfortably inside 300s once CV extraction is paid
 * for. Raising this is how the Unplaced desk timed out on the first 89-CV run.
 */
export const DESK_CHUNK = 8;

/** Consecutive failures of the SAME chunk before the run parks itself. */
const MAX_ATTEMPTS = 3;

/**
 * How long a drain's claim on a run is honoured.
 *
 * Longer than the 300s a chunk may take, so a worker that is merely slow is
 * never raced by the cron; short enough that a worker killed mid-chunk is
 * picked up on the next sweep. A lease, not a lock — nothing releases it if
 * the process dies, so it must expire on its own.
 */
const LEASE_MS = 7 * 60 * 1000;

export type BatchDesk = {
  /** locationId, or "__unplaced__" for the pool triage couldn't place. */
  key: string;
  /** City name, or "Unplaced". Used in the desk title and the progress UI. */
  label: string;
  locationId: string | null;
  unplaced: boolean;
  /** Set by the first committed chunk; later chunks append to it. */
  slug: string | null;
  /** CVs COMMITTED to the desk. The resume point, and never a guess. */
  done: number;
  /** Of `done`, how many were passed over as copies of someone already on the desk. */
  dupes?: number;
  cvs: CvRef[];
};

export type BatchPlan = {
  chunkSize: number;
  /** Free-text brief for JD-less runs; a picked JD supplies its own notes. */
  context: string;
  desks: BatchDesk[];
};

export type RunProgress = {
  id: string;
  status: string;
  title: string;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  totalCvs: number;
  doneCvs: number;
  /** The desk currently being worked, if any. */
  currentLabel: string | null;
  desks: { key: string; label: string; slug: string | null; done: number; total: number; dupes: number }[];
};

export function readPlan(run: Pick<RecruitmentBatchRun, "planJson">): BatchPlan {
  return run.planJson as unknown as BatchPlan;
}

export function describeRun(run: RecruitmentBatchRun): RunProgress {
  const plan = readPlan(run);
  const next = plan.desks.find((d) => d.done < d.cvs.length) ?? null;
  return {
    id: run.id,
    status: run.status,
    title: run.title,
    error: run.error,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    totalCvs: plan.desks.reduce((n, d) => n + d.cvs.length, 0),
    doneCvs: plan.desks.reduce((n, d) => n + d.done, 0),
    currentLabel: run.status === "running" ? next?.label ?? null : null,
    desks: plan.desks.map((d) => ({
      key: d.key,
      label: d.label,
      slug: d.slug,
      done: d.done,
      total: d.cvs.length,
      dupes: d.dupes ?? 0,
    })),
  };
}

// ── Starting a run ───────────────────────────────────────────────────────────

export async function startBatchRun(input: {
  title: string;
  date: string;
  jobId: string | null;
  context: string;
  /**
   * `slug` may be preset to an EXISTING desk — that is how the recovery flow
   * finishes a pool into the desk it half-built, rather than making a second
   * one beside it. Every chunk then appends, including the first.
   */
  desks: (Omit<BatchDesk, "slug" | "done"> & { slug?: string | null })[];
  session: SessionLike;
  /**
   * Client-minted id, so starting a run is idempotent.
   *
   * The start call itself is quick, but "quick" is not "cannot lose its
   * response" — and a lost response that the browser retries must not build
   * every desk twice. Same id, same run.
   */
  id?: string;
}): Promise<{ id: string; existed: boolean }> {
  const id = input.id || `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const existing = await prisma.recruitmentBatchRun.findUnique({ where: { id }, select: { id: true } });
  if (existing) return { id, existed: true };
  const plan: BatchPlan = {
    chunkSize: DESK_CHUNK,
    context: input.context,
    desks: input.desks.map((d) => ({ ...d, slug: d.slug ?? null, done: 0 })),
  };
  await prisma.recruitmentBatchRun.create({
    data: {
      id,
      jobId: input.jobId,
      title: input.title,
      matchday: input.date ? new Date(input.date) : null,
      status: "running",
      planJson: plan as unknown as never,
      createdById: input.session?.user?.id ?? null,
    },
  });
  return { id, existed: false };
}

/** Ids we mint, and the only shape the start endpoint will accept from a client. */
export function isRunId(v: unknown): v is string {
  return typeof v === "string" && /^b[a-z0-9]{6,40}$/.test(v);
}

// ── Leasing ──────────────────────────────────────────────────────────────────

/**
 * Take the run if nobody is working it. Conditional UPDATE, so two workers
 * racing on the same run can never both win — one of them updates zero rows.
 *
 * Taking the run COUNTS as an attempt at its current chunk. Counting only
 * failures missed the one failure that never reports itself: a chunk that
 * runs past the 300s ceiling is killed mid-call, nothing catches it, the
 * lease goes stale, the cron hands the same chunk to a fresh worker, and that
 * one is killed too — forever, with the run still showing "running" and the
 * attempt count still 0. That is how a recovery run sat at 32/173 with a
 * spinner and nothing to press.
 */
async function claim(runId: string): Promise<RecruitmentBatchRun | null> {
  const cutoff = new Date(Date.now() - LEASE_MS);
  const got = await prisma.recruitmentBatchRun.updateMany({
    where: {
      id: runId,
      status: "running",
      OR: [{ lockedAt: null }, { lockedAt: { lt: cutoff } }],
    },
    data: { lockedAt: new Date(), attempts: { increment: 1 } },
  });
  if (got.count === 0) return null;
  return prisma.recruitmentBatchRun.findUnique({ where: { id: runId } });
}

/** Runs nobody is working that still have chunks left. The cron's input. */
export async function findStaleRuns(limit = 3): Promise<string[]> {
  const cutoff = new Date(Date.now() - LEASE_MS);
  const rows = await prisma.recruitmentBatchRun.findMany({
    where: { status: "running", OR: [{ lockedAt: null }, { lockedAt: { lt: cutoff } }] },
    orderBy: { startedAt: "asc" },
    take: limit,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

// ── One chunk ────────────────────────────────────────────────────────────────

const CODE = /APPRF[-_ ]?(\d{3,6})/i;

/** The APPRF code a CV's filename carries, normalised, or null. */
export function cvCode(name: string): string | null {
  const m = name.match(CODE);
  return m ? `APPRF-${m[1]}` : null;
}

/** Candidate codes already on a desk — pulled in SQL so no cvText is loaded. */
async function codesOnDesk(slug: string): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ code: string | null }[]>`
    SELECT DISTINCT c->>'code' AS code
    FROM "RecruitmentScoutingDay",
         LATERAL jsonb_array_elements("snapshotJson"->'candidates') AS c
    WHERE slug = ${slug} AND jsonb_typeof("snapshotJson"->'candidates') = 'array'
  `;
  const out = new Set<string>();
  for (const r of rows) {
    const code = r.code ? cvCode(r.code) : null;
    if (code) out.add(code);
  }
  return out;
}

/** "Unplaced, CVs 33–40" — the chunk a run is on, for messages about it. */
function currentChunkLabel(run: RecruitmentBatchRun): string {
  const plan = readPlan(run);
  const desk = plan.desks.find((d) => d.done < d.cvs.length);
  if (!desk) return run.title;
  const end = Math.min(desk.done + plan.chunkSize, desk.cvs.length);
  return `${desk.label}, CVs ${desk.done + 1}–${end}`;
}

type ChunkOutcome =
  | { kind: "committed"; more: boolean }
  | { kind: "finished" }
  | { kind: "failed"; error: string; retryable: boolean };

async function runOneChunk(run: RecruitmentBatchRun, session: SessionLike): Promise<ChunkOutcome> {
  const plan = readPlan(run);
  const desk = plan.desks.find((d) => d.done < d.cvs.length);
  if (!desk) return { kind: "finished" };

  const chunk = desk.cvs.slice(desk.done, desk.done + plan.chunkSize);

  // A person already on the desk is not scouted again. The temp area holds a
  // copy of a pool for every time it was uploaded, and the recovery survey
  // hands all of them over — so without this a re-uploaded CV lands on the
  // desk once per upload, each copy a separate model spend.
  const seen = desk.slug ? await codesOnDesk(desk.slug) : new Set<string>();
  const fresh = chunk.filter((cv) => {
    const code = cvCode(cv.name);
    if (!code) return true;
    if (seen.has(code)) return false;
    seen.add(code);
    return true;
  });

  if (fresh.length === 0) {
    desk.done += chunk.length;
    desk.dupes = (desk.dupes ?? 0) + chunk.length;
    await prisma.recruitmentBatchRun.update({
      where: { id: run.id },
      data: { planJson: plan as unknown as never, attempts: 0, error: null, lockedAt: new Date() },
    });
    return { kind: "committed", more: plan.desks.some((d) => d.done < d.cvs.length) };
  }

  // First chunk of a desk creates it; every later chunk appends to it.
  //
  // The append is FORCED rather than left to decideMode(), which would read
  // chunk 2 as "adding 8 to a pool of 8" and re-scout the whole desk on every
  // chunk — quadratic model spend, and the radar axes would churn each time.
  // Chunked building wants a locked-axes append.
  const result = desk.slug
    ? await appendCandidates(desk.slug, fresh, session, { keepCvs: true })
    : await generateDesk({
        // The city is part of the title so the desks are tellable apart in
        // the listing, where they otherwise sit together.
        title: `${run.title} — ${desk.label}`,
        date: run.matchday ? run.matchday.toISOString().slice(0, 10) : "",
        context: plan.context,
        jobId: run.jobId,
        locationId: desk.locationId,
        unplaced: desk.unplaced,
        batchId: run.id,
        cvs: fresh,
        session,
      });

  if (!result.ok) {
    // 5xx (and thrown exceptions, handled by the caller) are transient: a
    // model timeout, unparseable output, a blob read that failed once. 4xx is
    // the recruiter's data — an unreadable CV, an archived JD — and retrying
    // it just spends money to fail identically.
    return { kind: "failed", error: `${desk.label}: ${result.error}`, retryable: result.status >= 500 };
  }

  desk.slug = desk.slug ?? result.slug;
  desk.done += chunk.length;
  if (fresh.length < chunk.length) desk.dupes = (desk.dupes ?? 0) + chunk.length - fresh.length;

  // Commit progress in the same write that releases the lease. Everything
  // before this point is repeatable; everything after it is never redone.
  await prisma.recruitmentBatchRun.update({
    where: { id: run.id },
    data: { planJson: plan as unknown as never, attempts: 0, error: null, lockedAt: new Date() },
  });

  return { kind: "committed", more: plan.desks.some((d) => d.done < d.cvs.length) };
}

/**
 * Drop the temp CVs — once, at the very end.
 *
 * Deleting each desk's inputs as it finished is what made a failed run
 * impossible to retry: the resume re-read desk 1's CVs, which no longer
 * existed, and reported "Could not read CV <name>" — which reads like a
 * corrupt file and was nothing of the sort.
 */
async function finish(run: RecruitmentBatchRun): Promise<void> {
  const plan = readPlan(run);
  const all = plan.desks.flatMap((d) => d.cvs);
  await Promise.allSettled(all.map((cv) => del(cv.url)));
  await prisma.recruitmentBatchRun.update({
    where: { id: run.id },
    data: { status: "done", finishedAt: new Date(), lockedAt: null, error: null },
  });
}

async function park(run: RecruitmentBatchRun, error: string, retryable: boolean): Promise<void> {
  // `run.attempts` already counts this attempt — claim() took it.
  const attempts = retryable ? run.attempts : MAX_ATTEMPTS;
  const spent = attempts >= MAX_ATTEMPTS;
  await prisma.recruitmentBatchRun.update({
    where: { id: run.id },
    data: {
      attempts,
      error,
      // Keep the CVs either way — a parked run is a resumable run.
      ...(spent ? { status: "failed", lockedAt: null } : { lockedAt: null }),
    },
  });
}

/**
 * Work one chunk of one run. Returns whether another chunk is waiting, so the
 * caller can hand off to a fresh invocation rather than starting a second
 * multi-minute model call on a budget it has already spent part of.
 */
export async function drainOneChunk(
  runId: string,
  session: SessionLike,
): Promise<{ claimed: boolean; more: boolean; retrying: boolean }> {
  const run = await claim(runId);
  if (!run) return { claimed: false, more: false, retrying: false };

  const stuck = currentChunkLabel(run);
  if (run.attempts > MAX_ATTEMPTS) {
    // Every attempt so far was killed before it could report — the chunk
    // outlives the function ceiling. Park it so the recruiter can skip it.
    await park(
      run,
      `${stuck}: never finished inside the server's 5-minute limit, ${MAX_ATTEMPTS} times running. ` +
        `One of these CVs is probably too heavy to read (a long scan, say) — skip them to carry on.`,
      false,
    );
    return { claimed: true, more: false, retrying: false };
  }
  if (run.attempts > 1 && !run.error) {
    // The previous worker vanished without a word. Say so, so the page isn't
    // just a spinner that looks exactly like progress.
    await prisma.recruitmentBatchRun.update({
      where: { id: run.id },
      data: { error: `${stuck}: the last attempt didn't finish — trying again (${run.attempts} of ${MAX_ATTEMPTS}).` },
    });
  }

  let outcome: ChunkOutcome;
  try {
    outcome = await runOneChunk(run, session);
  } catch (e) {
    // A thrown error is infrastructure (blob store, DB, network to the model),
    // not the recruiter's data — always worth another attempt.
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[recruitment-batch] ${runId} chunk threw:`, msg);
    outcome = { kind: "failed", error: msg, retryable: true };
  }

  if (outcome.kind === "finished") {
    await finish(run);
    return { claimed: true, more: false, retrying: false };
  }
  if (outcome.kind === "failed") {
    await park(run, outcome.error, outcome.retryable);
    // `retrying` tells the caller to wait before the next attempt. Retrying a
    // model overload immediately just spends the attempt budget in a few
    // seconds and parks the run on a condition that would have cleared.
    const willRetry = outcome.retryable && run.attempts < MAX_ATTEMPTS;
    return { claimed: true, more: willRetry, retrying: willRetry };
  }
  if (!outcome.more) {
    const fresh = await prisma.recruitmentBatchRun.findUnique({ where: { id: run.id } });
    if (fresh) await finish(fresh);
    return { claimed: true, more: false, retrying: false };
  }
  await prisma.recruitmentBatchRun.update({ where: { id: run.id }, data: { lockedAt: null } });
  return { claimed: true, more: true, retrying: false };
}

/** Breathing room before a retry, so a transient fault isn't retried into a park. */
export const RETRY_BACKOFF_MS = 20_000;

/**
 * Restart a parked run at the first uncommitted chunk.
 *
 * `skipStuck` advances past the chunk that keeps failing. It exists for the
 * one failure a resume cannot fix on its own — a CV the extractor can't read
 * — where the alternative is the whole run staying stuck on one bad file. The
 * skipped CVs are reported, never silently dropped.
 */
export async function resumeBatchRun(runId: string, skipStuck: boolean): Promise<{ ok: boolean; skipped: number }> {
  const run = await prisma.recruitmentBatchRun.findUnique({ where: { id: runId } });
  if (!run || run.status === "done") return { ok: false, skipped: 0 };

  let skipped = 0;
  const plan = readPlan(run);
  if (skipStuck) {
    const desk = plan.desks.find((d) => d.done < d.cvs.length);
    if (desk) {
      skipped = Math.min(plan.chunkSize, desk.cvs.length - desk.done);
      // Drop them from the plan rather than marking them done: `done` already
      // points at the next unprocessed CV, so removing the stuck slice leaves
      // it pointing at the one after, and keeps done/total honest in the UI.
      desk.cvs.splice(desk.done, skipped);
    }
  }

  await prisma.recruitmentBatchRun.update({
    where: { id: runId },
    data: {
      status: "running",
      error: null,
      attempts: 0,
      lockedAt: null,
      finishedAt: null,
      ...(skipStuck ? { planJson: plan as unknown as never } : {}),
    },
  });
  return { ok: true, skipped };
}

// ── Kicking the next worker ──────────────────────────────────────────────────

/**
 * Per-run bearer token for the internal drain endpoint.
 *
 * Derived from NEXTAUTH_SECRET rather than a new env var, and scoped to one
 * run id, so a leaked token drains one run that is draining anyway. The
 * endpoint is under /api/cron/ because that prefix is the only one middleware
 * lets through without a session cookie — and a worker calling the next
 * worker has no cookie.
 */
export function drainToken(runId: string): string {
  return createHmac("sha256", process.env.NEXTAUTH_SECRET || "dev").update(`batch-drain:${runId}`).digest("hex");
}

export function drainTokenValid(runId: string, given: string | null): boolean {
  if (!given) return false;
  const want = Buffer.from(drainToken(runId));
  const got = Buffer.from(given);
  return want.length === got.length && timingSafeEqual(want, got);
}

/**
 * Hand the next chunk to a FRESH invocation.
 *
 * Deliberately not a recursive call in-process: each chunk gets its own full
 * 300s, and a chunk that dies takes only itself down. The request resolves in
 * milliseconds because the drain endpoint answers before doing the work.
 */
export async function kickDrain(runId: string, origin: string): Promise<void> {
  try {
    await fetch(`${origin}/api/cron/recruitment-batch-drain`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${drainToken(runId)}` },
      body: JSON.stringify({ runId }),
    });
  } catch (e) {
    // The cron sweep is the backstop — a failed kick delays the run, it does
    // not lose it.
    console.error(`[recruitment-batch] kick failed for ${runId}:`, e instanceof Error ? e.message : e);
  }
}

/** Absolute origin for a self-call, which fetch needs and a relative path won't give. */
export function selfOrigin(reqUrl: string): string {
  try {
    return new URL(reqUrl).origin;
  } catch {
    return process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : `https://${process.env.VERCEL_URL}`;
  }
}
