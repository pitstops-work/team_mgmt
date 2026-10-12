/**
 * How a pool of CVs is cut into model calls.
 *
 * Pure arithmetic, no server imports — which is the point: the CLIENT has to
 * know the same number, because it decides whether a pool goes straight to a
 * single generate call or is handed to the batch runner. Importing it from
 * batchRunner would drag prisma and @vercel/blob into the browser bundle.
 *
 * The runner itself re-exports both of these, so server callers keep reading
 * them from there.
 */

/**
 * CVs per model call when building or extending a desk.
 *
 * Bounded by OUTPUT tokens against the 300s function ceiling, which is
 * Vercel's maximum and cannot be raised — not by input size. A rendered
 * candidate costs ~830-1,540 output tokens (measured on real desks) and Opus
 * streams on the order of 50-80 tokens/sec, so eight candidates is roughly
 * 7-12k tokens — comfortably inside 300s once CV extraction is paid for.
 * Raising this is how the Unplaced desk timed out on the first 89-CV run.
 *
 * It is therefore also the largest pool that may be scouted in ONE request.
 * Anything bigger has to be chunked by the batch runner, whatever screen it
 * was started from: a 50-CV pool in a single call is ~40-75k output tokens,
 * which is 10-25 minutes of streaming and cannot finish inside the ceiling no
 * matter how many times it is retried.
 */
export const DESK_CHUNK = 8;

/**
 * How many CVs this attempt should take on.
 *
 * A chunk that cannot finish inside the 300s ceiling will not finish on a
 * second identical try either — the only variable the server controls is how
 * much it bites off. So each consecutive failure halves it, and the CV that is
 * genuinely too heavy to read is isolated instead of taking its neighbours
 * down with it. `attempts` is reset on every commit, so this is always
 * "failures of the chunk in front of us", never a tally for the whole run.
 */
export function chunkForAttempt(chunkSize: number, attempts: number): number {
  const n = Math.max(1, attempts);
  return Math.max(1, Math.ceil(chunkSize / 2 ** (n - 1)));
}

/** True when a pool is too large to scout in one request and must be chunked. */
export function needsChunking(cvCount: number): boolean {
  return cvCount > DESK_CHUNK;
}
