"use client";

/**
 * Recording what was decided about a grant.
 *
 * This is the screen that did not exist: approval was a side effect of setting
 * up reporting, so nothing said who decided, when, in which forum, or on what
 * terms. Everything downstream — the release gate, the baseline a variance is
 * measured against, the closure checks — hangs off the record this form makes.
 *
 * Two things the form is deliberately strict about, because both are the kind
 * of error that looks fine on the day and is unrecoverable later:
 *
 *  - A conditional approval cannot be saved as a clean one. Attaching a
 *    condition changes the outcome, rather than quietly riding along with it.
 *  - A decision written up for a grant approved long ago must say so. The
 *    snapshot it freezes is TODAY's budget, not what the committee saw, so it
 *    is marked unusable for variance instead of silently wrong.
 */

import { useState, useTransition } from "react";
import { recordGrantDecision, dischargeCondition, waiveCondition } from "../../grant-actions";

type Timing = "pre_disbursement" | "pre_tranche" | "during_grant" | "pre_closure";
type Outcome = "approved" | "approved_with_conditions" | "deferred" | "declined" | "withdrawn";
type Forum = "gc" | "internal" | "written_resolution";

const TIMING_LABEL: Record<Timing, string> = {
  pre_disbursement: "Before any money moves",
  pre_tranche: "Before a specific tranche",
  during_grant: "During the grant",
  pre_closure: "Before closure",
};

const FORUM_LABEL: Record<Forum, string> = {
  gc: "Grants committee / board",
  internal: "Delegated internal authority",
  written_resolution: "Written resolution",
};

const DECLINE_REASONS = [
  "outside_strategy",
  "insufficient_evidence",
  "governance_concerns",
  "financial_concerns",
  "capacity_concerns",
  "budget_exhausted",
  "duplicate_or_covered",
  "withdrawn_by_applicant",
  "other",
];

export type ExistingCondition = {
  id: string;
  text: string;
  timing: Timing;
  status: string;
  dueOn: Date | string | null;
  blocksTrancheNumber: number | null;
};

export type ExistingDecision = {
  id: string;
  outcome: string;
  forum: string;
  decidedOn: Date | string;
  approvedAmount: string;
  variationNote: string | null;
  reasonCode: string | null;
  conditions: ExistingCondition[];
};

type ConditionDraft = { text: string; timing: Timing; blocksTrancheNumber: string; dueOn: string };

function money(v: string | number | null) {
  if (v === null) return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : String(v);
}

function fmtDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DecisionPanel({
  budgetId,
  budgetTotal,
  existing,
  canRecord,
  /** True when the grant was approved before this record existed. */
  looksRetrospective,
  approvedAtLabel,
}: {
  budgetId: string;
  budgetTotal: number;
  existing: ExistingDecision | null;
  canRecord: boolean;
  looksRetrospective: boolean;
  approvedAtLabel: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(!existing);

  const [outcome, setOutcome] = useState<Outcome>("approved");
  const [forum, setForum] = useState<Forum>("internal");
  const [decidedOn, setDecidedOn] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(String(Math.round(budgetTotal)));
  const [months, setMonths] = useState("");
  const [variationNote, setVariationNote] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [conditions, setConditions] = useState<ConditionDraft[]>([]);
  const [reconstructed, setReconstructed] = useState(looksRetrospective);
  const [reconstructionNote, setReconstructionNote] = useState("");

  const isApproving = outcome === "approved" || outcome === "approved_with_conditions";
  const needsReason = ["deferred", "declined", "withdrawn"].includes(outcome);
  const variance = Number(amount) - budgetTotal;

  function addCondition() {
    setConditions((c) => [
      ...c,
      { text: "", timing: "pre_disbursement", blocksTrancheNumber: "", dueOn: "" },
    ]);
    // Attaching a condition changes what was approved, so the outcome follows
    // rather than being left for someone to remember.
    if (outcome === "approved") setOutcome("approved_with_conditions");
  }

  function removeCondition(i: number) {
    setConditions((c) => {
      const next = c.filter((_, idx) => idx !== i);
      if (next.length === 0 && outcome === "approved_with_conditions") setOutcome("approved");
      return next;
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await recordGrantDecision({
        budgetId,
        outcome,
        forum,
        decidedOn,
        approvedAmount: isApproving ? Number(amount) : 0,
        approvedMonths: months ? Number(months) : null,
        variationNote: variationNote.trim() || undefined,
        reasonCode: needsReason ? reasonCode : undefined,
        reasonNote: needsReason ? reasonNote.trim() || undefined : undefined,
        conditions: isApproving
          ? conditions
              .filter((c) => c.text.trim())
              .map((c) => ({
                text: c.text.trim(),
                timing: c.timing,
                blocksTrancheNumber: c.blocksTrancheNumber ? Number(c.blocksTrancheNumber) : null,
                dueOn: c.dueOn || null,
              }))
          : [],
        supersedesId: existing?.id ?? null,
        baselineIsReconstructed: isApproving ? reconstructed : false,
        reconstructionNote: reconstructed ? reconstructionNote.trim() : undefined,
      });
      if (!result.ok) setError(result.error ?? "Could not record this.");
      else setOpen(false);
    });
  }

  function resolveCondition(id: string, mode: "discharge" | "waive") {
    const note = window.prompt(
      mode === "discharge" ? "What satisfied this condition?" : "Why is this being waived?",
    );
    if (!note?.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = mode === "discharge"
        ? await dischargeCondition(id, note)
        : await waiveCondition(id, note);
      if (!result.ok) setError(result.error ?? "Could not update the condition.");
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">
          {error}
        </div>
      )}

      {existing && (
        <section className="rounded-lg border border-stone-200 p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-stone-400">
                Decision of record
              </div>
              <div className="text-lg font-semibold text-stone-800 mt-0.5">
                {existing.outcome.replace(/_/g, " ")}
                {existing.outcome.startsWith("approved") && (
                  <span className="ml-2 text-base font-normal text-stone-600">
                    {money(existing.approvedAmount)}
                  </span>
                )}
              </div>
              <div className="text-xs text-stone-500 mt-0.5">
                {FORUM_LABEL[existing.forum as Forum] ?? existing.forum} ·{" "}
                {fmtDate(existing.decidedOn)}
                {existing.reasonCode ? ` · ${existing.reasonCode.replace(/_/g, " ")}` : ""}
              </div>
            </div>
            {canRecord && !open && (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-xs px-2 py-1 rounded border border-stone-300 text-stone-600 hover:bg-stone-50"
              >
                Record a new decision
              </button>
            )}
          </div>

          {existing.variationNote && (
            <p className="text-sm text-stone-600">{existing.variationNote}</p>
          )}

          {existing.conditions.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-stone-400 mb-1">Conditions</div>
              <ul className="space-y-1">
                {existing.conditions.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className={c.status === "open" ? "text-stone-800" : "text-stone-400"}>
                      <span className="text-xs text-stone-400 mr-1">
                        [{TIMING_LABEL[c.timing] ?? c.timing}
                        {c.blocksTrancheNumber ? ` · tranche ${c.blocksTrancheNumber}` : ""}]
                      </span>
                      {c.text}
                      {c.status !== "open" && (
                        <span className="ml-1 text-xs">({c.status})</span>
                      )}
                    </span>
                    {c.status === "open" && canRecord && (
                      <span className="whitespace-nowrap">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => resolveCondition(c.id, "discharge")}
                          className="text-xs px-1.5 py-0.5 rounded border border-green-300 text-green-700 mr-1"
                        >
                          Discharge
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => resolveCondition(c.id, "waive")}
                          className="text-xs px-1.5 py-0.5 rounded border border-amber-300 text-amber-700"
                        >
                          Waive
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-stone-400 mt-2">
                Waiving is not the same as discharging. A discharge says the condition was
                met; a waiver says it was not and someone decided to proceed anyway — which
                is recorded against them.
              </p>
            </div>
          )}
        </section>
      )}

      {canRecord && open && (
        <section className="rounded-lg border border-stone-200 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-stone-700">
            {existing ? "Record a new decision" : "Record the decision"}
          </h3>
          {existing && (
            <p className="text-xs text-stone-500">
              This supersedes the decision above rather than editing it. A decision is never
              rewritten — the chain is how &ldquo;how many times did this go to the
              board&rdquo; stays answerable.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs text-stone-500">
              Outcome
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as Outcome)}
                className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm text-stone-800"
              >
                <option value="approved">Approved</option>
                <option value="approved_with_conditions">Approved with conditions</option>
                <option value="deferred">Deferred</option>
                <option value="declined">Declined</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
            </label>
            <label className="text-xs text-stone-500">
              Forum
              <select
                value={forum}
                onChange={(e) => setForum(e.target.value as Forum)}
                className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm text-stone-800"
              >
                {Object.entries(FORUM_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-stone-500">
              Date decided
              <input
                type="date"
                value={decidedOn}
                onChange={(e) => setDecidedOn(e.target.value)}
                className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm text-stone-800"
              />
            </label>
          </div>

          {isApproving && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="text-xs text-stone-500">
                  Amount approved
                  <input
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm tabular-nums text-stone-800"
                  />
                  <span className="block mt-1 text-stone-400">
                    Budget totals {money(budgetTotal)}
                  </span>
                </label>
                <label className="text-xs text-stone-500">
                  Months approved
                  <input
                    inputMode="numeric"
                    value={months}
                    onChange={(e) => setMonths(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="as per budget"
                    className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm text-stone-800"
                  />
                </label>
                <div className="text-xs text-stone-500">
                  Variance
                  <div
                    className={`mt-1 px-2 py-1.5 text-sm tabular-nums rounded border ${
                      Math.abs(variance) < 1
                        ? "border-stone-200 text-stone-400"
                        : "border-amber-200 bg-amber-50 text-amber-800"
                    }`}
                  >
                    {Math.abs(variance) < 1 ? "—" : money(variance)}
                  </div>
                </div>
              </div>

              {Math.abs(variance) >= 1 && (
                <label className="block text-xs text-stone-500">
                  Why the approved amount differs from the budget
                  <input
                    value={variationNote}
                    onChange={(e) => setVariationNote(e.target.value)}
                    placeholder="e.g. committee trimmed the travel head"
                    className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm text-stone-800"
                  />
                  <span className="block mt-1 text-stone-400">
                    The difference is kept, not reconciled away — that is the point of
                    recording it.
                  </span>
                </label>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-stone-400">
                    Conditions
                  </span>
                  <button
                    type="button"
                    onClick={addCondition}
                    className="text-xs px-2 py-1 rounded border border-stone-300 text-stone-600 hover:bg-stone-50"
                  >
                    Add a condition
                  </button>
                </div>
                {conditions.length === 0 ? (
                  <p className="text-xs text-stone-400">
                    None. Adding one makes this an approval with conditions, and the release
                    gate will hold money until each is discharged or waived.
                  </p>
                ) : (
                  conditions.map((c, i) => (
                    <div key={i} className="rounded border border-stone-200 p-2 space-y-2">
                      <div className="flex gap-2">
                        <input
                          value={c.text}
                          onChange={(e) =>
                            setConditions((all) =>
                              all.map((x, idx) => (idx === i ? { ...x, text: e.target.value } : x)),
                            )
                          }
                          placeholder="What has to be true"
                          className="flex-1 border border-stone-300 rounded px-2 py-1 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeCondition(i)}
                          className="text-xs px-2 text-stone-400 hover:text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={c.timing}
                          onChange={(e) =>
                            setConditions((all) =>
                              all.map((x, idx) =>
                                idx === i ? { ...x, timing: e.target.value as Timing } : x,
                              ),
                            )
                          }
                          className="border border-stone-300 rounded px-2 py-1 text-xs"
                        >
                          {Object.entries(TIMING_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                        {c.timing === "pre_tranche" && (
                          <input
                            inputMode="numeric"
                            value={c.blocksTrancheNumber}
                            onChange={(e) =>
                              setConditions((all) =>
                                all.map((x, idx) =>
                                  idx === i
                                    ? { ...x, blocksTrancheNumber: e.target.value.replace(/[^0-9]/g, "") }
                                    : x,
                                ),
                              )
                            }
                            placeholder="tranche # (blank = all)"
                            className="border border-stone-300 rounded px-2 py-1 text-xs w-36"
                          />
                        )}
                        <input
                          type="date"
                          value={c.dueOn}
                          onChange={(e) =>
                            setConditions((all) =>
                              all.map((x, idx) => (idx === i ? { ...x, dueOn: e.target.value } : x)),
                            )
                          }
                          className="border border-stone-300 rounded px-2 py-1 text-xs"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* The retrospective trap, surfaced rather than silently handled. */}
              <div
                className={`rounded border p-3 ${
                  reconstructed ? "border-amber-300 bg-amber-50" : "border-stone-200"
                }`}
              >
                <label className="flex items-start gap-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    checked={reconstructed}
                    onChange={(e) => setReconstructed(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    This is a write-up of a decision taken earlier
                    {approvedAtLabel ? ` — this grant was approved ${approvedAtLabel}` : ""}.
                    <span className="block text-xs text-stone-500 mt-0.5">
                      Saving freezes the budget as it stands <em>today</em> as the approved
                      baseline. For an older grant those are not the lines the committee saw,
                      so the baseline is marked unusable and no variance will be reported
                      against it — rather than showing a comforting figure nobody can source.
                    </span>
                  </span>
                </label>
                {reconstructed && (
                  <input
                    value={reconstructionNote}
                    onChange={(e) => setReconstructionNote(e.target.value)}
                    placeholder="Where did these figures come from? Minutes, signed agreement, email…"
                    className="mt-2 w-full border border-amber-300 rounded px-2 py-1.5 text-sm"
                  />
                )}
              </div>
            </>
          )}

          {needsReason && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs text-stone-500">
                Reason
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm text-stone-800"
                >
                  <option value="">Choose a reason…</option>
                  {DECLINE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-stone-500">
                Notes, for institutional memory
                <input
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  className="mt-1 w-full border border-stone-300 rounded px-2 py-1.5 text-sm text-stone-800"
                />
              </label>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
            {existing && (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm px-3 py-1.5 text-stone-500"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={submit}
              className="text-sm px-3 py-1.5 rounded bg-stone-800 text-white disabled:opacity-50"
            >
              {pending ? "Recording…" : "Record decision"}
            </button>
          </div>
          <p className="text-xs text-stone-400">
            A decision cannot be edited afterwards. Correcting one means recording another
            that supersedes it, so the trail of what was decided when stays intact.
          </p>
        </section>
      )}

      {!canRecord && !existing && (
        <p className="text-sm text-stone-400">
          No decision has been recorded for this grant, and you do not have authority to
          record one.
        </p>
      )}
    </div>
  );
}
