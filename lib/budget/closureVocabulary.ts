/**
 * The closure stage's vocabulary: settlement modes and asset dispositions.
 *
 * Prisma-free so the closure screen, a client component, can import it. That
 * boundary has now cost two builds that typechecked clean — `tsc --noEmit`
 * cannot see it, only the bundler can — so anything a closure form needs to
 * render lives here rather than beside the functions that use it.
 *
 * ── What happens to things bought with grant money ─────────────────────────
 *
 * `GrantAsset.disposition` is a free `String` in the schema, so nothing stops a
 * typo becoming a category. These are the allowed values, in a prisma-free
 * module because the closure screen is a client component — the third time that
 * boundary has mattered, and `tsc --noEmit` cannot see it.
 *
 * It matters more than a label list: the exit decision turns on what was
 * bought and where it ended up. A vehicle retained by a grantee we are exiting
 * is a different conversation from one transferred to the community, and if
 * both are recorded as free text nobody can ask the question across a
 * portfolio.
 */

export const ASSET_DISPOSITIONS = [
  "retained_by_grantee",
  "transferred_to_community",
  "returned_to_funder",
  "sold",
  "written_off",
  "undecided",
] as const;

export type AssetDisposition = (typeof ASSET_DISPOSITIONS)[number];

export const ASSET_DISPOSITION_LABELS: Record<AssetDisposition, string> = {
  retained_by_grantee: "Retained by the grantee",
  transferred_to_community: "Transferred to the community",
  returned_to_funder: "Returned to us",
  sold: "Sold",
  written_off: "Written off",
  undecided: "Not yet decided",
};

/** Dispositions that need a note to mean anything. */
export const DISPOSITIONS_NEEDING_NOTE: AssetDisposition[] = ["sold", "written_off", "undecided"];

export function isAssetDisposition(v: string): v is AssetDisposition {
  return (ASSET_DISPOSITIONS as readonly string[]).includes(v);
}

/**
 * How an unspent balance is settled.
 *
 * Mirrors `SETTLEMENT_MODES` in lib/budget/closure.ts, which is the value the
 * database stores; a check in scripts/check-grant-invariants.ts asserts the two
 * lists are identical, because a mode offered here and unknown there would fail
 * on save, and one known there but missing here would be unreachable.
 *
 * There is deliberately no default. How a balance is treated is decided case by
 * case, so a default would make the system assert a financial position nobody
 * took — and `none` is refused outright when there IS a balance, since that
 * would be a write-off that never said so.
 */
export const SETTLEMENT_MODES_UI = [
  "refunded",
  "adjusted_against_renewal",
  "written_off",
  "none",
] as const;

export type SettlementModeUi = (typeof SETTLEMENT_MODES_UI)[number];

export const SETTLEMENT_MODE_LABELS: Record<SettlementModeUi, string> = {
  refunded: "Refunded to us",
  adjusted_against_renewal: "Carried into another grant",
  written_off: "Written off",
  none: "No balance to settle",
};

export const EXIT_DECISIONS = ["undecided", "renew", "exit", "pause"] as const;
export type ExitDecisionUi = (typeof EXIT_DECISIONS)[number];

export const EXIT_DECISION_LABELS: Record<ExitDecisionUi, string> = {
  undecided: "Not yet decided",
  renew: "Renew — fund them again",
  exit: "Exit — the relationship ends here",
  pause: "Pause — not now, not never",
};
