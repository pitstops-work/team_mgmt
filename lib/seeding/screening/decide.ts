/**
 * What a review does to an application.
 *
 * L2 (screener): Shortlist → the geography lead; Reject → rejected; Hold → a
 * second L2 read by someone else. A second read that holds again goes to the
 * lead rather than round again. If the two L2 totals differ by more than the
 * divergence setting, the lead makes a third read whatever the decisions were.
 *
 * L3 (geography lead): Approve, Reject or Hold.
 *
 * Every decision needs a written justification. A dimension scored 1 flags the
 * application for the lead without changing where it goes.
 */

import type { ScreeningStatus } from "@/app/generated/prisma/client";

export type Level = "l2" | "l3";
export const L2_DECISIONS = ["shortlist", "hold", "reject"] as const;
export const L3_DECISIONS = ["approve", "hold", "reject"] as const;
export type Decision = (typeof L2_DECISIONS)[number] | (typeof L3_DECISIONS)[number];

export const DECISION_LABEL: Record<Decision, string> = {
  shortlist: "Shortlist",
  approve: "Approve",
  hold: "Put on hold",
  reject: "Reject",
};

export const STATUS_META: Record<ScreeningStatus, { label: string; chip: string }> = {
  new: { label: "Awaiting L2", chip: "bg-sky-100 text-sky-700" },
  l2_hold: { label: "On hold — second read", chip: "bg-amber-100 text-amber-700" },
  l3_pending: { label: "Awaiting lead", chip: "bg-violet-100 text-violet-700" },
  l3_hold: { label: "On hold — lead", chip: "bg-amber-100 text-amber-700" },
  approved: { label: "Approved", chip: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", chip: "bg-rose-100 text-rose-700" },
};

export const FLAG_META: Record<string, { label: string; chip: string }> = {
  red_flag: { label: "Red flag", chip: "bg-rose-100 text-rose-700" },
  safeguarding: { label: "Safeguarding", chip: "bg-rose-600 text-white" },
  low_dimension: { label: "Dimension scored 1", chip: "bg-amber-100 text-amber-800" },
  divergent: { label: "Divergent reads", chip: "bg-violet-100 text-violet-700" },
};

/** Which level may act on an application in this status. */
export function levelFor(status: ScreeningStatus): Level | null {
  if (status === "new" || status === "l2_hold") return "l2";
  if (status === "l3_pending" || status === "l3_hold") return "l3";
  return null;
}

export function nextState(opts: {
  level: Level;
  decision: Decision;
  status: ScreeningStatus;
  total: number | null;
  /** Totals of earlier L2 reads of this application. */
  priorL2Totals: number[];
  divergence: number;
  lowDimension: boolean;
  flags: string[];
}): { status: ScreeningStatus; flags: string[] } {
  const flags = new Set(opts.flags);
  if (opts.lowDimension) flags.add("low_dimension");

  if (opts.level === "l3") {
    const status: ScreeningStatus =
      opts.decision === "approve" ? "approved" : opts.decision === "reject" ? "rejected" : "l3_hold";
    return { status, flags: [...flags] };
  }

  const divergent =
    opts.total !== null && opts.priorL2Totals.some((t) => Math.abs(t - opts.total!) > opts.divergence);
  if (divergent) {
    flags.add("divergent");
    return { status: "l3_pending", flags: [...flags] };
  }
  const secondRead = opts.status === "l2_hold";
  const status: ScreeningStatus =
    opts.decision === "shortlist"
      ? "l3_pending"
      : opts.decision === "reject"
        ? "rejected"
        : secondRead
          ? "l3_pending"
          : "l2_hold";
  return { status, flags: [...flags] };
}
