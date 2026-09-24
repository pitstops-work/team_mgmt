/**
 * /api/recruitment/[slug]/rehome — sort an Unplaced desk out by home state.
 *
 *   POST { action: "plan" }                     → who would go where (nothing moves)
 *   POST { action: "apply", moves: [{ candidateId, toLocationId }] }
 *                                               → queue those moves and start working them
 *   GET                                         → progress of the queue
 *
 * See lib/recruitment/rehome.ts for the rule and why it's split in two.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import { selfOrigin } from "@/lib/recruitment/batchRunner";
import { kickRehome, planRehome, queueRehome, rehomeStatus } from "@/lib/recruitment/rehome";

export const runtime = "nodejs";
export const maxDuration = 300;

async function gate(request: NextRequest, action: "read" | "create") {
  const session = await auth();
  const ctx = await buildRbacContext(session, { req: request });
  return can(ctx, "recruitment", action);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await gate(request, "create"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => null);

  if (body?.action === "plan") {
    const plan = await planRehome(slug);
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });
    return NextResponse.json(plan);
  }

  if (body?.action === "apply") {
    const moves = (Array.isArray(body.moves) ? body.moves : [])
      .map((m: { candidateId?: unknown; toLocationId?: unknown }) => ({
        candidateId: String(m?.candidateId || ""),
        toLocationId: String(m?.toLocationId || ""),
      }))
      .filter((m: { candidateId: string; toLocationId: string }) => m.candidateId && m.toLocationId);
    const res = await queueRehome(slug, moves);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    const origin = selfOrigin(request.url);
    after(() => kickRehome(slug, origin));
    return NextResponse.json(res);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await gate(request, "read"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { slug } = await params;
  const status = await rehomeStatus(slug);
  // Someone is watching a queue nobody is working: restart it. The lease
  // means a repeated kick is a no-op.
  if (status.stale) {
    const origin = selfOrigin(request.url);
    after(() => kickRehome(slug, origin));
  }
  return NextResponse.json(status);
}
