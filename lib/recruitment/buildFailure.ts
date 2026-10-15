/**
 * Turn an exception thrown while building a desk into something the
 * recruiter can act on.
 *
 * Uncaught, any of these came back as a bare 500 HTML page, and the form
 * could only guess: "If it repeats, the pool size is the first thing to
 * halve". For a pool of two that advice is no help at all. The real cause is
 * nearly always one of three things: the AI service, the database, or one
 * file. Say which, and say that nothing was built.
 */

import Anthropic from "@anthropic-ai/sdk";

export function buildFailure(e: unknown, what: string): { status: number; error: string } {
  console.error(`[recruitment] ${what} threw:`, e);
  if (e instanceof Anthropic.APIError) {
    const s = e.status;
    if (s === 429 || s === 529 || (typeof s === "number" && s >= 500)) {
      return {
        status: 503,
        error: `The AI service is overloaded or unavailable (${s}). Nothing was built — try again in a few minutes.`,
      };
    }
    return {
      status: 502,
      error: `The AI service rejected the request (${s ?? "no status"}): ${e.message.slice(0, 300)}. Nothing was built.`,
    };
  }
  const msg = e instanceof Error ? e.message : String(e);
  return { status: 500, error: `Could not ${what}: ${msg.replace(/\s+/g, " ").slice(0, 400)}. Nothing was built.` };
}
