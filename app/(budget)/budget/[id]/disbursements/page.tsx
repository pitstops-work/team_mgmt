import { auth } from "@/lib/auth";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { getPartnerAccess, partnerCanAccessBudget } from "@/lib/budget/partnerAccess";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTrancheView } from "../../grant-actions";
import { activeDecision } from "@/lib/budget/decision";
import { moneyToString } from "@/lib/budget/money";
import TrancheBoard from "./TrancheBoard";

/**
 * The release schedule and payment confirmations for one grant.
 *
 * Grantee-visible, read-only: a grantee should be able to see what is coming,
 * what is blocking the next tranche and which bank reference matches which
 * credit in their statement, without having to ask. The actions are gated to
 * internal reviewers, and the server re-checks all of it regardless.
 */
export default async function DisbursementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  const budget = await prisma.budget.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      partnerId: true,
      grantPartnerId: true,
      grantPartner: { select: { name: true } },
      agreement: {
        select: { status: true, trancheFrequency: true, effectiveFrom: true, effectiveTo: true },
      },
    },
  });
  if (!budget) notFound();

  const canReview = isSuperAdmin(session) || isBudgetAdmin(session);
  const partnerAccess = await getPartnerAccess(session);
  const isGrantee = partnerCanAccessBudget(partnerAccess, budget);
  const isOwner = budget.partnerId === session?.user?.id;
  if (!canReview && !isGrantee && !isOwner) notFound();

  const decision = await activeDecision(id);

  if (budget.status === "draft" || budget.status === "final") {
    return (
      <div className="text-center py-20 text-stone-400">
        <p className="text-sm">This grant has not been approved yet.</p>
        <p className="text-xs mt-1 text-stone-300">
          A release schedule is generated once there is a decision to release against.
        </p>
      </div>
    );
  }

  if (!decision) {
    // The grant is approved but has no decision record — a pre-existing grant
    // from before the decision model existed. Say so plainly rather than
    // rendering an empty schedule that looks like a configuration mistake.
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-sm text-stone-600">
          This grant was approved before approvals were recorded as decisions, so there is
          nothing to release against yet.
        </p>
        <p className="text-xs text-stone-400 mt-2">
          Record the decision that approved it — forum, date, amount and any conditions —
          and the schedule can be generated from the budget&rsquo;s per-year totals.
        </p>
        <Link
          href={`/budget/${id}`}
          className="inline-block mt-4 text-xs px-3 py-1.5 rounded border border-stone-300 text-stone-600"
        >
          Back to the grant
        </Link>
      </div>
    );
  }

  const { tranches, totals } = await getTrancheView(id);

  const agreementExecuted = budget.agreement?.status === "executed";

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-stone-800">Releases</h2>
        <p className="text-sm text-stone-500">
          {budget.grantPartner?.name ?? "Unassigned"} · approved{" "}
          {`₹${Number(moneyToString(decision.approvedAmount)).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
          {budget.agreement?.trancheFrequency
            ? ` · ${budget.agreement.trancheFrequency.replace(/_/g, "-")} releases`
            : ""}
        </p>
      </header>

      {!agreementExecuted && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
          <strong className="font-medium">No executed agreement.</strong> Nothing can be
          released until the agreement is signed by both sides and marked executed — the
          gate below will keep refusing until then.
        </div>
      )}

      {decision.conditions.some((c) => c.status === "open") && (
        <div className="rounded-md bg-stone-50 border border-stone-200 px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-stone-400 mb-1">Open conditions</div>
          <ul className="space-y-1">
            {decision.conditions
              .filter((c) => c.status === "open")
              .map((c) => (
                <li key={c.id} className="text-sm text-stone-700">
                  <span className="text-xs text-stone-400 mr-1">
                    [{c.timing.replace(/_/g, " ")}
                    {c.blocksTrancheNumber ? ` · tranche ${c.blocksTrancheNumber}` : ""}]
                  </span>
                  {c.text}
                </li>
              ))}
          </ul>
        </div>
      )}

      <TrancheBoard
        budgetId={id}
        tranches={tranches}
        totals={totals}
        canApprove={canReview}
        canRecord={canReview}
      />

      <p className="text-xs text-stone-400 max-w-2xl">
        Payments here mirror the accounting system, which stays the record of what left the
        bank. A row exists so the gap between what was approved and what was actually paid
        is visible; the bank reference is what ties the two together.
      </p>
    </div>
  );
}
