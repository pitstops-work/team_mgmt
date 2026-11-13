import { auth } from "@/lib/auth";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { notFound } from "next/navigation";
import Link from "next/link";
import { grantPipeline, STAGE_ORDER, STAGE_LABELS, type StageKey, type StageState } from "@/lib/budget/spine";
import { proposalPipeline } from "@/lib/budget/proposals";

/**
 * The portfolio, by stage. The entry point the grant world did not have.
 *
 * Internal only. A grantee sees their own grants on /budget and has no business
 * seeing the pipeline — who else applied, who was declined, what is stuck.
 *
 * Two lanes, because a grant-maker's work genuinely has two halves and
 * flattening them hides the pre-grant half entirely:
 *
 *   Intake   — proposals not yet attached to a grant. They have no budget, so
 *              they cannot appear in the grant columns at all; before this they
 *              were invisible outside the proposal tables.
 *   Grants   — everything with a Budget behind it, placed at the stage it is
 *              actually at, by the same rules the grant page uses.
 *
 * Deliberately not filtered to "live" grants by default. The first question
 * anyone asks a pipeline board is "where is everything", and a board that has
 * already decided what counts as interesting cannot answer it.
 */

const DOT: Record<StageState, string> = {
  done: "bg-emerald-500",
  active: "bg-sky-500",
  blocked: "bg-amber-500",
  pending: "bg-stone-300",
  skipped: "bg-stone-200",
  unknown: "bg-stone-400",
};

export default async function PipelinePage() {
  const session = await auth();
  if (!(isSuperAdmin(session) || isBudgetAdmin(session))) notFound();

  const [rows, proposals] = await Promise.all([grantPipeline(), proposalPipeline()]);

  const unlinked = proposals.filter((p) => p.stage !== "decided");

  const byStage = new Map<StageKey | "complete", typeof rows>();
  for (const key of STAGE_ORDER) byStage.set(key, []);
  byStage.set("complete", []);
  for (const r of rows) byStage.get(r.stage ?? "complete")!.push(r);

  const blocked = rows.filter((r) => r.stageState === "blocked");
  const columns: { key: StageKey | "complete"; label: string }[] = [
    ...STAGE_ORDER.map((k) => ({ key: k as StageKey | "complete", label: STAGE_LABELS[k] })),
    { key: "complete" as const, label: "Nothing outstanding" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold text-stone-800">Pipeline</h2>
        <p className="text-sm text-stone-500">
          {rows.length} grant{rows.length === 1 ? "" : "s"} · {unlinked.length} proposal
          {unlinked.length === 1 ? "" : "s"} in intake
        </p>
        {blocked.length > 0 && (
          <span className="ml-auto rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
            {blocked.length} blocked
          </span>
        )}
      </header>

      {/* ── Intake ──────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-stone-200 bg-white">
        <div className="flex items-baseline justify-between border-b border-stone-200 px-4 py-2">
          <h3 className="text-sm font-medium text-stone-700">Intake</h3>
          <Link href="/budget/proposals" className="text-xs text-sky-600 hover:underline">
            The intake desk →
          </Link>
        </div>
        {unlinked.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-stone-400">
            Nothing in intake. Proposals arrive here from the open call, or when a
            colleague records a solicited one.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {unlinked.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2">
                <span className="font-mono text-xs text-stone-400">{p.publicRef}</span>
                <Link
                  href={`/budget/proposals/${p.id}`}
                  className="text-sm text-stone-800 hover:underline"
                >
                  {p.orgName}
                </Link>
                <span className="text-xs text-stone-500">{p.title}</span>
                <span className="ml-auto flex items-baseline gap-3 text-xs">
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-600">
                    {p.stage.replace(/_/g, " ")}
                  </span>
                  {p.requestedAmount && (
                    <span className="tabular-nums text-stone-500">₹{p.requestedAmount}</span>
                  )}
                  <span
                    className={`tabular-nums ${p.daysInStage > 30 ? "text-amber-700" : "text-stone-400"}`}
                    title="Days since this proposal last moved stage"
                  >
                    {p.daysInStage}d
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Grants by stage ─────────────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-stone-700">Grants, by stage</h3>
          <span className="text-xs text-stone-400">
            Each grant sits at the earliest stage that is live or stuck
          </span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-3">
          {columns.map((col) => {
            const items = byStage.get(col.key) ?? [];
            return (
              <div
                key={col.key}
                className="flex w-60 shrink-0 flex-col rounded-lg border border-stone-200 bg-stone-50/60"
              >
                <div className="flex items-baseline justify-between border-b border-stone-200 px-2.5 py-1.5">
                  <span className="text-xs font-medium text-stone-600">{col.label}</span>
                  <span className="text-xs tabular-nums text-stone-400">{items.length}</span>
                </div>
                <div className="flex flex-col gap-1.5 p-1.5">
                  {items.length === 0 && (
                    <span className="px-1 py-2 text-xs text-stone-300">—</span>
                  )}
                  {items.map((r) => (
                    <Link
                      key={r.budgetId}
                      href={`/budget/${r.budgetId}`}
                      className="rounded border border-stone-200 bg-white px-2 py-1.5 hover:border-stone-300 hover:shadow-sm"
                      title={r.blockers.join("\n") || undefined}
                    >
                      <div className="flex items-start gap-1.5">
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${DOT[r.stageState]}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-stone-800">
                            {r.granteeName ?? r.name}
                          </span>
                          {r.granteeName && (
                            <span className="block truncate text-[11px] text-stone-400">
                              {r.name}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="mt-1 flex items-baseline justify-between gap-2 text-[11px]">
                        <span
                          className="tabular-nums text-stone-500"
                          title={
                            r.amountIsApproved
                              ? "Approved amount"
                              : "Budget total — no decision recorded, so nothing is approved"
                          }
                        >
                          {r.amount ?? "—"}
                          {!r.amountIsApproved && r.amount ? "*" : ""}
                        </span>
                        <span className="truncate text-stone-400">{r.grantLead ?? "no lead"}</span>
                      </div>
                      {r.blockers.length > 0 && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-amber-800">
                          {r.blockers[0]}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-stone-400">
          * budget total, not an approved amount — there is no decision of record
          behind that grant.
        </p>
      </section>
    </div>
  );
}
