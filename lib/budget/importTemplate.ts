// Parse a filled APF budget Excel back into a budget draft — the inverse of
// lib/budget/exportTemplate.ts. Reads structural identity + config from the
// hidden 00.Meta sheet, then overlays the partner's edits from the editable
// green cells on the Budget sheet(s). Totals are recomputed server-side
// (Units × Unit Cost × Allocation%) — Excel's cached values are never trusted.
//
// Only files produced by our own export are supported (they carry the Meta
// sheet). Files without it are rejected with a clear message.

import ExcelJS from "exceljs";
import {
  META_SHEET, YEAR_INPUT_COLS,
  type MetaLine, type TemplateMeta,
} from "./templateLayout";

export type ParsedLine = {
  position: number;
  domain: string | null;
  section: MetaLine["section"];
  templateKey: string | null;
  description: string;
  costCategory: "Salary" | "Other" | "Nil";
  unitType: string;
  salaryHint: string | null;
  notes: string | null;
  y1Units: number; y1UnitCost: number; y1AllocPct: number; y1Total: number;
  y2Units: number; y2UnitCost: number; y2AllocPct: number; y2Total: number;
  y3Units: number; y3UnitCost: number; y3AllocPct: number; y3Total: number;
  y4Units: number; y4UnitCost: number; y4AllocPct: number; y4Total: number;
  y5Units: number; y5UnitCost: number; y5AllocPct: number; y5Total: number;
  /** True if any amount differs from the exported baseline (partner edited it). */
  edited: boolean;
};

export type ParsedBudget = {
  name: string;
  city: string;
  domains: string[];
  horizonMonths: number;
  years: number;
  applyInflation: boolean;
  inflationPct: { Salary: number; Other: number; Nil: number };
  inputs: Record<string, number>;
  costOverrides: Record<string, number>;
  costSnapshot: Record<string, number>;
  lines: ParsedLine[];
  grandTotal: number;
  warnings: string[];
};

export class BudgetImportError extends Error {}

/** Read a possibly-chunked numeric/string cell as a finite number, or null. */
function cellNumber(cell: ExcelJS.Cell): number | null {
  const v = cell.value as unknown;
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // Formula cell → { formula, result }. Use the cached result if Excel saved one.
  if (typeof v === "object" && v !== null && "result" in v) {
    const r = (v as { result?: unknown }).result;
    return typeof r === "number" && Number.isFinite(r) ? r : null;
  }
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function cellString(cell: ExcelJS.Cell): string | null {
  const v = cell.value as unknown;
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && v !== null && "result" in v) {
    const r = (v as { result?: unknown }).result;
    return r === null || r === undefined ? null : String(r).trim() || null;
  }
  return null;
}

/** Reassemble the JSON meta blob from the (possibly chunked) Meta sheet. */
function readMeta(wb: ExcelJS.Workbook): TemplateMeta {
  const ws = wb.getWorksheet(META_SHEET);
  if (!ws) {
    throw new BudgetImportError(
      "This file has no embedded budget metadata. Only budgets exported from this app can be imported — re-export the template and fill that copy.",
    );
  }
  let json = "";
  for (let row = 1; row <= ws.rowCount; row++) {
    const part = cellString(ws.getCell(`A${row}`));
    if (part === null) break;
    json += part;
  }
  let meta: TemplateMeta;
  try {
    meta = JSON.parse(json) as TemplateMeta;
  } catch {
    throw new BudgetImportError("The embedded budget metadata is corrupted and could not be read.");
  }
  if (meta.kind !== "apf-budget" || !Array.isArray(meta.lines)) {
    throw new BudgetImportError("The embedded budget metadata is not a recognised budget template.");
  }
  return meta;
}

const VALID_CATEGORY = new Set(["Salary", "Other", "Nil"]);

/** Strip the "  [salaryHint]" suffix the export appends to salary descriptions. */
function stripSalaryHint(desc: string): string {
  return desc.replace(/\s*\[[^\]]*\]\s*$/, "").trim();
}

export async function parseBudgetWorkbook(buffer: ArrayBuffer): Promise<ParsedBudget> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new BudgetImportError("Could not read the file — make sure it is a valid .xlsx workbook.");
  }
  const meta = readMeta(wb);
  const warnings: string[] = [];
  const years = Math.min(5, Math.max(1, meta.years || 1));

  const lines: ParsedLine[] = [];
  for (const ml of meta.lines) {
    const ws = wb.getWorksheet(ml.sheet);
    if (!ws) { warnings.push(`Sheet "${ml.sheet}" missing — line "${ml.description}" kept at template values.`); }
    const row = ws ? ws.getRow(ml.row) : null;

    // Identity: prefer the (editable) cell value, fall back to the template meta.
    const descCell = row ? cellString(row.getCell(2)) : null;
    const description = descCell ? stripSalaryHint(descCell) : ml.description;
    const catCell = row ? cellString(row.getCell(3)) : null;
    const costCategory = (catCell && VALID_CATEGORY.has(catCell) ? catCell : ml.costCategory) as "Salary" | "Other" | "Nil";
    const unitTypeCell = row ? cellString(row.getCell(5)) : null;
    const unitType = unitTypeCell ?? ml.unitType;
    const notesCell = row ? cellString(row.getCell(27)) : null;
    const notes = notesCell ?? ml.notes;

    // Amounts per active year: units & alloc% read straight; unit cost falls back
    // to the formula result, then the template baseline if the cell is unreadable.
    const amt: Record<string, { u: number; c: number; a: number; t: number }> = {};
    for (let y = 1 as 1 | 2 | 3 | 4 | 5; y <= 5; y = (y + 1) as 1 | 2 | 3 | 4 | 5) {
      const base = ml.base[`y${y}` as keyof MetaLine["base"]];
      if (y > years) { amt[`y${y}`] = { u: 0, c: 0, a: 1, t: 0 }; continue; }
      const cols = YEAR_INPUT_COLS[y];
      const uCell = row?.getCell(cols.u);
      const cCell = row?.getCell(cols.c);
      const aCell = row?.getCell(cols.a);
      const u = uCell ? (cellNumber(uCell) ?? 0) : base.u;
      const c = cCell ? (cellNumber(cCell) ?? base.c) : base.c;
      const aRaw = aCell ? cellNumber(aCell) : null;
      const a = aRaw === null ? 1 : aRaw; // blank allocation = 100% (matches export formula)
      const t = u * c * a;
      amt[`y${y}`] = { u, c, a, t };
    }

    const grand = amt.y1.t + amt.y2.t + amt.y3.t + amt.y4.t + amt.y5.t;
    const baseGrand =
      ml.base.y1.u * ml.base.y1.c * ml.base.y1.a + ml.base.y2.u * ml.base.y2.c * ml.base.y2.a +
      ml.base.y3.u * ml.base.y3.c * ml.base.y3.a + ml.base.y4.u * ml.base.y4.c * ml.base.y4.a +
      ml.base.y5.u * ml.base.y5.c * ml.base.y5.a;
    const edited = Math.abs(grand - baseGrand) > 0.5 || description !== ml.description;

    lines.push({
      position: ml.position, domain: ml.domain, section: ml.section, templateKey: ml.templateKey,
      description, costCategory, unitType, salaryHint: ml.salaryHint, notes,
      y1Units: amt.y1.u, y1UnitCost: amt.y1.c, y1AllocPct: amt.y1.a, y1Total: amt.y1.t,
      y2Units: amt.y2.u, y2UnitCost: amt.y2.c, y2AllocPct: amt.y2.a, y2Total: amt.y2.t,
      y3Units: amt.y3.u, y3UnitCost: amt.y3.c, y3AllocPct: amt.y3.a, y3Total: amt.y3.t,
      y4Units: amt.y4.u, y4UnitCost: amt.y4.c, y4AllocPct: amt.y4.a, y4Total: amt.y4.t,
      y5Units: amt.y5.u, y5UnitCost: amt.y5.c, y5AllocPct: amt.y5.a, y5Total: amt.y5.t,
      edited,
    });
  }

  const grandTotal = lines.reduce(
    (s, l) => s + l.y1Total + l.y2Total + l.y3Total + l.y4Total + l.y5Total, 0,
  );

  return {
    name: meta.name, city: meta.city, domains: meta.domains,
    horizonMonths: meta.horizonMonths, years,
    applyInflation: meta.applyInflation, inflationPct: meta.inflation,
    inputs: meta.inputs ?? {}, costOverrides: meta.costOverrides ?? {}, costSnapshot: meta.costSnapshot ?? {},
    lines, grandTotal, warnings,
  };
}
