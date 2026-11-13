"use client";

import Link from "next/link";
import type { ProposalStage } from "@/app/generated/prisma/client";
import {
  PROPOSAL_DESK_ORDER,
  PROPOSAL_STAGE_LABELS,
  AGEING_WARN_DAYS,
  AGEING_STALE_DAYS,
} from "@/lib/budget/proposalVocabulary";

/**
 * The desk, grouped by stage.
 *
 * Age is shown against the last stage MOVE, not against submission, because
 * those answer different questions and only one of them is actionable: a
 * proposal that moved yesterday is being worked on, however long ago it
 * arrived. Both are rendered, with the actionable one first.
 */

export type DeskRow = {
  id: string;
  publicRef: string;
  orgName: string;
  title: string;
  stage: ProposalStage;
  requestedAmount: string | null;
  city: string | null;
  domains: string[];
  assignedTo: { id: string; name: string | null } | null;
  scores: { level: number; total: number | null }[];
  daysInStage: number;
  daysSinceSubmission: number | null;
};

function ageClass(days: number) {
  if (days >= AGEING_STALE_DAYS) return "text-red-700";
  if (days >= AGEING_WARN_DAYS) return "text-amber-700";
  return "text-stone-400";
}

export default function ProposalDesk({
  rows,
  emptyMessage,
}: {
  rows: DeskRow[];
  emptyMessage?: string;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-dashed border-stone-300 p-6 text-sm text-stone-500">
        {emptyMessage ??
          "Nothing in the pipeline. Proposals arrive from an open call, or are added below when the work was solicited rather than submitted."}
      </div>
    );
  }

  const byStage = PROPOSAL_DESK_ORDER.map((stage) => ({
    stage,
    rows: rows.filter((r) => r.stage === stage),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-5">
      {byStage.map(({ stage, rows: group }) => (
        <section key={stage}>
          <div className="flex items-baseline gap-2 mb-2">
            <h3 className="text-sm font-medium text-stone-700">{PROPOSAL_STAGE_LABELS[stage]}</h3>
            <span className="text-xs text-stone-400">{group.length}</span>
          </div>
          <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
            {group.map((r) => {
              const best = r.scores
                .map((s) => s.total)
                .filter((t): t is number => t !== null)
                .sort((a, b) => b - a)[0];
              return (
                <li key={r.id} className="px-3 py-2">
                  <Link href={`/budget/proposals/${r.id}`} className="block group">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm text-stone-800 group-hover:underline">
                        {r.orgName}
                        <span className="text-stone-400 text-xs ml-2 font-mono">{r.publicRef}</span>
                      </span>
                      <span className="text-sm tabular-nums text-stone-600">
                        {r.requestedAmount ? `₹${r.requestedAmount}` : "no amount"}
                      </span>
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5">{r.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                      <span className={ageClass(r.daysInStage)} title="Days since this proposal last moved stage">
                        {r.daysInStage}d in stage
                      </span>
                      {r.daysSinceSubmission !== null && (
                        <span className="text-stone-300" title="Days since it was submitted">
                          {r.daysSinceSubmission}d since submission
                        </span>
                      )}
                      {r.city && <span className="text-stone-400">{r.city}</span>}
                      {r.domains.slice(0, 3).map((d) => (
                        <span key={d} className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-500">
                          {d}
                        </span>
                      ))}
                      {best !== undefined && (
                        <span className="text-stone-500 tabular-nums">score {best}</span>
                      )}
                      <span className={r.assignedTo ? "text-stone-500" : "text-amber-700"}>
                        {r.assignedTo?.name ?? "unassigned"}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
