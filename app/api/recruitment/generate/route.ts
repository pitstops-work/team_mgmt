import { NextRequest, NextResponse } from "next/server";
import { access } from "fs/promises";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { del, get, list, put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
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

export const runtime = "nodejs";
export const maxDuration = 300;

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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const ctx = await buildRbacContext(session, { req: request });
  if (!(await can(ctx, "recruitment", "create"))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const title = String(body?.title || "").trim();
  const date = String(body?.date || "").trim();
  const context = String(body?.context || "").trim();
  const jobId = typeof body?.jobId === "string" && body.jobId ? String(body.jobId) : null;
  // Which of the JD's cities this scouting day is for. Optional: a single-city
  // JD resolves on its own; a multi-city one requires it.
  const requestedLocationId =
    typeof body?.locationId === "string" && body.locationId ? String(body.locationId) : null;
  // Set when this desk is one city's slice of a multi-city run, so the sibling
  // desks can find each other. Opaque, client-generated, same for the whole run.
  const batchId =
    typeof body?.batchId === "string" && body.batchId ? String(body.batchId).slice(0, 64) : null;
  // An "unplaced" desk scouts the CVs triage could not assign to a city. It is
  // a real desk in every other respect — it just carries no local context, and
  // its candidates get allocated to a city from the desk itself.
  const unplaced = body?.unplaced === true;
  const cvs: { url: string; name: string }[] = Array.isArray(body?.cvs) ? body.cvs : [];
  if (!title || cvs.length === 0) {
    return NextResponse.json({ error: "Title and at least one CV are required" }, { status: 400 });
  }
  for (const cv of cvs) {
    const u = new URL(cv.url);
    if (!u.hostname.endsWith(".blob.vercel-storage.com") || !u.pathname.includes("recruitment/cv-tmp/")) {
      return NextResponse.json({ error: "Invalid CV reference" }, { status: 400 });
    }
  }

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
    if (!job) return NextResponse.json({ error: "Selected JD not found" }, { status: 404 });
    if (job.archivedAt) return NextResponse.json({ error: "Selected JD is archived" }, { status: 400 });

    if (unplaced) {
      // No city to resolve — that is the point of this desk. locationId stays
      // null, and the prompt is told the location is unknown rather than
      // inheriting the primary city's language and reference orgs.
      snapshot = jobSnapshotUnplaced(job);
    } else {
      // Fall back to the primary for JDs created before the multi-location
      // migration backfilled their membership rows.
      const candidates = job.locations.length > 0 ? job.locations : [job.location];
      const picked = resolveDayLocation(candidates, job.locationId, requestedLocationId);
      if ("error" in picked) return NextResponse.json({ error: picked.error }, { status: 400 });

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
      return NextResponse.json({ error: `Could not read CV "${cvs[i].name}"` }, { status: 502 });
    }
    const buffer = Buffer.from(await new Response(got.stream).arrayBuffer());
    let text: string, images: Awaited<ReturnType<typeof extractCv>>["images"];
    try {
      ({ text, images } = await extractCv(buffer));
    } catch (e) {
      // A file we can identify but can't read (legacy .doc, image-only docx).
      // Name the CV — with a pool of 30 the recruiter needs to know which one.
      if (e instanceof UnsupportedCvError) {
        return NextResponse.json({ error: `"${cvs[i].name}": ${e.message}` }, { status: 400 });
      }
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
    return NextResponse.json({ error: "Model returned unparseable output — try again" }, { status: 502 });
  }
  if (!Array.isArray(data.candidates) || data.candidates.length === 0) {
    return NextResponse.json({ error: "Model returned no candidates — try again" }, { status: 502 });
  }
  data.selector = session!.user?.name || "The Selector";

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
      createdById: session!.user?.id ?? null,
    },
  });

  // 4. Clean up temp CVs (best-effort)
  await Promise.allSettled(cvs.map((cv) => del(cv.url)));

  return NextResponse.json({ slug });
}
