import { auth } from "@/lib/auth";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { activeDecision, decisionHistory } from "@/lib/budget/decision";
import { baselineVarianceFor } from "@/lib/budget/baselineDiff";
import { moneyToString } from "@/lib/budget/money";
import { activeYearBands } from "@/lib/budget-generator";
import DecisionPanel, { type ExistingDecision } from "./DecisionPanel";

/**
 * The decision of record for one grant.
 *
 * Internal only — a grantee has no business reading the committee's reasoning,
 * and the decline notes in particular are written for institutional memory
 * rather than for the applicant.
 */
export default async function DecisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const canReview = isSuperAdmin(session) || isBudgetAdmin(session);
  if (!canReview) notFound();

  const budget = await prisma.budget.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      horizonMonths: true,
      approvedAt: true,
      grantPartner: { select: { name: true } },
      lines: {
        select: { y1Total: true, y2Total: true, y3Total: true, y4Total: true, y5Total: true },
      },
    },
  });
  if (!budget) notFound();

  // The budget's own total across its active year bands — what the committee
  // would have been asked to approve.
  const bands = activeYearBands(budget.horizonMonths);
  const budgetTotal = budget.lines.reduce((sum, l) => {
    let s = l.y1Total;
    if (bands >= 2) s += l.y2Total;
    if (bands >= 3) s += l.y3Total;
    if (bands >= 4) s += l.y4Total;
    if (bands >= 5) s += l.y5Total;
    return sum + s;
  }, 0);

  const [decision, history, variance] = await Promise.all([
    activeDecision(id),
    decisionHistory(id),
    baselineVarianceFor(id),
  ]);

  // A grant already marked approved, with no decision behind it, was approved
  // before any of this existed — so anything recorded now is a write-up, and
  // the form should say so before the person ticks anything.
  const looksRetrospective = Boolean(budget.approvedAt && !decision);
  const approvedAtLabel = budget.approvedAt
    ? `on ${budget.approvedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
    : null;

  const existing: ExistingDecision | null = decision
    ? {
        id: decision.id,
        outcome: decision.outcome,
        forum: decision.forum,
        decidedOn: decision.decidedOn,
        approvedAmount: moneyToString(decision.approvedAmount),
        variationNote: decision.variationNote,
        reasonCode: decision.reasonCode,
        conditions: decision.conditions.map((c) => ({
          id: c.id,
          text: c.text,
          timing: c.timing,
          status: c.status,
          dueOn: c.dueOn,
          blocksTrancheNumber: c.blocksTrancheNumber,
        })),
      }
    : null;

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-stone-800">Decision</h2>
        <p className="text-sm text-stone-500">
          {budget.name} · {budget.grantPartner?.name ?? "Unassigned"}
        </p>
      </header>

      {!decision && budget.status === "approved" && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
          This grant is marked approved but has no decision behind it. Until now, approval
          happened as a by-product of setting up reporting — so there is a flag, but no
          record of who decided, when, or on what terms. Recording one here is what the
          release schedule and the closure checks read.
        </div>
      )}

      <DecisionPanel
        budgetId={id}
        budgetTotal={budgetTotal}
        existing={existing}
        canRecord={canReview}
        looksRetrospective={looksRetrospective}
        approvedAtLabel={approvedAtLabel}
      />

      {variance.status === "reconstructed" && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs uppercase tracking-wide text-amber-700">Baseline</div>
          <p className="text-sm text-amber-900 mt-1">
            This decision was written up after the fact, so its baseline is today&rsquo;s
            budget rather than the lines that were approved. No variance is reported against
            it — a diff would read as &ldquo;nothing has changed since approval&rdquo;, which
            is the most misleading answer available.
          </p>
          {variance.note && (
            <p className="text-xs text-amber-800 mt-2">Source: {variance.note}</p>
          )}
        </section>
      )}

      {variance.status === "ok" && (
        <section className="rounded-lg border border-stone-200 p-4">
          <div className="flex items-baseline justify-between">
            <div className="text-xs uppercase tracking-wide text-stone-400">
              Against the approved baseline
            </div>
            <div className="text-sm tabular-nums text-stone-700">
              {variance.diff.unchanged
                ? "unchanged"
                : `${variance.diff.changes.length} change(s) · ${variance.diff.delta}`}
            </div>
          </div>
          {!variance.diff.unchanged && (
            <ul className="mt-2 space-y-1 text-sm">
              {variance.diff.changes.slice(0, 12).map((c, i) => (
                <li key={i} className="text-stone-600">
                  {c.kind === "added" && <span className="text-green-700">added </span>}
                  {c.kind === "removed" && <span className="text-red-700">removed </span>}
                  {c.kind === "changed" ? (
                    <>
                      {c.description}{" "}
                      <span className="text-stone-400">
                        {c.fromTotal} → {c.toTotal}
                      </span>
                    </>
                  ) : (
                    c.line.description
                  )}
                </li>
              ))}
              {variance.diff.changes.length > 12 && (
                <li className="text-xs text-stone-400">
                  …and {variance.diff.changes.length - 12} more
                </li>
              )}
            </ul>
          )}
        </section>
      )}

      {history.length > 1 && (
        <section className="rounded-lg border border-stone-200 p-4">
          <div className="text-xs uppercase tracking-wide text-stone-400 mb-2">
            How many times this went to a forum
          </div>
          <ul className="space-y-1 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex justify-between gap-3">
                <span className="text-stone-700">
                  {h.outcome.replace(/_/g, " ")}
                  <span className="text-stone-400 text-xs ml-1">{h.forum}</span>
                </span>
                <span className="text-stone-400 text-xs whitespace-nowrap">
                  {new Date(h.decidedOn).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                  {h.recordedBy?.name ? ` · ${h.recordedBy.name}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex gap-3 pt-2">
        <Link href={`/budget/${id}`} className="text-sm text-stone-500 hover:text-stone-700">
          ← Back to the grant
        </Link>
        {decision && (
          <Link
            href={`/budget/${id}/disbursements`}
            className="text-sm text-sky-600 hover:underline"
          >
            Releases →
          </Link>
        )}
      </div>
    </div>
  );
}
