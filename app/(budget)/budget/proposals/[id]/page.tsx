import { auth } from "@/lib/auth";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { proposalDetail } from "@/lib/budget/proposals";
import { rubricsFor } from "@/lib/budget/fundingWindows";
import { compareMoney } from "@/lib/budget/money";
import ProposalPanel from "./ProposalPanel";

/**
 * One proposal, internal.
 *
 * Ordered the way a screener actually works: what was asked for, who asked,
 * what they wrote, what we scored it, where it is, and only then the two
 * irreversible-ish moves — declining it, or turning it into a grant.
 *
 * The ceiling comparison is here rather than in the library because
 * `FundingWindow.ceilingAmount` is explicitly INDICATIVE: nothing refuses a
 * proposal above it, and a screen that silently hid or blocked one would be
 * inventing a policy the call never published.
 */
export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!(isSuperAdmin(session) || isBudgetAdmin(session))) notFound();

  const proposal = await proposalDetail(id);
  if (!proposal) notFound();

  const [rubrics, assignees, unlinked] = await Promise.all([
    rubricsFor(proposal.window?.id ?? null),
    prisma.user.findMany({
      where: { role: { in: ["super_admin", "budget_admin"] } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
    proposal.budgetId
      ? Promise.resolve([])
      : prisma.budget.findMany({
          where: { proposal: null, status: { notIn: ["closed"] } },
          select: { id: true, name: true, status: true, grantPartner: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
  ]);

  const overCeiling =
    proposal.requestedAmount && proposal.ceilingAmount
      ? compareMoney(proposal.requestedAmount, proposal.ceilingAmount) > 0
      : false;

  const questions = Array.isArray(proposal.window?.questions)
    ? (proposal.window.questions as unknown as { key: string; label: string }[])
    : [];
  const answers = (proposal.answers ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-lg font-semibold text-stone-800">{proposal.applicantOrgName}</h2>
          <span className="font-mono text-xs text-stone-400">{proposal.publicRef}</span>
        </div>
        <p className="text-sm text-stone-500">
          {proposal.title}
          {proposal.window ? ` · ${proposal.window.name}` : " · no call"}
        </p>
      </header>

      {!proposal.org && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Not matched to an organisation in the registry. Until it is, the conflict-of-interest
          check on scoring has nothing to check against, and due diligence has nowhere to
          attach.
        </div>
      )}

      {overCeiling && (
        <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
          Asks for ₹{proposal.requestedAmount} against an indicative ceiling of ₹
          {proposal.ceilingAmount}. The ceiling is indicative, so nothing refuses this — it is
          noted here because the call published the figure.
        </div>
      )}

      <section className="rounded-lg border border-stone-200 p-4 grid gap-3 sm:grid-cols-2 text-sm">
        <Fact label="Requested" value={proposal.requestedAmount ? `₹${proposal.requestedAmount}` : "—"} />
        <Fact label="Over" value={proposal.requestedMonths ? `${proposal.requestedMonths} months` : "—"} />
        <Fact label="Contact" value={`${proposal.contactName} · ${proposal.contactEmail}`} />
        <Fact label="Phone" value={proposal.contactPhone ?? "—"} />
        <Fact label="City" value={proposal.city ?? "—"} />
        <Fact label="Domains" value={proposal.domains.length ? proposal.domains.join(", ") : "—"} />
        <Fact
          label="Asking for"
          value={
            proposal.continuity
              ? proposal.continuity.replace(/_/g, " ")
              : "not stated"
          }
        />
        <Fact
          label="Submitted"
          value={
            proposal.submittedAt
              ? proposal.submittedAt.toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "not submitted"
          }
        />
      </section>

      {proposal.summary && (
        <section className="rounded-lg border border-stone-200 p-4">
          <div className="text-xs uppercase tracking-wide text-stone-400 mb-1">Summary</div>
          <p className="text-sm text-stone-700 whitespace-pre-wrap">{proposal.summary}</p>
        </section>
      )}

      {questions.length > 0 && (
        <section className="rounded-lg border border-stone-200 p-4 space-y-3">
          <div className="text-xs uppercase tracking-wide text-stone-400">
            Answers to the call&rsquo;s questions
          </div>
          {questions.map((q) => (
            <div key={q.key}>
              <div className="text-xs text-stone-500">{q.label}</div>
              <div className="text-sm text-stone-700 whitespace-pre-wrap">
                {formatAnswer(answers[q.key])}
              </div>
            </div>
          ))}
          {/* Answers with no question left on the call. They cannot be reached
              through the form any more, so without this they would simply be
              invisible — which is the failure the frozen question set exists to
              prevent, shown rather than hidden where it has already happened. */}
          {Object.keys(answers)
            .filter((k) => !questions.some((q) => q.key === k))
            .map((k) => (
              <div key={k} className="border-l-2 border-amber-300 pl-2">
                <div className="text-xs text-amber-700">
                  {k} — no longer a question on this call
                </div>
                <div className="text-sm text-stone-700 whitespace-pre-wrap">
                  {formatAnswer(answers[k])}
                </div>
              </div>
            ))}
        </section>
      )}

      <ProposalPanel
        proposal={{
          id: proposal.id,
          publicRef: proposal.publicRef,
          stage: proposal.stage,
          nextStages: proposal.nextStages,
          declineReasonCode: proposal.declineReasonCode,
          declineReasonNote: proposal.declineReasonNote,
          orgId: proposal.org?.id ?? null,
          orgName: proposal.org?.name ?? null,
          applicantOrgName: proposal.applicantOrgName,
          assignedToId: proposal.assignedTo?.id ?? null,
          budget: proposal.budget,
          reviews: proposal.reviews.map((r) => ({
            id: r.id,
            level: r.level,
            totalScore: r.totalScore,
            recommendation: r.recommendation,
            note: r.note,
            submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
            reviewerName: r.reviewer.name ?? r.reviewer.email,
            rubricName:
              r.rubricSnapshot && typeof r.rubricSnapshot === "object" && !Array.isArray(r.rubricSnapshot)
                ? String((r.rubricSnapshot as Record<string, unknown>).name ?? "—")
                : "—",
          })),
        }}
        rubrics={rubrics.map((r) => ({
          id: r.id,
          name: r.name,
          version: r.version,
          criteria: Array.isArray(r.criteria)
            ? (r.criteria as unknown as { key: string; label: string; maxScore?: number; weight?: number; guidance?: string }[])
            : [],
        }))}
        assignees={assignees.map((u) => ({ id: u.id, name: u.name ?? u.email ?? u.id }))}
        unlinkedGrants={unlinked.map((b) => ({
          id: b.id,
          name: b.name,
          status: b.status,
          granteeName: b.grantPartner?.name ?? null,
        }))}
      />

      <section className="rounded-lg border border-stone-200 p-4">
        <div className="text-xs uppercase tracking-wide text-stone-400 mb-2">Trail</div>
        <ul className="space-y-1 text-sm">
          {proposal.events.map((e) => (
            <li key={e.id} className="flex justify-between gap-3">
              <span className="text-stone-700">
                {e.kind.replace(/_/g, " ")}
                {!e.isPublic && (
                  <span className="text-stone-300 text-xs ml-2" title="Not shown to the applicant">
                    internal
                  </span>
                )}
              </span>
              <span className="text-xs text-stone-400 whitespace-nowrap">
                {e.createdAt.toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
                {e.actor?.name ? ` · ${e.actor.name}` : ""}
              </span>
            </li>
          ))}
          {proposal.events.length === 0 && (
            <li className="text-stone-400 text-xs">Nothing recorded.</li>
          )}
        </ul>
      </section>

      <div className="flex gap-3 pt-2">
        <Link href="/budget/proposals" className="text-sm text-stone-500 hover:text-stone-700">
          ← Intake
        </Link>
        {proposal.budget && (
          <Link href={`/budget/${proposal.budget.id}`} className="text-sm text-sky-600 hover:underline">
            {proposal.budget.name} →
          </Link>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-stone-400">{label}</div>
      <div className="text-stone-700">{value}</div>
    </div>
  );
}

function formatAnswer(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
