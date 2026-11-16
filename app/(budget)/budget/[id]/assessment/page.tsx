import { auth } from "@/lib/auth";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { assessmentHistory } from "@/lib/budget/assessment";
import AssessmentPanel from "./AssessmentPanel";

/**
 * What we think of this grant.
 *
 * Internal only, and unlike every other stage there is no grantee rendering of
 * this screen at all — not a narrower view, nothing. `PARTNER_VISIBLE.assessment`
 * is `false` for the reason written there: a RAG rating is a management
 * conversation, and an assessment is candid only while it is not addressed to
 * its subject. A grantee who reaches this URL is redirected by middleware
 * before the page runs, and `notFound()` here is the second lock.
 *
 * The thing this screen exists to capture is the thing reports cannot say. A
 * grant can be fully compliant on paper — money spent, forms in on time — and
 * still be in trouble: underspending, delivering activities but not outcomes,
 * budgeted on assumptions that turned out wrong. Nobody had anywhere to write
 * that down, so it was said in meetings and lost.
 */
export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!(isSuperAdmin(session) || isBudgetAdmin(session))) notFound();

  const budget = await prisma.budget.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      grantPartner: { select: { name: true } },
    },
  });
  if (!budget) notFound();

  const [history, slots] = await Promise.all([
    assessmentHistory(id),
    prisma.budgetReportSlot.findMany({
      where: { budgetId: id },
      select: {
        id: true,
        slotNumber: true,
        periodFrom: true,
        periodTo: true,
        status: true,
        assessments: { select: { id: true } },
      },
      orderBy: { slotNumber: "desc" },
    }),
  ]);

  const notApproved = budget.status === "draft" || budget.status === "final";

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-stone-800">Assessment</h2>
        <p className="text-sm text-stone-500">
          {budget.name} · {budget.grantPartner?.name ?? "Unassigned"}
        </p>
      </header>

      <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
        Nothing on this page is shown to the grantee, and nothing here notifies
        them. That is what makes it worth writing honestly — and it means a red
        rating is not how anyone finds out. If something needs saying to them,
        say it to them.
      </div>

      {notApproved ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This grant is {budget.status} — it has not been approved, so no money has
          moved and there is nothing yet to form a view about. An assessment recorded
          now would appear in the portfolio health view as though it were live.
        </div>
      ) : (
        <AssessmentPanel
          budgetId={id}
          periods={slots.map((s) => ({
            id: s.id,
            slotNumber: s.slotNumber,
            periodFrom: s.periodFrom.toISOString().slice(0, 10),
            periodTo: s.periodTo.toISOString().slice(0, 10),
            status: s.status,
            assessed: s.assessments.length > 0,
          }))}
          history={history.map((h) => ({
            id: h.id,
            slotId: h.slotId,
            slotNumber: h.slot?.slotNumber ?? null,
            periodFrom: h.slot?.periodFrom ? h.slot.periodFrom.toISOString().slice(0, 10) : null,
            periodTo: h.slot?.periodTo ? h.slot.periodTo.toISOString().slice(0, 10) : null,
            programmeRag: h.programmeRag,
            programmeRationale: h.programmeRationale,
            financeRag: h.financeRag,
            financeRationale: h.financeRationale,
            overallRag: h.overallRag,
            overallNote: h.overallNote,
            assessedOn: h.assessedOn.toISOString().slice(0, 10),
            assessedByName: h.assessedBy?.name ?? null,
          }))}
        />
      )}

      <div className="flex gap-3 pt-2">
        <Link href={`/budget/${id}`} className="text-sm text-stone-500 hover:text-stone-700">
          ← Back to the grant
        </Link>
        <Link href={`/budget/${id}/reports`} className="text-sm text-sky-600 hover:underline">
          Reporting →
        </Link>
        <Link href="/budget/health" className="text-sm text-sky-600 hover:underline">
          Portfolio health →
        </Link>
      </div>
    </div>
  );
}
