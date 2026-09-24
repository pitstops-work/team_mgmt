import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MapPin, UserSearch } from "lucide-react";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import prisma from "@/lib/prisma";
import { describeRun } from "@/lib/recruitment/batchRunner";
import BatchProgress from "../BatchProgress";

export const dynamic = "force-dynamic";

/**
 * The desks produced by one multi-city run, in one place.
 *
 * A single posting for a multi-location JD draws CVs for every city at once.
 * Triage splits them and each city gets its own desk, because generation is
 * single-city. This is the landing page after such a run — the one link that
 * holds all of them.
 */
export default async function RecruitmentBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const session = await auth();
  const ctx = await buildRbacContext(session, { surface: "recruitment.list" });
  if (!(await can(ctx, "recruitment", "read"))) notFound();

  const { batchId } = await params;
  // The run row exists from the moment the recruiter confirms the split —
  // before any desk does. So the page has to be openable with zero desks on
  // it, which is also the state they land in straight after pressing Scout.
  const run = await prisma.recruitmentBatchRun.findUnique({ where: { id: batchId } });
  // A recovery run appends to a desk an EARLIER run created, so that desk
  // carries the earlier batchId. Find it by the slug in the plan too, or the
  // page shows "0 candidates" and no desk while the run fills it.
  const planSlugs = run ? describeRun(run).desks.flatMap((d) => (d.slug ? [d.slug] : [])) : [];
  const days = await prisma.recruitmentScoutingDay.findMany({
    where: planSlugs.length ? { OR: [{ batchId }, { slug: { in: planSlugs } }] } : { batchId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      slug: true,
      title: true,
      matchday: true,
      snapshotJson: true,
      location: { select: { city: true } },
      job: { select: { title: true, slug: true } },
    },
  });
  if (days.length === 0 && !run) notFound();

  const totalCandidates = days.reduce((n, d) => {
    const snap = d.snapshotJson as { candidates?: unknown[] } | null;
    return n + (Array.isArray(snap?.candidates) ? snap.candidates.length : 0);
  }, 0);
  const job = days[0]?.job ?? null;
  const progress = run ? describeRun(run) : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/recruitment" className="text-stone-400 hover:text-stone-600">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <UserSearch className="w-5 h-5 text-sky-500" />
        <h1 className="text-lg font-semibold text-stone-900">
          {progress && progress.status !== "done"
            ? `${progress.desks.length} desk${progress.desks.length === 1 ? "" : "s"} from one posting`
            : `${days.length} desks from one posting`}
        </h1>
      </div>
      <p className="text-sm text-stone-500 mb-6 leading-relaxed">
        {job ? (
          <>
            <Link href={`/recruitment/jobs/${job.slug}`} className="text-sky-600 hover:underline">{job.title}</Link>{" "}
          </>
        ) : null}
        — {totalCandidates} candidate{totalCandidates === 1 ? "" : "s"} sorted across{" "}
        {progress ? progress.desks.length : days.length}{" "}
        {(progress ? progress.desks.length : days.length) === 1 ? "city" : "cities"}. Each desk judges its pool against that city&apos;s own
        language, reference orgs and red flags.
      </p>

      {progress && <BatchProgress initial={progress} />}

      <div className="space-y-2">
        {days.map((d) => {
          const snap = d.snapshotJson as { candidates?: unknown[] } | null;
          const n = Array.isArray(snap?.candidates) ? snap.candidates.length : 0;
          return (
            <Link
              key={d.id}
              href={`/recruitment/${d.slug}`}
              className="block bg-white border border-stone-200 rounded-xl p-3 hover:border-sky-300 hover:bg-sky-50/40"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-stone-800">{d.title}</span>
                {d.location && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600 inline-flex items-center gap-0.5">
                    <MapPin className="w-2.5 h-2.5" /> {d.location.city}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-stone-400 mt-0.5">
                {n} candidate{n === 1 ? "" : "s"}
                {d.matchday
                  ? ` · ${new Date(d.matchday).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                  : ""}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
