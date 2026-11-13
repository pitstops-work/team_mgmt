import { auth } from "@/lib/auth";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { fundingWindowDetail } from "@/lib/budget/fundingWindows";
import WindowPanel from "./WindowPanel";

/**
 * One call.
 *
 * The question set is editable while the call is a draft and frozen in shape
 * once it opens — labels and guidance can still change. `Proposal.answers` is
 * keyed by question key, so removing or re-keying a question mid-call does not
 * delete the answers people wrote, it orphans them: still in the row, no
 * longer rendered anywhere. The detail page shows orphans where they already
 * exist; this is what stops new ones being made.
 */
export default async function WindowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!(isSuperAdmin(session) || isBudgetAdmin(session))) notFound();

  const window = await fundingWindowDetail(id);
  if (!window) notFound();

  const units = await prisma.grantingUnit.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-stone-800">{window.name}</h2>
        <p className="text-sm text-stone-500">
          <span className="font-mono">/{window.slug}</span> · {window.status} ·{" "}
          {window._count.proposals} proposal(s)
        </p>
      </header>

      <WindowPanel
        window={{
          id: window.id,
          name: window.name,
          slug: window.slug,
          status: window.status,
          nextStatuses: window.nextStatuses,
          grantingUnitId: window.grantingUnit?.id ?? null,
          opensOn: window.opensOn ? window.opensOn.toISOString().slice(0, 10) : "",
          closesOn: window.closesOn ? window.closesOn.toISOString().slice(0, 10) : "",
          brief: window.brief ?? "",
          ceilingAmount: window.ceilingAmount ?? "",
          questions: window.questions,
          proposalCount: window._count.proposals,
        }}
        units={units}
        rubrics={window.rubrics.map((r) => ({
          id: r.id,
          name: r.name,
          version: r.version,
          isActive: r.isActive,
          criteria: Array.isArray(r.criteria)
            ? (r.criteria as unknown as {
                key: string;
                label: string;
                weight?: number;
                maxScore?: number;
                guidance?: string;
              }[])
            : [],
        }))}
      />

      <div className="flex gap-3 pt-2">
        <Link href="/budget/windows" className="text-sm text-stone-500 hover:text-stone-700">
          ← Calls
        </Link>
        <Link
          href={`/budget/proposals?window=${window.id}`}
          className="text-sm text-sky-600 hover:underline"
        >
          Its proposals →
        </Link>
      </div>
    </div>
  );
}
