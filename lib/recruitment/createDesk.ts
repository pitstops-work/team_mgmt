/**
 * Create a scouting desk for a city that doesn't have one yet, from candidates
 * we already hold CV text for.
 *
 * Reached when someone allocates a candidate to a city whose desk was never
 * generated — triage found nobody for it, so the batch skipped it. Rather than
 * blocking the move, the desk is created on demand and joins the same batch.
 *
 * This is the generate flow minus the upload: same system prompt, same city
 * context, same persistence shape as app/api/recruitment/generate/route.ts,
 * but fed from stored text instead of blobs.
 */

import Anthropic from "@anthropic-ai/sdk";
import { put } from "@vercel/blob";
import prisma from "@/lib/prisma";
import { renderScoutingDoc, type ScoutDocData } from "@/lib/recruitment/renderDoc";
import {
  buildSystemPrompt,
  jobSnapshotFromRow,
  SCOUT_MAX_TOKENS,
} from "@/lib/recruitment/systemPrompt";
import type { RecruitmentJob } from "@/app/generated/prisma/client";

type SessionLike = { user?: { id?: string; name?: string | null } | null } | null;

export type CreateDeskResult =
  | { ok: true; slug: string; addedIds: string[] }
  | { ok: false; status: number; error: string };

/**
 * DB-only uniqueness. The generate route also checks the blob store and the
 * committed-docs folder, which matters when it is minting a slug from a
 * user-supplied title; here the base already contains a city and a JD title,
 * so a DB collision check plus a numeric suffix is sufficient.
 */
async function uniqueSlug(base: string): Promise<string> {
  const taken = new Set(
    (await prisma.recruitmentScoutingDay.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } }))
      .map((r) => r.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export async function createDeskForCity(opts: {
  job: RecruitmentJob;
  location: { id: string; city: string; state: string | null; country: string; primaryLanguage: string | null; localReferenceOrgs: string[]; localRedFlags: string[]; mobilityDefault: string | null; notes: string };
  titleBase: string;
  matchday: Date | null;
  batchId: string | null;
  items: { name: string; text: string }[];
  session: SessionLike;
}): Promise<CreateDeskResult> {
  const { job, location, titleBase, matchday, batchId, items, session } = opts;
  if (items.length === 0) return { ok: false, status: 400, error: "Nothing to scout" };

  const snapshot = jobSnapshotFromRow(job, location);
  const title = `${titleBase} — ${location.city}`;

  const header: Anthropic.ContentBlockParam = {
    type: "text",
    text: [
      `Interview-day title: ${title}`,
      matchday ? `Interview date: ${matchday.toISOString().slice(0, 10)}` : null,
      `Number of candidates: ${items.length}`,
      `Note: this desk is being opened for ${location.city} because a candidate was allocated here from another desk.`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
  const blocks: Anthropic.ContentBlockParam[] = items.map((it, i) => ({
    type: "text",
    text: `=== CV ${i + 1} of ${items.length}: ${it.name} ===\n${it.text}`,
  }));

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: "claude-opus-4-7",
    max_tokens: SCOUT_MAX_TOKENS,
    system: buildSystemPrompt(snapshot),
    messages: [{ role: "user", content: [header, ...blocks] }],
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
    console.error("[recruitment-create-desk] unparseable model output:", raw.slice(0, 500));
    return { ok: false, status: 502, error: "Model returned unparseable output — try again" };
  }
  if (!Array.isArray(data.candidates) || data.candidates.length === 0) {
    return { ok: false, status: 502, error: "Model returned no candidates — try again" };
  }
  data.selector = session?.user?.name || "The Selector";

  // Same cvIndex → cvText pairing the generate route does, so the new desk's
  // candidates can themselves be re-scouted or moved on later.
  data.candidates = data.candidates.map((c) => {
    const idx = typeof c.cvIndex === "number" ? c.cvIndex : 0;
    return { ...c, cvIndex: idx || undefined, cvText: idx >= 1 && idx <= items.length ? items[idx - 1].text : "" };
  });

  const base =
    title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "scouting-day";
  const slug = await uniqueSlug(base);

  // Best-effort blob cache; loadDoc renders new desks from snapshotJson.
  let blobUrl: string | null = null;
  try {
    blobUrl = (await put(`recruitment/docs/${slug}.html`, renderScoutingDoc(slug, data), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "text/html; charset=utf-8",
    })).url;
  } catch (e) {
    console.error(`[recruitment-create-desk] blob write failed for ${slug} (DB still authoritative):`, e instanceof Error ? e.message : e);
  }

  await prisma.recruitmentScoutingDay.create({
    data: {
      slug,
      jobId: job.id,
      locationId: location.id,
      batchId,
      matchday,
      title,
      jobSnapshotJson: snapshot as unknown as never,
      snapshotJson: data as unknown as never,
      renderedBlobUrl: blobUrl,
      createdById: session?.user?.id ?? null,
    },
  });

  return { ok: true, slug, addedIds: data.candidates.map((c) => c.id) };
}
