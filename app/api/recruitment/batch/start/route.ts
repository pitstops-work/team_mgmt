/**
 * POST /api/recruitment/batch/start
 *   body: { title, date, context, jobId, desks: [{ key, label, locationId, unplaced, cvs }] }
 *
 * Hands a whole multi-city run to the server and returns immediately. The
 * browser's only job after this is to watch — it can be closed, and the run
 * carries on (see lib/recruitment/batchRunner.ts for why that matters).
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import { isRunId, kickDrain, selfOrigin, startBatchRun, type BatchDesk } from "@/lib/recruitment/batchRunner";
import { invalidCvRef } from "@/lib/recruitment/generateDesk";
import type { CvRef } from "@/lib/recruitment/scoutingDayOps";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const ctx = await buildRbacContext(session, { req: request });
  if (!(await can(ctx, "recruitment", "create"))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const title = String(body?.title || "").trim();
  const jobId = typeof body?.jobId === "string" && body.jobId ? String(body.jobId) : null;
  const rawDesks = Array.isArray(body?.desks) ? body.desks : [];
  if (!title) return NextResponse.json({ error: "A title is required" }, { status: 400 });

  const desks: Omit<BatchDesk, "slug" | "done">[] = [];
  for (const d of rawDesks) {
    const cvs: CvRef[] = Array.isArray(d?.cvs) ? d.cvs : [];
    if (cvs.length === 0) continue;
    const bad = invalidCvRef(cvs);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    desks.push({
      key: String(d?.key || d?.locationId || "__unplaced__"),
      label: String(d?.label || "Unplaced").slice(0, 80),
      locationId: typeof d?.locationId === "string" && d.locationId ? String(d.locationId) : null,
      unplaced: d?.unplaced === true || !d?.locationId,
      cvs,
    });
  }
  if (desks.length === 0) return NextResponse.json({ error: "No CVs to scout" }, { status: 400 });

  const { id } = await startBatchRun({
    title,
    date: String(body?.date || "").trim(),
    jobId,
    context: String(body?.context || "").trim(),
    desks,
    session,
    // Idempotency: a start whose response was lost gets retried by the
    // browser, and the same id must mean the same run, not a second one
    // building every desk again.
    id: isRunId(body?.runId) ? body.runId : undefined,
  });

  // Start the chain after the response — the recruiter gets the batch link
  // straight away rather than waiting on the first model call.
  const origin = selfOrigin(request.url);
  after(() => kickDrain(id, origin));

  return NextResponse.json({ batchId: id });
}
