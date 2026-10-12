import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import { needsChunking } from "@/lib/recruitment/chunking";
import { generateDesk } from "@/lib/recruitment/generateDesk";

// POST /api/recruitment/generate
//   body: { title, date, context, jobId, locationId, unplaced, batchId, cvs }
//
// Builds ONE desk from a SMALL uploaded pool, in one request. Anything over
// DESK_CHUNK goes to /api/recruitment/batch/start instead, which chunks it
// server-side so the run survives both the 300s ceiling and the browser
// closing (see lib/recruitment/batchRunner.ts) — as does every multi-city run,
// whatever its size.
//
// The size limit is enforced here and not only in the form: a client holding a
// stale bundle would otherwise still post a 50-CV pool, and the only thing
// that answers it is a 300s timeout with nothing built and no desk to resume.

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const ctx = await buildRbacContext(session, { req: request });
  if (!(await can(ctx, "recruitment", "create"))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const cvs = Array.isArray(body?.cvs) ? body.cvs : [];
  if (needsChunking(cvs.length)) {
    return NextResponse.json(
      {
        error:
          `${cvs.length} CVs is more than one scouting call can finish — a pool this size has to be built in ` +
          `chunks. Reload the page and start the run again; it will be handed to the server automatically.`,
      },
      { status: 413 },
    );
  }

  const result = await generateDesk({
    title: String(body?.title || "").trim(),
    date: String(body?.date || "").trim(),
    context: String(body?.context || "").trim(),
    jobId: typeof body?.jobId === "string" && body.jobId ? String(body.jobId) : null,
    // Which of the JD's cities this scouting day is for. Optional: a
    // single-city JD resolves on its own; a multi-city one requires it.
    locationId: typeof body?.locationId === "string" && body.locationId ? String(body.locationId) : null,
    unplaced: body?.unplaced === true,
    /** The ROLE has no city at all — different from `unplaced`, see generateDesk. */
    notCitySpecific: body?.notCitySpecific === true,
    batchId: typeof body?.batchId === "string" && body.batchId ? String(body.batchId).slice(0, 64) : null,
    cvs,
    session,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ slug: result.slug });
}
