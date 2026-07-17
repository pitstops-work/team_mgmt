// Build a BLANK APF budget template — the same xlsx layout as a real export,
// but pre-seeded with empty green rows in every section for the partner to fill
// by hand, then re-import via /budget/import. Because the import parser only
// ever reads rows registered in the hidden 00.Meta index (it does not scan for
// hand-added rows), a blank template must ship a fixed number of pre-registered
// empty rows per section — the "fixed-slot" approach. Untouched rows import as
// zero and are dropped by the parser; filled rows round-trip normally.
//
// Lines carry no templateKey and no cost registry basis, so the resulting budget
// opts out of cost-registry analysis (deviation-vs-standard is N/A per line) but
// keeps everything else: editing, versioning, working, history and export.

import { buildBudgetWorkbook, type ExportBudget, type ExportLine } from "./exportTemplate";
import { BLANK_TEMPLATE_KEY_PREFIX } from "./templateLayout";
import { activeYearBands, DEFAULT_INFLATION_RATES } from "@/lib/budget-generator";
import type { BudgetSection } from "@/app/generated/prisma/client";

export type BlankTemplateConfig = {
  name: string;
  city: string;
  horizonMonths: number;
  applyInflation: boolean;
  /** Blank rows offered per section. Import drops the ones left empty. */
  rowsPerSection?: number;
};

/** Section slots in APF order, with a sensible default inflation category the
 *  filler can override on the sheet. */
const BLANK_SECTIONS: { section: BudgetSection; costCategory: "Salary" | "Other" | "Nil" }[] = [
  { section: "salary",        costCategory: "Salary" },
  { section: "admin_salary",  costCategory: "Salary" },
  { section: "capex",         costCategory: "Nil" },
  { section: "travel",        costCategory: "Other" },
  { section: "programme",     costCategory: "Other" },
  { section: "admin_other",   costCategory: "Other" },
];

function blankLine(section: BudgetSection, costCategory: "Salary" | "Other" | "Nil", idx: number): ExportLine {
  return {
    domain: null, section, description: "", costCategory, unitType: "",
    notes: null, salaryHint: null, templateKey: `${BLANK_TEMPLATE_KEY_PREFIX}${section}:${idx}`,
    costComponents: [], costMonthly: false, isSalaryStub: false,
    userInputCost: null, workerRatioKey: null, costPctOf: null,
    cadence: "monthly", plannedMonths: [],
    y1Units: 0, y1UnitCost: 0, y1AllocPct: 1, y1Total: 0,
    y2Units: 0, y2UnitCost: 0, y2AllocPct: 1, y2Total: 0,
    y3Units: 0, y3UnitCost: 0, y3AllocPct: 1, y3Total: 0,
    y4Units: 0, y4UnitCost: 0, y4AllocPct: 1, y4Total: 0,
    y5Units: 0, y5UnitCost: 0, y5AllocPct: 1, y5Total: 0,
  };
}

export async function buildBlankBudgetWorkbook(cfg: BlankTemplateConfig) {
  const horizonMonths = Math.min(60, Math.max(1, Math.round(cfg.horizonMonths || 12)));
  const years = activeYearBands(horizonMonths);
  const rowsPerSection = Math.min(60, Math.max(1, Math.round(cfg.rowsPerSection ?? 12)));

  const lines: ExportLine[] = BLANK_SECTIONS.flatMap(s =>
    Array.from({ length: rowsPerSection }, (_, i) => blankLine(s.section, s.costCategory, i)),
  );

  // Inflation rates only surface on the Instructions sheet reference table; the
  // percentages also ride in Meta so a re-import remembers the choice.
  const rates = cfg.applyInflation ? DEFAULT_INFLATION_RATES : { Salary: 0, Other: 0, Nil: 0 };
  const inflationPct = cfg.applyInflation
    ? { Salary: DEFAULT_INFLATION_RATES.Salary * 100, Other: DEFAULT_INFLATION_RATES.Other * 100, Nil: DEFAULT_INFLATION_RATES.Nil * 100 }
    : { Salary: 0, Other: 0, Nil: 0 };

  const budget: ExportBudget = {
    name: cfg.name.trim() || "Untitled budget",
    domains: [],            // single 03.Budget sheet with all five sections
    years,
    inflationRates: rates,
    lines,
    meta: {
      city: cfg.city,
      horizonMonths,
      applyInflation: cfg.applyInflation,
      inflationPct,
      inputs: {},
      costOverrides: {},
      costSnapshot: {},     // no registry basis — a template-free budget
    },
  };

  return buildBudgetWorkbook(budget);
}
