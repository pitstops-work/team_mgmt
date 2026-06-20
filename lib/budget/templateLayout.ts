// Shared geometry + metadata contract for the APF budget Excel template.
//
// Both the export (lib/budget/exportTemplate.ts) and the import parser
// (lib/budget/importTemplate.ts) depend on these so the two can never silently
// drift apart. If the on-sheet layout changes, bump LAYOUT_VERSION and update
// both sides.

import type { BudgetSection } from "@/app/generated/prisma/client";

/** Header row on each Budget data sheet (data rows start at HEADER_ROW + 1). */
export const HEADER_ROW = 4;

/** Per-year input column letters on the Budget sheet.
 *  u = No. of Units, c = Unit Cost, a = % of allocation, t = Total. */
export const YEAR_INPUT_COLS = {
  1: { u: "F", c: "G", a: "H", t: "I" },
  2: { u: "J", c: "K", a: "L", t: "M" },
  3: { u: "N", c: "O", a: "P", t: "Q" },
  4: { u: "R", c: "S", a: "T", t: "U" },
  5: { u: "V", c: "W", a: "X", t: "Y" },
} as const;

/** Fixed (non-year) column letters used by both sides. */
export const COL = {
  sno: "A",
  description: "B",
  costCategory: "C",
  inflationKey: "D",
  unitType: "E",
  rowTotal: "Z",
  budgetNotes: "AA",
} as const;

/** Hidden metadata sheet — carries the machine-readable budget state for a
 *  lossless round-trip. Invisible to the partner; read first on import. */
export const META_SHEET = "00.Meta";
/** Cell on the Meta sheet holding the JSON blob. */
export const META_CELL = "A1";
/** Bump when the on-sheet layout or meta schema changes incompatibly.
 *  v2: MetaLine carries `locations[]` (was sheet+row) + cadence/plannedMonths. */
export const LAYOUT_VERSION = 2;

/** One programme/section line's structural identity + location(s) in the
 *  workbook. Amounts are intentionally NOT stored here — they live in the
 *  editable green cells (the partner's surface). `base` is a fallback only, used
 *  when a cell is unreadable (e.g. an un-opened file whose formulas have no
 *  cached result). */
export type MetaLine = {
  /** All (sheet,row) occurrences. A cross-cutting (domain=null) line is repeated
   *  on every domain sheet in multi-domain exports, so it has >1 location. */
  locations: { sheet: string; row: number }[];
  position: number;     // BudgetLine.position
  domain: string | null;
  section: BudgetSection;
  templateKey: string | null;
  costCategory: "Salary" | "Other" | "Nil";
  unitType: string;
  description: string;
  salaryHint: string | null;
  notes: string | null;
  cadence: "monthly" | "one_time" | "seasonal";
  plannedMonths: number[];
  base: {
    y1: { u: number; c: number; a: number };
    y2: { u: number; c: number; a: number };
    y3: { u: number; c: number; a: number };
    y4: { u: number; c: number; a: number };
    y5: { u: number; c: number; a: number };
  };
};

/** The full machine-readable state embedded in the Meta sheet. */
export type TemplateMeta = {
  v: number;                 // LAYOUT_VERSION
  kind: "apf-budget";
  name: string;
  city: string;
  domains: string[];
  years: number;             // active year-bands (1..5)
  horizonMonths: number;
  applyInflation: boolean;
  /** Inflation rates as PERCENTAGES (e.g. 10 = 10%). */
  inflation: { Salary: number; Other: number; Nil: number };
  /** Full flat programme-input map (mirrors BudgetInputs.extraInputs). */
  inputs: Record<string, number>;
  costOverrides: Record<string, number>;
  costSnapshot: Record<string, number>;
  /** Worksheet names that carry budget data rows. */
  budgetSheets: string[];
  lines: MetaLine[];
};
