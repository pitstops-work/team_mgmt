import { auth } from "@/lib/auth";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { approvedUnpaid } from "@/lib/budget/disbursement";
import { overdueForClosure } from "@/lib/budget/closure";
import { expiringCompliance } from "@/lib/budget/compliance";
import { moneyToString } from "@/lib/budget/money";

/**
 * The portfolio release queue.
 *
 * Four lists, in the order someone working through a week would want them:
 * requests waiting on an approval, releases approved but not yet paid, grants
 * that should have closed, and registrations about to lapse.
 *
 * The second list is the one that did not exist in any form before. With
 * accounting as the system of record, the interesting number is not what was
 * paid — accounting knows that — but the gap: money this system said to release
 * that nobody has confirmed leaving. Age is shown in days because a
 * three-week-old approved release is a grantee wondering where their money is.
 */
function money(v: string) {
  const n = Number(v);
  return `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function fmtDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Over a fortnight unpaid is where a grantee starts chasing. */
const STALE_DAYS = 14;

export default async function DisbursementQueuePage() {
  const session = await auth();
  if (!isSuperAdmin(session) && !isBudgetAdmin(session)) notFound();

  const [pendingRequests, unpaid, overdueClosures, expiring] = await Promise.all([
    prisma.disbursementRequest.findMany({
      where: { status: "submitted" },
      select: {
        id: true,
        requestedAmount: true,
        submittedAt: true,
        justification: true,
        gateSnapshot: true,
        submittedBy: { select: { name: true, email: true } },
        tranche: {
          select: {
            trancheNumber: true,
            budgetId: true,
            budget: { select: { name: true, grantPartner: { select: { name: true } } } },
          },
        },
      },
      orderBy: { submittedAt: "asc" },
    }),
    approvedUnpaid(),
    overdueForClosure({ graceDays: 30 }),
    expiringCompliance({ withinDays: 90 }),
  ]);

  return (
    <div className="space-y-10 max-w-5xl">
      <header>
        <h1 className="text-xl font-semibold text-stone-800">Release queue</h1>
        <p className="text-sm text-stone-500 mt-1">
          What is waiting on someone. Payments themselves live in the accounting system —
          what this page tracks is the decisions, and the gap between a decision and the
          money actually moving.
        </p>
      </header>

      {/* 1. Awaiting approval */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-stone-700">
          Awaiting approval <span className="text-stone-400 font-normal">({pendingRequests.length})</span>
        </h2>
        {pendingRequests.length === 0 ? (
          <p className="text-sm text-stone-400">Nothing waiting.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-stone-400 border-b border-stone-200">
                <th className="py-2 pr-3">Grant</th>
                <th className="py-2 pr-3">Tranche</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 pr-3">Raised by</th>
                <th className="py-2 pr-3">Submitted</th>
                <th className="py-2">Gate at submit</th>
              </tr>
            </thead>
            <tbody>
              {pendingRequests.map((r) => {
                // The gate as it stood when the request was raised. A condition
                // discharged since then does not rewrite this — that is the
                // point of freezing it — so the live gate is re-read at approval.
                const snapshot = r.gateSnapshot as { ok?: boolean; blockers?: { message: string }[] } | null;
                const blockers = snapshot?.blockers ?? [];
                return (
                  <tr key={r.id} className="border-b border-stone-100 align-top">
                    <td className="py-2 pr-3">
                      <Link
                        href={`/budget/${r.tranche.budgetId}/disbursements`}
                        className="text-stone-800 hover:underline"
                      >
                        {r.tranche.budget.name}
                      </Link>
                      <div className="text-xs text-stone-400">
                        {r.tranche.budget.grantPartner?.name ?? "Unassigned"}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-stone-500">{r.tranche.trancheNumber}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {money(moneyToString(r.requestedAmount))}
                    </td>
                    <td className="py-2 pr-3 text-stone-500">
                      {r.submittedBy?.name ?? r.submittedBy?.email ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-stone-500">{fmtDate(r.submittedAt)}</td>
                    <td className="py-2">
                      {blockers.length === 0 ? (
                        <span className="text-xs text-green-700">clear</span>
                      ) : (
                        <span className="text-xs text-red-700">
                          {blockers.length} blocker{blockers.length > 1 ? "s" : ""}
                          <span className="text-stone-400"> · {blockers[0].message}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* 2. Approved but unpaid — the gap */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-stone-700">
          Approved, not confirmed paid{" "}
          <span className="text-stone-400 font-normal">({unpaid.length})</span>
        </h2>
        <p className="text-xs text-stone-400">
          Released by decision here, with no payment confirmed back from accounting. Either
          the payment has not been made, or it has and nobody recorded the reference.
        </p>
        {unpaid.length === 0 ? (
          <p className="text-sm text-stone-400">Nothing outstanding.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-stone-400 border-b border-stone-200">
                <th className="py-2 pr-3">Grant</th>
                <th className="py-2 pr-3">Tranche</th>
                <th className="py-2 pr-3">Approved</th>
                <th className="py-2 pr-3 text-right">Outstanding</th>
                <th className="py-2">Age</th>
              </tr>
            </thead>
            <tbody>
              {unpaid.map((u) => (
                <tr key={u.requestId} className="border-b border-stone-100">
                  <td className="py-2 pr-3">
                    <Link
                      href={`/budget/${u.budgetId}/disbursements`}
                      className="text-stone-800 hover:underline"
                    >
                      {u.budgetName}
                    </Link>
                    <div className="text-xs text-stone-400">{u.partnerName ?? "Unassigned"}</div>
                  </td>
                  <td className="py-2 pr-3 text-stone-500">{u.trancheNumber}</td>
                  <td className="py-2 pr-3 text-stone-500">{fmtDate(u.approvedOn)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(u.outstanding)}</td>
                  <td className="py-2">
                    <span
                      className={
                        u.ageDays !== null && u.ageDays > STALE_DAYS
                          ? "text-xs text-red-700"
                          : "text-xs text-stone-500"
                      }
                    >
                      {u.ageDays === null ? "—" : `${u.ageDays}d`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 3. Grants that should have ended */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-stone-700">
          Overdue for closure{" "}
          <span className="text-stone-400 font-normal">({overdueClosures.length})</span>
        </h2>
        <p className="text-xs text-stone-400">
          Past their end date and still counted as live, so every portfolio total includes
          them.
        </p>
        {overdueClosures.length === 0 ? (
          <p className="text-sm text-stone-400">Nothing overdue.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {overdueClosures.map((c) => (
              <li key={c.budgetId} className="py-2 flex items-baseline justify-between gap-3">
                <div>
                  <Link href={`/budget/${c.budgetId}`} className="text-sm text-stone-800 hover:underline">
                    {c.name}
                  </Link>
                  <span className="text-xs text-stone-400 ml-2">{c.partnerName ?? "Unassigned"}</span>
                </div>
                <div className="text-xs text-stone-500 whitespace-nowrap">
                  ended {fmtDate(c.endedOn)} · {c.daysOverdue}d · {c.closureStatus.replace(/_/g, " ")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 4. Registrations lapsing */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-stone-700">
          Compliance lapsing <span className="text-stone-400 font-normal">({expiring.length})</span>
        </h2>
        {expiring.length === 0 ? (
          <p className="text-sm text-stone-400">Nothing expiring in the next 90 days.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {expiring.map((e) => (
              <li key={e.complianceId} className="py-2 flex items-baseline justify-between gap-3">
                <div className="text-sm text-stone-800">
                  {e.orgName}
                  <span className="text-xs text-stone-400 ml-2">{e.label}</span>
                  {e.blocksRelease && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                      blocks release
                    </span>
                  )}
                </div>
                <div className="text-xs whitespace-nowrap">
                  <span className={e.state === "expired" ? "text-red-700" : "text-amber-700"}>
                    {e.state}
                  </span>
                  <span className="text-stone-400"> · {fmtDate(e.validUntil)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
