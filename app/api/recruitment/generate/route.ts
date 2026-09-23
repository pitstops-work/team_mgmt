import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import { generateDesk } from "@/lib/recruitment/generateDesk";

// POST /api/recruitment/generate
//   body: { title, date, context, jobId, locationId, unplaced, batchId, cvs }
//
// Builds ONE desk from an uploaded pool. Single-city runs (and JD-less
// one-offs) come here straight from the upload form. A multi-city run does
// NOT: it posts a plan to /api/recruitment/batch/start and the batch runner
// calls generateDesk() server-side, once per desk, so the run survives the
// browser closing (see lib/recruitment/batchRunner.ts).

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const ctx = await buildRbacContext(session, { req: request });
  if (!(await can(ctx, "recruitment", "create"))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const result = await generateDesk({
    title: String(body?.title || "").trim(),
    date: String(body?.date || "").trim(),
    context: String(body?.context || "").trim(),
    jobId: typeof body?.jobId === "string" && body.jobId ? String(body.jobId) : null,
    // Which of the JD's cities this scouting day is for. Optional: a
    // single-city JD resolves on its own; a multi-city one requires it.
    locationId: typeof body?.locationId === "string" && body.locationId ? String(body.locationId) : null,
    unplaced: body?.unplaced === true,
    batchId: typeof body?.batchId === "string" && body.batchId ? String(body.batchId).slice(0, 64) : null,
    cvs: Array.isArray(body?.cvs) ? body.cvs : [],
    session,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ slug: result.slug });
}
