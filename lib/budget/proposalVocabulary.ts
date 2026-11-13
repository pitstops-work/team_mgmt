/**
 * The intake module's fixed vocabulary.
 *
 * Deliberately prisma-free — type imports only — because the desk, the stage
 * picker and the applicant's own status page are all client components, and a
 * module that reaches prisma typechecks clean then fails the build with
 * "Can't resolve 'dns'". That has cost this work two builds already.
 *
 * The substantive reason this file exists, though, is `declineReasonCode`. It
 * is a free `String` on `Proposal`, and `declineReasonSummary()` GROUPS BY it.
 * Free text through a group-by produces a report where "no fit", "No Fit" and
 * "not a fit" are three findings — which is the same failure as
 * `GrantAsset.disposition` before it was constrained. A fixed list is what
 * makes "why do we say no" answerable at all.
 */

import type { ProposalStage, FundingWindowStatus } from "@/app/generated/prisma/client";

/**
 * `Record<ProposalStage, …>` rather than a lookup with a fallback: adding a
 * stage to the enum without deciding what to call it becomes a compile error
 * instead of a screen that renders "undefined".
 */
export const PROPOSAL_STAGE_LABELS: Record<ProposalStage, string> = {
  received: "Received",
  screening: "Screening",
  eligible: "Eligible",
  ineligible: "Not eligible",
  due_diligence: "Due diligence",
  appraisal: "Appraisal",
  decided: "Decided",
  withdrawn: "Withdrawn",
};

/** Desk column order. Terminal stages sit at the end, collapsed by default. */
export const PROPOSAL_DESK_ORDER: ProposalStage[] = [
  "received",
  "screening",
  "eligible",
  "due_diligence",
  "appraisal",
  "decided",
  "ineligible",
  "withdrawn",
];

export const TERMINAL_PROPOSAL_STAGES: ProposalStage[] = ["ineligible", "decided", "withdrawn"];

/** Stages whose entry needs a recorded reason. */
export const STAGES_NEEDING_REASON: ProposalStage[] = ["ineligible", "withdrawn"];

export function isTerminalProposalStage(s: ProposalStage): boolean {
  return TERMINAL_PROPOSAL_STAGES.includes(s);
}

/**
 * What the applicant is told, which is not what the stage is called internally.
 *
 * Two of these differ on purpose. "Due diligence" to an applicant reads as a
 * decision already taken — it is the stage where a funder spends real money on
 * checks, and saying so invites them to count on it. And "Not eligible" is an
 * assessment of them; "Not taken forward" is a statement about our decision,
 * which is the honest shape of it and the one we can actually stand behind.
 */
export const PUBLIC_STAGE_LABELS: Record<ProposalStage, string> = {
  received: "Received",
  screening: "Being read",
  eligible: "Shortlisted",
  ineligible: "Not taken forward",
  due_diligence: "Under assessment",
  appraisal: "Under assessment",
  decided: "Decided",
  withdrawn: "Withdrawn",
};

/**
 * One line the applicant gets instead of nothing. A public status page whose
 * only content is a word is worse than no page: it invites a phone call.
 */
export const PUBLIC_STAGE_NOTES: Record<ProposalStage, string> = {
  received: "We have your proposal. Nobody has read it yet.",
  screening: "Someone is reading it against the call's eligibility criteria.",
  eligible: "It met the criteria and is in the pool being considered.",
  ineligible: "We are not taking this proposal forward. The reason is below.",
  due_diligence: "We are checking the organisation's governance, finances and compliance.",
  appraisal: "A funding recommendation is being written up for a decision forum.",
  decided: "A decision has been taken. Whoever you have been speaking to will confirm the terms.",
  withdrawn: "This proposal was withdrawn.",
};

/**
 * The decline reasons.
 *
 * Fixed, and kept short on purpose: a list of thirty codes is filled in at
 * random and reports the same nothing as free text. `needsNote` marks the ones
 * that say nothing on their own — exactly as the closure vocabulary does for
 * "sold" and "written off".
 */
export const DECLINE_REASONS = [
  { code: "out_of_scope", label: "Outside the call's scope", needsNote: false },
  { code: "ineligible_org", label: "Organisation not eligible", needsNote: false },
  { code: "incomplete", label: "Proposal incomplete after follow-up", needsNote: false },
  { code: "weak_proposal", label: "Assessed as weaker than the pool", needsNote: false },
  { code: "no_budget", label: "No funds left in this call", needsNote: false },
  { code: "duplicate", label: "Duplicate of another proposal", needsNote: true },
  { code: "governance_concern", label: "Governance or compliance concern", needsNote: true },
  { code: "applicant_withdrew", label: "Applicant withdrew", needsNote: false },
  { code: "other", label: "Other", needsNote: true },
] as const;

export type DeclineReasonCode = (typeof DECLINE_REASONS)[number]["code"];

export function isDeclineReason(v: string): v is DeclineReasonCode {
  return DECLINE_REASONS.some((r) => r.code === v);
}

export function declineReasonLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return DECLINE_REASONS.find((r) => r.code === code)?.label ?? code;
}

export function declineReasonNeedsNote(code: string): boolean {
  return DECLINE_REASONS.find((r) => r.code === code)?.needsNote ?? false;
}

/**
 * Reasons the applicant is shown verbatim.
 *
 * `governance_concern` is not among them. It is a judgement about named people,
 * recorded for our own file, and a public page is not where it gets
 * communicated — that conversation is had by a person or not at all. The
 * applicant sees the generic decline line in its place.
 */
export const PUBLICLY_STATED_REASONS: string[] = [
  "out_of_scope",
  "ineligible_org",
  "incomplete",
  "no_budget",
  "applicant_withdrew",
];

export function publicDeclineLine(code: string | null | undefined): string {
  if (!code) return "We are not taking this proposal forward.";
  if (!PUBLICLY_STATED_REASONS.includes(code)) {
    return "We are not taking this proposal forward. Someone will be in touch if you would like to discuss it.";
  }
  return declineReasonLabel(code) ?? "We are not taking this proposal forward.";
}

export const WINDOW_STATUS_LABELS: Record<FundingWindowStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
  archived: "Archived",
};

/** The question types the public form can render. */
export const QUESTION_TYPES = ["text", "textarea", "number", "select", "boolean", "date"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export type WindowQuestion = {
  key: string;
  label: string;
  type: QuestionType;
  required: boolean;
  /** Only for `select`. */
  options?: string[];
  help?: string;
};

export function isQuestionType(v: string): v is QuestionType {
  return (QUESTION_TYPES as readonly string[]).includes(v);
}

/** Ageing thresholds for the desk. Not a policy — a colour. */
export const AGEING_WARN_DAYS = 21;
export const AGEING_STALE_DAYS = 45;
