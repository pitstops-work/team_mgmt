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
  META_SHEET, YEAR_INPUT_COLS, BLANK_TEMPLATE_KEY_PREFIX,
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
  cadence: "monthly" | "one_time" | "seasonal";
  plannedMonths: number[];
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

type YearAmt = { u: number; c: number; a: number; t: number };
type LocationRead = {
  description: string;
  costCategory: "Salary" | "Other" | "Nil";
  unitType: string;
  notes: string | null;
  amt: Record<"y1" | "y2" | "y3" | "y4" | "y5", YearAmt>;
  grand: number;
};

/** Read one (sheet,row) occurrence of a line into resolved identity + amounts. */
function readLocation(
  wb: ExcelJS.Workbook, loc: { sheet: string; row: number }, ml: MetaLine, years: number,
): LocationRead | null {
  const ws = wb.getWorksheet(loc.sheet);
  if (!ws) return null;
  const row = ws.getRow(loc.row);

  const descCell = cellString(row.getCell(2));
  const description = descCell ? stripSalaryHint(descCell) : ml.description;
  const catCell = cellString(row.getCell(3));
  const costCategory = (catCell && VALID_CATEGORY.has(catCell) ? catCell : ml.costCategory) as "Salary" | "Other" | "Nil";
  const unitType = cellString(row.getCell(5)) ?? ml.unitType;
  const notes = cellString(row.getCell(27)) ?? ml.notes;

  const amt = {} as Record<"y1" | "y2" | "y3" | "y4" | "y5", YearAmt>;
  let grand = 0;
  for (let y = 1; y <= 5; y++) {
    const key = `y${y}` as "y1" | "y2" | "y3" | "y4" | "y5";
    const base = ml.base[key];
    if (y > years) { amt[key] = { u: 0, c: 0, a: 1, t: 0 }; continue; }
    const cols = YEAR_INPUT_COLS[y as 1 | 2 | 3 | 4 | 5];
    const u = cellNumber(row.getCell(cols.u)) ?? 0;
    const c = cellNumber(row.getCell(cols.c)) ?? base.c;
    const aRaw = cellNumber(row.getCell(cols.a));
    const a = aRaw === null ? 1 : aRaw; // blank allocation = 100% (matches export formula)
    const t = u * c * a;
    amt[key] = { u, c, a, t };
    grand += t;
  }
  return { description, costCategory, unitType, notes, amt, grand };
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

  const baseGrandOf = (ml: MetaLine) =>
    ml.base.y1.u * ml.base.y1.c * ml.base.y1.a + ml.base.y2.u * ml.base.y2.c * ml.base.y2.a +
    ml.base.y3.u * ml.base.y3.c * ml.base.y3.a + ml.base.y4.u * ml.base.y4.c * ml.base.y4.a +
    ml.base.y5.u * ml.base.y5.c * ml.base.y5.a;

  const lines: ParsedLine[] = [];
  for (const ml of meta.lines) {
    // Back-compat: pre-v2 meta carried a single { sheet, row } instead of locations.
    const locs = ml.locations ?? (
      (ml as unknown as { sheet?: string; row?: number }).sheet
        ? [{ sheet: (ml as unknown as { sheet: string }).sheet, row: (ml as unknown as { row: number }).row }]
        : []
    );
    const reads = locs.map(l => readLocation(wb, l, ml, years)).filter((r): r is LocationRead => r !== null);
    if (reads.length === 0) { warnings.push(`Could not locate line "${ml.description}" — kept at template values.`); }

    const baseGrand = baseGrandOf(ml);
    // Across occurrences (cross-cutting lines repeat per domain sheet): prefer an
    // edited one. If several disagree, take the first edited and warn.
    const edits = reads.filter(r => Math.abs(r.grand - baseGrand) > 0.5 || r.description !== ml.description);
    const distinctEditGrands = new Set(edits.map(r => Math.round(r.grand)));
    if (distinctEditGrands.size > 1) {
      warnings.push(`Line "${ml.description}" was edited differently on multiple sheets — using the first edit (₹${Math.round(edits[0].grand).toLocaleString("en-IN")}).`);
    }
    const chosen: LocationRead = edits[0] ?? reads[0] ?? {
      description: ml.description, costCategory: ml.costCategory, unitType: ml.unitType, notes: ml.notes,
      amt: {
        y1: { u: ml.base.y1.u, c: ml.base.y1.c, a: ml.base.y1.a, t: ml.base.y1.u * ml.base.y1.c * ml.base.y1.a },
        y2: { u: ml.base.y2.u, c: ml.base.y2.c, a: ml.base.y2.a, t: ml.base.y2.u * ml.base.y2.c * ml.base.y2.a },
        y3: { u: ml.base.y3.u, c: ml.base.y3.c, a: ml.base.y3.a, t: ml.base.y3.u * ml.base.y3.c * ml.base.y3.a },
        y4: { u: ml.base.y4.u, c: ml.base.y4.c, a: ml.base.y4.a, t: ml.base.y4.u * ml.base.y4.c * ml.base.y4.a },
        y5: { u: ml.base.y5.u, c: ml.base.y5.c, a: ml.base.y5.a, t: ml.base.y5.u * ml.base.y5.c * ml.base.y5.a },
      },
      grand: baseGrand,
    };
    const a = chosen.amt;

    // Placeholder rows from a blank template carry a synthetic templateKey only
    // to stay distinct in the Meta index — a committed line must have none.
    const templateKey = ml.templateKey?.startsWith(BLANK_TEMPLATE_KEY_PREFIX) ? null : ml.templateKey;

    lines.push({
      position: ml.position, domain: ml.domain, section: ml.section, templateKey,
      description: chosen.description, costCategory: chosen.costCategory, unitType: chosen.unitType,
      salaryHint: ml.salaryHint, notes: chosen.notes,
      cadence: ml.cadence ?? "monthly", plannedMonths: ml.plannedMonths ?? [],
      y1Units: a.y1.u, y1UnitCost: a.y1.c, y1AllocPct: a.y1.a, y1Total: a.y1.t,
      y2Units: a.y2.u, y2UnitCost: a.y2.c, y2AllocPct: a.y2.a, y2Total: a.y2.t,
      y3Units: a.y3.u, y3UnitCost: a.y3.c, y3AllocPct: a.y3.a, y3Total: a.y3.t,
      y4Units: a.y4.u, y4UnitCost: a.y4.c, y4AllocPct: a.y4.a, y4Total: a.y4.t,
      y5Units: a.y5.u, y5UnitCost: a.y5.c, y5AllocPct: a.y5.a, y5Total: a.y5.t,
      edited: edits.length > 0,
    });
  }

  // Drop untouched blank rows — the empty slots a blank template ships with that
  // the filler never used (no description AND no amount anywhere). A real line
  // always carries a description, so normal round-trips are unaffected.
  const keptLines = lines.filter(
    l => l.description.trim() !== "" || (l.y1Total + l.y2Total + l.y3Total + l.y4Total + l.y5Total) !== 0,
  );

  const grandTotal = keptLines.reduce(
    (s, l) => s + l.y1Total + l.y2Total + l.y3Total + l.y4Total + l.y5Total, 0,
  );

  return {
    name: meta.name, city: meta.city, domains: meta.domains,
    horizonMonths: meta.horizonMonths, years,
    applyInflation: meta.applyInflation, inflationPct: meta.inflation,
    inputs: meta.inputs ?? {}, costOverrides: meta.costOverrides ?? {}, costSnapshot: meta.costSnapshot ?? {},
    lines: keptLines, grandTotal, warnings,
  };
}
