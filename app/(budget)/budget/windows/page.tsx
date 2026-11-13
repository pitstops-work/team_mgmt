import { auth } from "@/lib/auth";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { notFound } from "next/navigation";
import Link from "next/link";
import { fundingWindows } from "@/lib/budget/fundingWindows";
import { WINDOW_STATUS_LABELS } from "@/lib/budget/proposalVocabulary";
import NewWindow from "./NewWindow";

/**
 * Calls for proposals.
 *
 * There are none in the database. That is the reason the intake tables have
 * never held a row: the pipeline was built from the proposal end and had
 * nothing to point at, so no proposal could ever arrive against anything.
 */
export default async function WindowsPage() {
  const session = await auth();
  if (!(isSuperAdmin(session) || isBudgetAdmin(session))) notFound();

  const windows = await fundingWindows();

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-stone-800">Calls for proposals</h2>
          <p className="text-sm text-stone-500">
            A call carries the dates, the published guidance and the question set proposals
            are keyed against.
          </p>
        </div>
        <Link href="/budget/proposals" className="text-sm text-sky-600 hover:underline">
          Intake →
        </Link>
      </header>

      {windows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 p-6 text-sm text-stone-500">
          No call exists yet. Until one does, proposals can only be entered by staff —
          nothing can be submitted from outside.
        </div>
      ) : (
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
          {windows.map((w) => (
            <li key={w.id} className="px-3 py-2">
              <Link href={`/budget/windows/${w.id}`} className="block group">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-stone-800 group-hover:underline">
                    {w.name}
                    <span className="font-mono text-xs text-stone-400 ml-2">/{w.slug}</span>
                  </span>
                  <span
                    className={`text-xs ${
                      w.pastDeadlineWhileOpen
                        ? "text-red-700"
                        : w.status === "open"
                          ? "text-green-700"
                          : "text-stone-500"
                    }`}
                  >
                    {WINDOW_STATUS_LABELS[w.status]}
                    {w.pastDeadlineWhileOpen ? " · deadline passed" : ""}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-stone-500">
                  <span>
                    {w.closesOn
                      ? `closes ${w.closesOn.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
                      : "no closing date"}
                  </span>
                  <span>{w.questionCount} question(s)</span>
                  <span className={w.hasBrief ? "" : "text-amber-700"}>
                    {w.hasBrief ? "guidance published" : "no guidance"}
                  </span>
                  <span>
                    {w.proposalCount} proposal(s) · {w.liveCount} live
                  </span>
                  {w.ceilingAmount && <span>ceiling ₹{w.ceilingAmount}</span>}
                  {w.grantingUnit && <span>{w.grantingUnit.name}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <NewWindow />
    </div>
  );
}
