import { auth } from "@/lib/auth";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { notFound } from "next/navigation";
import Link from "next/link";
import { proposalPipeline, declineReasonSummary } from "@/lib/budget/proposals";
import { fundingWindows } from "@/lib/budget/fundingWindows";
import {
  declineReasonLabel,
  PROPOSAL_STAGE_LABELS,
  TERMINAL_PROPOSAL_STAGES,
} from "@/lib/budget/proposalVocabulary";
import type { ProposalStage } from "@/app/generated/prisma/client";
import ProposalDesk from "./ProposalDesk";
import NewProposal from "./NewProposal";

/**
 * The intake desk.
 *
 * Internal only, and that is not the usual internal/grantee split: an applicant
 * at this stage has no login, no grant and nothing for the partner-lane rules
 * to attach to. Their face on this stage is the public status page, which
 * authenticates with a reference and a resume token.
 *
 * `proposalPipeline()` defaults to live stages — terminal ones are shown
 * separately and counted, because a desk that lists every decline ever is a
 * desk nobody opens, while a pipeline that cannot say how many it declined is
 * a pipeline that learns nothing.
 */
export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; stage?: string }>;
}) {
  const session = await auth();
  if (!(isSuperAdmin(session) || isBudgetAdmin(session))) notFound();

  const { window: windowId, stage } = await searchParams;

  // `proposalPipeline()` excludes terminal stages unless one is asked for by
  // name. Without a way to ask, a declined proposal would be unreachable from
  // anywhere — the reason would be on the record and nobody could read it.
  const terminalStage = TERMINAL_PROPOSAL_STAGES.find((s) => s === stage) ?? null;

  const [live, declines, windows] = await Promise.all([
    proposalPipeline({
      ...(windowId ? { windowId } : {}),
      ...(terminalStage ? { stage: terminalStage as ProposalStage } : {}),
    }),
    declineReasonSummary(),
    fundingWindows(),
  ]);

  const openWindows = windows.filter((w) => w.status === "open");
  const declinedTotal = declines.reduce((n, d) => n + d.count, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-stone-800">Intake</h2>
          <p className="text-sm text-stone-500">
            Proposals being worked on, and how long each has been where it is.
          </p>
        </div>
        <Link href="/budget/windows" className="text-sm text-sky-600 hover:underline">
          Calls for proposals →
        </Link>
      </header>

      {windows.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          There is no call for proposals yet, so nothing can arrive on its own. A proposal
          added here is a solicited one — entered by staff, with the applicant&rsquo;s own
          words recorded as they gave them.{" "}
          <Link href="/budget/windows" className="underline">
            Open a call
          </Link>{" "}
          to take submissions.
        </div>
      )}

      {openWindows.some((w) => w.pastDeadlineWhileOpen) && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          A call is marked open with a closing date already past. Whether a submission is
          accepted then depends on which check runs first, so close it or move the date.
        </div>
      )}

      {windows.length > 1 && (
        <nav className="flex flex-wrap gap-2 text-xs">
          <Link
            href="/budget/proposals"
            className={`rounded-full border px-3 py-1 ${
              windowId ? "border-stone-200 text-stone-500" : "border-stone-800 text-stone-800"
            }`}
          >
            All calls
          </Link>
          {windows.map((w) => (
            <Link
              key={w.id}
              href={`/budget/proposals?window=${w.id}`}
              className={`rounded-full border px-3 py-1 ${
                windowId === w.id ? "border-stone-800 text-stone-800" : "border-stone-200 text-stone-500"
              }`}
            >
              {w.name} <span className="text-stone-400">{w.liveCount}</span>
            </Link>
          ))}
        </nav>
      )}

      <nav className="flex flex-wrap gap-2 text-xs">
        <Link
          href={windowId ? `/budget/proposals?window=${windowId}` : "/budget/proposals"}
          className={`rounded-full border px-3 py-1 ${
            terminalStage ? "border-stone-200 text-stone-500" : "border-stone-800 text-stone-800"
          }`}
        >
          In the pipeline
        </Link>
        {TERMINAL_PROPOSAL_STAGES.map((s) => (
          <Link
            key={s}
            href={`/budget/proposals?stage=${s}${windowId ? `&window=${windowId}` : ""}`}
            className={`rounded-full border px-3 py-1 ${
              terminalStage === s ? "border-stone-800 text-stone-800" : "border-stone-200 text-stone-500"
            }`}
          >
            {PROPOSAL_STAGE_LABELS[s]}
          </Link>
        ))}
      </nav>

      <ProposalDesk
        rows={live}
        emptyMessage={
          terminalStage
            ? `Nothing ${PROPOSAL_STAGE_LABELS[terminalStage as ProposalStage].toLowerCase()} yet.`
            : undefined
        }
      />

      {!terminalStage && (
        <NewProposal windows={windows.map((w) => ({ id: w.id, name: w.name, status: w.status }))} />
      )}

      <section className="rounded-lg border border-stone-200 p-4">
        <div className="text-xs uppercase tracking-wide text-stone-400">
          Why we said no
        </div>
        {declinedTotal === 0 ? (
          <p className="mt-2 text-sm text-stone-500">
            Nothing has been declined through this desk yet. Until it has, the funder cannot
            say anything about its own refusals — which is the gap this list exists to close.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {declines.map((d) => (
              <li key={d.reasonCode} className="flex justify-between gap-3">
                <span className="text-stone-700">{declineReasonLabel(d.reasonCode)}</span>
                <span className="tabular-nums text-stone-500">{d.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
