import { auth } from "@/lib/auth";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { getPartnerAccess, partnerCanAccessBudget } from "@/lib/budget/partnerAccess";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { agreementFor, agreementGate } from "@/lib/budget/agreement";
import AgreementPanel from "./AgreementPanel";

/**
 * The agreement for one grant.
 *
 * Grantee-visible, read-only: a grantee should be able to see the reference
 * number, the term, who signed on each side and when, without emailing to ask.
 * What they must NOT see is the internal sign-off chain — who prepared the
 * draft, who reviewed it and what the reviewer wrote — which is our own
 * assurance record about the document, not part of the bargain.
 *
 * Everything that writes is gated again in `requireGrantReviewer`, so the
 * read-only rendering here is a courtesy to the reader rather than the
 * protection.
 */
export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  const ownership = await prisma.budget.findUnique({
    where: { id },
    select: { partnerId: true, grantPartnerId: true },
  });
  if (!ownership) notFound();

  const canReview = isSuperAdmin(session) || isBudgetAdmin(session);
  const partnerAccess = await getPartnerAccess(session);
  const isGrantee = partnerCanAccessBudget(partnerAccess, ownership);
  const isOwner = ownership.partnerId === session?.user?.id;
  if (!canReview && !isGrantee && !isOwner) notFound();

  const view = await agreementFor(id);
  if (!view) notFound();

  const fmt = (d: Date | null) =>
    d
      ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      : null;

  // ── The grantee's and the budget owner's view: facts, no controls ────────
  if (!canReview) {
    const ag = view.agreement;
    return (
      <div className="max-w-2xl space-y-6">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-stone-800">Agreement</h2>
          <p className="text-sm text-stone-500">{view.budgetName}</p>
        </header>

        {!ag ? (
          <p className="rounded-md border border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
            No agreement has been drawn up for this grant yet. It follows the
            funding decision, and you will be sent a copy to sign.
          </p>
        ) : (
          <dl className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
            {[
              ["Status", ag.status.replace(/_/g, " ")],
              ["Reference", ag.reference],
              ["Term", ag.effectiveFrom ? `${fmt(ag.effectiveFrom)} — ${fmt(ag.effectiveTo) ?? "open"}` : null],
              ["Releases", ag.trancheFrequency],
              [
                "Signed for you",
                ag.granteeSignatoryName
                  ? `${ag.granteeSignatoryName}${ag.granteeSignatoryRole ? `, ${ag.granteeSignatoryRole}` : ""}${
                      ag.granteeSignedOn ? ` · ${fmt(ag.granteeSignedOn)}` : ""
                    }`
                  : null,
              ],
              [
                "Signed for us",
                ag.funderSignatoryName
                  ? `${ag.funderSignatoryName}${ag.funderSignatoryRole ? `, ${ag.funderSignatoryRole}` : ""}${
                      ag.funderSignedOn ? ` · ${fmt(ag.funderSignedOn)}` : ""
                    }`
                  : null,
              ],
              ["Executed", fmt(ag.executedOn)],
              ...(ag.terminatedOn
                ? [["Terminated", `${fmt(ag.terminatedOn)} · ${ag.terminationReason ?? ""}`] as const]
                : []),
            ].map(([label, value]) => (
              <div key={label as string} className="flex gap-4 px-4 py-2.5">
                <dt className="w-32 shrink-0 text-xs uppercase tracking-wide text-stone-400">
                  {label}
                </dt>
                <dd className="text-sm text-stone-700">{value || <span className="text-stone-300">—</span>}</dd>
              </div>
            ))}
          </dl>
        )}

        {ag?.status === "executed" && (
          <p className="text-xs text-stone-500">
            This agreement is in force. Releases against it are listed under{" "}
            <Link href={`/budget/${id}/disbursements`} className="text-sky-600 hover:underline">
              Releases
            </Link>
            .
          </p>
        )}
      </div>
    );
  }

  // ── The internal view ───────────────────────────────────────────────────
  const blockers = await agreementGate(id);

  return (
    <AgreementPanel
      budgetId={id}
      view={JSON.parse(JSON.stringify(view))}
      blockers={blockers}
      currentUserId={session?.user?.id ?? null}
    />
  );
}
