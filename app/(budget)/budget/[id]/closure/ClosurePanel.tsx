"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ASSET_DISPOSITIONS,
  ASSET_DISPOSITION_LABELS,
  DISPOSITIONS_NEEDING_NOTE,
  EXIT_DECISIONS,
  EXIT_DECISION_LABELS,
  SETTLEMENT_MODES_UI,
  SETTLEMENT_MODE_LABELS,
  type AssetDisposition,
  type ExitDecisionUi,
  type SettlementModeUi,
} from "@/lib/budget/closureVocabulary";
import {
  startClosure,
  recordSettlement,
  closeOutGrant,
  recordClosureAsset,
  deleteClosureAsset,
} from "../../grant-actions";

/**
 * Closing one grant.
 *
 * Ordered the way the act happens: see the money, clear what is outstanding,
 * decide what happens to the balance and the assets, decide about the
 * relationship, then close. Closing is last and visibly separate because it
 * freezes the figures for good — nothing recomputes them afterwards, which is
 * the whole reason the row stores them rather than deriving them.
 *
 * Every refusal shown here comes from the server. Disabled states only save a
 * round trip.
 */

type Blocker = { code: string; message: string };

type Closure = {
  status: string;
  initiatedAt: string | null;
  closedAt: string | null;
  settlementMode: string | null;
  adjustedIntoBudgetId: string | null;
  adjustedIntoBudget: { id: string; name: string } | null;
  refundAmount: string | null;
  refundReceivedOn: string | null;
  refundReference: string | null;
  writeOffNote: string | null;
  exitDecision: string;
  exitNote: string | null;
  exceptionNote: string | null;
  borrowingsSettled: boolean;
  totalReleased: string;
  totalUtilised: string;
  unspentAmount: string;
  closedBy: { name: string | null } | null;
} | null;

type Asset = {
  id: string;
  description: string;
  quantity: number;
  cost: string;
  acquiredOn: string | null;
  disposition: string;
  dispositionNote: string | null;
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null;

const inputClass =
  "mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm text-stone-800 focus:border-sky-400 focus:outline-none disabled:bg-stone-50";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-stone-400">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-xs text-stone-400">{hint}</span>}
    </label>
  );
}

export default function ClosurePanel({
  budgetId,
  budgetName,
  granteeName,
  grantEndDate,
  live,
  gate,
  closure,
  assets,
  carryTargets,
}: {
  budgetId: string;
  budgetName: string;
  granteeName: string | null;
  grantEndDate: string | null;
  live: {
    totalReleased: string;
    totalUtilised: string;
    unspent: string;
    openBorrowings: { id: string; amount: string; direction: "lent" | "borrowed" }[];
  };
  gate: { ok: boolean; blockers: Blocker[] };
  closure: Closure;
  assets: { assets: Asset[]; total: string; undecided: number };
  carryTargets: { id: string; name: string; status: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const closed = closure?.status === "closed" || closure?.status === "closed_with_exception";
  const started = Boolean(closure && closure.status !== "open");
  const hasBalance = Number(live.unspent) > 0;

  const [mode, setMode] = useState<SettlementModeUi>(
    (closure?.settlementMode as SettlementModeUi) ?? (hasBalance ? "refunded" : "none"),
  );
  const [refund, setRefund] = useState({
    refundAmount: closure?.refundAmount ?? live.unspent,
    refundReceivedOn: closure?.refundReceivedOn?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    refundReference: closure?.refundReference ?? "",
  });
  const [carryInto, setCarryInto] = useState(closure?.adjustedIntoBudgetId ?? "");
  const [writeOffNote, setWriteOffNote] = useState(closure?.writeOffNote ?? "");

  const [exit, setExit] = useState<ExitDecisionUi>((closure?.exitDecision as ExitDecisionUi) ?? "undecided");
  const [exitNote, setExitNote] = useState(closure?.exitNote ?? "");
  const [exceptionNote, setExceptionNote] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  const [asset, setAsset] = useState({
    description: "",
    quantity: "1",
    cost: "",
    acquiredOn: "",
    disposition: "retained_by_grantee" as AssetDisposition,
    dispositionNote: "",
  });

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) {
    setError(null);
    setNote(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else {
        if (ok) setNote(ok);
        router.refresh();
      }
    });
  }

  // Frozen once closed; live until then. Which is shown matters, so it is said.
  const money = closed
    ? {
        released: closure!.totalReleased,
        utilised: closure!.totalUtilised,
        unspent: closure!.unspentAmount,
      }
    : { released: live.totalReleased, utilised: live.totalUtilised, unspent: live.unspent };

  return (
    <div className="max-w-3xl space-y-6">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold text-stone-800">Closure</h2>
        {closed && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              closure!.status === "closed"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {closure!.status.replace(/_/g, " ")}
          </span>
        )}
        <p className="text-sm text-stone-500">
          {budgetName}
          {granteeName ? ` · ${granteeName}` : ""}
        </p>
        {grantEndDate && (
          <span className="ml-auto text-xs text-stone-400">ended {fmtDate(grantEndDate)}</span>
        )}
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}
      {note && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {note}
        </div>
      )}

      {/* ── The money ───────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-stone-200 bg-white">
        <div className="flex items-baseline justify-between border-b border-stone-200 px-4 py-2">
          <h3 className="text-sm font-medium text-stone-700">The account</h3>
          <span className="text-xs text-stone-400">
            {closed ? `Frozen at closure, ${fmtDate(closure!.closedAt)}` : "Live"}
          </span>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-stone-100">
          {[
            ["Released", money.released],
            ["Utilised", money.utilised],
            ["Unspent", money.unspent],
          ].map(([label, value]) => (
            <div key={label} className="px-4 py-3">
              <dt className="text-xs uppercase tracking-wide text-stone-400">{label}</dt>
              <dd className="mt-0.5 text-sm tabular-nums text-stone-800">₹{value}</dd>
            </div>
          ))}
        </dl>
        {!closed && (
          <p className="border-t border-stone-100 px-4 py-2 text-xs text-stone-400">
            Utilisation counts approved reports only — so unspent is overstated
            while any report is still unapproved. The gate below will not let the
            grant close in that state.
          </p>
        )}
        {live.openBorrowings.length > 0 && (
          <div className="border-t border-stone-100 px-4 py-2">
            <span className="text-xs text-stone-400">Open borrowings: </span>
            {live.openBorrowings.map((b) => (
              <span key={b.id} className="text-xs text-amber-800">
                ₹{b.amount} {b.direction}{" "}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ── What is outstanding ─────────────────────────────────────────── */}
      {!closed && (
        <section
          className={`rounded-lg border p-4 ${gate.ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}
        >
          <h3 className={`text-sm font-medium ${gate.ok ? "text-emerald-900" : "text-amber-900"}`}>
            {gate.ok ? "Nothing outstanding" : `${gate.blockers.length} thing(s) outstanding`}
          </h3>
          {gate.blockers.length > 0 && (
            <ul className="mt-2 space-y-1">
              {gate.blockers.map((b, i) => (
                <li key={i} className="text-sm text-amber-800">
                  {b.message}
                </li>
              ))}
            </ul>
          )}
          {!started && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => startClosure(budgetId), "Closure started.")}
              className="mt-3 rounded-lg bg-stone-800 px-4 py-2 text-sm text-white hover:bg-stone-900 disabled:opacity-40"
            >
              Start closing
            </button>
          )}
        </section>
      )}

      {started && !closed && (
        <>
          {/* ── Settlement ───────────────────────────────────────────────── */}
          <section className="rounded-lg border border-stone-200 bg-white p-4">
            <h3 className="text-sm font-medium text-stone-700">The unspent balance</h3>
            <p className="mt-1 text-xs text-stone-400">
              {hasBalance
                ? `₹${live.unspent} is left over. There is no default — somebody has to decide.`
                : "Nothing left over."}
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="How it is settled">
                <select
                  className={inputClass}
                  value={mode}
                  onChange={(e) => setMode(e.target.value as SettlementModeUi)}
                >
                  {SETTLEMENT_MODES_UI.filter((m) => (hasBalance ? m !== "none" : true)).map((m) => (
                    <option key={m} value={m}>
                      {SETTLEMENT_MODE_LABELS[m]}
                    </option>
                  ))}
                </select>
              </Field>

              {mode === "refunded" && (
                <>
                  <Field label="Amount received" hint={`Cannot exceed ₹${live.unspent}`}>
                    <input
                      className={inputClass}
                      value={refund.refundAmount}
                      onChange={(e) => setRefund({ ...refund, refundAmount: e.target.value })}
                    />
                  </Field>
                  <Field label="Received on">
                    <input
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      className={inputClass}
                      value={refund.refundReceivedOn}
                      onChange={(e) => setRefund({ ...refund, refundReceivedOn: e.target.value })}
                    />
                  </Field>
                  <Field label="Bank reference" hint="What to match against the statement">
                    <input
                      className={inputClass}
                      value={refund.refundReference}
                      onChange={(e) => setRefund({ ...refund, refundReference: e.target.value })}
                    />
                  </Field>
                </>
              )}

              {mode === "adjusted_against_renewal" && (
                <Field
                  label="Carried into"
                  hint={
                    carryTargets.length
                      ? "Only this grantee's own live grants."
                      : "This grantee has no other live grant to carry it into."
                  }
                >
                  <select
                    className={inputClass}
                    value={carryInto}
                    onChange={(e) => setCarryInto(e.target.value)}
                    disabled={!carryTargets.length}
                  >
                    <option value="">Choose a grant…</option>
                    {carryTargets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.status})
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {mode === "written_off" && (
                <Field label="Why it is being written off" hint="The only record of it">
                  <input
                    className={inputClass}
                    value={writeOffNote}
                    onChange={(e) => setWriteOffNote(e.target.value)}
                  />
                </Field>
              )}
            </div>

            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    recordSettlement({
                      budgetId,
                      mode,
                      adjustedIntoBudgetId: mode === "adjusted_against_renewal" ? carryInto || null : null,
                      refundAmount: mode === "refunded" ? Number(refund.refundAmount) : undefined,
                      refundReceivedOn: mode === "refunded" ? refund.refundReceivedOn : null,
                      refundReference: mode === "refunded" ? refund.refundReference : null,
                      writeOffNote: mode === "written_off" ? writeOffNote : null,
                    }),
                  "Settlement recorded.",
                )
              }
              className="mt-4 rounded-lg bg-stone-800 px-4 py-2 text-sm text-white hover:bg-stone-900 disabled:opacity-40"
            >
              Record settlement
            </button>
          </section>

          {/* ── Assets ───────────────────────────────────────────────────── */}
          <section className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-medium text-stone-700">Assets bought with grant money</h3>
              <span className="text-xs text-stone-400">
                {assets.assets.length ? `₹${assets.total}` : "none recorded"}
                {assets.undecided ? ` · ${assets.undecided} undecided` : ""}
              </span>
            </div>
            <p className="mt-1 text-xs text-stone-400">
              What the exit decision turns on. An asset register is also a
              pre-closure document requirement.
            </p>

            {assets.assets.length > 0 && (
              <ul className="mt-3 divide-y divide-stone-100">
                {assets.assets.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 py-2">
                    <span className="text-sm text-stone-800">{a.description}</span>
                    {a.quantity > 1 && <span className="text-xs text-stone-400">×{a.quantity}</span>}
                    <span className="text-xs tabular-nums text-stone-500">₹{a.cost}</span>
                    <span
                      className={`text-xs ${a.disposition === "undecided" ? "text-amber-700" : "text-stone-400"}`}
                    >
                      {ASSET_DISPOSITION_LABELS[a.disposition as AssetDisposition] ?? a.disposition}
                      {a.dispositionNote ? ` · ${a.dispositionNote}` : ""}
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => deleteClosureAsset({ budgetId, assetId: a.id }), "Asset removed.")}
                      className="ml-auto text-xs text-stone-400 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="What it is">
                <input
                  className={inputClass}
                  value={asset.description}
                  onChange={(e) => setAsset({ ...asset, description: e.target.value })}
                  placeholder="e.g. Tata Ace, registration KA-01-…"
                />
              </Field>
              <Field label="Cost">
                <input
                  className={inputClass}
                  value={asset.cost}
                  onChange={(e) => setAsset({ ...asset, cost: e.target.value })}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Quantity">
                <input
                  className={inputClass}
                  value={asset.quantity}
                  onChange={(e) => setAsset({ ...asset, quantity: e.target.value })}
                />
              </Field>
              <Field label="Acquired on">
                <input
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  className={inputClass}
                  value={asset.acquiredOn}
                  onChange={(e) => setAsset({ ...asset, acquiredOn: e.target.value })}
                />
              </Field>
              <Field label="What happened to it">
                <select
                  className={inputClass}
                  value={asset.disposition}
                  onChange={(e) => setAsset({ ...asset, disposition: e.target.value as AssetDisposition })}
                >
                  {ASSET_DISPOSITIONS.map((d) => (
                    <option key={d} value={d}>
                      {ASSET_DISPOSITION_LABELS[d]}
                    </option>
                  ))}
                </select>
              </Field>
              {DISPOSITIONS_NEEDING_NOTE.includes(asset.disposition) && (
                <Field label="Note" hint="Required for this disposition">
                  <input
                    className={inputClass}
                    value={asset.dispositionNote}
                    onChange={(e) => setAsset({ ...asset, dispositionNote: e.target.value })}
                  />
                </Field>
              )}
            </div>

            <button
              type="button"
              disabled={pending || !asset.description.trim() || !asset.cost.trim()}
              onClick={() =>
                run(() => {
                  const p = recordClosureAsset({
                    budgetId,
                    description: asset.description,
                    quantity: Number(asset.quantity) || 1,
                    cost: Number(asset.cost),
                    acquiredOn: asset.acquiredOn || null,
                    disposition: asset.disposition,
                    dispositionNote: asset.dispositionNote || null,
                  });
                  setAsset({
                    description: "",
                    quantity: "1",
                    cost: "",
                    acquiredOn: "",
                    disposition: "retained_by_grantee",
                    dispositionNote: "",
                  });
                  return p;
                }, "Asset recorded.")
              }
              className="mt-3 rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:border-stone-400 disabled:opacity-40"
            >
              Add to the register
            </button>
          </section>

          {/* ── Close out ────────────────────────────────────────────────── */}
          <section className="rounded-lg border border-stone-300 bg-stone-50 p-4">
            <h3 className="text-sm font-medium text-stone-800">Close the grant</h3>
            <p className="mt-1 text-xs text-stone-500">
              Freezes these figures for good — nothing recomputes them afterwards
              — and sets the grant to closed.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="What happens to the relationship" hint="Internal — not shown to the grantee">
                <select
                  className={inputClass}
                  value={exit}
                  onChange={(e) => setExit(e.target.value as ExitDecisionUi)}
                >
                  {EXIT_DECISIONS.map((d) => (
                    <option key={d} value={d}>
                      {EXIT_DECISION_LABELS[d]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Note">
                <input
                  className={inputClass}
                  value={exitNote}
                  onChange={(e) => setExitNote(e.target.value)}
                  placeholder="Why, in a line"
                />
              </Field>
            </div>

            {!gate.ok && (
              <div className="mt-3">
                <Field
                  label="Closing past the gate"
                  hint="Recorded as an exception, with what was overridden, and stays visible afterwards."
                >
                  <input
                    className={inputClass}
                    value={exceptionNote}
                    onChange={(e) => setExceptionNote(e.target.value)}
                    placeholder="Why this is being closed with things outstanding"
                  />
                </Field>
              </div>
            )}

            {!confirmClose ? (
              <button
                type="button"
                disabled={pending || (!gate.ok && !exceptionNote.trim())}
                onClick={() => setConfirmClose(true)}
                className="mt-4 rounded-lg bg-stone-800 px-4 py-2 text-sm text-white hover:bg-stone-900 disabled:opacity-40"
              >
                {gate.ok ? "Close the grant" : "Close with an exception"}
              </button>
            ) : (
              <div className="mt-4 rounded-md border border-stone-300 bg-white p-3">
                <p className="text-sm text-stone-700">
                  Close {budgetName} with ₹{live.unspent} unspent
                  {gate.ok ? "" : ` and ${gate.blockers.length} thing(s) outstanding`}? The figures
                  are frozen at this point and cannot be reopened here.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () =>
                          closeOutGrant({
                            budgetId,
                            exitDecision: exit === "undecided" ? undefined : exit,
                            exitNote: exitNote || undefined,
                            exceptionNote: gate.ok ? undefined : exceptionNote,
                          }),
                        "Grant closed.",
                      )
                    }
                    className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white hover:bg-black disabled:opacity-40"
                  >
                    Yes, close it
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClose(false)}
                    className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* ── Closed ──────────────────────────────────────────────────────── */}
      {closed && (
        <section className="space-y-3">
          <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-stone-400">Closed</div>
            <p className="mt-1 text-sm text-stone-700">
              {fmtDate(closure!.closedAt)}
              {closure!.closedBy?.name ? ` by ${closure!.closedBy.name}` : ""} ·{" "}
              {EXIT_DECISION_LABELS[closure!.exitDecision as ExitDecisionUi] ?? closure!.exitDecision}
              {closure!.exitNote ? ` — ${closure!.exitNote}` : ""}
            </p>
            {closure!.settlementMode && (
              <p className="mt-1 text-sm text-stone-600">
                Balance:{" "}
                {SETTLEMENT_MODE_LABELS[closure!.settlementMode as SettlementModeUi] ??
                  closure!.settlementMode}
                {closure!.adjustedIntoBudget ? ` into ${closure!.adjustedIntoBudget.name}` : ""}
                {closure!.refundReference ? ` · ${closure!.refundReference}` : ""}
                {closure!.writeOffNote ? ` · ${closure!.writeOffNote}` : ""}
              </p>
            )}
          </div>

          {closure!.exceptionNote && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-amber-700">
                Closed with an exception
              </div>
              <p className="mt-1 text-sm text-amber-900">{closure!.exceptionNote}</p>
              <p className="mt-1 text-xs text-amber-700">
                What was overridden is in the audit log. Internal — the grantee
                does not see this.
              </p>
            </div>
          )}

          {assets.assets.length > 0 && (
            <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-stone-400">
                Asset register · ₹{assets.total}
              </div>
              <ul className="mt-1 space-y-0.5">
                {assets.assets.map((a) => (
                  <li key={a.id} className="text-sm text-stone-600">
                    {a.description} — ₹{a.cost} —{" "}
                    {ASSET_DISPOSITION_LABELS[a.disposition as AssetDisposition] ?? a.disposition}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Link href={`/budget/${budgetId}/documents`} className="text-sm text-sky-700 hover:underline">
            Documents on file →
          </Link>
        </section>
      )}
    </div>
  );
}
