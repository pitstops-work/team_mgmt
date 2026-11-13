/**
 * What each kind of grant document is, and who may see or send it.
 *
 * Prisma-free and type-import only, because the documents screen is a client
 * component. Importing these from a module that pulls in prisma typechecks
 * clean and then fails the build with `fs`/`net`/`tls` in the browser bundle —
 * `tsc --noEmit` cannot see that boundary, only the bundler can. The tranche
 * frequency labels learnt this the hard way.
 *
 * ── Why this table is the access decision ───────────────────────────────────
 *
 * A grant document repository holds the most sensitive things either side has:
 * audited accounts, FCRA returns, bank statements, a signed contract, and the
 * committee's own minutes. "Attached to this grant" is NOT a permission to
 * read — the appraisal note and the board minutes hang off the same budget as
 * the grantee's own utilisation certificate, and the grantee must not see
 * them.
 *
 * So each kind carries two separate decisions, and they are genuinely
 * different questions:
 *
 *   granteeMaySee    — would showing this to the organisation it concerns
 *                      breach the candour it was written under?
 *   granteeMayUpload — is this theirs to provide, or ours to issue?
 *
 * Both default to the restrictive answer by being written out per kind rather
 * than inferred. A `Record` over the enum means a kind added to
 * GrantDocumentKind without an entry is a compile error, not a document that
 * silently becomes visible to everyone.
 */

import type { GrantDocumentKind } from "@/app/generated/prisma/client";

export type DocumentKindRule = {
  label: string;
  /** Which stage of the lifecycle this document belongs to, for grouping. */
  stage:
    | "intake"
    | "budget"
    | "decision"
    | "agreement"
    | "conditions"
    | "releases"
    | "reporting"
    | "closure"
    | "other";
  /** Whether a grantee login may read this document on their own grant. */
  granteeMaySee: boolean;
  /** Whether a grantee login may attach one. */
  granteeMayUpload: boolean;
  /** One line for the person choosing a kind, where the label is not enough. */
  hint?: string;
};

export const DOCUMENT_KINDS: Record<GrantDocumentKind, DocumentKindRule> = {
  proposal: {
    label: "Proposal",
    stage: "intake",
    granteeMaySee: true,
    granteeMayUpload: true,
  },
  dd_evidence: {
    label: "Due-diligence evidence",
    stage: "intake",
    granteeMaySee: true,
    granteeMayUpload: true,
    hint: "Registration certificates, governing-body papers, statutory filings.",
  },
  // Internal-only, for the same reason the spine hides the appraisal stage: the
  // note argues a case and quotes the appraiser's doubts, and candour survives
  // only while it is not addressed to its subject.
  appraisal_note: {
    label: "Appraisal note",
    stage: "decision",
    granteeMaySee: false,
    granteeMayUpload: false,
    hint: "Internal. Never visible to the grantee.",
  },
  board_minutes: {
    label: "Committee minutes",
    stage: "decision",
    granteeMaySee: false,
    granteeMayUpload: false,
    hint: "Internal. Never visible to the grantee.",
  },
  agreement_draft: {
    label: "Agreement (draft)",
    stage: "agreement",
    granteeMaySee: true,
    granteeMayUpload: false,
    hint: "We draft it; they are sent it.",
  },
  agreement_executed: {
    label: "Agreement (signed)",
    stage: "agreement",
    granteeMaySee: true,
    granteeMayUpload: false,
  },
  amendment_deed: {
    label: "Amendment deed",
    stage: "agreement",
    granteeMaySee: true,
    granteeMayUpload: false,
  },
  condition_evidence: {
    label: "Evidence against a condition",
    stage: "conditions",
    granteeMaySee: true,
    granteeMayUpload: true,
    hint: "What discharges a condition attached to the decision.",
  },
  budget_workbook: {
    label: "Budget workbook",
    stage: "budget",
    granteeMaySee: true,
    granteeMayUpload: true,
  },
  financial_report: {
    label: "Financial report",
    stage: "reporting",
    granteeMaySee: true,
    granteeMayUpload: true,
  },
  narrative_report: {
    label: "Narrative report",
    stage: "reporting",
    granteeMaySee: true,
    granteeMayUpload: true,
  },
  utilisation_certificate: {
    label: "Utilisation certificate",
    stage: "reporting",
    granteeMaySee: true,
    granteeMayUpload: true,
  },
  audited_accounts: {
    label: "Audited accounts",
    stage: "reporting",
    granteeMaySee: true,
    granteeMayUpload: true,
  },
  fcra_return: {
    label: "FCRA return",
    stage: "reporting",
    granteeMaySee: true,
    granteeMayUpload: true,
  },
  disbursement_advice: {
    label: "Disbursement advice",
    stage: "releases",
    granteeMaySee: true,
    granteeMayUpload: false,
    hint: "We issue it.",
  },
  bank_statement: {
    label: "Bank statement",
    stage: "reporting",
    granteeMaySee: true,
    granteeMayUpload: true,
  },
  asset_register: {
    label: "Asset register",
    stage: "closure",
    granteeMaySee: true,
    granteeMayUpload: true,
  },
  closure_report: {
    label: "Closure report",
    stage: "closure",
    granteeMaySee: true,
    granteeMayUpload: true,
  },
  other: {
    label: "Other",
    stage: "other",
    granteeMaySee: true,
    granteeMayUpload: true,
  },
};

export const DOCUMENT_KIND_LIST = Object.keys(DOCUMENT_KINDS) as GrantDocumentKind[];

/** Kinds no grantee may read, however the document was attached. */
export const INTERNAL_ONLY_KINDS = DOCUMENT_KIND_LIST.filter(
  (k) => !DOCUMENT_KINDS[k].granteeMaySee,
);

export function documentLabel(kind: GrantDocumentKind): string {
  return DOCUMENT_KINDS[kind]?.label ?? kind.replace(/_/g, " ");
}

export function granteeMaySee(kind: GrantDocumentKind): boolean {
  return DOCUMENT_KINDS[kind]?.granteeMaySee ?? false;
}

export function granteeMayUpload(kind: GrantDocumentKind): boolean {
  return DOCUMENT_KINDS[kind]?.granteeMayUpload ?? false;
}

/** Kinds a grantee may attach, for their own upload picker. */
export const GRANTEE_UPLOADABLE_KINDS = DOCUMENT_KIND_LIST.filter(
  (k) => DOCUMENT_KINDS[k].granteeMayUpload,
);

export const STAGE_ORDER_FOR_DOCUMENTS: DocumentKindRule["stage"][] = [
  "intake",
  "budget",
  "decision",
  "agreement",
  "conditions",
  "releases",
  "reporting",
  "closure",
  "other",
];

export const DOCUMENT_STAGE_LABELS: Record<DocumentKindRule["stage"], string> = {
  intake: "Intake and due diligence",
  budget: "Budget",
  decision: "Decision",
  agreement: "Agreement",
  conditions: "Conditions",
  releases: "Releases",
  reporting: "Reporting",
  closure: "Closure",
  other: "Other",
};

/** Mime types we accept. Deliberately narrow — see the upload route. */
export const ACCEPTED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
] as const;

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
