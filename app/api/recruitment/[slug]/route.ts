import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { del, get, list } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import prisma from "@/lib/prisma";
import { renderScoutingDoc, type ScoutDocData } from "@/lib/recruitment/renderDoc";
import {
  jobSnapshotFromRow,
  snapshotWithNoCity,
  type JobSnapshot,
} from "@/lib/recruitment/systemPrompt";
import { resolveDayLocation } from "@/lib/recruitment/locations";
import { busyWithBatch } from "@/lib/recruitment/rehome";
import { regenerateScoutingDay } from "@/lib/recruitment/scoutingDayOps";

// The re-scout branch of PATCH is a full model call on the whole pool.
export const runtime = "nodejs";
export const maxDuration = 300;

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

// PATCH /api/recruitment/[slug]
//   Change which location a desk is scouted against — in particular, mark a
//   desk as "not city-specific" after the fact, or give a no-city desk a city.
//
//   body: { notCitySpecific: true }                     → convert to no-city
//         { notCitySpecific: false, locationId: "<id>" } → convert back
//         + optional { rescout: true }                   → also re-judge the pool
//
//   The candidate write-ups are NOT rewritten by a conversion: they were
//   judged against the old location's language, local orgs and red flags and
//   will keep reading that way. `rescout` is how you actually fix that, and
//   `locationChangedAt` is how the desk admits it when you don't.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  const ctx = await buildRbacContext(session, { req });
  // `update` edits the desk's settings, matching locations/[id] and jobs/[id].
  if (!(await can(ctx, "recruitment", "update"))) return Response.json({ error: "Not found" }, { status: 404 });

  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const toNoCity = body?.notCitySpecific === true;
  const rescout = body?.rescout === true;
  const locationId = typeof body?.locationId === "string" && body.locationId ? String(body.locationId) : null;

  // A re-scout spends a model call and rewrites every write-up — the same
  // thing `create` gates on add-cvs, move-candidate and rehome.
  if (rescout && !(await can(ctx, "recruitment", "create"))) {
    return Response.json({ error: "You can change the location, but not re-scout the pool." }, { status: 403 });
  }

  // Hand-committed docs live in the repo, not the DB.
  try {
    await readFile(path.join(process.cwd(), "content", "recruitment", `${slug}.html`), "utf8");
    return Response.json(
      { error: "This is a hand-committed doc — edit it in content/recruitment/ in the repo instead." },
      { status: 400 },
    );
  } catch {
    /* not committed — proceed */
  }

  const day = await prisma.recruitmentScoutingDay.findUnique({
    where: { slug },
    include: { job: { include: { location: true, locations: { orderBy: { city: "asc" } } } } },
  });
  if (!day) return Response.json({ error: "That desk doesn't exist, or is a legacy blob-only doc." }, { status: 404 });
  if (!day.jobSnapshotJson) {
    return Response.json({ error: "This desk has no saved JD snapshot, so its location can't be changed." }, { status: 400 });
  }
  // Same rule as creation: the scout judges on the ROLE, so a desk with no
  // city still needs a JD. This is what protects the old JD-less docs.
  if (!day.jobId || !day.job) {
    return Response.json(
      { error: "This desk isn't linked to a JD. A desk with no city still needs one — the scout judges on the role." },
      { status: 400 },
    );
  }
  if (await busyWithBatch(slug)) {
    return Response.json(
      { error: "A scouting run is still adding CVs to this desk. Wait for it to finish, then change the location." },
      { status: 409 },
    );
  }
  const pending = (day.snapshotJson as { candidates?: { rehomeTo?: string | null }[] } | null)?.candidates ?? [];
  if (pending.some((c) => c.rehomeTo)) {
    return Response.json({ error: "People are still being moved off this desk. Wait for that to finish." }, { status: 409 });
  }

  const prior = day.jobSnapshotJson as unknown as JobSnapshot;
  let nextSnapshot: JobSnapshot;
  // Taken from the RESOLVED location, never from the request: a single-city
  // JD resolves with no locationId sent at all, so trusting the request body
  // here would null the column on a desk that does have a city.
  let nextLocationId: string | null = null;
  if (toNoCity) {
    // Re-point ONLY the location. Rebuilding from the live JD row would drag
    // in every JD edit made since this desk was scouted, which is exactly what
    // snapshot-on-use exists to prevent.
    nextSnapshot = snapshotWithNoCity(prior);
  } else {
    const cities = day.job.locations.length > 0 ? day.job.locations : [day.job.location];
    const picked = resolveDayLocation(cities, day.job.locationId, locationId);
    if ("error" in picked) return Response.json({ error: picked.error }, { status: 400 });
    // Going back to a city has no frozen context to restore — this desk never
    // ran there — so the live RecruitmentLocation row is the only source. Note
    // this direction ADDS language/local-org/travel assumptions that the
    // existing write-ups were deliberately written without.
    nextSnapshot = jobSnapshotFromRow(day.job, picked.location);
    nextLocationId = picked.location.id;
  }

  // Column and snapshot together, in ONE update. Either half alone leaves a
  // desk that lies: snapshot-only keeps nagging and printing the old city,
  // column-only claims no city while the next Add CVs judges against the old.
  await prisma.recruitmentScoutingDay.update({
    where: { slug },
    data: {
      notCitySpecific: toNoCity,
      locationId: nextLocationId,
      jobSnapshotJson: nextSnapshot as unknown as never,
      // Cleared when the same request re-scouts: the reports are no longer stale.
      locationChangedAt: rescout ? null : new Date(),
    },
  });

  if (!rescout) return Response.json({ ok: true, rescouted: false });

  // Re-judge the pool against the new context. Zero new CVs is a supported
  // call on a non-empty pool, and it preserves candidate ids by name match so
  // the team's scores, notes and transcripts stay attached.
  const res = await regenerateScoutingDay(slug, [], session);
  if (!res.ok) {
    // The conversion stands. A visible, fixable half-state beats an invisible
    // rollback — and the recruiter needs to know the reports are still stale.
    await prisma.recruitmentScoutingDay.update({ where: { slug }, data: { locationChangedAt: new Date() } });
    return Response.json(
      { error: `Location changed, but the re-scout failed: ${res.error} The reports still reflect the old location — try again from Location…` },
      { status: res.status },
    );
  }
  return Response.json({ ok: true, rescouted: true });
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
        notCitySpecific: true,
        // The JD's cities power per-candidate allocation inside the desk.
        // Read live rather than from the snapshot so adding a city to the JD
        // shows up on desks that already exist.
        job: { select: { locationId: true, locations: { select: { id: true, city: true }, orderBy: { city: "asc" } } } },
      },
    });
    const snap = day?.snapshotJson as ScoutDocData | null | undefined;
    if (snap && Array.isArray(snap.candidates) && snap.candidates.length > 0) {
      return renderScoutingDoc(slug, snap, {
        // Cities are still passed on a not-city-specific desk: the picker is
        // hidden behind a quiet link rather than removed, because a
        // central-team applicant can still turn out to suit a city post.
        cities: day?.job?.locations ?? [],
        deskLocationId: day?.locationId ?? null,
        notCitySpecific: day?.notCitySpecific ?? false,
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
