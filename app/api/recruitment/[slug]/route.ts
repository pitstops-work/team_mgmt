import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { del, get, list } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import prisma from "@/lib/prisma";
import { renderScoutingDoc, type ScoutDocData } from "@/lib/recruitment/renderDoc";

// Serves scouting-day HTML docs (embedded in an iframe by /recruitment/[slug]):
// hand-committed ones from content/recruitment/, DB-backed ones re-rendered
// live from their snapshot, legacy ones from the private blob store. See
// loadDoc below for why the re-render matters. Candidate PII — RBAC-gated on
// `recruitment.read`.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  const ctx = await buildRbacContext(session, { req });
  if (!(await can(ctx, "recruitment", "read"))) return Response.json({ error: "Not found" }, { status: 404 });

  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) return Response.json({ error: "Not found" }, { status: 404 });

  const html = await loadDoc(slug);
  if (html === null) return Response.json({ error: "Not found" }, { status: 404 });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

// DELETE /api/recruitment/[slug]
//   Removes the scouting day everywhere it lives: the DB row (if any), the
//   private-blob HTML (if any), the RecruitmentScoutState team-scoring row
//   (if any). Hand-committed content/recruitment/*.html is NOT deletable via
//   API — those are code-owned and must be removed from the repo.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  const ctx = await buildRbacContext(session, { req });
  if (!(await can(ctx, "recruitment", "delete"))) return Response.json({ error: "Not found" }, { status: 404 });

  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) return Response.json({ error: "Not found" }, { status: 404 });

  // Refuse to delete hand-committed docs — those live in the repo, not blob.
  const committedPath = path.join(process.cwd(), "content", "recruitment", `${slug}.html`);
  try {
    await readFile(committedPath, "utf8");
    return Response.json({ error: "This is a hand-committed doc — remove it from content/recruitment/ in the repo instead." }, { status: 400 });
  } catch {
    /* not committed — proceed */
  }

  // 1. Blob HTML (best-effort — legacy docs may not have a stored URL).
  try {
    const pathname = `recruitment/docs/${slug}.html`;
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    const blob = blobs.find((b) => b.pathname === pathname);
    if (blob) await del(blob.url);
  } catch {
    /* blob store unreachable — DB delete still proceeds */
  }

  // 2. DB row (may not exist for legacy blob-only docs).
  await prisma.recruitmentScoutingDay.deleteMany({ where: { slug } });

  // 3. Interview transcripts. These are the most sensitive blobs in the
  // feature — a full record of what a named person said in an interview — and
  // unlike CVs they are deliberately KEPT while the desk lives. Deleting the
  // desk must take them with it, or interview PII outlives the thing that
  // justified collecting it. Prefix-scoped by slug, so this can't touch
  // another desk's transcripts.
  try {
    const { blobs } = await list({ prefix: `recruitment/transcripts/${slug}/` });
    await Promise.allSettled(blobs.map((b) => del(b.url)));
  } catch (e) {
    // Log loudly — a silent failure here means transcript PII is orphaned in
    // the blob store with nothing left pointing at it.
    console.error(`[recruitment-delete] transcript cleanup failed for ${slug}:`, e instanceof Error ? e.message : e);
  }

  // 4. Team-scoring state — same slug key, safe to delete unconditionally.
  // Holds the transcript summaries, so this is the other half of step 3.
  await prisma.recruitmentScoutState.deleteMany({ where: { slug } });

  return Response.json({ ok: true });
}

/**
 * Resolve a doc's HTML, in priority order:
 *
 *   1. Hand-committed file in content/recruitment/ — authoritative for itself.
 *   2. RE-RENDERED from RecruitmentScoutingDay.snapshotJson, when a row exists.
 *   3. The stored blob — legacy docs that predate the DB row.
 *
 * Step 2 is the important one. This used to go straight from 1 to 3, serving
 * the HTML that was frozen into the blob at generation time. That meant any
 * change to lib/recruitment/renderDoc.ts reached NEW desks only — every desk
 * already in use kept running whatever template rendered it, forever. It is
 * why the team-sync fix could not reach the three live desks on its own.
 *
 * The blob was always documented as a render cache with the DB row as source
 * of truth (see persist() in scoutingDayOps.ts, which writes both from one
 * `data` object). This makes that true. Rendering is pure string
 * concatenation over JSON already being read, so the per-request cost is
 * negligible, and it permanently removes the class of bug where a template
 * change silently fails to reach existing desks.
 */
async function loadDoc(slug: string): Promise<string | null> {
  try {
    return await readFile(path.join(process.cwd(), "content", "recruitment", `${slug}.html`), "utf8");
  } catch {
    /* not a committed doc — try a fresh render, then the blob */
  }
  try {
    const day = await prisma.recruitmentScoutingDay.findUnique({
      where: { slug },
      select: {
        snapshotJson: true,
        locationId: true,
        // The JD's cities power per-candidate allocation inside the desk.
        // Read live rather than from the snapshot so adding a city to the JD
        // shows up on desks that already exist.
        job: { select: { locationId: true, locations: { select: { id: true, city: true }, orderBy: { city: "asc" } } } },
      },
    });
    const snap = day?.snapshotJson as ScoutDocData | null | undefined;
    if (snap && Array.isArray(snap.candidates) && snap.candidates.length > 0) {
      return renderScoutingDoc(slug, snap, {
        cities: day?.job?.locations ?? [],
        deskLocationId: day?.locationId ?? null,
      });
    }
  } catch {
    /* DB unreachable or snapshot unusable — the blob below is still valid */
  }
  try {
    const pathname = `recruitment/docs/${slug}.html`;
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    const blob = blobs.find((b) => b.pathname === pathname);
    if (!blob) return null;
    // Private blobs need the store token — a plain fetch of the URL 401s.
    const got = await get(blob.url, { access: "private" });
    return got?.statusCode === 200 ? await new Response(got.stream).text() : null;
  } catch {
    return null;
  }
}
