/**
 * Build one scouting desk from freshly uploaded CVs.
 *
 * This is the core of `POST /api/recruitment/generate`, lifted out of the
 * route so it can also be driven by the batch runner, which builds a
 * multi-city run's desks server-side with no browser attached
 * (lib/recruitment/batchRunner.ts). The route is now request parsing plus a
 * call to this; there is exactly one implementation of "scout a pool".
 *
 * Sibling entry points, all sharing the same prompt and persistence shape:
 *   - createDeskForCity  — desk opened on demand from already-extracted text
 *   - appendCandidates   — more CVs onto a desk that exists
 */

import { access } from "fs/promises";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { del, get, list, put } from "@vercel/blob";
import prisma from "@/lib/prisma";
import { extractCv, UnsupportedCvError } from "@/lib/recruitment/extractCv";
import { renderScoutingDoc, type ScoutDocData } from "@/lib/recruitment/renderDoc";
import {
  buildSystemPrompt,
  jobSnapshotFromRow,
  jobSnapshotUnplaced,
  SCOUT_MAX_TOKENS,
  type JobSnapshot,
} from "@/lib/recruitment/systemPrompt";
import { resolveDayLocation } from "@/lib/recruitment/locations";
import type { CvRef } from "@/lib/recruitment/scoutingDayOps";

type SessionLike = { user?: { id?: string; name?: string | null } | null } | null;

export type GenerateDeskResult = { ok: true; slug: string } | { ok: false; status: number; error: string };

// ── One-off / legacy fallback JD ─────────────────────────────────────────────
// When the upload form doesn't pick a saved JD (jobless one-off runs, or the
// legacy `context` free-text path), we synthesise a minimal JobSnapshot from
// the request fields so the prompt template still has something to render.
// The scouting-day row still gets written; `jobId` stays null.
function fallbackSnapshot(title: string, context: string): JobSnapshot {
  return {
    title: title || "Unspecified role",
    seniority: null,
    dayToDay: "",
    mustHaves: [],
    niceToHaves: [],
    hardDisqualifiers: [],
    salaryBand: null,
    theme: "football",
    notes: context,
    redFlagRules: [],
    yellowFlagRules: [],
    scrutiniseFor: [],
    lockedAxes: [],
    location: {
      city: "—",
      state: null,
      country: "IN",
      primaryLanguage: null,
      localReferenceOrgs: [],
      localRedFlags: [],
      mobilityDefault: null,
      notes: "",
    },
  };
}

async function uniqueSlug(base: string): Promise<string> {
  const taken = new Set<string>();
  try {
    const { blobs } = await list({ prefix: "recruitment/docs/" });
    for (const b of blobs) {
      const m = b.pathname.match(/^recruitment\/docs\/([a-z0-9-]+)\.html$/);
      if (m) taken.add(m[1]);
    }
  } catch {
    /* blob store unreachable — fs + DB check below still apply */
  }
  // Also reserve slugs already taken by DB rows (scouting days created from a
  // previous generate that succeeded to DB but where the blob store was
  // unreachable — we don't want to collide on the next run).
  const rows = await prisma.recruitmentScoutingDay.findMany({
    select: { slug: true },
    where: { slug: { startsWith: base } },
  });
  for (const r of rows) taken.add(r.slug);

  let slug = base;
  for (let n = 2; ; n++) {
    const onFs = await access(path.join(process.cwd(), "content", "recruitment", `${slug}.html`))
      .then(() => true)
      .catch(() => false);
    if (!onFs && !taken.has(slug)) return slug;
    slug = `${base}-${n}`;
  }
}

/** Blob refs the client hands us must point at our own temp-CV area. */
export function invalidCvRef(cvs: CvRef[]): string | null {
  for (const cv of cvs) {
    let u: URL;
    try {
      u = new URL(cv.url);
    } catch {
      return "Invalid CV reference";
    }
    if (!u.hostname.endsWith(".blob.vercel-storage.com") || !u.pathname.includes("recruitment/cv-tmp/")) {
      return "Invalid CV reference";
    }
  }
  return null;
}

export async function generateDesk(input: {
  title: string;
  /** ISO date string, or "" for an undated desk. */
  date: string;
  /** Free-text brief. Only used on JD-less runs — a picked JD supplies its own. */
  context: string;
  jobId: string | null;
  locationId: string | null;
  /** Desk for the CVs triage could not place. No city context goes into the prompt. */
  unplaced: boolean;
  batchId: string | null;
  cvs: CvRef[];
  session: SessionLike;
}): Promise<GenerateDeskResult> {
  const { title, date, context, jobId, locationId, unplaced, batchId, cvs, session } = input;
  if (!title || cvs.length === 0) {
    return { ok: false, status: 400, error: "Title and at least one CV are required" };
  }
  const bad = invalidCvRef(cvs);
  if (bad) return { ok: false, status: 400, error: bad };

  // Resolve the JD snapshot — either a saved JD, or a minimal fallback derived
  // from the request body. Snapshot is frozen into RecruitmentScoutingDay.jobSnapshotJson
  // below so subsequent JD edits don't retroactively rewrite this scouting day.
  let snapshot: JobSnapshot;
  // Which city this day runs in. A JD can span several; the prompt takes
  // exactly one (see lib/recruitment/locations.ts). Null for JD-less runs.
  let dayLocationId: string | null = null;
  if (jobId) {
    const job = await prisma.recruitmentJob.findUnique({
      where: { id: jobId },
      include: { location: true, locations: { orderBy: { city: "asc" } } },
    });
    if (!job) return { ok: false, status: 404, error: "Selected JD not found" };
    if (job.archivedAt) return { ok: false, status: 400, error: "Selected JD is archived" };

    if (unplaced) {
      // No city to resolve — that is the point of this desk. locationId stays
      // null, and the prompt is told the location is unknown rather than
      // inheriting the primary city's language and reference orgs.
      snapshot = jobSnapshotUnplaced(job);
    } else {
      // Fall back to the primary for JDs created before the multi-location
      // migration backfilled their membership rows.
      const candidates = job.locations.length > 0 ? job.locations : [job.location];
      const picked = resolveDayLocation(candidates, job.locationId, locationId);
      if ("error" in picked) return { ok: false, status: 400, error: picked.error };

      dayLocationId = picked.location.id;
      snapshot = jobSnapshotFromRow(job, picked.location);
    }
  } else {
    snapshot = fallbackSnapshot(title, context);
  }

  // 1. Pull + extract each CV
  const userContent: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: [
        `Interview-day title: ${title}`,
        date ? `Interview date: ${date}` : null,
        `Number of candidates: ${cvs.length}`,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];

  // Track the extracted text per CV in the same order as `cvs` — the LLM
  // will return cvIndex per candidate so we can attach the right blob back.
  const extractedTexts: string[] = [];
  for (let i = 0; i < cvs.length; i++) {
    // Private blobs need the store token — a plain fetch of the URL 401s.
    const got = await get(cvs[i].url, { access: "private" });
    if (got?.statusCode !== 200) {
      return {
        ok: false,
        status: 502,
        error: `Could not read CV "${cvs[i].name}". If an earlier run already built some desks, its CVs were consumed then — re-upload and start a fresh run.`,
      };
    }
    const buffer = Buffer.from(await new Response(got.stream).arrayBuffer());
    let text: string, images: Awaited<ReturnType<typeof extractCv>>["images"];
    try {
      ({ text, images } = await extractCv(buffer));
    } catch (e) {
      // A file we can identify but can't read (legacy .doc, image-only docx).
      // Name the CV — with a pool of 30 the recruiter needs to know which one.
      if (e instanceof UnsupportedCvError) return { ok: false, status: 400, error: `"${cvs[i].name}": ${e.message}` };
      throw e;
    }
    extractedTexts.push(text || "");
    userContent.push({ type: "text", text: `=== CV ${i + 1} of ${cvs.length}: ${cvs[i].name} ===\n${text || "(scanned — see page images below)"}` });
    for (const img of images) {
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.buffer.toString("base64") },
      });
    }
  }

  // 2. One Claude call → scouting JSON
  const client = new Anthropic();
  const stream = client.messages.stream({
    model: "claude-opus-4-7",
    max_tokens: SCOUT_MAX_TOKENS,
    system: buildSystemPrompt(snapshot),
    messages: [{ role: "user", content: userContent }],
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
    console.error("[recruitment-generate] unparseable model output:", raw.slice(0, 500));
    return { ok: false, status: 502, error: "Model returned unparseable output — try again" };
  }
  if (!Array.isArray(data.candidates) || data.candidates.length === 0) {
    return { ok: false, status: 502, error: "Model returned no candidates — try again" };
  }
  data.selector = session?.user?.name || "The Selector";

  // Attach each candidate's original CV text back to the row via cvIndex.
  // Kept in snapshotJson only — cleanCandidate in renderDoc.ts drops it before
  // HTML rendering. Falls back to empty string if the LLM omitted cvIndex or
  // pointed out of range; regenerate degrades to scout prose in that case.
  data.candidates = data.candidates.map((c) => {
    const idx = typeof c.cvIndex === "number" ? c.cvIndex : 0;
    const cvText = idx >= 1 && idx <= extractedTexts.length ? extractedTexts[idx - 1] : "";
    return { ...c, cvIndex: idx || undefined, cvText };
  });

  // 3. Render + persist. Blob = render cache; DB row = source of truth.
  const base =
    title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "scouting-day";
  const slug = await uniqueSlug(base);
  const html = renderScoutingDoc(slug, data);
  const putResult = await put(`recruitment/docs/${slug}.html`, html, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "text/html; charset=utf-8",
  });

  await prisma.recruitmentScoutingDay.create({
    data: {
      slug,
      jobId,
      locationId: dayLocationId,
      batchId,
      matchday: date ? new Date(date) : null,
      title,
      // Cast: Prisma's JSON input type is picky about our structured shapes; DB
      // just stores JSONB. Same trick as RecruitmentScoutState.stateJson.
      jobSnapshotJson: snapshot as unknown as never,
      snapshotJson: data as unknown as never,
      renderedBlobUrl: putResult.url,
      createdById: session?.user?.id ?? null,
    },
  });

  // 4. Clean up temp CVs (best-effort)
  // Keep the CVs while a BATCH is in flight. A batch builds several desks
  // across several steps, and deleting each desk's inputs the moment it
  // succeeds makes the whole run un-retryable: a resume re-reads desk 1's
  // CVs, which no longer exist, and reports "Could not read CV <name>" —
  // which reads like a corrupt file and is nothing of the sort. The runner
  // deletes them once the whole run completes.
  if (!batchId) await Promise.allSettled(cvs.map((cv) => del(cv.url)));

  return { ok: true, slug };
}
