import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import { moveCandidate } from "@/lib/recruitment/moveCandidate";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST /api/recruitment/[slug]/move-candidate
//   body: { candidateId, toLocationId }
//   → { toSlug, toCandidateId, city, createdDesk, name }
//
// Move a candidate to the desk for the city they actually belong to,
// re-scouting them against that city's context on the way (see
// lib/recruitment/moveCandidate.ts for why it is a re-scout and not a copy).
//
// Gated on `recruitment.create`, matching add-cvs: this extends a desk's pool
// and can open a new desk, which is the same class of act — not the
// `recruitment.read` gate that covers scoring on a desk you already have.
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  const ctx = await buildRbacContext(session, { req: request });
  if (!(await can(ctx, "recruitment", "create"))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const candidateId = String(body?.candidateId || "").trim();
  const toLocationId = String(body?.toLocationId || "").trim();
  if (!candidateId || !toLocationId) {
    return NextResponse.json({ error: "candidateId and toLocationId are required" }, { status: 400 });
  }

  const res = await moveCandidate(slug, candidateId, toLocationId, session);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res);
}
