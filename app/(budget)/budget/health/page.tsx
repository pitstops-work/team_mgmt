import { auth } from "@/lib/auth";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { portfolioHealth, unassessedPeriods } from "@/lib/budget/assessment";
import {
  RAG_LABELS,
  RAG_CLASSES,
  ASSESSMENT_WARN_DAYS,
  ASSESSMENT_STALE_DAYS,
} from "@/lib/budget/ragScale";

/**
 * The portfolio, worst first.
 *
 * `portfolioHealth()` has existed for a while with nothing rendering it, and
 * its most important design choice only pays off in a screen: it returns the
 * grants with NO assessment too, sorted ABOVE the red ones. An unassessed grant
 * is not a green grant, and a health dashboard that quietly drops them reports
 * a portfolio healthier than the one that exists. Today that is the whole
 * story — every approved grant is unassessed — so the page is mostly a list of
 * work nobody has done, which is the honest thing for it to be.
 *
 * Internal only. Role-gated rather than record-gated, because the question is
 * portfolio-wide; the rows are not narrowed to the granting units this reviewer
 * can reach, which is true of every portfolio view here and is a real limit
 * rather than a decision.
 */
export default async function PortfolioHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string }>;
}) {
  const session = await auth();
  if (!(isSuperAdmin(session) || isBudgetAdmin(session))) notFound();

  const { unit } = await searchParams;

  const [rows, overdue, units, slotCounts] = await Promise.all([
    portfolioHealth(unit ? { grantingUnitId: unit } : undefined),
    unassessedPeriods(),
    prisma.grantingUnit.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.budgetReportSlot.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const never = rows.filter((r) => r.overallRag === null);
  const rated = rows.filter((r) => r.overallRag !== null);
  const counts = {
    red: rated.filter((r) => r.overallRag === "red").length,
    amber: rated.filter((r) => r.overallRag === "amber").length,
    green: rated.filter((r) => r.overallRag === "green").length,
  };
  const diverging = rated.filter((r) => r.diverges).length;

  const approvedSlots = slotCounts.find((s) => s.status === "approved")?._count._all ?? 0;
  const pendingSlots = slotCounts
    .filter((s) => s.status !== "approved")
    .reduce((n, s) => n + s._count._all, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-stone-800">Portfolio health</h2>
          <p className="text-sm text-stone-500">
            The most recent view taken of each approved grant. Worst first, and never
            assessed counts as worst.
          </p>
        </div>
        <Link href="/budget/pipeline" className="text-sm text-sky-600 hover:underline">
          Pipeline →
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        {(["red", "amber", "green"] as const).map((r) => (
          <div key={r} className={`rounded-lg border px-3 py-2 ${RAG_CLASSES[r]}`}>
            <div className="text-xs uppercase tracking-wide opacity-70">{RAG_LABELS[r]}</div>
            <div className="text-xl tabular-nums">{counts[r]}</div>
          </div>
        ))}
        <div className="rounded-lg border border-stone-300 bg-stone-100 px-3 py-2 text-stone-700">
          <div className="text-xs uppercase tracking-wide opacity-70">Never assessed</div>
          <div className="text-xl tabular-nums">{never.length}</div>
        </div>
      </section>

      {never.length === rows.length && rows.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No grant in this portfolio has ever been assessed. Every figure above is a
          count of grants nobody has formed a recorded view about, so there is nothing
          here yet to read as reassurance.
        </div>
      )}

      {diverging > 0 && (
        <p className="text-sm text-stone-600">
          {diverging} grant{diverging === 1 ? "" : "s"} where the programme and finance
          views disagree — the case a single rating would have hidden.
        </p>
      )}

      {units.length > 1 && (
        <nav className="flex flex-wrap gap-2 text-xs">
          <Link
            href="/budget/health"
            className={`rounded-full border px-3 py-1 ${
              unit ? "border-stone-200 text-stone-500" : "border-stone-800 text-stone-800"
            }`}
          >
            All units
          </Link>
          {units.map((u) => (
            <Link
              key={u.id}
              href={`/budget/health?unit=${u.id}`}
              className={`rounded-full border px-3 py-1 ${
                unit === u.id ? "border-stone-800 text-stone-800" : "border-stone-200 text-stone-500"
              }`}
            >
              {u.name}
            </Link>
          ))}
        </nav>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 p-6 text-sm text-stone-500">
          No approved grants {unit ? "in this granting unit" : ""}.
        </div>
      ) : (
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
          {rows.map((r) => (
            <li key={r.budgetId} className="px-3 py-2">
              <Link href={`/budget/${r.budgetId}/assessment`} className="block group">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-stone-800 group-hover:underline">
                    {r.partnerName ?? "Unassigned"}
                    <span className="text-stone-400 text-xs ml-2">{r.name}</span>
                  </span>
                  {r.overallRag ? (
                    <span
                      className={`rounded border px-1.5 py-0.5 text-xs ${RAG_CLASSES[r.overallRag]}`}
                    >
                      {RAG_LABELS[r.overallRag]}
                    </span>
                  ) : (
                    <span className="rounded border border-stone-300 bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">
                      Never assessed
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                  {r.programmeRag && r.financeRag && (
                    <span className="text-stone-500">
                      programme {RAG_LABELS[r.programmeRag].toLowerCase()} · finance{" "}
                      {RAG_LABELS[r.financeRag].toLowerCase()}
                    </span>
                  )}
                  {r.diverges && <span className="text-stone-600">axes disagree</span>}
                  {r.staleDays !== null && (
                    <span
                      className={
                        r.staleDays >= ASSESSMENT_STALE_DAYS
                          ? "text-red-700"
                          : r.staleDays >= ASSESSMENT_WARN_DAYS
                            ? "text-amber-700"
                            : "text-stone-400"
                      }
                    >
                      {r.staleDays}d old
                    </span>
                  )}
                </div>
                {r.rationale && (
                  <p className="mt-1 text-xs text-stone-600 line-clamp-2">{r.rationale}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* ── Periods closed with nobody's view on them ─────────────────────── */}
      <section className="rounded-lg border border-stone-200 p-4">
        <div className="text-xs uppercase tracking-wide text-stone-400 mb-2">
          Reporting periods closed with no assessment
        </div>
        <p className="text-sm text-stone-500">
          The quiet failure this guards against: reports get approved on the financial
          detail alone, the judgement step is skipped, and the first anyone hears of a
          struggling grant is at closure.
        </p>
        {overdue.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">
            None.{" "}
            {pendingSlots > 0 && (
              <>
                That is not the reassurance it looks like: only {approvedSlots} reporting
                period{approvedSlots === 1 ? " has" : "s have"} been approved against{" "}
                {pendingSlots} still pending, and this list only looks at approved ones.
                The gap is upstream, in{" "}
                <Link href="/budget/disbursements" className="underline">
                  reporting
                </Link>
                , not here.
              </>
            )}
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {overdue.map((o) => (
              <li key={o.slotId} className="flex flex-wrap justify-between gap-3">
                <Link
                  href={`/budget/${o.budgetId}/assessment`}
                  className="text-stone-700 hover:underline"
                >
                  {o.partnerName ?? o.budgetName} · period {o.slotNumber}
                </Link>
                <span className="text-xs text-stone-400">
                  closed {o.periodEnded.toISOString().slice(0, 10)} · {o.daysSince}d ago
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
