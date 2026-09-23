/** GET /api/recruitment/batch/[id]/status — progress for the batch page's poll. */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import prisma from "@/lib/prisma";
import { describeRun } from "@/lib/recruitment/batchRunner";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const ctx = await buildRbacContext(session, { req: request });
  if (!(await can(ctx, "recruitment", "read"))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { id } = await params;
  const run = await prisma.recruitmentBatchRun.findUnique({ where: { id } });
  // A batch from before the runner existed has desks but no run row. Not an
  // error — the page just shows the desks with nothing in flight.
  if (!run) return NextResponse.json({ run: null });
  return NextResponse.json({ run: describeRun(run) });
}
