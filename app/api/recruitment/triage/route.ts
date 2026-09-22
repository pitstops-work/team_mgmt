import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import prisma from "@/lib/prisma";
import { extractCv, UnsupportedCvError } from "@/lib/recruitment/extractCv";
import { triageCvs, TRIAGE_CHARS_PER_CV, type TriageCity } from "@/lib/recruitment/triage";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Parallel blob reads. High enough that 85 CVs isn't 85 serial round trips,
 *  low enough not to open a connection per CV on a large pool. */
const EXTRACT_CONCURRENCY = 8;

// POST /api/recruitment/triage
//   body: { jobId, locationIds: string[], cvs: [{ url, name }] }
//   → { cities, assignments }
//
// Step one of a multi-city run: sort the CV pile by city so each city's desk
// can be generated against its own local context. Returns a PROPOSAL — the
// client shows it for correction and nothing is persisted here.
//
// Deliberately does NOT create anything or delete the temp CV blobs: the
// generate calls that follow still need them, and an abandoned triage should
// leave no trace. Gated on recruitment.create, same as generate.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const ctx = await buildRbacContext(session, { req: request });
  if (!(await can(ctx, "recruitment", "create"))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const jobId = typeof body?.jobId === "string" && body.jobId ? body.jobId : null;
  const locationIds: string[] = Array.isArray(body?.locationIds) ? body.locationIds.map(String) : [];
  const cvs: { url: string; name: string }[] = Array.isArray(body?.cvs) ? body.cvs : [];

  if (!jobId) return NextResponse.json({ error: "A saved JD is required to sort by city" }, { status: 400 });
  if (locationIds.length < 2) return NextResponse.json({ error: "Pick at least two cities to sort between" }, { status: 400 });
  if (cvs.length === 0) return NextResponse.json({ error: "At least one CV is required" }, { status: 400 });

  // Same blob-reference check generate does — these URLs come from the client.
  for (const cv of cvs) {
    const u = new URL(cv.url);
    if (!u.hostname.endsWith(".blob.vercel-storage.com") || !u.pathname.includes("recruitment/cv-tmp/")) {
      return NextResponse.json({ error: "Invalid CV reference" }, { status: 400 });
    }
  }

  // Cities must belong to the JD — otherwise a desk could be generated for a
  // city the role isn't hiring in.
  const job = await prisma.recruitmentJob.findUnique({
    where: { id: jobId },
    include: { location: true, locations: { orderBy: { city: "asc" } } },
  });
  if (!job) return NextResponse.json({ error: "Selected JD not found" }, { status: 404 });
  if (job.archivedAt) return NextResponse.json({ error: "Selected JD is archived" }, { status: 400 });

  const allowed = job.locations.length > 0 ? job.locations : [job.location];
  const cities: TriageCity[] = locationIds
    .map((id) => allowed.find((l) => l.id === id))
    .filter((l): l is (typeof allowed)[number] => !!l)
    .map((l) => ({ id: l.id, city: l.city, state: l.state }));

  if (cities.length !== locationIds.length) {
    return NextResponse.json({ error: "One or more cities are not on this JD" }, { status: 400 });
  }

  // Extract just enough text per CV for the location signal.
  //
  // Fetched with bounded concurrency, not one at a time: a pool of 85 means 85
  // blob round trips, and serially that alone can eat most of the 300s budget
  // before the sorting call has started. textOnly skips rasterizing scanned
  // PDFs, whose page images triage would only throw away.
  const texts: { name: string; text: string }[] = new Array(cvs.length);
  // An array rather than a `let … | null`: TypeScript's control-flow analysis
  // can't see assignments made inside the async workers, so a nullable local
  // narrows to `never` by the time it is read back.
  const failures: { status: number; error: string }[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(EXTRACT_CONCURRENCY, cvs.length) }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= cvs.length || failures.length > 0) return;
        const cv = cvs[i];
        try {
          const got = await get(cv.url, { access: "private" });
          if (got?.statusCode !== 200) {
            failures.push({ status: 502, error: `Could not read CV "${cv.name}"` });
            return;
          }
          const buffer = Buffer.from(await new Response(got.stream).arrayBuffer());
          const { text } = await extractCv(buffer, { textOnly: true });
          texts[i] = { name: cv.name, text: text.slice(0, TRIAGE_CHARS_PER_CV) };
        } catch (e) {
          if (e instanceof UnsupportedCvError) {
            failures.push({ status: 400, error: `"${cv.name}": ${e.message}` });
            return;
          }
          // A CV that blows up for any other reason (corrupt PDF, mupdf throw)
          // must not take down a pool of 85. It sorts as Unsorted.
          texts[i] = { name: cv.name, text: "" };
        }
      }
    }),
  );
  if (failures.length > 0) return NextResponse.json({ error: failures[0].error }, { status: failures[0].status });

  // A scanned CV yields no text layer here. Rather than let the sorter guess
  // from an empty string, mark it Unsorted up front — the scouting pass will
  // still read it properly via page images once it lands in a city.
  const assignments = await triageCvs(cities, texts);
  const withScanNote = assignments.map((a, i) =>
    texts[i].text.trim().length === 0
      ? { ...a, locationId: null, confidence: "low" as const, reason: "Scanned CV — no text to sort on. Assign manually." }
      : a,
  );

  return NextResponse.json({ cities, assignments: withScanNote });
}
