/**
 * POST /api/recruitment/batch/[id]/resume
 *   body: { skipStuck?: boolean }
 *
 * Restart a parked run at its first uncommitted chunk. Safe to press twice:
 * the runner's lease means a second worker finds the run already claimed and
 * does nothing, and progress is recorded per committed chunk, so nothing is
 * re-scouted.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import { kickDrain, resumeBatchRun, selfOrigin } from "@/lib/recruitment/batchRunner";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const ctx = await buildRbacContext(session, { req: request });
  if (!(await can(ctx, "recruitment", "create"))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const { ok, skipped } = await resumeBatchRun(id, body?.skipStuck === true);
  if (!ok) return NextResponse.json({ error: "Nothing to resume" }, { status: 400 });

  const origin = selfOrigin(request.url);
  after(() => kickDrain(id, origin));
  return NextResponse.json({ ok: true, skipped });
}
