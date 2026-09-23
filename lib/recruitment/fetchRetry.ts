/**
 * Client-side fetch with a retry for connection failures.
 *
 * `fetch` rejects with a bare `TypeError: Failed to fetch` when the request
 * never completed at the network level — Wi-Fi blip, laptop asleep, VPN
 * re-handshake. There is no status, so every "the server said…" message the
 * caller has prepared is skipped and the recruiter is shown two words. That
 * is exactly what ended the 89-CV run of 2026-09-22: no server error existed,
 * the connection simply went away mid-request.
 *
 * A retry only helps where the request is SAFE TO REPEAT. Uploading a CV and
 * asking for a triage split are; the multi-minute desk builds are not, which
 * is why they moved server-side instead (lib/recruitment/batchRunner.ts).
 */

const NETWORK_RETRIES = 2;
const BACKOFF_MS = [1500, 4000];

export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError;
}

export async function fetchRetrying(input: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= NETWORK_RETRIES; attempt++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      // A real HTTP error is a resolved Response, not a throw — anything that
      // lands here is the connection, so retrying is the right move.
      if (!isNetworkError(e)) throw e;
      lastErr = e;
      if (attempt < NETWORK_RETRIES) await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
    }
  }
  throw lastErr;
}

/**
 * What to say when the server fails WITHOUT a JSON body.
 *
 * A 504 or a crashed function returns an HTML error page, so `json.error` is
 * undefined and the caller's fallback string is all the user ever sees. A bare
 * "Could not sort the CVs" sent the recruiter back with nothing to act on
 * after a 20-minute upload (2026-09-22, an 85-CV pool). Name the likely cause
 * and the next move instead.
 */
export function describeServerFailure(status: number, what: string): string {
  if (status === 504 || status === 408) {
    return `Timed out trying to ${what} — the pool is probably too large for one run. Try splitting the CVs into two smaller runs.`;
  }
  if (status === 413) return `The upload was too large to ${what}. Try fewer CVs at once.`;
  if (status === 502 || status === 503) return `The server was unreachable while trying to ${what}. Wait a moment and try again.`;
  if (status >= 500) return `The server errored trying to ${what} (${status}). If it repeats, the pool size is the first thing to halve.`;
  return `Could not ${what} (${status}).`;
}

/**
 * The message for a connection that dropped after every retry was spent.
 *
 * `mayHaveLanded` is for a request that WRITES: a lost response is not proof
 * the work didn't happen, and telling someone to "just try again" is how you
 * get two of whatever they were making.
 */
export function describeNetworkFailure(what: string, mayHaveLanded = false): string {
  const lead = `Lost the connection while trying to ${what}, and retrying didn't get it back.`;
  return mayHaveLanded
    ? `${lead} It may still have finished on the server — check the list below before running it again, or you'll get two.`
    : `${lead} Nothing was built, so it's safe to try again once your network is back.`;
}
