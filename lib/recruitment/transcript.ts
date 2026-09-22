/**
 * Interview-transcript summarization for a single candidate.
 *
 * An interviewer uploads the DOCX/PDF transcript of their interview; this turns
 * it into a short structured read that sits beside their notes on the
 * candidate's card. It is deliberately NOT a scouting verdict — the scouting
 * desk already scores the CV pool against the JD. This summarizes what was
 * actually said in the room, so a second interviewer can catch up without
 * reading an hour of transcript.
 *
 * Grounding is the whole game here. A summary that invents a strength is worse
 * than no summary, because it reads exactly as confidently as a true one and
 * ends up informing a hiring decision. The prompt is written to refuse rather
 * than fill gaps, and coerceSummary() keeps a malformed response from becoming
 * a half-populated card.
 */

import Anthropic from "@anthropic-ai/sdk";

/**
 * Text budget for a transcript.
 *
 * A CV is capped at 24,000 chars (extractCv's default); a 60-90 minute
 * interview transcript runs 40,000-90,000. 120,000 covers a long interview
 * with headroom — roughly 30k tokens, about $0.15 at Opus input rates. Beyond
 * it we truncate, but we SAY SO: `truncated` rides back to the UI, because a
 * summary of the first half of an interview that claims to be a summary of the
 * interview is the failure mode worth spending a flag on.
 */
export const TRANSCRIPT_MAX_CHARS = 120_000;

/** Output ceiling. A summary is a few hundred tokens; 4,000 is generous and
 *  stays under the 16k guidance for a non-streaming call. */
export const TRANSCRIPT_MAX_TOKENS = 4_000;

/**
 * Upload size cap. Unlike CVs, a transcript comes through the function rather
 * than via a Blob client token (the scouting doc has no bundler and cannot
 * import the client SDK — see the route for the full reasoning), so Vercel's
 * 4.5 MB request-body limit applies. 4 MB leaves headroom for multipart
 * encoding. A text transcript is far below this: a 90-minute interview is
 * ~50-200 KB as DOCX. A file that exceeds it is almost always a scan, which
 * has no text layer to read anyway.
 */
export const TRANSCRIPT_MAX_BYTES = 4 * 1024 * 1024;

export type TranscriptSummary = {
  /** 2-5 bullets: what they demonstrated, each traceable to the transcript. */
  strengths: string[];
  /** 0-5 bullets: gaps, evasions, contradictions. Empty is a valid answer. */
  concerns: string[];
  /** 0-5 things a later interviewer should probe. */
  followUps: string[];
  /** One sentence the interviewer can react to. Never a hire/no-hire call. */
  verdictCue: string;
};

export const EMPTY_SUMMARY: TranscriptSummary = {
  strengths: [],
  concerns: [],
  followUps: [],
  verdictCue: "",
};

const SYSTEM = `You are summarizing the transcript of one job interview for the interviewer's own notes.

Return ONLY a JSON object, no markdown fences, no commentary:
{"strengths":["..."],"concerns":["..."],"followUps":["..."],"verdictCue":"..."}

Rules:
- Every item must be grounded in something actually said in this transcript. If
  the transcript does not support a point, leave it out. Do not infer from the
  candidate's job titles, employers, or education what they "probably" can do —
  summarize the conversation, not the CV.
- strengths: 2-5 items. What they showed, with the substance that showed it —
  "walked through de-escalating a caregiver dispute, named the steps" beats
  "good communication skills". Never a bare adjective.
- concerns: 0-5 items. Gaps, evasions, contradictions, questions they could not
  answer. An interview with no concerns is legitimate — return [] rather than
  manufacturing a weakness to look balanced.
- followUps: 0-5 specific things a later round should probe, drawn from what was
  left unresolved here.
- verdictCue: ONE sentence describing where this candidate is strong and where
  they are thin, for the interviewer to react to. Do NOT recommend hiring or
  rejecting — that call is the interviewer's, and this summary has not seen the
  other candidates.
- Keep each item under 160 characters. Plain text, no markdown, no bullets.
- If the transcript is too short, garbled, or is clearly not an interview, return
  empty arrays and set verdictCue to a plain statement of that.`;

/**
 * Coerce whatever the model returned into a usable summary.
 *
 * Split out from the API call so it is testable without spending credits, in
 * the same shape as coerceAssignments in triage.ts. Every path returns a valid
 * TranscriptSummary — a malformed response yields an empty one, which the UI
 * renders as "couldn't summarize", rather than a card half-populated with
 * whatever survived parsing.
 */
export function coerceSummary(raw: string): TranscriptSummary {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, ""));
  } catch {
    return { ...EMPTY_SUMMARY };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...EMPTY_SUMMARY };
  const o = parsed as Record<string, unknown>;

  const list = (v: unknown, cap: number): string[] =>
    (Array.isArray(v) ? v : [])
      .map((x) => String(x ?? "").trim().replace(/\s+/g, " ").slice(0, 200))
      .filter(Boolean)
      .slice(0, cap);

  return {
    strengths: list(o.strengths, 5),
    concerns: list(o.concerns, 5),
    followUps: list(o.followUps, 5),
    verdictCue: String(o.verdictCue ?? "").trim().replace(/\s+/g, " ").slice(0, 400),
  };
}

/** True when the model gave us nothing usable — the UI says so plainly. */
export function isEmptySummary(s: TranscriptSummary): boolean {
  return s.strengths.length === 0 && s.concerns.length === 0 && s.followUps.length === 0 && !s.verdictCue;
}

/**
 * One model call. `candidateName` is passed so the summary can refer to the
 * person rather than "the candidate", and so a transcript pasted against the
 * wrong candidate is easier to spot when read back.
 */
export async function summariseTranscript(
  text: string,
  candidateName: string,
  opts: { truncated?: boolean } = {},
): Promise<TranscriptSummary> {
  const header = [
    `Candidate: ${candidateName}`,
    opts.truncated
      ? "NOTE: this transcript was too long to include in full and has been cut off. Summarize only what is present, and do not speculate about what came after."
      : null,
    "",
    "Transcript:",
  ]
    .filter(Boolean)
    .join("\n");

  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: TRANSCRIPT_MAX_TOKENS,
    system: SYSTEM,
    messages: [{ role: "user", content: `${header}\n${text}` }],
  });

  const raw = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return coerceSummary(raw);
}
