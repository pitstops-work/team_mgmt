/**
 * DELETE /api/recruitment/cv-tmp — clear temp CVs that are already on a desk.
 *
 * Only ever the `scouted` bucket: CVs whose APPRF code matches a candidate
 * someone has already read. Anything unmatched or unscouted is left, because
 * deleting a CV nobody has read is unrecoverable — the file exists only here
 * once the recruiter has moved on.
 */

import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import { surveyTempCvs } from "@/lib/recruitment/orphanCvs";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const ctx = await buildRbacContext(session, { req: request });
  if (!(await can(ctx, "recruitment", "delete"))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { scouted } = await surveyTempCvs();
  const results = await Promise.allSettled(scouted.map((c) => del(c.url)));
  const failed = results.filter((r) => r.status === "rejected").length;
  return NextResponse.json({ deleted: scouted.length - failed, failed });
}
