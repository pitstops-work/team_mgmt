// Response Manual constants.
//
// A "manual" is a WikiPage with type="manual". Its content lives in 8 fixed
// WikiManualSection rows. Spine sections (S2/S3/S7) are owner-authored and
// change slowly; living sections (S4/S6/S8) grow primarily via append-only
// WikiPracticeEntry captures fed by practice circles, partner reviews, and
// shadow visits.
//
// These constants are the contract between schema, capture flow, reader, and
// curator promotion editor. Section numbers are 1-indexed to match how editors
// and COs read the template.

export const MANUAL_TYPE = "manual" as const;

export type Maturity = "mostly_theory" | "emerging" | "seasoned";

export const MATURITY_VALUES: Maturity[] = ["mostly_theory", "emerging", "seasoned"];

export const MATURITY_LABEL: Record<Maturity, string> = {
  mostly_theory: "Mostly theory",
  emerging: "Emerging",
  seasoned: "Seasoned",
};

// Reader badge palette — stone for mostly-theory (low trust), amber for
// emerging (some practice), green for seasoned (years of ground truth).
export const MATURITY_BADGE_CLS: Record<Maturity, string> = {
  mostly_theory: "bg-stone-100 text-stone-700 border-stone-300",
  emerging: "bg-amber-50 text-amber-800 border-amber-300",
  seasoned: "bg-emerald-50 text-emerald-800 border-emerald-300",
};

export const MATURITY_TRUST_COPY: Record<Maturity, string> = {
  mostly_theory:
    "Standard written but not yet field-tested. Trust your own judgement more than the page.",
  emerging:
    "Some practice has been fed in. The standard path is reasonable; the living sections are still thin.",
  seasoned:
    "Years of accreted ground truth. The standard is well-tested; lean on it.",
};

// 1..8 — fixed shape. Section numbers are 1-indexed to match how editors and
// COs read the template (and the seed docx).
export type SectionNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const SECTION_NUMBERS: SectionNumber[] = [1, 2, 3, 4, 5, 6, 7, 8];

export const SECTION_LABELS: Record<SectionNumber, string> = {
  1: "The need, in the elder's words",
  2: 'What "done" actually means here',
  3: "The standard path",
  4: "Entering: the relational opening",
  5: "How it differs by person and context",
  6: "Where it gets stuck, and what people have actually tried",
  7: "Follow-up and closure mechanics",
  8: "Judgement notes: when to break the standard",
};

// Per-section stability marker. "stable" sections are owner-authored and
// change slowly; "living" sections grow continuously through practice
// circles; "between" sit in the middle.
export type Stability = "stable" | "between" | "living";

export const SECTION_STABILITY: Record<SectionNumber, Stability> = {
  1: "between",
  2: "stable",
  3: "stable",
  4: "living",
  5: "between",
  6: "living",
  7: "stable",
  8: "living",
};

// Light prompts shown in the capture UI when a user has picked this section
// as the destination. Kept short — the writer should not feel taxonomised.
export const SECTION_INTAKE_HINT: Record<SectionNumber, string> = {
  1: "How did the elder actually phrase the need? In which language?",
  2: "What did 'done' look like here? Or what got called done but wasn't?",
  3: "Did the standard steps need adjusting? Where?",
  4: "How did you arrive? What worked, what backfired?",
  5: "What was different about this elder or this household?",
  6: "Where did it get stuck? What was tried?",
  7: "Follow-up cadence — what got checked, what got missed?",
  8: "When did the standard turn out to be the wrong call?",
};

// Default destination when a capture entry comes in without an explicit
// section. Most circle output is failures and workarounds → Section 6.
export const DEFAULT_CAPTURE_SECTION: SectionNumber = 6;

// Boundary edge kinds. "hands_off" is an operationally consequential pass to
// another module (e.g. Mental Health → Safety Pathway on self-harm risk).
// "draws_on" is a shared-content cross-reference.
export type BoundaryKind = "hands_off" | "draws_on";

export const BOUNDARY_KIND_LABEL: Record<BoundaryKind, string> = {
  hands_off: "Hands off to",
  draws_on: "Draws on",
};

// Practice entry status. "raw" = incoming; "reviewed" = curator has read and
// acknowledged but not promoted; "promoted" = curator has stamped a
// promotedToSectionNumber (typically 5) marking this as a standard branch.
export type EntryStatus = "raw" | "reviewed" | "promoted";

export const ENTRY_STATUS_LABEL: Record<EntryStatus, string> = {
  raw: "New",
  reviewed: "Reviewed",
  promoted: "Promoted to standard",
};

export function isValidSectionNumber(n: number): n is SectionNumber {
  return Number.isInteger(n) && n >= 1 && n <= 8;
}

export function isValidMaturity(s: string | null | undefined): s is Maturity {
  return s != null && (MATURITY_VALUES as string[]).includes(s);
}
