import { NextRequest, NextResponse } from "next/server";
import { get, put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import { extractCv, UnsupportedCvError } from "@/lib/recruitment/extractCv";
import {
  summariseTranscript,
  isEmptySummary,
  TRANSCRIPT_MAX_CHARS,
  TRANSCRIPT_MAX_BYTES,
} from "@/lib/recruitment/transcript";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST /api/recruitment/[slug]/transcript   (multipart: file, candidateName)
//   → { blobUrl, name, words, truncated, summary }
//
// GET  /api/recruitment/[slug]/transcript?url=<blobUrl>
//   → { text, words, truncated }
//
// Upload an interview transcript for one candidate, keep the file, and return a
// structured summary of it. PERSISTS NO STATE — the summary goes back to the
// scouting doc, which writes it into the shared scout state via the existing
// /state PUT. Same review-before-save shape as jobs/extract.
//
// WHY MULTIPART AND NOT A CLIENT TOKEN. Every other upload here (upload-cv,
// upload-jd) issues a Vercel Blob client token so the browser uploads directly
// and dodges the 4.5 MB function-body cap. That is unavailable to this caller:
// the scouting desk is a standalone HTML document rendered from a template
// literal, with no bundler, so it cannot import `upload()` from
// @vercel/blob/client. The alternatives were hand-rolling Vercel's token
// handshake in vanilla JS (re-implementing an SDK wire protocol for a PII
// tool) or bridging to the parent React app over postMessage (a whole message
// protocol for a file picker). Neither is worth it here, because the size
// profile is different: a transcript is a text document — a 90-minute
// interview is ~50-200 KB as DOCX — where a CV may be a multi-megabyte scan.
// So the file comes through the function, and TRANSCRIPT_MAX_BYTES (4 MB) sits
// safely under the platform cap with a message that says so.
//
// Both verbs gated on `recruitment.read`, matching /state: attaching a
// transcript is the same class of act as scoring on the desk.

function blobUrlOk(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.endsWith(".blob.vercel-storage.com") && u.pathname.includes("recruitment/transcripts/");
  } catch {
    return false;
  }
}

/** Extract text, flagging truncation rather than hiding it. */
async function readTranscript(
  buffer: Buffer,
): Promise<{ text: string; truncated: boolean } | { error: string; status: number }> {
  try {
    // Ask for one char past the cap so a transcript sitting exactly at the
    // limit isn't reported as truncated.
    const { text } = await extractCv(buffer, { textOnly: true, maxChars: TRANSCRIPT_MAX_CHARS + 1 });
    const truncated = text.length > TRANSCRIPT_MAX_CHARS;
    return { text: truncated ? text.slice(0, TRANSCRIPT_MAX_CHARS) : text, truncated };
  } catch (e) {
    if (e instanceof UnsupportedCvError) return { error: e.message, status: 400 };
    throw e;
  }
}

const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  const ctx = await buildRbacContext(session, { req: request });
  if (!(await can(ctx, "recruitment", "read"))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    // A body over the platform cap is rejected at the edge before the handler
    // runs, and the rejection is not JSON — so this is the likeliest cause.
    return NextResponse.json(
      { error: "That file was too large to upload. Transcripts must be under 4 MB — export as .docx rather than a scanned PDF." },
      { status: 413 },
    );
  }

  const file = form.get("file");
  const candidateName = String(form.get("candidateName") || "").trim().slice(0, 120) || "the candidate";
  if (!file || typeof file === "string") return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > TRANSCRIPT_MAX_BYTES) {
    return NextResponse.json({ error: "Transcripts must be under 4 MB." }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Extract BEFORE storing: a file we can't read shouldn't leave PII sitting
  // in the blob store for nothing.
  const read = await readTranscript(buffer);
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: read.status });

  const words = countWords(read.text);
  if (words < 50) {
    return NextResponse.json(
      {
        error:
          "That file has almost no readable text. If it's a scan or a photo, there's no text layer to read — export the transcript as .docx or a text PDF.",
      },
      { status: 400 },
    );
  }

  const summary = await summariseTranscript(read.text, candidateName, { truncated: read.truncated });
  if (isEmptySummary(summary)) {
    return NextResponse.json({ error: "Could not summarise that transcript — try again." }, { status: 502 });
  }

  // Store only now that it's readable and summarised. Kept (not deleted like a
  // CV) so the summary can be checked against what was actually said; removed
  // with the desk by the DELETE in ../route.ts.
  const safeName = String((file as File).name || "transcript").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  let blobUrl: string;
  try {
    const stored = await put(`recruitment/transcripts/${slug}/${Date.now()}-${safeName}`, buffer, {
      access: "private",
      contentType: (file as File).type || "application/octet-stream",
      addRandomSuffix: true,
    });
    blobUrl = stored.url;
  } catch (e) {
    // The summary is the expensive part and it succeeded — don't throw it away
    // because storage failed. Return it without a blobUrl; the doc renders the
    // summary and simply omits the "view full transcript" link.
    console.error("[recruitment-transcript] blob store failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ blobUrl: null, name: safeName, words, truncated: read.truncated, summary });
  }

  return NextResponse.json({ blobUrl, name: safeName, words, truncated: read.truncated, summary });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await buildRbacContext(await auth(), { req: request });
  if (!(await can(ctx, "recruitment", "read"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await params;

  const url = request.nextUrl.searchParams.get("url") || "";
  if (!url || !blobUrlOk(url)) return NextResponse.json({ error: "Invalid transcript reference" }, { status: 400 });

  const got = await get(url, { access: "private" });
  if (got?.statusCode !== 200) return NextResponse.json({ error: "Could not read that transcript" }, { status: 502 });
  const buffer = Buffer.from(await new Response(got.stream).arrayBuffer());

  const read = await readTranscript(buffer);
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: read.status });

  return NextResponse.json({ text: read.text, words: countWords(read.text), truncated: read.truncated });
}
