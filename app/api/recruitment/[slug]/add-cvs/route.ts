import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import prisma from "@/lib/prisma";
import { kickDrain, selfOrigin, startBatchRun } from "@/lib/recruitment/batchRunner";
import { needsChunking } from "@/lib/recruitment/chunking";
import { decideMode } from "@/lib/recruitment/decideMode";
import { appendCandidates, regenerateScoutingDay, type CvRef } from "@/lib/recruitment/scoutingDayOps";

// POST /api/recruitment/[slug]/add-cvs
//   body: { cvs: [{ url, name }] }
//   → { slug, mode, addedCount, totalCount }   — done, inline
//   → { batchId }                              — handed to the batch runner
//
// Single entry point for the recruiter after they've uploaded more CVs. The
// server picks between append and regenerate via `decideMode(poolSize, addCount)`
// — the recruiter does NOT choose (see lib/recruitment/decideMode.ts for the
// rule). The response reports which mode was used so the client can label the
// success + refresh.
//
// Above DESK_CHUNK CVs neither mode can finish in one request, so the add is
// handed to the batch runner instead and the response is a run to watch. See
// the comment on that branch for why a big add is always a chunked APPEND.

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  const ctx = await buildRbacContext(session, { req: request });
  if (!(await can(ctx, "recruitment", "create"))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const cvs: CvRef[] = Array.isArray(body?.cvs) ? body.cvs : [];
  if (cvs.length === 0) return NextResponse.json({ error: "At least one CV is required" }, { status: 400 });
  for (const cv of cvs) {
    const u = new URL(cv.url);
    if (!u.hostname.endsWith(".blob.vercel-storage.com") || !u.pathname.includes("recruitment/cv-tmp/")) {
      return NextResponse.json({ error: "Invalid CV reference" }, { status: 400 });
    }
  }

  // Peek at pool size to decide the mode. Missing snapshot => can't dispatch.
  const day = await prisma.recruitmentScoutingDay.findUnique({
    where: { slug },
    select: {
      snapshotJson: true,
      // The rest is for the chunked branch below, which starts a batch run
      // against this desk and has to describe it to the runner.
      title: true,
      jobId: true,
      locationId: true,
      notCitySpecific: true,
      matchday: true,
    },
  });
  if (!day) return NextResponse.json({ error: "Scouting day not found (or a legacy blob-only doc that can't be extended)" }, { status: 404 });
  if (!day.snapshotJson) return NextResponse.json({ error: "This scouting day is missing its saved snapshot — extend not supported" }, { status: 400 });
  const existing = day.snapshotJson as unknown as { candidates: unknown[] };
  const poolSize = Array.isArray(existing?.candidates) ? existing.candidates.length : 0;

  // A big add goes to the batch runner, which appends it in chunks of
  // DESK_CHUNK against the desk's existing axes.
  //
  // It is an APPEND however large the add is, and that overrides decideMode on
  // purpose: regenerate re-scouts the whole pool in ONE call, so "50 new CVs
  // onto a pool of 100" would be 150 candidates in a single response — not
  // slow, impossible, and it failed at 300s with nothing added. A chunked
  // append is the only shape that fits the ceiling. The cost is that the axes
  // stay as they are, which the modal says out loud; refreshing them on a pool
  // that size needs its own chunked pass and doesn't exist yet.
  if (needsChunking(cvs.length)) {
    const { id } = await startBatchRun({
      // The runner titles a lone desk with the run title as-is, and this desk
      // already has its name. Reuse it so nothing is renamed underneath.
      title: day.title,
      date: day.matchday ? day.matchday.toISOString().slice(0, 10) : "",
      jobId: day.jobId,
      context: "",
      desks: [
        {
          key: day.locationId ?? "__unplaced__",
          label: day.title,
          locationId: day.locationId,
          notCitySpecific: day.notCitySpecific,
          unplaced: false,
          // Preset, so EVERY chunk appends to this desk rather than the first
          // one standing up a second desk beside it.
          slug,
          cvs,
        },
      ],
      session,
    });
    after(() => kickDrain(id, selfOrigin(request.url)));
    return NextResponse.json({ batchId: id, mode: "append", addedCount: cvs.length });
  }

  // `forceAppend` is for the batch runner's own chunks. decideMode would read
  // chunk 2 of 5 as "adding 8 to a pool of 8" and re-scout the whole pool
  // every time — quadratic work, and the axes would churn on every chunk.
  // Chunked building wants a locked-axes append; the rule still governs every
  // recruiter-initiated add that fits in one call.
  const mode = body?.forceAppend === true ? "append" : decideMode(poolSize, cvs.length);

  const result = mode === "append"
    ? await appendCandidates(slug, cvs, session, { keepCvs: body?.forceAppend === true })
    : await regenerateScoutingDay(slug, cvs, session);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({
    slug: result.slug,
    mode: result.mode,
    addedCount: result.addedCount,
    totalCount: result.totalCount,
  });
}
