/**
 * CV → city triage for a multi-city scouting run.
 *
 * A multi-location JD is usually posted once, so the CVs arrive as one pile
 * covering every city. Generation, though, is strictly single-city: the SYSTEM
 * prompt carries one location's language, reference orgs, local red flags and
 * mobility expectation (see systemPrompt.ts → jdBlock). Judging a Chennai
 * candidate against Bangalore's context produces a confident, wrong verdict.
 *
 * So before any scouting happens, one cheap text-only call sorts the pile. The
 * result is a PROPOSAL, never applied blind — the recruiter sees the split and
 * corrects it. `reason` exists so a correction is an informed one: the model
 * has to say what in the CV put the candidate in that city.
 *
 * This is deliberately a separate, smaller call from the scouting pass. It
 * reads truncated CV text, needs no images, and returns a few tokens per CV.
 */

import Anthropic from "@anthropic-ai/sdk";

/** Per-CV text budget for triage. A CV's location signal is near the top —
 *  address, current role, education. Sending 24k chars each would multiply
 *  cost for no extra accuracy. */
export const TRIAGE_CHARS_PER_CV = 2_500;

/**
 * CVs per model call.
 *
 * Sizing is driven by the RESPONSE, not the prompt. One assignment costs ~83
 * output tokens (measured: cuid location id, real name, ~90-char reason), so a
 * single call covering 85 CVs needs ~7,100 output tokens. The original
 * `max_tokens: 4_000` capped that at roughly 48 CVs — beyond which the JSON
 * truncated mid-object, every assignment was lost to the parse failure, and
 * the whole pool came back Unsorted. That is what broke the first real 85-CV
 * run on 2026-09-22.
 *
 * 25 per chunk against an 8,000-token ceiling leaves ~4x headroom, so an
 * unusually verbose batch still has room to finish its JSON. Chunking also
 * keeps each call short enough that the route's 300s ceiling isn't at risk.
 */
export const TRIAGE_CHUNK_SIZE = 25;
export const TRIAGE_MAX_TOKENS = 8_000;
/** Parallel model calls. Enough to keep a large pool quick, low enough not to
 *  fight the account rate limit with the rest of the app. */
export const TRIAGE_CONCURRENCY = 3;

export type TriageCity = { id: string; city: string; state: string | null };

export type TriageAssignment = {
  /** 1-based, matching the order CVs were submitted. */
  cvIndex: number;
  /** Candidate's name as read off the CV — the chip label in the review UI. */
  name: string;
  /** A city id, or null when the CV gives no usable signal. */
  locationId: string | null;
  confidence: "high" | "medium" | "low";
  /** What in the CV drove the call. Shown on the chip. */
  reason: string;
};

function triageSystemPrompt(cities: TriageCity[]): string {
  const list = cities
    .map((c) => `  - id "${c.id}" → ${c.city}${c.state ? `, ${c.state}` : ""}`)
    .join("\n");

  return `You are sorting a pile of CVs by which city's hiring pool each candidate belongs to.

The role is being hired in these cities:
${list}

For each CV, decide which ONE city it belongs to, weighing in this order:
1. An explicitly stated preferred/applied-for location.
2. Current residence — address, "based in X", current employer's city.
3. Most recent work or study location, if it is recent and the candidate has not clearly moved.
4. Language proficiency that only fits one of the cities, as a weak tie-breaker.

Rules:
- Return locationId as EXACTLY one of the id strings above, or null.
- Use null when the CV genuinely does not say, when the evidence points to a
  city that is NOT on the list, or when two listed cities are equally supported.
  A null costs the recruiter one drag; a confident wrong answer costs a
  candidate a fair reading. Prefer null when torn.
- confidence "high" = stated outright or current address; "medium" = inferred
  from recent employer/institution; "low" = weak or conflicting signal.
- reason: one short clause naming the actual evidence, e.g. "current address in
  Adyar, Chennai" or "last 3 years at an NGO in Bangalore". Never restate the
  city alone. Max 90 characters.
- name: the candidate's name from the CV. Use "CV <n>" if it is not stated.
- Return one object per CV, every cvIndex present exactly once.

Return ONLY a JSON object, no markdown fences, no commentary:
{"assignments":[{"cvIndex":1,"name":"...","locationId":"..."|null,"confidence":"high"|"medium"|"low","reason":"..."}]}`;
}

/**
 * Run the triage call. Returns one assignment per CV, in cvIndex order, with
 * anything the model got wrong or omitted coerced into a safe `null` bucket
 * rather than dropped — a missing CV would silently vanish from every desk.
 */
export async function triageCvs(
  cities: TriageCity[],
  cvs: { name: string; text: string }[],
): Promise<TriageAssignment[]> {
  const validIds = new Set(cities.map((c) => c.id));
  const system = triageSystemPrompt(cities);
  const client = new Anthropic();

  // Run the chunks with bounded concurrency. Unbounded would fire 4+ Opus
  // calls at once and contend for the same rate limit; serial would make an
  // 85-CV pool wait for ~4 round trips end to end.
  const chunks: { offset: number; slice: typeof cvs }[] = [];
  for (let i = 0; i < cvs.length; i += TRIAGE_CHUNK_SIZE) {
    chunks.push({ offset: i, slice: cvs.slice(i, i + TRIAGE_CHUNK_SIZE) });
  }

  const results: TriageAssignment[][] = new Array(chunks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(TRIAGE_CONCURRENCY, chunks.length) }, async () => {
      for (;;) {
        const n = next++;
        if (n >= chunks.length) return;
        results[n] = await triageChunk(client, system, validIds, chunks[n].slice, chunks[n].offset);
      }
    }),
  );

  return results.flat();
}

/**
 * One chunk = one model call. CVs are numbered 1..N *within the chunk* and the
 * returned indices are shifted back onto the global pool afterwards — asking
 * the model to keep track of a global offset is a needless way to get
 * off-by-one mis-assignments on a large pool.
 */
async function triageChunk(
  client: Anthropic,
  system: string,
  validIds: Set<string>,
  slice: { name: string; text: string }[],
  offset: number,
): Promise<TriageAssignment[]> {
  const userText = slice
    .map((cv, i) => `=== CV ${i + 1} of ${slice.length}: ${cv.name} ===\n${cv.text.slice(0, TRIAGE_CHARS_PER_CV) || "(no readable text)"}`)
    .join("\n\n");

  let raw = "";
  try {
    const msg = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: TRIAGE_MAX_TOKENS,
      system,
      messages: [{ role: "user", content: userText }],
    });
    raw = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  } catch (e) {
    // One failed chunk must not lose the whole run — its CVs fall through to
    // Unsorted (coerceAssignments handles the empty string) and the recruiter
    // places them by hand. The other chunks are unaffected.
    //
    // But LOG it. A systematic failure (bad key, rate limit, renamed model)
    // makes every chunk fail, and silently that is indistinguishable from
    // "the model couldn't place these CVs" — the recruiter sees a full
    // Unsorted column and no reason anywhere.
    console.error(
      `[recruitment-triage] chunk at offset ${offset} failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    raw = "";
  }

  return coerceAssignments(raw, validIds, slice.map((c) => c.name)).map((a) => ({
    ...a,
    cvIndex: a.cvIndex + offset,
  }));
}

/**
 * Turn whatever the model returned into exactly one assignment per CV.
 *
 * Split out from the API call so it can be tested directly — this is the part
 * that decides whether a malformed response loses a candidate or files one
 * under a city that was never offered, and neither failure is visible in the
 * finished doc. Every path lands a CV somewhere; nothing is ever dropped.
 *
 * Exported for tests and for the route; not part of the public flow.
 */
export function coerceAssignments(
  raw: string,
  validIds: Set<string>,
  cvNames: string[],
): TriageAssignment[] {
  let parsed: { assignments?: unknown };
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, ""));
  } catch {
    // Unparseable triage is not fatal: everything falls into Unsorted and the
    // recruiter sorts by hand. Losing the assist beats losing the run.
    return cvNames.map((name, i) => unsorted(i + 1, name, "Could not read the sorting result — assign manually."));
  }

  const byIndex = new Map<number, TriageAssignment>();
  for (const row of Array.isArray(parsed.assignments) ? parsed.assignments : []) {
    const r = row as Partial<TriageAssignment>;
    const idx = Number(r.cvIndex);
    // First write wins on a duplicate cvIndex, and an index outside the pool is
    // discarded — it refers to a CV that was never submitted.
    if (!Number.isInteger(idx) || idx < 1 || idx > cvNames.length || byIndex.has(idx)) continue;
    // A hallucinated id must not become a silent mis-assignment.
    const locationId = typeof r.locationId === "string" && validIds.has(r.locationId) ? r.locationId : null;
    byIndex.set(idx, {
      cvIndex: idx,
      name: String(r.name || "").trim().slice(0, 80) || `CV ${idx}`,
      locationId,
      confidence: r.confidence === "high" || r.confidence === "medium" ? r.confidence : "low",
      reason: String(r.reason || "").trim().slice(0, 120) || (locationId ? "No reason given." : "No usable location signal in the CV."),
    });
  }

  return cvNames.map((name, i) =>
    byIndex.get(i + 1) ?? unsorted(i + 1, name, "The sorter skipped this CV — assign manually."),
  );
}

function unsorted(cvIndex: number, name: string, reason: string): TriageAssignment {
  return { cvIndex, name: name || `CV ${cvIndex}`, locationId: null, confidence: "low", reason };
}
