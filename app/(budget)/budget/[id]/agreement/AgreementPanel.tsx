"use client";

import { useState, useTransition } from "react";
import type { TrancheFrequency } from "@/app/generated/prisma/client";
import { TRANCHE_FREQUENCY_LABELS } from "@/lib/budget/trancheFrequency";
import Link from "next/link";
import {
  saveAgreement,
  signOffAgreement,
  sendAgreement,
  recallAgreement,
  executeGrantAgreement,
  terminateGrantAgreement,
} from "../../grant-actions";

/**
 * Drafting, signing off, executing and terminating one grant agreement.
 *
 * The shape follows what the act actually is, in order: what was approved, what
 * the agreement says, who inside the organisation stands behind the draft, it
 * goes out, it comes back signed, it is in force. Executing is last and visibly
 * separate, because it is the moment money becomes releasable and should not
 * sit next to a text field somebody is tabbing through.
 *
 * Every refusal rendered here comes back from the server. The disabled states
 * are a courtesy — they stop a pointless round trip — never the check.
 */

type Signoff = {
  preparedAt: string | null;
  preparedBy: { id: string; name: string | null } | null;
  reviewedAt: string | null;
  reviewerNotes: string | null;
  reviewedBy: { id: string; name: string | null } | null;
  approvedAt: string | null;
  approvalNotes: string | null;
  approvedBy: { id: string; name: string | null } | null;
} | null;

type Doc = {
  id: string;
  kind: string;
  title: string;
  fileUrl: string;
  version: number;
  createdAt: string;
};

type Agreement = {
  id: string;
  status: "drafting" | "sent_for_signature" | "executed" | "terminated";
  reference: string | null;
  decisionId: string | null;
  trancheFrequency: Frequency;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  granteeSignatoryName: string | null;
  granteeSignatoryRole: string | null;
  granteeSignedOn: string | null;
  funderSignatoryName: string | null;
  funderSignatoryRole: string | null;
  funderSignedOn: string | null;
  executedOn: string | null;
  terminatedOn: string | null;
  terminationReason: string | null;
  signoff: Signoff;
  documents: Doc[];
} | null;

export type View = {
  budgetId: string;
  budgetName: string;
  budgetStatus: string;
  horizonMonths: number;
  granteeName: string | null;
  agreement: Agreement;
  decision: {
    id: string;
    outcome: string;
    forum: string;
    decidedOn: string;
    approvedAmount: string;
  } | null;
  trancheCount: number;
  frequencyLocked: boolean;
};

type Blocker = { code: string; message: string };

/**
 * Straight off the enum, via a Record the compiler forces to be exhaustive, so
 * this picker cannot drift from what the database accepts. Its first draft
 * listed "semiannual" and "monthly" — neither exists — and a cast at the call
 * site kept the compiler quiet about it.
 */
type Frequency = TrancheFrequency;

const FREQUENCIES = Object.entries(TRANCHE_FREQUENCY_LABELS) as [Frequency, string][];

const STATUS_STYLE: Record<string, string> = {
  drafting: "bg-stone-100 text-stone-700",
  sent_for_signature: "bg-sky-100 text-sky-800",
  executed: "bg-emerald-100 text-emerald-800",
  terminated: "bg-red-100 text-red-800",
};

const d10 = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const pretty = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : null;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-stone-400">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-xs text-stone-400">{hint}</span>}
    </label>
  );
}

const inputClass =
  "mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm text-stone-800 focus:border-sky-400 focus:outline-none disabled:bg-stone-50 disabled:text-stone-500";

export default function AgreementPanel({
  budgetId,
  view,
  blockers,
  currentUserId,
}: {
  budgetId: string;
  view: View;
  blockers: Blocker[];
  currentUserId: string | null;
}) {
  const ag = view.agreement;
  const status = ag?.status ?? "drafting";
  const frozen = status === "executed" || status === "terminated";

  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [terms, setTerms] = useState({
    reference: ag?.reference ?? "",
    trancheFrequency: (ag?.trancheFrequency ?? "annual") as Frequency,
    effectiveFrom: d10(ag?.effectiveFrom ?? null),
    effectiveTo: d10(ag?.effectiveTo ?? null),
    granteeSignatoryName: ag?.granteeSignatoryName ?? "",
    granteeSignatoryRole: ag?.granteeSignatoryRole ?? "",
    funderSignatoryName: ag?.funderSignatoryName ?? "",
    funderSignatoryRole: ag?.funderSignatoryRole ?? "",
  });

  const today = new Date().toISOString().slice(0, 10);
  const [exec, setExec] = useState({
    granteeSignedOn: d10(ag?.granteeSignedOn ?? null) || today,
    funderSignedOn: d10(ag?.funderSignedOn ?? null) || today,
    executedOn: d10(ag?.executedOn ?? null) || today,
  });

  const [recallReason, setRecallReason] = useState("");
  const [showTerminate, setShowTerminate] = useState(false);
  const [term, setTerm] = useState({ terminatedOn: today, reason: "" });

  function run(fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, ok?: string) {
    setError(null);
    setNote(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else if (ok) setNote(ok);
    });
  }

  const s = ag?.signoff ?? null;
  const preparedByMe = Boolean(s?.preparedBy && currentUserId && s.preparedBy.id === currentUserId);

  return (
    <div className="max-w-3xl space-y-6">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold text-stone-800">Agreement</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
          {status.replace(/_/g, " ")}
        </span>
        <p className="text-sm text-stone-500">
          {view.budgetName}
          {view.granteeName ? ` · ${view.granteeName}` : ""}
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      {note && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {note}
        </div>
      )}

      {/* ── What was approved ───────────────────────────────────────────── */}
      {view.decision ? (
        <section className="rounded-lg border border-stone-200 bg-white px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-stone-400">Agreed on the basis of</div>
          <p className="mt-1 text-sm text-stone-700">
            {view.decision.outcome.replace(/_/g, " ")} · {view.decision.approvedAmount} ·{" "}
            {view.decision.forum} · {pretty(view.decision.decidedOn)}
          </p>
          {ag?.decisionId && ag.decisionId !== view.decision.id && (
            <p className="mt-1 text-sm text-amber-800">
              This agreement still cites an earlier decision. Saving the terms re-links it to the
              current one.
            </p>
          )}
        </section>
      ) : (
        <section className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          There is no decision of record for this grant, so there are no approved terms to write an
          agreement from.{" "}
          <Link href={`/budget/${budgetId}/decision`} className="underline">
            Record the decision
          </Link>{" "}
          first.
        </section>
      )}

      {/* ── Terms ───────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-stone-700">Terms</h3>
          {frozen && (
            <span className="text-xs text-stone-400">
              {status === "executed"
                ? "Signed by both sides — vary it with a fresh decision"
                : "Terminated"}
            </span>
          )}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Reference">
            <input
              className={inputClass}
              value={terms.reference}
              disabled={frozen}
              onChange={(e) => setTerms({ ...terms, reference: e.target.value })}
              placeholder="e.g. APF/2026/0142"
            />
          </Field>
          <Field
            label="Release frequency"
            hint={
              view.frequencyLocked
                ? `Locked — ${view.trancheCount} tranches already generated on this basis`
                : undefined
            }
          >
            <select
              className={inputClass}
              value={terms.trancheFrequency}
              disabled={frozen || view.frequencyLocked}
              onChange={(e) =>
                setTerms({ ...terms, trancheFrequency: e.target.value as Frequency })
              }
            >
              {FREQUENCIES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="In force from">
            <input
              type="date"
              className={inputClass}
              value={terms.effectiveFrom}
              disabled={frozen}
              onChange={(e) => setTerms({ ...terms, effectiveFrom: e.target.value })}
            />
          </Field>
          <Field label="Until" hint="Leave blank for an open term">
            <input
              type="date"
              className={inputClass}
              value={terms.effectiveTo}
              disabled={frozen}
              onChange={(e) => setTerms({ ...terms, effectiveTo: e.target.value })}
            />
          </Field>
          <Field label="Signs for the grantee">
            <input
              className={inputClass}
              value={terms.granteeSignatoryName}
              disabled={frozen}
              onChange={(e) => setTerms({ ...terms, granteeSignatoryName: e.target.value })}
              placeholder="Name"
            />
            <input
              className={inputClass}
              value={terms.granteeSignatoryRole}
              disabled={frozen}
              onChange={(e) => setTerms({ ...terms, granteeSignatoryRole: e.target.value })}
              placeholder="Role"
            />
          </Field>
          <Field label="Signs for us">
            <input
              className={inputClass}
              value={terms.funderSignatoryName}
              disabled={frozen}
              onChange={(e) => setTerms({ ...terms, funderSignatoryName: e.target.value })}
              placeholder="Name"
            />
            <input
              className={inputClass}
              value={terms.funderSignatoryRole}
              disabled={frozen}
              onChange={(e) => setTerms({ ...terms, funderSignatoryRole: e.target.value })}
              placeholder="Role"
            />
          </Field>
        </div>

        {!frozen && (
          <button
            type="button"
            disabled={pending || !view.decision}
            onClick={() =>
              run(
                () =>
                  saveAgreement({
                    budgetId,
                    reference: terms.reference || null,
                    trancheFrequency: terms.trancheFrequency,
                    effectiveFrom: terms.effectiveFrom || null,
                    effectiveTo: terms.effectiveTo || null,
                    granteeSignatoryName: terms.granteeSignatoryName || null,
                    granteeSignatoryRole: terms.granteeSignatoryRole || null,
                    funderSignatoryName: terms.funderSignatoryName || null,
                    funderSignatoryRole: terms.funderSignatoryRole || null,
                  }),
                "Terms saved.",
              )
            }
            className="mt-4 rounded-lg bg-stone-800 px-4 py-2 text-sm text-white hover:bg-stone-900 disabled:opacity-40"
          >
            {ag ? "Save terms" : "Draft the agreement"}
          </button>
        )}
      </section>

      {/* ── Internal sign-off ───────────────────────────────────────────── */}
      {ag && !frozen && (
        <section className="rounded-lg border border-stone-200 bg-white p-4">
          <h3 className="text-sm font-medium text-stone-700">Before it goes out</h3>
          <p className="mt-1 text-xs text-stone-400">
            Our own record that someone other than the drafter read it. Internal — the grantee
            never sees this.
          </p>

          <ol className="mt-3 space-y-2">
            {([
              ["prepared", "Prepared", s?.preparedAt, s?.preparedBy?.name, null],
              ["reviewed", "Reviewed", s?.reviewedAt, s?.reviewedBy?.name, s?.reviewerNotes],
              ["approved", "Approved", s?.approvedAt, s?.approvedBy?.name, s?.approvalNotes],
            ] as const).map(([step, label, at, who, stepNote], i) => {
              const prevDone = i === 0 || Boolean([s?.preparedAt, s?.reviewedAt][i - 1]);
              const blockedBySelf = step !== "prepared" && preparedByMe;
              return (
                <li key={step} className="flex flex-wrap items-baseline gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${at ? "bg-emerald-500" : "bg-stone-300"}`}
                  />
                  <span className="w-20 text-sm text-stone-700">{label}</span>
                  {at ? (
                    <span className="text-xs text-stone-500">
                      {who ?? "—"} · {pretty(at)}
                      {stepNote ? ` · ${stepNote}` : ""}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={pending || !prevDone || blockedBySelf}
                      title={
                        blockedBySelf
                          ? "You prepared this draft, so somebody else has to do this step."
                          : !prevDone
                            ? "The step before this one is not done."
                            : undefined
                      }
                      onClick={() =>
                        run(() => signOffAgreement({ budgetId, step }), `Marked ${label.toLowerCase()}.`)
                      }
                      className="rounded border border-stone-300 px-2 py-0.5 text-xs text-stone-700 hover:border-stone-400 disabled:opacity-40"
                    >
                      Mark {label.toLowerCase()}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>

          {status === "drafting" && (
            <button
              type="button"
              disabled={pending || !s?.approvedAt}
              title={s?.approvedAt ? undefined : "The draft has to be approved internally first."}
              onClick={() => run(() => sendAgreement(budgetId), "Sent for signature.")}
              className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700 disabled:opacity-40"
            >
              Send for signature
            </button>
          )}

          {status === "sent_for_signature" && (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <label className="flex-1">
                <span className="block text-xs uppercase tracking-wide text-stone-400">
                  Bring it back for redrafting
                </span>
                <input
                  className={inputClass}
                  value={recallReason}
                  onChange={(e) => setRecallReason(e.target.value)}
                  placeholder="Why it is coming back"
                />
              </label>
              <button
                type="button"
                disabled={pending || !recallReason.trim()}
                onClick={() =>
                  run(() => recallAgreement(budgetId, recallReason), "Back in drafting.")
                }
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:border-stone-400 disabled:opacity-40"
              >
                Recall
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── Execution ───────────────────────────────────────────────────── */}
      {status === "executed" ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="text-sm font-medium text-emerald-900">In force</h3>
          <p className="mt-1 text-sm text-emerald-800">
            Executed {pretty(ag!.executedOn)} — signed {pretty(ag!.granteeSignedOn)} by the grantee
            and {pretty(ag!.funderSignedOn)} by us. The release gate is open on this condition.
          </p>
          <Link
            href={`/budget/${budgetId}/disbursements`}
            className="mt-2 inline-block text-sm text-sky-700 hover:underline"
          >
            Releases →
          </Link>
        </section>
      ) : status === "terminated" ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="text-sm font-medium text-red-900">Terminated</h3>
          <p className="mt-1 text-sm text-red-800">
            {pretty(ag!.terminatedOn)} — {ag!.terminationReason}
          </p>
        </section>
      ) : (
        <section className="rounded-lg border border-stone-300 bg-stone-50 p-4">
          <h3 className="text-sm font-medium text-stone-800">Mark it executed</h3>
          <p className="mt-1 text-xs text-stone-500">
            This is what opens the release gate. Record the dates from the signed copy, not
            today&rsquo;s date.
          </p>

          {blockers.length > 0 && (
            <ul className="mt-3 space-y-1">
              {blockers.map((b) => (
                <li key={b.code} className="text-sm text-amber-800">
                  {b.message}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Grantee signed">
              <input
                type="date"
                max={today}
                className={inputClass}
                value={exec.granteeSignedOn}
                onChange={(e) => setExec({ ...exec, granteeSignedOn: e.target.value })}
              />
            </Field>
            <Field label="We signed">
              <input
                type="date"
                max={today}
                className={inputClass}
                value={exec.funderSignedOn}
                onChange={(e) => setExec({ ...exec, funderSignedOn: e.target.value })}
              />
            </Field>
            <Field label="Executed on">
              <input
                type="date"
                max={today}
                className={inputClass}
                value={exec.executedOn}
                onChange={(e) => setExec({ ...exec, executedOn: e.target.value })}
              />
            </Field>
          </div>

          <button
            type="button"
            disabled={pending || blockers.length > 0}
            onClick={() => run(() => executeGrantAgreement({ budgetId, ...exec }), "Agreement executed.")}
            className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-800 disabled:opacity-40"
          >
            Mark executed
          </button>
        </section>
      )}

      {/* ── Documents on file ───────────────────────────────────────────── */}
      {ag && ag.documents.length > 0 && (
        <section className="rounded-lg border border-stone-200 bg-white p-4">
          <h3 className="text-sm font-medium text-stone-700">On file</h3>
          <ul className="mt-2 space-y-1">
            {ag.documents.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <a href={doc.fileUrl} className="text-sky-600 hover:underline" target="_blank" rel="noreferrer">
                  {doc.title}
                </a>
                <span className="text-xs text-stone-400">
                  {doc.kind.replace(/_/g, " ")} · v{doc.version} · {pretty(doc.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Termination ─────────────────────────────────────────────────── */}
      {ag && status !== "terminated" && (
        <section className="rounded-lg border border-stone-200 p-4">
          {!showTerminate ? (
            <button
              type="button"
              onClick={() => setShowTerminate(true)}
              className="text-sm text-stone-400 hover:text-red-700"
            >
              Terminate this agreement
            </button>
          ) : (
            <>
              <h3 className="text-sm font-medium text-red-900">Terminate</h3>
              <p className="mt-1 text-xs text-stone-500">
                Closes the release gate for good. Anything already released still has to be settled
                at closure.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr]">
                <Field label="Terminated on">
                  <input
                    type="date"
                    max={today}
                    className={inputClass}
                    value={term.terminatedOn}
                    onChange={(e) => setTerm({ ...term, terminatedOn: e.target.value })}
                  />
                </Field>
                <Field label="Why">
                  <input
                    className={inputClass}
                    value={term.reason}
                    onChange={(e) => setTerm({ ...term, reason: e.target.value })}
                    placeholder="The only record of it"
                  />
                </Field>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={pending || !term.reason.trim()}
                  onClick={() =>
                    run(() => terminateGrantAgreement({ budgetId, ...term }), "Agreement terminated.")
                  }
                  className="rounded-lg bg-red-700 px-4 py-2 text-sm text-white hover:bg-red-800 disabled:opacity-40"
                >
                  Terminate
                </button>
                <button
                  type="button"
                  onClick={() => setShowTerminate(false)}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-600"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
