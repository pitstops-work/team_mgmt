import { readdir, readFile } from "fs/promises";
import path from "path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Briefcase, KeyRound, Languages, Loader2, MapPin, UserSearch } from "lucide-react";
import { get, list } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import prisma from "@/lib/prisma";
import { describeRun } from "@/lib/recruitment/batchRunner";
import { surveyTempCvs } from "@/lib/recruitment/orphanCvs";
import UploadForm from "./UploadForm";
import UnfinishedUploads from "./UnfinishedUploads";
import DocCard from "./DocCard";

export const dynamic = "force-dynamic";

const DIR = path.join(process.cwd(), "content", "recruitment");

type DocEntry = {
  slug: string;
  title: string;
  matchday: string | null;
  jobTitle: string | null;
  jobSlug: string | null;
  city: string | null;
  createdAt: number; // unix ms for sorting
  isLegacy: boolean;
  isCommitted: boolean;
};

function parseHtmlDoc(slug: string, html: string, createdAt: number, isCommitted: boolean): DocEntry {
  return {
    slug,
    title: html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? slug,
    matchday: html.match(/class="matchday">([^<]*)</)?.[1]?.trim() ?? null,
    jobTitle: null,
    jobSlug: null,
    city: null,
    createdAt,
    isLegacy: true,
    isCommitted,
  };
}

export default async function RecruitmentPage() {
  const session = await auth();
  const ctx = await buildRbacContext(session, { surface: "recruitment.list" });
  if (!(await can(ctx, "recruitment", "list"))) notFound();
  const canDelete = await can(ctx, "recruitment", "delete");

  // 1. DB rows: the source of truth going forward. Each carries its JD chip.
  const dbRows = await prisma.recruitmentScoutingDay.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      slug: true,
      title: true,
      matchday: true,
      createdAt: true,
      job: { select: { slug: true, title: true, location: { select: { city: true } } } },
      // The city this day actually ran in — a multi-city JD's days differ.
      location: { select: { city: true } },
    },
  });
  const knownSlugs = new Set(dbRows.map((r) => r.slug));
  const docs: DocEntry[] = dbRows.map((r) => ({
    slug: r.slug,
    title: r.title,
    matchday: r.matchday ? r.matchday.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : null,
    jobTitle: r.job?.title ?? null,
    jobSlug: r.job?.slug ?? null,
    // Prefer the day's own city; fall back to the JD's primary for days
    // generated before multi-location (their locationId backfilled to it anyway).
    city: r.location?.city ?? r.job?.location.city ?? null,
    createdAt: +r.createdAt,
    isLegacy: false,
    isCommitted: false,
  }));

  // 2. Legacy blob-only docs (generated before Phase 1 landed). Same fs+blob
  // dual-source pattern as before; skip anything already in the DB.
  try {
    const { blobs } = await list({ prefix: "recruitment/docs/" });
    const legacyBlobs = blobs
      .filter((b) => b.pathname.endsWith(".html"))
      .filter((b) => {
        const slug = b.pathname.replace(/^recruitment\/docs\//, "").replace(/\.html$/, "");
        return !knownSlugs.has(slug);
      });
    const legacy = await Promise.all(
      legacyBlobs.map(async (b) => {
        const slug = b.pathname.replace(/^recruitment\/docs\//, "").replace(/\.html$/, "");
        const got = await get(b.url, { access: "private" });
        const html = got?.statusCode === 200 ? await new Response(got.stream).text() : "";
        return parseHtmlDoc(slug, html, +new Date(b.uploadedAt), false);
      }),
    );
    docs.push(...legacy);
  } catch {
    /* blob store unreachable — DB-only listing still works */
  }
  try {
    const files = (await readdir(DIR)).filter((f) => f.endsWith(".html"));
    const committed = await Promise.all(
      files
        .filter((f) => !knownSlugs.has(f.replace(/\.html$/, "")))
        .map(async (f) => {
          const html = await readFile(path.join(DIR, f), "utf8");
          return parseHtmlDoc(f.replace(/\.html$/, ""), html, 0, true); // committed → not deletable
        }),
    );
    docs.push(...committed);
  } catch {
    /* no committed docs */
  }

  docs.sort((a, b) => b.createdAt - a.createdAt);

  // CVs uploaded for a run that never finished. Listing the temp area is only
  // possible here — the store is private and its token is a sensitive project
  // env var, so no local script can reach it.
  const temp = await surveyTempCvs().catch(() => null);
  const tempRow = (c: { name: string; code: string | null }) => ({ name: c.name, code: c.code });

  // Runs still in flight, or parked waiting to be carried on.
  //
  // A run no longer lives in the tab that started it, so it needs a way back:
  // the recruiter can close the browser mid-run, and a desk that is half built
  // looks identical to a finished one in the list below.
  const openRuns = (
    await prisma.recruitmentBatchRun.findMany({
      where: { status: { in: ["running", "failed"] } },
      orderBy: { startedAt: "desc" },
      take: 5,
    })
  ).map(describeRun);

  // JDs for the upload picker.
  const jobs = await prisma.recruitmentJob.findMany({
    where: { archivedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, slug: true, title: true,
      location: { select: { city: true } },
      locations: { select: { id: true, city: true }, orderBy: { city: "asc" } },
      locationId: true,
    },
  });
  const pickerJobs = jobs.map((j) => ({
    id: j.id,
    slug: j.slug,
    title: j.title,
    city: j.location.city,
    // Primary first so it's the default selection in the city picker. Falls
    // back to the primary alone for any JD without membership rows.
    locations: [
      ...j.locations.filter((l) => l.id === j.locationId),
      ...j.locations.filter((l) => l.id !== j.locationId),
    ],
  }));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2.5 mb-1">
        <UserSearch className="w-5 h-5 text-sky-500" />
        <h1 className="text-lg font-semibold text-stone-900">Recruitment</h1>
      </div>
      <p className="text-sm text-stone-500 mb-4">Scouting desks for interview days. Scores and notes sync across the team.</p>

      <div className="flex items-center gap-3 mb-6 text-sm flex-wrap">
        <Link href="/recruitment/jobs" className="inline-flex items-center gap-1.5 text-stone-500 hover:text-sky-600">
          <Briefcase className="w-4 h-4" /> Job descriptions
        </Link>
        <span className="text-stone-300">·</span>
        <Link href="/recruitment/locations" className="inline-flex items-center gap-1.5 text-stone-500 hover:text-sky-600">
          <MapPin className="w-4 h-4" /> Locations
        </Link>
        <span className="ml-auto text-stone-300 hidden sm:inline">·</span>
        {/* Account-settings links — placed here so users who only see /recruitment
            (e.g. budget-admins granted recruitment.* access, who don't get the
            sidebar app nav) can still reach their account settings. */}
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-stone-400 hover:text-stone-700">
          <KeyRound className="w-3.5 h-3.5" /> Change password
        </Link>
        <span className="text-stone-300">·</span>
        <Link href="/settings/language" className="inline-flex items-center gap-1.5 text-stone-400 hover:text-stone-700">
          <Languages className="w-3.5 h-3.5" /> Language
        </Link>
      </div>

      <UploadForm jobs={pickerJobs} />

      {temp && temp.unscouted.length + temp.scouted.length + temp.unmatched.length > 0 && (
        <UnfinishedUploads
          unscouted={temp.unscouted.map(tempRow)}
          scouted={temp.scouted.map(tempRow)}
          unmatched={temp.unmatched.map(tempRow)}
          // Newest first: the desk a dead run left half-built is almost always
          // the most recent one.
          desks={dbRows.slice(0, 25).map((r) => ({ slug: r.slug, title: r.title }))}
        />
      )}

      {openRuns.length > 0 && (
        <div className="mb-6 space-y-2">
          {openRuns.map((r) => {
            const failed = r.status === "failed";
            return (
              <Link
                key={r.id}
                href={`/recruitment/batch/${r.id}`}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                  failed
                    ? "border-rose-200 bg-rose-50/60 hover:border-rose-300"
                    : "border-sky-200 bg-sky-50/60 hover:border-sky-300"
                }`}
              >
                {failed ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                ) : (
                  <Loader2 className="w-3.5 h-3.5 text-sky-600 shrink-0 animate-spin" />
                )}
                <span className="text-sm font-medium text-stone-800 truncate">{r.title}</span>
                <span className="text-[11px] text-stone-500 truncate">
                  {failed ? "stopped part-way — carry on" : `scouting ${r.currentLabel ?? "…"}`}
                </span>
                <span className="ml-auto text-[11px] tabular-nums text-stone-500 shrink-0">
                  {r.doneCvs}/{r.totalCvs} CVs
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {docs.length === 0 ? (
        <p className="text-sm text-stone-400">No scouting docs yet.</p>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <DocCard key={d.slug} entry={d} canDelete={canDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
