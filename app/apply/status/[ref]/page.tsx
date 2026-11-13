import { notFound } from "next/navigation";
import { publicProposalStatus } from "@/lib/budget/proposals";
import {
  PUBLIC_STAGE_LABELS,
  PUBLIC_STAGE_NOTES,
  publicDeclineLine,
} from "@/lib/budget/proposalVocabulary";

/**
 * The applicant's own view of their proposal.
 *
 * This is the second audience for the proposal stage, and it is a different
 * shape from every other stage's grantee view: an applicant has no login, no
 * grant and nothing for the partner-lane rules to attach to. They hold a
 * reference and a resume token, and that is the whole of their authentication —
 * which is why this page is served from a public prefix and why
 * `publicProposalStatus()` is built by naming each field rather than spreading
 * the row.
 *
 * What it does NOT carry is the point of it. No score. No reviewer. No internal
 * note. No event that was not marked public when it was written. And no
 * governance concern: that is a judgement about named people, recorded for our
 * own file, and a web page is not where it gets communicated.
 *
 * A wrong or expired token gets a 404, not "wrong token" — telling someone that
 * a reference exists is itself the disclosure.
 */
export default async function ProposalStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { ref } = await params;
  const { t } = await searchParams;
  if (!t) notFound();

  const status = await publicProposalStatus(ref, t);
  if (!status) notFound();

  const declined = status.stage === "ineligible" || status.stage === "withdrawn";

  return (
    <main className="mx-auto max-w-xl px-4 py-10 space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-stone-400">
          {status.windowName ?? "Application"}
        </p>
        <h1 className="text-xl font-semibold text-stone-800">{status.title}</h1>
        <p className="text-sm text-stone-500">
          {status.orgName} · reference <span className="font-mono">{status.publicRef}</span>
        </p>
      </header>

      <section className="rounded-lg border border-stone-200 bg-white p-4 space-y-2">
        <div className="text-xs uppercase tracking-wide text-stone-400">Where it stands</div>
        <div className="text-lg text-stone-800">{PUBLIC_STAGE_LABELS[status.stage]}</div>
        <p className="text-sm text-stone-600">{PUBLIC_STAGE_NOTES[status.stage]}</p>
        {declined && (
          <p className="rounded border border-stone-200 bg-stone-50 px-2 py-1.5 text-sm text-stone-700">
            {publicDeclineLine(status.declineReasonCode)}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-4 space-y-2">
        <div className="text-xs uppercase tracking-wide text-stone-400">What you sent</div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-stone-400">Amount requested</dt>
            <dd className="text-stone-700">
              {status.requestedAmount ? `₹${status.requestedAmount}` : "not stated"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-stone-400">Submitted</dt>
            <dd className="text-stone-700">
              {status.submittedAt
                ? status.submittedAt.toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : "not yet submitted"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-stone-400">Contact</dt>
            <dd className="text-stone-700">{status.contactName}</dd>
          </div>
        </dl>
      </section>

      {status.timeline.length > 0 && (
        <section className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-stone-400 mb-2">History</div>
          <ul className="space-y-1 text-sm">
            {status.timeline.map((e, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="text-stone-700">{e.kind.replace(/_/g, " ")}</span>
                <span className="text-xs text-stone-400">
                  {e.at.toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-stone-400">
        This page is yours alone — the link in it is what identifies you, so treat it the way
        you would a password. We do not show scores or internal notes here, and we never will:
        an assessment written candidly is not written to be read by the organisation it is
        about.
      </p>
    </main>
  );
}
