// Finance Declaration by Partner — content model shared by the submit action
// (snapshot + hash) and the DOCX generator. Pure/server-safe: no docx import so
// it can be pulled into either without bundling document libraries.

import { proratedBudget } from "@/lib/budget-report-slots";
import type { BudgetLineCadence } from "@/app/generated/prisma/client";

// The declaration's fixed "Summary of Fund Utilization" rows, each fed by one or
// more budget sections. `additional` folds into Program expenses.
export const DECLARATION_ROWS: { key: string; sl: string; label: string; sections: string[] }[] = [
  { key: "prog_salary", sl: "1.a", label: "Program staff salaries", sections: ["salary"] },
  { key: "admin_salary", sl: "1.b", label: "Admin staff salaries", sections: ["admin_salary"] },
  { key: "capex", sl: "2.", label: "Fixed assets / CAPEX", sections: ["capex"] },
  { key: "travel", sl: "3.", label: "Travel, Boarding & Lodging", sections: ["travel"] },
  { key: "programme", sl: "4.", label: "Program expenses", sections: ["programme", "additional"] },
  { key: "admin_other", sl: "5.", label: "Administration cost", sections: ["admin_other"] },
];

export type DeclLineInput = {
  section: string;
  cadence: BudgetLineCadence;
  plannedMonths: number[];
  yearTotal: number; // for the slot's grant year
  actual: number; // this-period actual from the report line
};

export type DeclarationSummaryRow = { key: string; sl: string; label: string; budget: number; expenses: number };

export type DeclarationSummary = {
  rows: DeclarationSummaryRow[];
  totalBudget: number;
  totalExpenses: number;
};

export function buildDeclarationSummary(
  lines: DeclLineInput[],
  periodFrom: Date,
  periodTo: Date,
  yearStart: Date,
): DeclarationSummary {
  const rows = DECLARATION_ROWS.map(r => {
    const inSec = lines.filter(l => r.sections.includes(l.section));
    const budget = inSec.reduce((s, l) => s + proratedBudget(l, periodFrom, periodTo, yearStart), 0);
    const expenses = inSec.reduce((s, l) => s + l.actual, 0);
    return { key: r.key, sl: r.sl, label: r.label, budget: Math.round(budget), expenses: Math.round(expenses) };
  });
  return {
    rows,
    totalBudget: rows.reduce((s, r) => s + r.budget, 0),
    totalExpenses: rows.reduce((s, r) => s + r.expenses, 0),
  };
}

// Fields the partner fills into the declaration (the yellow-highlighted blanks).
export type DeclarationInputs = {
  grantId: string;
  orgHeadName: string;
  orgHeadDesignation: string;
  finHeadName: string;
  finHeadDesignation: string;
  valid12A: string; // free text / date, e.g. "31/03/2025"
  valid80G: string;
  fcraApplicable: boolean;
  validFCRA: string; // ignored when fcraApplicable is false
};

export const BLANK_DECLARATION_INPUTS: DeclarationInputs = {
  grantId: "",
  orgHeadName: "",
  orgHeadDesignation: "",
  finHeadName: "",
  finHeadDesignation: "",
  valid12A: "",
  valid80G: "",
  fcraApplicable: false,
  validFCRA: "",
};

export function declarationInputsComplete(i: DeclarationInputs): boolean {
  const req = [i.grantId, i.orgHeadName, i.orgHeadDesignation, i.finHeadName, i.finHeadDesignation, i.valid12A, i.valid80G];
  if (i.fcraApplicable && !i.validFCRA.trim()) return false;
  return req.every(v => v.trim().length > 0);
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

// The exact affirmation text the partner ticks. Kept here so the snapshot/hash
// and the on-screen copy never drift.
export const AFFIRMATION_CLAUSES = [
  "The purpose and scale of the program align with the grant agreement, and any changes have been mutually agreed upon by the Foundation.",
  "To the best of our knowledge, all applicable statutory requirements, including labour-law requirements, have been complied with.",
  "The reported expenses have been exclusively utilised for the program's intended purpose, as per the grant agreement.",
  "The expenditure reported in the Fund Utilization Report for the Reporting Period is in line with the books of accounts.",
  "The financial information in the Fund Utilization Report, Bank Statement, and Bank Reconciliation Statement is true and correct to the best of our knowledge and reflects a true and fair state of affairs.",
];
