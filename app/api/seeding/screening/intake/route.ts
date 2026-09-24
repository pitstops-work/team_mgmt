/**
 * POST /api/seeding/screening/intake — the application portal's door into screening.
 *
 *   Authorization: Bearer <SCREENING_INTAKE_TOKEN>
 *   body: one application, or { applications: [...] } (up to 100)
 *
 * Idempotent on `ref`: re-sending an application updates it. Document URLs
 * must be https and readable by this server when the first read runs. See
 * lib/seeding/screening/intake.ts for the shape, and docs/screening-intake.md.
 */

import { NextRequest, after } from "next/server";
import { timingSafeEqual } from "crypto";
import { selfOrigin } from "@/lib/recruitment/batchRunner";
import { kickDrafts } from "@/lib/seeding/screening/draft";
import { upsertApplication, validateInput, type ApplicationInput } from "@/lib/seeding/screening/intake";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorised(req: NextRequest): boolean {
  const want = process.env.SCREENING_INTAKE_TOKEN;
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!want || !got) return false;
  const a = Buffer.from(want);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "Body must be JSON" }, { status: 400 });
  const items: Partial<ApplicationInput>[] = Array.isArray(body.applications) ? body.applications : [body];
  if (items.length > 100) return Response.json({ error: "At most 100 applications per request" }, { status: 400 });

  const results: { ref: string; ok: boolean; created?: boolean; error?: string }[] = [];
  for (const item of items) {
    const bad = validateInput(item);
    if (bad) {
      results.push({ ref: String(item.ref ?? ""), ok: false, error: bad });
      continue;
    }
    try {
      const r = await upsertApplication(item as ApplicationInput, "api", null);
      results.push({ ref: item.ref!, ok: true, created: r.created });
    } catch (e) {
      results.push({ ref: item.ref!, ok: false, error: e instanceof Error ? e.message : "Failed" });
    }
  }
  if (results.some((r) => r.ok)) {
    const origin = selfOrigin(req.url);
    after(() => kickDrafts(origin));
  }
  const status = results.every((r) => r.ok) ? 200 : results.some((r) => r.ok) ? 207 : 400;
  return Response.json({ results }, { status });
}
