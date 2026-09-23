/**
 * POST /api/recruitment/batch/recover
 *   body: { deskSlug, includeUnmatched?: boolean }
 *
 * Finish a pool of temp CVs that a dead run left behind, into the desk it was
 * half-way through building. Produces an ordinary batch run whose plan has one
 * desk with an EXISTING slug, so every chunk appends to that desk rather than
 * standing up a second one beside it.
 *
 * The client sends the decision, not the CVs: the survey is re-run here, so
 * what gets scouted is what is actually orphaned at this moment, not what some
 * page said a while ago.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import prisma from "@/lib/prisma";
import { kickDrain, selfOrigin, startBatchRun } from "@/lib/recruitment/batchRunner";
import { surveyTempCvs } from "@/lib/recruitment/orphanCvs";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const ctx = await buildRbacContext(session, { req: request });
  if (!(await can(ctx, "recruitment", "create"))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const deskSlug = String(body?.deskSlug || "");
  if (!/^[a-z0-9-]+$/.test(deskSlug)) return NextResponse.json({ error: "Pick a desk to finish into" }, { status: 400 });

  const desk = await prisma.recruitmentScoutingDay.findUnique({
    where: { slug: deskSlug },
    select: { slug: true, title: true, jobId: true, locationId: true, matchday: true, snapshotJson: true },
  });
  if (!desk) return NextResponse.json({ error: "That desk no longer exists" }, { status: 404 });
  if (!desk.snapshotJson) {
    return NextResponse.json({ error: "That desk has no saved snapshot, so it can't be extended" }, { status: 400 });
  }

  const survey = await surveyTempCvs();
  const cvs = [...survey.unscouted, ...(body?.includeUnmatched === true ? survey.unmatched : [])].map((c) => ({
    url: c.url,
    name: c.name,
  }));
  if (cvs.length === 0) return NextResponse.json({ error: "Nothing left to scout" }, { status: 400 });

  const { id } = await startBatchRun({
    // The runner titles each desk `${title} — ${label}`, and this desk already
    // has its name. Reuse it so nothing is renamed underneath the recruiter.
    title: desk.title,
    date: desk.matchday ? desk.matchday.toISOString().slice(0, 10) : "",
    jobId: desk.jobId,
    context: "",
    desks: [
      {
        key: desk.locationId ?? "__unplaced__",
        label: desk.title,
        locationId: desk.locationId,
        unplaced: !desk.locationId,
        slug: desk.slug,
        cvs,
      },
    ],
    session,
  });

  after(() => kickDrain(id, selfOrigin(request.url)));
  return NextResponse.json({ batchId: id, count: cvs.length });
}
