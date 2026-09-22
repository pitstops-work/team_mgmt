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

  const userText = cvs
    .map((cv, i) => `=== CV ${i + 1} of ${cvs.length}: ${cv.name} ===\n${cv.text.slice(0, TRIAGE_CHARS_PER_CV) || "(no readable text)"}`)
    .join("\n\n");

  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4_000,
    system: triageSystemPrompt(cities),
    messages: [{ role: "user", content: userText }],
  });

  const raw = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return coerceAssignments(raw, validIds, cvs.map((c) => c.name));
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
