import { stat } from "fs/promises";
import path from "path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { list } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import prisma from "@/lib/prisma";
import ScoutingDayActions from "./ScoutingDayActions";

export const dynamic = "force-dynamic";

// Mirrors the fs-then-blob lookup in app/api/recruitment/[slug]/route.ts.
// Generated docs only exist in the blob store, never on disk.
async function docExists(slug: string): Promise<boolean> {
  try {
    await stat(path.join(process.cwd(), "content", "recruitment", `${slug}.html`));
    return true;
  } catch {
    /* not a committed doc — try the blob store */
  }
  try {
    const pathname = `recruitment/docs/${slug}.html`;
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    return blobs.some((b) => b.pathname === pathname);
  } catch {
    return false;
  }
}

async function isCommittedDoc(slug: string): Promise<boolean> {
  try {
    await stat(path.join(process.cwd(), "content", "recruitment", `${slug}.html`));
    return true;
  } catch {
    return false;
  }
}

export default async function RecruitmentDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  const ctx = await buildRbacContext(session, { surface: "recruitment.doc" });
  if (!(await can(ctx, "recruitment", "read"))) notFound();
  const canAddCvs = await can(ctx, "recruitment", "create");
  const canDelete = await can(ctx, "recruitment", "delete");
  const canUpdate = await can(ctx, "recruitment", "update");

  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) notFound();
  if (!(await docExists(slug))) notFound();

  // DB-backed docs can accept new CVs (we have snapshotJson to append to).
  // Legacy blob-only + hand-committed docs cannot — no snapshot to extend.
  const day = await prisma.recruitmentScoutingDay.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      snapshotJson: true,
      batchId: true,
      jobId: true,
      locationId: true,
      notCitySpecific: true,
      locationChangedAt: true,
      location: { select: { city: true } },
      job: { select: { locations: { select: { id: true, city: true }, orderBy: { city: "asc" } }, location: { select: { id: true, city: true } } } },
    },
  });

  // Desks from a multi-city run link back to their siblings — without this a
  // batch desk is a dead end and the other cities are only findable by
  // scrolling the main listing.
  const siblings = day?.batchId
    ? await prisma.recruitmentScoutingDay.findMany({
        where: { batchId: day.batchId, slug: { not: slug } },
        orderBy: { createdAt: "asc" },
        select: { slug: true, notCitySpecific: true, location: { select: { city: true } } },
      })
    : [];
  const committed = await isCommittedDoc(slug);

  // Pool size drives the append-vs-regenerate rule (server-side); we pass it
  // in so the modal can preview the choice for the user before they submit.
  const snap = day?.snapshotJson as { candidates?: unknown[] } | null | undefined;
  const poolSize = Array.isArray(snap?.candidates) ? snap.candidates.length : 0;

  // Cache-buster for the iframe src. Without this, router.refresh() re-runs
  // the server component but the iframe's src attribute is unchanged, so
  // React never re-mounts it and the browser never re-fetches the doc —
  // append/regenerate look like they did nothing until the user hard-reloads.
  // JSON.stringify length flips on any snapshot mutation (add candidate,
  // re-score, re-order, new axes), which is exactly the signal we want.
  const iframeVersion = day?.snapshotJson ? JSON.stringify(day.snapshotJson).length : 0;

  return (
    // h-dvh, NOT h-full. This page renders under two different layout
    // branches (app/(app)/layout.tsx): most roles get `div.h-screen >
    // main.flex-1`, which has a definite height, but budget-admin gets
    // `main.min-h-screen`, which has none. `h-full` is height:100%, and a
    // percentage height cannot resolve against an ancestor of indefinite
    // height — it collapsed to content height, leaving the iframe's flex-1
    // nothing to grow into, so it fell back to the HTML default iframe height
    // of 150px ("half a page") for every budget-admin. A viewport unit
    // resolves the same under either branch; dvh over vh so mobile browser
    // chrome doesn't clip the doc.
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-2">
        <Link href="/recruitment" className="text-stone-400 hover:text-stone-600" title="Back to recruitment">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <p className="text-sm font-medium text-stone-800 truncate">{day?.title ?? slug}</p>
        {committed && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500">committed</span>
        )}
        {!day && !committed && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500">legacy</span>
        )}
        {/* The positive signal. Without it a no-city desk just reads as one
            that is missing its city. */}
        {day?.notCitySpecific && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500 shrink-0"
            title="This role has no location — remote, national, or a central team"
          >
            not city-specific
          </span>
        )}
        {siblings.length > 0 && day?.batchId && (
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-stone-400 min-w-0">
            <Link href={`/recruitment/batch/${day.batchId}`} className="text-sky-600 hover:underline shrink-0">
              batch
            </Link>
            <span className="shrink-0">·</span>
            {siblings.map((s) => (
              <Link
                key={s.slug}
                href={`/recruitment/${s.slug}`}
                className="px-1.5 py-0.5 rounded-full bg-stone-100 hover:bg-sky-50 hover:text-sky-600 truncate"
              >
                {s.notCitySpecific ? "No city" : s.location?.city ?? s.slug}
              </Link>
            ))}
          </div>
        )}
        <div className="ml-auto">
          <ScoutingDayActions
            slug={slug}
            poolSize={poolSize}
            canAddCvs={canAddCvs && !!day}
            canDelete={canDelete && !committed}
            addDisabledReason={committed ? "Hand-committed doc" : !day ? "Legacy doc — no snapshot to extend" : ""}
            deleteDisabledReason={committed ? "Remove from content/recruitment/ in the repo instead" : ""}
            notCitySpecific={!!day?.notCitySpecific}
            cityName={day?.location?.city ?? null}
            // Fall back to the JD's primary for JDs created before the
            // multi-location migration backfilled their membership rows.
            jobCities={day?.job ? (day.job.locations.length > 0 ? day.job.locations : [day.job.location]) : []}
            canConvert={canUpdate && !!day && !committed && !!day.jobId}
            convertDisabledReason={
              committed
                ? "Hand-committed doc"
                : !day
                  ? "Legacy doc — no snapshot to change"
                  : !day.jobId
                    ? "Not linked to a JD — a desk with no city still needs one"
                    : ""
            }
          />
        </div>
      </header>
      {/* The desk admits the conversion rather than quietly misrepresenting
          write-ups that were judged against a location it no longer claims. */}
      {day?.locationChangedAt && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-800">
          This desk&apos;s location changed on{" "}
          {day.locationChangedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. The
          candidate reports below were written before that and have not been re-scouted.
        </p>
      )}
      <iframe src={`/api/recruitment/${slug}?v=${iframeVersion}`} title="Scouting desk" className="block w-full flex-1" />
    </div>
  );
}
