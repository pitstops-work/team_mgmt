/**
 * Shared implementations for the two ways of adding CVs to an existing
 * scouting day: append (new candidates only, scored on the doc's existing
 * axes) and regenerate (full re-scout, fresh axes, existing candidates
 * re-scored using their saved cvText as evidence).
 *
 * Both are called from `POST /api/recruitment/[slug]/add-cvs` — the endpoint
 * decides which via `decideMode()` and dispatches. The endpoints previously
 * living at /add-cvs and /regenerate are consolidated here so the choice is
 * server-driven, not user-driven (see docs above `decideMode` for the rule).
 */

import Anthropic from "@anthropic-ai/sdk";
import { del, get, put } from "@vercel/blob";
import prisma from "@/lib/prisma";
import { extractCv, UnsupportedCvError } from "@/lib/recruitment/extractCv";
import { renderScoutingDoc, type ScoutCandidate, type ScoutDocData } from "@/lib/recruitment/renderDoc";
import {
  buildAppendSystemPrompt,
  buildRegenerateSystemPrompt,
  APPEND_MAX_TOKENS,
  SCOUT_MAX_TOKENS,
  type JobSnapshot,
} from "@/lib/recruitment/systemPrompt";

export type CvRef = { url: string; name: string };

type SessionLike = { user?: { id?: string; name?: string | null } | null } | null;

async function extractAll(cvs: CvRef[]): Promise<{
  extractedTexts: string[];
  userBlocks: Anthropic.ContentBlockParam[];
  error?: string;
}> {
  const extractedTexts: string[] = [];
  const userBlocks: Anthropic.ContentBlockParam[] = [];
  for (let i = 0; i < cvs.length; i++) {
    const got = await get(cvs[i].url, { access: "private" });
    if (got?.statusCode !== 200) {
      return {
        extractedTexts,
        userBlocks,
        error: `Could not read CV "${cvs[i].name}". If an earlier run already used it, re-upload and start a fresh run.`,
      };
    }
    const buffer = Buffer.from(await new Response(got.stream).arrayBuffer());
    let text: string, images: Awaited<ReturnType<typeof extractCv>>["images"];
    try {
      ({ text, images } = await extractCv(buffer));
    } catch (e) {
      // Surfaced to the recruiter as-is by the add-cvs route.
      if (e instanceof UnsupportedCvError) {
        return { extractedTexts, userBlocks, error: `"${cvs[i].name}": ${e.message}` };
      }
      throw e;
    }
    extractedTexts.push(text || "");
    userBlocks.push({
      type: "text",
      text: `=== NEW CV ${i + 1} of ${cvs.length}: ${cvs[i].name} ===\n${text || "(scanned — see page images below)"}`,
    });
    for (const img of images) {
      userBlocks.push({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.buffer.toString("base64") },
      });
    }
  }
  return { extractedTexts, userBlocks };
}

/**
 * Write the new pool to the DB, and refresh the blob copy.
 *
 * The DB row is the source of truth: loadDoc (app/api/recruitment/[slug]/
 * route.ts) re-renders from snapshotJson on every request, so the blob is a
 * cache. A blob failure must therefore NOT abort the operation — by the time
 * we get here the model call is already paid for, and throwing would lose the
 * result while the desk itself would have rendered fine from the DB.
 */
async function persist(slug: string, data: ScoutDocData): Promise<string | null> {
  const html = renderScoutingDoc(slug, data);
  let url: string | null = null;
  try {
    url = (await put(`recruitment/docs/${slug}.html`, html, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "text/html; charset=utf-8",
    })).url;
  } catch (e) {
    console.error(`[recruitment-persist] blob refresh failed for ${slug} (DB still authoritative):`, e instanceof Error ? e.message : e);
  }
  await prisma.recruitmentScoutingDay.update({
    where: { slug },
    data: {
      snapshotJson: data as unknown as never,
      ...(url ? { renderedBlobUrl: url } : {}),
    },
  });
  return url;
}

// ── Append ──────────────────────────────────────────────────────────────────

export type OpResult =
  | { ok: true; slug: string; mode: "append" | "regenerate"; addedCount: number; totalCount: number }
  | { ok: false; status: number; error: string };

export async function appendCandidates(
  slug: string,
  cvs: CvRef[],
  _session: SessionLike,
  opts: { keepCvs?: boolean } = {},
): Promise<OpResult> {
  if (cvs.length === 0) return { ok: false, status: 400, error: "At least one CV is required to append" };
  const { extractedTexts, userBlocks, error } = await extractAll(cvs);
  if (error) return { ok: false, status: 502, error };

  const res = await appendExtracted(
    slug,
    cvs.map((cv, i) => ({ name: cv.name, text: extractedTexts[i] ?? "" })),
    userBlocks,
  );
  if (!res.ok) return res;
  // `keepCvs` is the batch builder: a run that deletes its own inputs as it
  // goes cannot be retried. It cleans up once, at the end.
  if (!opts.keepCvs) await Promise.allSettled(cvs.map((cv) => del(cv.url)));
  return { ok: true, slug, mode: "append", addedCount: res.addedIds.length, totalCount: res.totalCount };
}

/**
 * Append candidates whose CV text we ALREADY have, with no blob to read.
 *
 * Split out of appendCandidates so a candidate can be moved between desks
 * using the `cvText` persisted on them at generation time — the original CV
 * blob is deleted once a desk is built, so a move has no file to re-extract.
 * Returns the new ids, which the caller needs to carry the team's scores and
 * notes across to the candidate's new home.
 *
 * `userBlocks` lets the blob path pass richer content (page images for a
 * scanned CV); the text-only path builds plain text blocks.
 */
export type AppendOutcome =
  | { ok: true; addedIds: string[]; totalCount: number }
  | { ok: false; status: number; error: string };

export async function appendExtracted(
  slug: string,
  items: { name: string; text: string }[],
  userBlocksIn?: Anthropic.ContentBlockParam[],
): Promise<AppendOutcome> {
  if (items.length === 0) return { ok: false, status: 400, error: "Nothing to append" };
  const extractedTexts = items.map((i) => i.text);
  const userBlocks: Anthropic.ContentBlockParam[] =
    userBlocksIn ??
    items.map((it, i) => ({
      type: "text",
      text: `=== NEW CV ${i + 1} of ${items.length}: ${it.name} ===\n${it.text || "(no CV text stored — see prior scout notes above)"}`,
    }));

  const day = await prisma.recruitmentScoutingDay.findUnique({ where: { slug } });
  if (!day) return { ok: false, status: 404, error: "Scouting day not found (or a legacy blob-only doc that can't be extended)" };
  if (!day.jobSnapshotJson || !day.snapshotJson) {
    return { ok: false, status: 400, error: "This scouting day is missing its saved snapshot — extend not supported" };
  }

  const snapshot = day.jobSnapshotJson as unknown as JobSnapshot;
  const existing = day.snapshotJson as unknown as ScoutDocData;
  const existingIds = new Set(existing.candidates.map((c) => c.id));
  const existingSummaries = existing.candidates.map(
    (c) => `${c.name} (id: ${c.id}, code: ${c.code}) — ${c.pos}${c.meta ? " · " + c.meta : ""}`,
  );

  const header: Anthropic.ContentBlockParam = {
    type: "text",
    text: [
      `Interview-day title: ${day.title}`,
      day.matchday ? `Interview date: ${day.matchday.toISOString().slice(0, 10)}` : null,
      `Existing pool size: ${existing.candidates.length}`,
      `Number of NEW candidates to score: ${items.length}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: "claude-opus-4-7",
    max_tokens: APPEND_MAX_TOKENS,
    system: buildAppendSystemPrompt(snapshot, existing.axes, existingSummaries),
    messages: [{ role: "user", content: [header, ...userBlocks] }],
  });
  const msg = await stream.finalMessage();
  const raw = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: { candidates: ScoutCandidate[] };
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, ""));
  } catch {
    console.error("[recruitment-append] unparseable model output:", raw.slice(0, 500));
    return { ok: false, status: 502, error: "Model returned unparseable output — try again" };
  }
  if (!Array.isArray(parsed.candidates) || parsed.candidates.length === 0) {
    return { ok: false, status: 502, error: "Model returned no new candidates — try again" };
  }

  // Dedupe ids against existing + within batch; attach cvText via cvIndex.
  const seenIds = new Set(existingIds);
  const addedCandidates: ScoutCandidate[] = parsed.candidates.map((c) => {
    let id = c.id;
    for (let n = 2; seenIds.has(id); n++) id = `${c.id}-${n}`;
    seenIds.add(id);
    const idx = typeof c.cvIndex === "number" ? c.cvIndex : 0;
    const cvText = idx >= 1 && idx <= extractedTexts.length ? extractedTexts[idx - 1] : "";
    return { ...c, id, cvIndex: idx || undefined, cvText };
  });

  const merged: ScoutDocData = { ...existing, candidates: [...existing.candidates, ...addedCandidates] };
  await persist(slug, merged);

  return { ok: true, addedIds: addedCandidates.map((c) => c.id), totalCount: merged.candidates.length };
}

// ── Regenerate ──────────────────────────────────────────────────────────────

export async function regenerateScoutingDay(
  slug: string,
  cvs: CvRef[],
  session: SessionLike,
): Promise<OpResult> {
  const day = await prisma.recruitmentScoutingDay.findUnique({ where: { slug } });
  if (!day) return { ok: false, status: 404, error: "Scouting day not found (or a legacy blob-only doc that can't be regenerated)" };
  if (!day.jobSnapshotJson || !day.snapshotJson) {
    return { ok: false, status: 400, error: "This scouting day is missing its saved snapshot — regenerate not supported" };
  }
  const snapshot = day.jobSnapshotJson as unknown as JobSnapshot;
  const existing = day.snapshotJson as unknown as ScoutDocData;

  if (cvs.length === 0 && existing.candidates.length === 0) {
    return { ok: false, status: 400, error: "Nothing to scout — the pool is empty and no new CVs provided" };
  }

  const header: Anthropic.ContentBlockParam = {
    type: "text",
    text: [
      `Interview-day title: ${day.title}`,
      day.matchday ? `Interview date: ${day.matchday.toISOString().slice(0, 10)}` : null,
      `Prior pool size: ${existing.candidates.length}`,
      `New CVs to add: ${cvs.length}`,
      `Total pool to scout: ${existing.candidates.length + cvs.length}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };

  const existingBlocks: Anthropic.ContentBlockParam[] = [];
  if (existing.candidates.length > 0) {
    // Prefer the saved CV text as evidence; fall back to scout prose for
    // pre-cvText docs. The dossier tells the model which id to reuse for each
    // person so team scores keyed to that id stay linked.
    const dossier = existing.candidates
      .map((c) => {
        const evidence = c.cvText && c.cvText.trim()
          ? `CV text extract:\n${c.cvText}`
          : `Prior scout notes (no CV text stored for this candidate):\n${c.scout}\nPrior meta: ${c.meta}\nPrior positional read: ${c.pos}\nPrior flags: ${(c.flags || []).map(([sev, txt]) => `[${sev}] ${txt}`).join(" | ") || "(none)"}`;
        return `--- EXISTING CANDIDATE — id: ${c.id}, code: ${c.code} ---\nName: ${c.name}\n${evidence}`;
      })
      .join("\n\n");
    existingBlocks.push({
      type: "text",
      text: `Existing candidates — you MUST reuse the exact ids above for these people so team scores stay linked. Where CV text is available, treat it as the primary evidence.\n\n${dossier}`,
    });
  }

  const { extractedTexts, userBlocks, error } = await extractAll(cvs);
  if (error) return { ok: false, status: 502, error };

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: "claude-opus-4-7",
    max_tokens: SCOUT_MAX_TOKENS,
    system: buildRegenerateSystemPrompt(snapshot),
    messages: [{ role: "user", content: [header, ...existingBlocks, ...userBlocks] }],
  });
  const msg = await stream.finalMessage();
  const raw = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let data: ScoutDocData;
  try {
    data = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, ""));
  } catch {
    console.error("[recruitment-regenerate] unparseable model output:", raw.slice(0, 500));
    return { ok: false, status: 502, error: "Model returned unparseable output — try again" };
  }
  if (!Array.isArray(data.candidates) || data.candidates.length === 0) {
    return { ok: false, status: 502, error: "Model returned no candidates — try again" };
  }
  data.selector = session?.user?.name || existing.selector || "The Selector";

  // Enforce id preservation via name match, and attach cvText.
  // - Existing candidates: pull their prior id + their prior cvText forward.
  // - New candidates: attach cvText via cvIndex from the new CV batch.
  const existingByName = new Map(
    existing.candidates.map((c) => [c.name.trim().toLowerCase(), c]),
  );
  const seenIds = new Set<string>();
  data.candidates = data.candidates.map((c) => {
    const prior = existingByName.get((c.name || "").trim().toLowerCase());
    let id = prior?.id ?? c.id;
    for (let n = 2; seenIds.has(id); n++) id = `${prior?.id ?? c.id}-${n}`;
    seenIds.add(id);
    // Preserve prior cvText if this is a known existing candidate; otherwise
    // pair the new CV via cvIndex.
    let cvText = prior?.cvText ?? "";
    let cvIndex = prior?.cvIndex;
    if (!prior) {
      const idx = typeof c.cvIndex === "number" ? c.cvIndex : 0;
      if (idx >= 1 && idx <= extractedTexts.length) {
        cvText = extractedTexts[idx - 1];
        cvIndex = idx;
      }
    }
    return { ...c, id, cvIndex, cvText };
  });

  await persist(slug, data);
  await Promise.allSettled(cvs.map((cv) => del(cv.url)));

  return {
    ok: true,
    slug,
    mode: "regenerate",
    addedCount: cvs.length,
    totalCount: data.candidates.length,
  };
}
