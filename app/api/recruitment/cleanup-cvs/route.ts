import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";

export const runtime = "nodejs";

// POST /api/recruitment/cleanup-cvs   body: { cvs: [{ url }] }
//
// Deletes temp CV uploads once a multi-desk run has finished.
//
// A single-desk generate deletes its own CVs as it completes, which is the
// right PII-minimising default. A BATCH cannot: it builds several desks across
// several requests, so deleting each desk's inputs on success makes the run
// un-retryable — a failure on desk 8 leaves desk 1's CVs gone, and the retry
// reports "Could not read CV <name>", which reads like a corrupt file and is
// nothing of the sort. So the batch keeps them and calls this at the end.
//
// Best-effort by design: a CV that fails to delete is reported, not fatal.
// Losing the cleanup must never lose the desks that were just built.
export async function POST(request: NextRequest) {
  const ctx = await buildRbacContext(await auth(), { req: request });
  if (!(await can(ctx, "recruitment", "create"))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const cvs: { url?: string }[] = Array.isArray(body?.cvs) ? body.cvs : [];
  if (cvs.length === 0) return NextResponse.json({ deleted: 0, failed: 0 });

  // Only ever delete from the temp CV prefix — the same check the generate and
  // triage routes apply before reading these URLs.
  const urls = cvs
    .map((c) => String(c?.url || ""))
    .filter((u) => {
      try {
        const p = new URL(u);
        return p.hostname.endsWith(".blob.vercel-storage.com") && p.pathname.includes("recruitment/cv-tmp/");
      } catch {
        return false;
      }
    });

  const results = await Promise.allSettled(urls.map((u) => del(u)));
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    console.error(`[recruitment-cleanup] ${failed} of ${urls.length} temp CVs could not be deleted`);
  }
  return NextResponse.json({ deleted: urls.length - failed, failed });
}
