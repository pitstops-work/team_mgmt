import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { getPartnerAccess, partnerCanAccessBudget } from "@/lib/budget/partnerAccess";
import { closureFigures, closureGate, closureAssets } from "@/lib/budget/closure";
import { moneyToString } from "@/lib/budget/money";
import { SETTLEMENT_MODE_LABELS } from "@/lib/budget/closureVocabulary";
import ClosurePanel from "./ClosurePanel";

/**
 * Winding one grant up.
 *
 * The grantee sees the money — released, utilised, what is left and how it was
 * settled — because it is their account as much as ours, and the commonest
 * closure dispute is about exactly those four numbers.
 *
 * They do not see the exit decision or the exception note. "Exit — the
 * relationship ends here" is a management decision about the relationship,
 * taken before it is communicated; an exception note is our own record of
 * having closed past our own gate, which is an internal control failure, not
 * something the grantee did.
 */
export default async function ClosurePage({ params }: { params: Promise<{ id: string }> }) {
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
      grantPartner: { select: { id: true, name: true } },
      reportConfig: { select: { grantEndDate: true } },
      closure: {
        select: {
          status: true,
          initiatedAt: true,
          closedAt: true,
          settlementMode: true,
          adjustedIntoBudgetId: true,
          adjustedIntoBudget: { select: { id: true, name: true } },
          refundAmount: true,
          refundReceivedOn: true,
          refundReference: true,
          writeOffNote: true,
          exitDecision: true,
          exitNote: true,
          exceptionNote: true,
          borrowingsSettled: true,
          totalReleased: true,
          totalUtilised: true,
          unspentAmount: true,
          closedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!budget) notFound();

  const canReview = isSuperAdmin(session) || isBudgetAdmin(session);
  const partnerAccess = await getPartnerAccess(session);
  const isGrantee = partnerCanAccessBudget(partnerAccess, budget);
  const isOwner = budget.partnerId === session?.user?.id;
  if (!canReview && !isGrantee && !isOwner) notFound();

  const [figures, gate, assets] = await Promise.all([
    closureFigures(id),
    closureGate(id),
    closureAssets(id),
  ]);

  const closed =
    budget.closure?.status === "closed" || budget.closure?.status === "closed_with_exception";

  const fmt = (d: Date | null | undefined) =>
    d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null;

  // ── The grantee's view: the money, and what is still wanted from them ────
  if (!canReview) {
    const c = budget.closure;
    // Frozen once closed; live while still open. Saying which is the point —
    // a closed grant's figures must not look like they might still move.
    const money = closed
      ? {
          released: moneyToString(c!.totalReleased),
          utilised: moneyToString(c!.totalUtilised),
          unspent: moneyToString(c!.unspentAmount),
        }
      : {
          released: moneyToString(figures.totalReleased),
          utilised: moneyToString(figures.totalUtilised),
          unspent: moneyToString(figures.unspent),
        };

    // Only the blockers they can act on. "Report 3 is not approved" is theirs
    // to fix; an unsettled borrowing between two of our grants is not.
    const theirs = gate.blockers.filter(
      (b) => b.code === "report_open" || b.code === "document_missing" || b.code === "condition_open",
    );

    return (
      <div className="max-w-2xl space-y-6">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-stone-800">Closure</h2>
          <p className="text-sm text-stone-500">{budget.name}</p>
        </header>

        <section className="rounded-lg border border-stone-200 bg-white">
          <div className="flex items-baseline justify-between border-b border-stone-200 px-4 py-2">
            <h3 className="text-sm font-medium text-stone-700">The account</h3>
            <span className="text-xs text-stone-400">
              {closed ? `Final, as at ${fmt(c!.closedAt)}` : "Still moving"}
            </span>
          </div>
          <dl className="divide-y divide-stone-100">
            {[
              ["Released to you", money.released],
              ["Utilised", money.utilised],
              ["Unspent", money.unspent],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between px-4 py-2.5">
                <dt className="text-sm text-stone-600">{label}</dt>
                <dd className="text-sm tabular-nums text-stone-800">₹{value}</dd>
              </div>
            ))}
          </dl>
          {!closed && (
            <p className="border-t border-stone-100 px-4 py-2 text-xs text-stone-400">
              Utilisation counts approved reports only, so this figure rises as
              reports are approved.
            </p>
          )}
        </section>

        {c?.settlementMode && (
          <section className="rounded-lg border border-stone-200 bg-white px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-stone-400">Unspent balance</div>
            <p className="mt-1 text-sm text-stone-700">
              {SETTLEMENT_MODE_LABELS[c.settlementMode as "refunded"] ?? c.settlementMode}
              {c.adjustedIntoBudget ? ` — into ${c.adjustedIntoBudget.name}` : ""}
              {c.refundReference ? ` — reference ${c.refundReference}` : ""}
            </p>
          </section>
        )}

        {!closed && theirs.length > 0 && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h3 className="text-sm font-medium text-amber-900">Still needed from you</h3>
            <ul className="mt-2 space-y-1">
              {theirs.map((b, i) => (
                <li key={i} className="text-sm text-amber-800">
                  {b.message}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-3 text-sm">
              <Link href={`/budget/${id}/reports`} className="text-sky-700 hover:underline">
                Reports →
              </Link>
              <Link href={`/budget/${id}/documents`} className="text-sky-700 hover:underline">
                Documents →
              </Link>
            </div>
          </section>
        )}

        {closed && (
          <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
            This grant was closed on {fmt(c!.closedAt)}. Its figures are final.
          </p>
        )}
      </div>
    );
  }

  // ── The internal view ───────────────────────────────────────────────────
  // Candidates to carry a balance into: the same grantee's other live grants.
  // Restricting to the same grantee is the point — carrying one organisation's
  // unspent money into another's would be untraceable in exactly the way the
  // settlement rules exist to prevent.
  const carryTargets = budget.grantPartner
    ? await prisma.budget.findMany({
        where: {
          grantPartnerId: budget.grantPartner.id,
          id: { not: id },
          status: { not: "closed" },
        },
        select: { id: true, name: true, status: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <ClosurePanel
      budgetId={id}
      budgetName={budget.name}
      granteeName={budget.grantPartner?.name ?? null}
      grantEndDate={budget.reportConfig?.grantEndDate?.toISOString() ?? null}
      live={{
        totalReleased: moneyToString(figures.totalReleased),
        totalUtilised: moneyToString(figures.totalUtilised),
        unspent: moneyToString(figures.unspent),
        openBorrowings: figures.openBorrowings,
      }}
      gate={gate}
      closure={JSON.parse(JSON.stringify(budget.closure))}
      assets={JSON.parse(JSON.stringify(assets))}
      carryTargets={carryTargets}
    />
  );
}
