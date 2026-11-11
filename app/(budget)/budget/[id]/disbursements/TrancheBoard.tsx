"use client";

/**
 * The release schedule for one grant.
 *
 * Two things this screen exists to make impossible to miss:
 *
 * 1. **Indicative money is never shown as committed.** Later grant years are
 *    projections off the budget, restated at the year boundary from utilisation
 *    and reallocations. They get their own column, their own badge, and no
 *    combined total anywhere on the page — because the moment the two are added
 *    together, the number stops being true.
 *
 * 2. **A blocked release says what is blocking it, by name.** The gate returns
 *    a list rather than a boolean precisely so this panel can print "Condition
 *    still open: audited accounts for FY24" instead of a disabled button with
 *    no explanation.
 */

import { useState, useTransition } from "react";
import {
  generateSchedule,
  recomputeYear,
  requestRelease,
  approveRelease,
  rejectRelease,
  confirmPayment,
  getReleaseGate,
} from "../../grant-actions";

type Blocker = { code: string; message: string };

type Payment = {
  id: string;
  amount: string;
  netAmount: string;
  valueDate: Date | string;
  bankReference: string | null;
  status: string;
};

type Request = {
  id: string;
  status: string;
  requestedAmount: string;
  submittedAt: Date | string | null;
};

export type Tranche = {
  id: string;
  trancheNumber: number;
  grantYear: number;
  plannedOn: Date | string;
  plannedAmount: string;
  status: string;
  isCommitted: boolean;
  restatedFromAmount: string | null;
  restatementNote: string | null;
  gatingSlot: { slotNumber: number; status: string } | null;
  requests: Request[];
  disbursements: Payment[];
};

const STATUS_STYLE: Record<string, string> = {
  planned: "bg-stone-100 text-stone-500",
  blocked: "bg-red-100 text-red-700",
  requested: "bg-sky-100 text-sky-700",
  approved: "bg-amber-100 text-amber-700",
  released: "bg-green-100 text-green-700",
  partially_released: "bg-lime-100 text-lime-700",
  cancelled: "bg-stone-200 text-stone-400 line-through",
};

function money(v: string | null) {
  if (v === null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function fmtDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TrancheBoard({
  budgetId,
  tranches,
  totals,
  canApprove,
  canRecord,
}: {
  budgetId: string;
  tranches: Tranche[];
  totals: { committed: string; indicative: string; years: number[] };
  canApprove: boolean;
  canRecord: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [gates, setGates] = useState<Record<string, Blocker[]>>({});
  const [openRow, setOpenRow] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, success?: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      else if (success) setNotice(success);
    });
  }

  async function showGate(trancheId: string) {
    const gate = await getReleaseGate(trancheId);
    setGates((g) => ({ ...g, [trancheId]: gate.blockers }));
    setOpenRow(trancheId);
  }

  const byYear = tranches.reduce<Record<number, Tranche[]>>((acc, t) => {
    (acc[t.grantYear] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Committed and indicative are shown side by side and NEVER added. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-stone-200 p-4">
          <div className="text-xs uppercase tracking-wide text-stone-400">Committed</div>
          <div className="text-2xl font-semibold text-stone-800 mt-1">{money(totals.committed)}</div>
          <p className="text-xs text-stone-500 mt-1">
            The current grant year, as approved. This is what the grantee can count on.
          </p>
        </div>
        <div className="rounded-lg border border-dashed border-stone-300 p-4 bg-stone-50">
          <div className="text-xs uppercase tracking-wide text-stone-400">Indicative</div>
          <div className="text-2xl font-semibold text-stone-500 mt-1">{money(totals.indicative)}</div>
          <p className="text-xs text-stone-500 mt-1">
            Later years, projected from the budget. Restated at each year boundary from what
            was actually spent and any approved reallocations — not a commitment, and
            deliberately not added to the figure beside it.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{error}</div>
      )}
      {notice && (
        <div className="rounded-md bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2">{notice}</div>
      )}

      {tranches.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-stone-300 rounded-lg">
          <p className="text-sm text-stone-500">No release schedule yet.</p>
          <p className="text-xs text-stone-400 mt-1">
            Generated from the budget&rsquo;s per-year totals, split across the agreement&rsquo;s
            release frequency.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => generateSchedule(budgetId), "Schedule generated.")}
            className="mt-4 px-3 py-1.5 text-sm rounded-md bg-stone-800 text-white disabled:opacity-50"
          >
            Generate schedule
          </button>
        </div>
      ) : (
        Object.entries(byYear).map(([year, rows]) => {
          const yearNum = Number(year);
          const uncommitted = rows.some((r) => !r.isCommitted);
          return (
            <div key={year} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-700">
                  Year {year}
                  {uncommitted && (
                    <span className="ml-2 text-xs font-normal text-stone-400">indicative</span>
                  )}
                </h3>
                {uncommitted && yearNum > 1 && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => recomputeYear(budgetId, yearNum),
                        `Year ${year} restated and committed.`,
                      )
                    }
                    className="text-xs px-2 py-1 rounded border border-stone-300 text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                  >
                    Recompute &amp; commit year {year}
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-stone-400 border-b border-stone-200">
                      <th className="py-2 pr-3">#</th>
                      <th className="py-2 pr-3">Planned</th>
                      <th className="py-2 pr-3 text-right">Amount</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Gate</th>
                      <th className="py-2 pr-3 text-right">Paid</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => {
                      const paid = t.disbursements
                        .filter((d) => d.status === "released")
                        .reduce((a, d) => a + Number(d.amount), 0);
                      const openRequest = t.requests.find((r) =>
                        ["submitted", "approved"].includes(r.status),
                      );
                      const blockers = gates[t.id];
                      return (
                        <tr key={t.id} className="border-b border-stone-100 align-top">
                          <td className="py-2 pr-3 text-stone-500">{t.trancheNumber}</td>
                          <td className="py-2 pr-3 text-stone-600">{fmtDate(t.plannedOn)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-stone-800">
                            {money(t.plannedAmount)}
                            {t.restatedFromAmount && (
                              <div
                                className="text-xs text-stone-400"
                                title={t.restatementNote ?? undefined}
                              >
                                was {money(t.restatedFromAmount)}
                              </div>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs ${STATUS_STYLE[t.status] ?? "bg-stone-100 text-stone-500"}`}
                            >
                              {t.status.replace(/_/g, " ")}
                            </span>
                            {!t.isCommitted && (
                              <span className="ml-1 px-1.5 py-0.5 rounded text-xs bg-stone-100 text-stone-400 border border-dashed border-stone-300">
                                indicative
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            {t.gatingSlot ? (
                              <span className="text-xs text-stone-500">
                                report {t.gatingSlot.slotNumber} · {t.gatingSlot.status.replace(/_/g, " ")}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => showGate(t.id)}
                                className="text-xs text-stone-500 underline hover:text-stone-700"
                              >
                                check
                              </button>
                            )}
                            {openRow === t.id && blockers && (
                              <ul className="mt-1 space-y-0.5">
                                {blockers.length === 0 ? (
                                  <li className="text-xs text-green-700">Clear to release.</li>
                                ) : (
                                  blockers.map((b, i) => (
                                    <li key={i} className="text-xs text-red-700">
                                      {b.message}
                                    </li>
                                  ))
                                )}
                              </ul>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-stone-600">
                            {paid ? money(String(paid)) : "—"}
                            {t.disbursements
                              .filter((d) => d.bankReference)
                              .map((d) => (
                                <div key={d.id} className="text-xs text-stone-400">
                                  {d.bankReference}
                                </div>
                              ))}
                          </td>
                          <td className="py-2 text-right whitespace-nowrap">
                            <TrancheActions
                              tranche={t}
                              openRequest={openRequest}
                              canApprove={canApprove}
                              canRecord={canRecord}
                              pending={pending}
                              run={run}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function TrancheActions({
  tranche,
  openRequest,
  canApprove,
  canRecord,
  pending,
  run,
}: {
  tranche: Tranche;
  openRequest: Request | undefined;
  canApprove: boolean;
  canRecord: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, success?: string) => void;
}) {
  const [mode, setMode] = useState<null | "request" | "approve" | "pay">(null);
  const [justification, setJustification] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [valueDate, setValueDate] = useState(new Date().toISOString().slice(0, 10));
  const [tds, setTds] = useState("0");

  // An indicative tranche offers no actions at all: requesting against a
  // projection is refused server-side, and offering the button would be a lie.
  if (!tranche.isCommitted) {
    return <span className="text-xs text-stone-400">commit the year first</span>;
  }
  if (tranche.status === "cancelled") return null;

  if (!openRequest && tranche.status !== "released") {
    return mode === "request" ? (
      <div className="text-left space-y-1">
        <textarea
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          placeholder="What is this release for?"
          rows={2}
          className="w-56 text-xs border border-stone-300 rounded px-2 py-1"
        />
        <div className="flex gap-1 justify-end">
          <button
            type="button"
            className="text-xs px-2 py-1 text-stone-500"
            onClick={() => setMode(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || !justification.trim()}
            onClick={() =>
              run(
                () => requestRelease({ trancheId: tranche.id, justification }),
                "Release requested.",
              )
            }
            className="text-xs px-2 py-1 rounded bg-stone-800 text-white disabled:opacity-50"
          >
            Request
          </button>
        </div>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => setMode("request")}
        className="text-xs px-2 py-1 rounded border border-stone-300 text-stone-600 hover:bg-stone-50"
      >
        Request release
      </button>
    );
  }

  if (openRequest?.status === "submitted" && canApprove) {
    return mode === "approve" ? (
      <div className="text-left space-y-1">
        <input
          value={overrideReason}
          onChange={(e) => setOverrideReason(e.target.value)}
          placeholder="Override reason (only if blocked)"
          className="w-56 text-xs border border-stone-300 rounded px-2 py-1"
        />
        <div className="flex gap-1 justify-end">
          <button type="button" className="text-xs px-2 py-1 text-stone-500" onClick={() => setMode(null)}>
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  rejectRelease(openRequest.id, overrideReason || "Not approved").then((r) => ({
                    ...r,
                  })),
                "Request rejected.",
              )
            }
            className="text-xs px-2 py-1 rounded border border-red-300 text-red-700"
          >
            Reject
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  approveRelease(openRequest.id, {
                    overrideReason: overrideReason.trim() || undefined,
                  }),
                "Release approved.",
              )
            }
            className="text-xs px-2 py-1 rounded bg-stone-800 text-white disabled:opacity-50"
          >
            Approve
          </button>
        </div>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => setMode("approve")}
        className="text-xs px-2 py-1 rounded bg-amber-600 text-white"
      >
        Review request
      </button>
    );
  }

  if (openRequest?.status === "approved" && canRecord) {
    return mode === "pay" ? (
      <div className="text-left space-y-1">
        <input
          value={bankReference}
          onChange={(e) => setBankReference(e.target.value)}
          placeholder="UTR / cheque no."
          className="w-56 text-xs border border-stone-300 rounded px-2 py-1"
        />
        <div className="flex gap-1">
          <input
            type="date"
            value={valueDate}
            onChange={(e) => setValueDate(e.target.value)}
            className="text-xs border border-stone-300 rounded px-2 py-1"
          />
          <input
            value={tds}
            onChange={(e) => setTds(e.target.value)}
            placeholder="TDS"
            className="w-20 text-xs border border-stone-300 rounded px-2 py-1"
          />
        </div>
        <div className="flex gap-1 justify-end">
          <button type="button" className="text-xs px-2 py-1 text-stone-500" onClick={() => setMode(null)}>
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || !bankReference.trim()}
            onClick={() =>
              run(
                () =>
                  confirmPayment({
                    requestId: openRequest.id,
                    amount: Number(openRequest.requestedAmount),
                    tdsAmount: Number(tds) || 0,
                    valueDate,
                    bankReference,
                  }),
                "Payment confirmed.",
              )
            }
            className="text-xs px-2 py-1 rounded bg-green-700 text-white disabled:opacity-50"
          >
            Confirm paid
          </button>
        </div>
        <p className="text-xs text-stone-400 w-56">
          Records a payment made in the accounting system. The reference is what ties
          the two together.
        </p>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => setMode("pay")}
        className="text-xs px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50"
      >
        Confirm paid
      </button>
    );
  }

  if (openRequest?.status === "submitted") {
    return <span className="text-xs text-stone-400">awaiting approval</span>;
  }
  if (openRequest?.status === "approved") {
    return <span className="text-xs text-amber-600">approved, unpaid</span>;
  }
  return null;
}
