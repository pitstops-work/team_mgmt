import ExcelJS from "exceljs";
import type { BudgetSection } from "@/app/generated/prisma/client";
import {
  META_SHEET, META_CELL, LAYOUT_VERSION,
  type MetaLine, type TemplateMeta,
} from "./templateLayout";

/**
 * Cost-component for a programme line, sourced from CostRegistry items joined
 * via LineTemplate.costKey/costKey2/costKey3. Used to populate Working sheet.
 */
export type CostComponent = {
  label: string;   // human-readable, e.g. "₹/workshop (youth.yuva_adda_cost_per_workshop)"
  value: number;   // numeric value used in the Excel multiplication formula
};

/** One sub-item in an aggregate cost's breakup (from CostRegistryComponent). */
export type CostBreakupComponent = {
  label: string;
  spec: string | null;
  qty: number;
  unitCost: number;
};

/** An aggregate cost item and its structured breakup. Rendered on the
 *  "05.Cost Breakup" sheet so the derivation of a bundled unit cost (e.g.
 *  one-time setup) stays visible even though it's a single line on the Budget
 *  sheet. Mirrors the APF template's "Detail budget for asset" sheet. */
export type CostBreakup = {
  parentItemKey: string;
  parentLabel: string;   // the budget line's description
  unitType: string;      // e.g. "Per creche"
  unitCost: number;      // aggregate unit cost (should equal Σ qty×unitCost)
  components: CostBreakupComponent[];
};

export type ExportLine = {
  domain: string | null;
  /** Multi-partner: which delivery partner this line belongs to (null = shared). */
  deliveryPartnerId?: string | null;
  section: BudgetSection;
  description: string;
  costCategory: "Salary" | "Other" | "Nil";
  unitType: string;
  notes: string | null;
  salaryHint: string | null;
  templateKey: string | null;
  // Cost-formula metadata copied from the LineTemplate this line was generated
  // from. Used to reverse the Working→Budget linkage: when a section-4 line has
  // a standard product formula (costKey × costKey2 × costKey3 × maybe ×12), the
  // Working sheet computes Unit Cost and Budget G col references back to it.
  costComponents: CostComponent[];
  costMonthly: boolean;
  isSalaryStub: boolean;
  userInputCost: string | null;
  workerRatioKey: string | null;   // present → non-standard formula, no linkage
  costPctOf: string | null;        // present → non-standard formula, no linkage
  // Timing profile — not rendered on the sheet, carried in Meta for round-trip.
  cadence: "monthly" | "one_time" | "seasonal";
  plannedMonths: number[];
  y1Units: number; y1UnitCost: number; y1AllocPct: number; y1Total: number;
  y2Units: number; y2UnitCost: number; y2AllocPct: number; y2Total: number;
  y3Units: number; y3UnitCost: number; y3AllocPct: number; y3Total: number;
  y4Units: number; y4UnitCost: number; y4AllocPct: number; y4Total: number;
  y5Units: number; y5UnitCost: number; y5AllocPct: number; y5Total: number;
};

export type ExportBudget = {
  name: string;
  domains: string[];
  /** Count of active year-bands (1..5). Used by emitDataRow to gate Y4/Y5 columns. */
  years: number;
  /** Per-budget inflation rates as decimals (10% → 0.10). When applyInflation
   * is false, all three should be 0 so the inflation formula collapses to 1. */
  inflationRates?: { Salary: number; Other: number; Nil: number };
  lines: ExportLine[];
  /** Aggregate cost items with a structured breakup. When present, a
   *  "05.Cost Breakup" sheet is added showing each bundle's sub-items. */
  costBreakups?: CostBreakup[];
  /** Multi-partner budgets: adds one summary sheet per delivery partner
   *  (direct lines + their allocated share of shared costs by sharedPct). */
  deliveryPartners?: { id: string; name: string; sharedPct: number }[];
  /** When provided, a hidden 00.Meta sheet is written carrying the full
   *  machine-readable budget state for a lossless round-trip on import.
   *  Omit for anonymous/ad-hoc exports that won't be re-imported. */
  meta?: {
    city: string;
    horizonMonths: number;
    applyInflation: boolean;
    /** Inflation rates as PERCENTAGES (10 = 10%). */
    inflationPct: { Salary: number; Other: number; Nil: number };
    inputs: Record<string, number>;
    costOverrides: Record<string, number>;
    costSnapshot: Record<string, number>;
  };
};

const DOMAIN_LABELS: Record<string, string> = {
  Children: "Children", Youth: "Youth", Elderly: "Elderly + Kitchen",
  WelfareRights: "Welfare Rights", Creche: "Creche",
};

// ── Template-exact colour palette (extracted from APF Budget Sheet template) ──
const C = {
  black: "FF000000",
  white: "FFFFFFFF",
  red: "FFFF0000",                  // title text
  olive: "FFC2D69B",                // column header fill
  yellow: "FFFFF2CC",               // inflation cell fill (data rows)
  sectionBanner: "FFBFBFBF",        // section banner fill (theme0 tint -0.25)
  subBanner: "FFFFFFFF",            // sub-banner is WHITE bold (theme0 tint 0)
  dataRow: "FFFCE4D6",              // data row light orange (theme7 tint 0.8)
  subtotal: "FFB8CCE4",             // light blue
  grandtotal: "FFC0504D",           // red/coral
  remarksHeader: "FFE2EFDA",        // light green (theme9) for Remarks/Notes header
  border: "FFBFBFBF",
  tabGreen: "FF92D050",
};

const FONT_NAME = "Calibri";
const FONT_SIZE = 11;

// Accounting number formats (Excel built-ins from the template)
const NUMFMT = {
  currency: '_ * #,##0_ ;_ * -#,##0_ ;_ * "-"??_ ;_ @_ ',
  decimal2: '_ * #,##0.00_ ;_ * -#,##0.00_ ;_ * "-"??_ ;_ @_ ',
  percent: "0%",
  percent2: "0.00%",
};

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const s: ExcelJS.BorderStyle = "thin";
  const c = { style: s, color: { argb: C.border } };
  return { top: c, bottom: c, left: c, right: c };
}

// ── Layout constants ─────────────────────────────────────────────────────────
// A=S.No, B=Description, C=Cost Category, D=Inflation, E=Unit Type
// F-I=Y1, J-M=Y2, N-Q=Y3, R-U=Y4, V-Y=Y5
// Z=Total, AA=Budget Notes, AB=Allocation %, AC=Check, AD=Remarks, AE=Notes
const COL_COUNT = 31;
const HEADER_ROW = 4;

const COL_WIDTHS = [
  6.29, 37.29, 13.29, 8.57, 10,
  11.57, 10, 14.14, 17,           // Y1
  11.57, 9.14, 14.14, 17,         // Y2
  11.57, 9.14, 14.14, 17,         // Y3
  11.57, 9.14, 14.14, 17,         // Y4 (outline level 1)
  11.57, 9.14, 14.14, 17,         // Y5 (outline level 1)
  10, 48.43, 7.71, 6.43, 25.14, 22.00,  // Z, AA, AB, AC, AD, AE
];

const Y4_Y5_OUTLINE_COLS = ["R", "S", "T", "U", "V", "W", "X", "Y"];

const YEAR_INPUT_COLS = {
  1: { u: "F", c: "G", a: "H", t: "I" },
  2: { u: "J", c: "K", a: "L", t: "M" },
  3: { u: "N", c: "O", a: "P", t: "Q" },
  4: { u: "R", c: "S", a: "T", t: "U" },
  5: { u: "V", c: "W", a: "X", t: "Y" },
} as const;

const HEADER_LABELS = [
  "S.No.", "Description", "Cost Category", "Inflation", "Unit Type",
  "No. of Units", "Unit Cost", "% of allocation", "Total (Rs.) - Year 1",
  "No. of Units", "Unit Cost", "% of allocation", "Total (Rs.) - Year 2",
  "No. of Units", "Unit Cost", "% of allocation", "Total (Rs.) - Year 3",
  "No. of Units", "Unit Cost", "% of allocation", "Total (Rs.) - Year 4",
  "No. of Units", "Unit Cost", "% of allocation", "Total (Rs.) - Year 5",
  "Total (Rs.)", "Budget Notes", "Allocation %", "Check", "Remarks", "Notes",
];

// Inflation rates still ship in the Instructions sheet at B20:C23 for
// reference (so the partner can see what was applied), but cell formulas no
// longer read from there — totals are pre-inflated by the generator.

type TemplateSection = {
  key: string;
  num: number;
  label: string;
  subs?: { key: string; letter: "a" | "b"; label: string; sources: BudgetSection[] }[];
  sources?: BudgetSection[];
};

const TEMPLATE_SECTIONS: TemplateSection[] = [
  {
    key: "1", num: 1, label: "Salary, Honorarium, Staff benefits",
    subs: [
      { key: "1a", letter: "a", label: "Program staff", sources: ["salary"] },
      { key: "1b", letter: "b", label: "Admin staff", sources: ["admin_salary"] },
    ],
  },
  { key: "2", num: 2, label: "Fixed assets/ CAPEX", sources: ["capex"] },
  { key: "3", num: 3, label: "Travel, Boarding & Lodging", sources: ["travel"] },
  { key: "4", num: 4, label: "Program expenses", sources: ["programme"] },
  { key: "5", num: 5, label: "Administration cost", sources: ["admin_other", "additional"] },
];

type SectionRowMap = Record<string, number> & { grandTotal: number };

export type ProgrammeRowRef = {
  line: ExportLine;
  rowNum: number; // row position on the source Budget sheet
};

export type BudgetSheetResult = {
  map: SectionRowMap;
  programmeRows: ProgrammeRowRef[];
  /** Every emitted data row (all sections) with its row number — used to build
   *  the hidden Meta line index for round-trip import. */
  dataRows: ProgrammeRowRef[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Instructions sheet
// ─────────────────────────────────────────────────────────────────────────────

const INSTRUCTION_LINES: string[] = [
  "Pls fill the data in all the sheets highlighted in GREEN (03.Budget and 04.Working). Items in yellow are auto-computed.",
  "Pls DO NOT CUT a cell. If you want to copy contents of one cell to another, use Copy + Paste instead.",
  "Columns marked 'Total' are auto-filled. The Summary sheet rolls up Budget category sub-totals automatically.",
  "To provide additional details like sub-line breakdown of a programme expense, use the 04.Working sheet.",
  "Inflation is pre-applied at budget creation: the Y2-Y5 Unit Cost cells already contain inflated values from the chosen budget's per-year rates. Edit any Unit Cost cell to override; the Total cell recalculates as Units × Unit Cost × Allocation%.",
  "Budget up to 5 years can be added in this sheet. Leave Y4/Y5 input cells blank if your grant is shorter. Y4 and Y5 columns are grouped — use the [-] button above column R to collapse them.",
  "Consultants (Full time / Part time) — categorize as per the programme need. Use 'Salary' inflation for retainers.",
  "Mention Asset details for Programme and Head office separately under section 2 (CAPEX).",
  "Mention admin costs for Head office & Project office separately under section 5 (Administration cost).",
];

const GUIDING_PRINCIPLES: string[] = [
  "Salaries — unit cost should reflect cost to organisation (CTC including statutory benefits).",
  "Shared cost (core salaries & office administration) — provide unit cost share attributable to this programme.",
  "Workshops / meetings — estimates to be based on latest similar events; capture per-head cost in budget notes.",
  "Local conveyance to be based on policy of the organisation; capture policy reference in budget notes.",
  "Assets — specify in the budget notes whether the asset is being purchased, replaced or leased.",
  "Capture unit-cost justification in budget notes. In case of pooled cost, mention basis of allocation.",
];

function buildInstructionsSheet(
  wb: ExcelJS.Workbook,
  inflation: { Salary: number; Other: number; Nil: number } = { Salary: 0.10, Other: 0.05, Nil: 0 },
): void {
  const ws = wb.addWorksheet("01.Instructions");
  ws.columns = [{ width: 6 }, { width: 30 }, { width: 14 }, { width: 60 }];

  const title = ws.addRow(["General Instructions"]);
  title.getCell(1).font = { name: FONT_NAME, bold: true, size: 13, color: { argb: C.red } };
  ws.mergeCells(1, 1, 1, 4);
  title.height = 22;

  INSTRUCTION_LINES.forEach((line, i) => {
    const r = ws.addRow([i + 1, line]);
    r.getCell(1).alignment = { horizontal: "center", vertical: "top" };
    r.getCell(2).alignment = { vertical: "top", wrapText: true };
    r.getCell(1).font = { name: FONT_NAME, size: FONT_SIZE };
    r.getCell(2).font = { name: FONT_NAME, size: FONT_SIZE };
    ws.mergeCells(r.number, 2, r.number, 4);
    r.height = 30;
  });

  ws.addRow([]);
  const gp = ws.addRow(["Guiding principles for arriving at unit cost"]);
  gp.getCell(1).font = { name: FONT_NAME, bold: true, size: 12, color: { argb: C.red } };
  ws.mergeCells(gp.number, 1, gp.number, 4);

  GUIDING_PRINCIPLES.forEach((line, i) => {
    const r = ws.addRow([i + 1, line]);
    r.getCell(1).alignment = { horizontal: "center", vertical: "top" };
    r.getCell(2).alignment = { vertical: "top", wrapText: true };
    r.getCell(1).font = { name: FONT_NAME, size: FONT_SIZE };
    r.getCell(2).font = { name: FONT_NAME, size: FONT_SIZE };
    ws.mergeCells(r.number, 2, r.number, 4);
    r.height = 28;
  });

  ws.addRow([]);

  // Inflation table at fixed location B20:C23 — formulas reference '01.Instructions'!$B$21:$C$23
  const targetTableRow = 20;
  while (ws.rowCount < targetTableRow - 1) ws.addRow([]);

  ws.getCell(`B${targetTableRow}`).value = "Inflation Type";
  ws.getCell(`C${targetTableRow}`).value = "Inflation";
  [ws.getCell(`B${targetTableRow}`), ws.getCell(`C${targetTableRow}`)].forEach(c => {
    c.font = { name: FONT_NAME, bold: true, size: FONT_SIZE };
    c.fill = fill(C.olive);
    c.border = thinBorder();
    c.alignment = { horizontal: "center" };
  });

  // Order kept stable so cell references in B${21..23} resolve the same key→row.
  const inflationRows: Array<[string, number]> = [
    ["Salary", inflation.Salary],
    ["Nil",    inflation.Nil],
    ["Other",  inflation.Other],
  ];
  inflationRows.forEach(([k, v], i) => {
    const r = targetTableRow + 1 + i;
    ws.getCell(`B${r}`).value = k;
    ws.getCell(`C${r}`).value = v;
    ws.getCell(`C${r}`).numFmt = NUMFMT.percent;
    [ws.getCell(`B${r}`), ws.getCell(`C${r}`)].forEach(c => {
      c.border = thinBorder();
      c.font = { name: FONT_NAME, size: FONT_SIZE };
    });
  });

  // Register a named Table so structured-ref formulas can also resolve.
  ws.addTable({
    name: "Tbl_inflation1",
    ref: `B${targetTableRow}`,
    headerRow: true,
    style: { theme: "TableStyleLight1", showRowStripes: false },
    columns: [{ name: "Inflation Type" }, { name: "Inflation" }],
    rows: inflationRows,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Working sheet — pre-populated from backend programme lines.
// One row per section-4 (Programme expense) line. Cells C/D, E/F, G/H carry
// the cost-registry components (label + numeric value). Cell J holds a
// product formula that becomes the source of truth for the line's unit cost.
// The corresponding Budget sheet's Y1 Unit Cost cell (col G) references
// J on this sheet, so editing component values cascades into Budget totals.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Plan for a single domain's programme rows on the Working sheet. The plan
 * is built BEFORE writing any sheets so Budget G cells can reference the
 * forecasted Working unit-cost cells.
 */
type WorkingPlan = {
  multiDomain: boolean;
  groups: Array<{
    domainKey: string;
    domainLabel: string;
    bannerRow: number | null;        // null in single-domain mode
    lines: Array<{
      line: ExportLine;
      workingRow: number;
      // Address used by Budget sheets to reference this row's unit cost.
      // null when the line is not formula-linkable (salary stub, user input,
      // worker ratio, %-of, or no cost components).
      unitCostRef: string | null;
    }>;
  }>;
};

function forecastWorkingPlan(
  programmeByDomain: Array<{ domainKey: string; domainLabel: string; lines: ExportLine[] }>,
): WorkingPlan {
  const groupsWithRows = programmeByDomain.filter(g => g.lines.length > 0);
  const multiDomain = groupsWithRows.length > 1;
  const groups: WorkingPlan["groups"] = [];

  // Rows 1 (intro), 2 (header) are fixed. Next available = 3.
  let cursor = 3;
  for (const g of groupsWithRows) {
    let bannerRow: number | null = null;
    if (multiDomain) { bannerRow = cursor; cursor++; }
    const lines: WorkingPlan["groups"][number]["lines"] = [];
    for (const ln of g.lines) {
      const workingRow = cursor;
      const unitCostRef = isStandardCostFormula(ln)
        ? `'04.Working'!$J$${workingRow}`
        : null;
      lines.push({ line: ln, workingRow, unitCostRef });
      cursor++;
    }
    groups.push({ domainKey: g.domainKey, domainLabel: g.domainLabel, bannerRow, lines });
  }
  return { multiDomain, groups };
}

function buildWorkingCellMap(plan: WorkingPlan): WorkingCellMap {
  const m: WorkingCellMap = new Map();
  for (const g of plan.groups) {
    g.lines.forEach((l, idx) => {
      if (l.unitCostRef) m.set(`${g.domainKey}:${idx}`, l.unitCostRef);
    });
  }
  return m;
}

const WORKING_COLS = 11;

function buildWorkingSheet(wb: ExcelJS.Workbook, plan: WorkingPlan): void {
  const ws = wb.addWorksheet("04.Working");
  ws.properties.tabColor = { argb: C.tabGreen };
  // A=Sl B=Programme expense C=Component1 D=Value1 E=Component2 F=Value2
  // G=Component3 H=Value3 I=×12 months? J=Unit Cost (formula) K=Assumptions
  ws.columns = [
    { width: 6 }, { width: 38 },
    { width: 36 }, { width: 12 },
    { width: 28 }, { width: 12 },
    { width: 22 }, { width: 12 },
    { width: 13 }, { width: 14 }, { width: 36 },
  ];

  const totalLines = plan.groups.reduce((s, g) => s + g.lines.length, 0);
  const introText = totalLines === 0
    ? "No programme expenses in this budget yet. Add lines under section 4 of 03.Budget; they'll appear here on the next export."
    : "Backing maths for each programme expense. Each row reconstructs the unit cost from the cost registry and the line template. The Unit Cost (₹) cell is the source of truth — the corresponding Unit Cost cell on the Budget sheet (col G) references it. Editing component values here flows through to the Budget sheet's Y1 totals.";

  const intro = ws.addRow([introText]);
  ws.mergeCells(1, 1, 1, WORKING_COLS);
  intro.getCell(1).alignment = { wrapText: true, vertical: "middle" };
  intro.getCell(1).font = { name: FONT_NAME, size: FONT_SIZE, italic: true };
  intro.height = 46;

  const hdr = ws.addRow([
    "Sl.No", "Programme expense",
    "Component 1 (cost driver)", "Value 1",
    "Component 2", "Value 2",
    "Component 3", "Value 3",
    "× 12 months?", "Unit Cost (₹)", "Assumptions",
  ]);
  hdr.eachCell({ includeEmpty: true }, c => {
    c.fill = fill(C.olive);
    c.font = { name: FONT_NAME, bold: true, size: FONT_SIZE };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = thinBorder();
  });
  hdr.height = 30;

  let sno = 1;
  for (const g of plan.groups) {
    if (plan.multiDomain && g.bannerRow != null) {
      const bnr = ws.addRow([`${g.domainLabel} — Programme expenses`]);
      ws.mergeCells(bnr.number, 1, bnr.number, WORKING_COLS);
      bnr.getCell(1).font = { name: FONT_NAME, bold: true, size: FONT_SIZE, color: { argb: C.black } };
      bnr.getCell(1).fill = fill(C.sectionBanner);
      bnr.getCell(1).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      bnr.getCell(1).border = thinBorder();
      for (let c = 2; c <= WORKING_COLS; c++) {
        bnr.getCell(c).fill = fill(C.sectionBanner);
        bnr.getCell(c).border = thinBorder();
      }
      bnr.height = 18;
    }

    for (const entry of g.lines) {
      const line = entry.line;
      const r = ws.addRow([]);
      const rn = r.number;

      r.getCell(1).value = sno++;
      r.getCell(2).value = line.description;

      // Component cells (C/D, E/F, G/H)
      const comps = line.costComponents.slice(0, 3);
      const compSlots: Array<{ labelCol: number; valueCol: number }> = [
        { labelCol: 3, valueCol: 4 }, { labelCol: 5, valueCol: 6 }, { labelCol: 7, valueCol: 8 },
      ];
      for (let i = 0; i < compSlots.length; i++) {
        const slot = compSlots[i];
        const c = comps[i];
        if (c) {
          r.getCell(slot.labelCol).value = c.label;
          r.getCell(slot.valueCol).value = c.value;
        }
      }

      // × 12 months? toggle (I) — only for standard-formula lines
      const isStandard = isStandardCostFormula(line);
      r.getCell(9).value = isStandard ? (line.costMonthly ? "Yes" : "No") : "";

      // Unit Cost (J) — formula when standard; literal fallback otherwise
      if (isStandard) {
        // =IF(ISNUMBER(D),D,1)*IF(ISNUMBER(F),F,1)*IF(ISNUMBER(H),H,1)*IF(I="Yes",12,1)
        r.getCell(10).value = {
          formula: `IF(ISNUMBER(D${rn}),D${rn},1)*IF(ISNUMBER(F${rn}),F${rn},1)*IF(ISNUMBER(H${rn}),H${rn},1)*IF(I${rn}="Yes",12,1)`,
        };
      } else {
        r.getCell(10).value = line.y1UnitCost || null;
      }

      // Assumptions (K): line notes + status note for non-standard formulas
      let assumption = line.notes ?? "";
      if (line.isSalaryStub) assumption = `Salary stub — user fills cost on Budget sheet${assumption ? `. ${assumption}` : ""}`;
      else if (line.userInputCost) assumption = `Programme input field: ${line.userInputCost}${assumption ? `. ${assumption}` : ""}`;
      else if (line.workerRatioKey) assumption = `Worker-ratio formula (not auto-linked)${assumption ? `. ${assumption}` : ""}`;
      else if (line.costPctOf) assumption = `Percentage-of formula (not auto-linked)${assumption ? `. ${assumption}` : ""}`;
      else if (!line.templateKey) assumption = `Manually added line (no template link)${assumption ? `. ${assumption}` : ""}`;
      r.getCell(11).value = assumption;

      r.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.border = thinBorder();
        cell.font = { name: FONT_NAME, size: FONT_SIZE };
        cell.fill = fill(C.dataRow);
        if (col === 1) cell.alignment = { horizontal: "center", vertical: "middle" };
        else if (col === 2 || col === 3 || col === 5 || col === 7 || col === 11)
          cell.alignment = { vertical: "middle", wrapText: true };
        else if (col === 9) cell.alignment = { horizontal: "center", vertical: "middle" };
        else cell.alignment = { horizontal: "right", vertical: "middle" };
        if (col === 4 || col === 6 || col === 8 || col === 10) cell.numFmt = NUMFMT.currency;
      });
      // Highlight the source-of-truth unit cost cell
      r.getCell(10).fill = fill(C.subtotal);
      r.getCell(10).font = { name: FONT_NAME, bold: true, size: FONT_SIZE };
      r.height = 28;

      if (rn !== entry.workingRow) {
        console.warn(`[budget export] Working row mismatch: forecast=${entry.workingRow}, actual=${rn} (${line.description})`);
      }
    }
  }

  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 2, topLeftCell: "C3" }];
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost Breakup sheet — structural provenance for aggregate cost items.
// A bundled unit cost (e.g. one-time setup) shows as a single line on the
// Budget sheet; here it's expanded into its sub-items so the derivation stays
// visible. Mirrors the APF template's "Detail budget for asset" sheet.
// One block per aggregate: banner → component rows (Amount = Qty × Unit Cost)
// → sub-total (flagged if it doesn't reconcile to the Budget-sheet unit cost).
// ─────────────────────────────────────────────────────────────────────────────

const BREAKUP_COLS = 6;

function buildCostBreakupSheet(wb: ExcelJS.Workbook, breakups: CostBreakup[]): void {
  const ws = wb.addWorksheet("05.Cost Breakup");
  ws.properties.tabColor = { argb: C.tabGreen };
  // A=Sl B=Item C=Specification D=Qty E=Unit Cost (₹) F=Amount (₹)
  ws.columns = [{ width: 6 }, { width: 40 }, { width: 46 }, { width: 8 }, { width: 14 }, { width: 15 }];

  const intro = ws.addRow([
    "How each bundled (aggregate) unit cost on the Budget sheet is arrived at. Each block lists the sub-items; the sub-total is the unit cost carried as one line on 03.Budget. Editing here does not flow back to the Budget sheet — it documents the standard.",
  ]);
  ws.mergeCells(1, 1, 1, BREAKUP_COLS);
  intro.getCell(1).alignment = { wrapText: true, vertical: "middle" };
  intro.getCell(1).font = { name: FONT_NAME, size: FONT_SIZE, italic: true };
  intro.height = 46;

  const hdr = ws.addRow(["Sl.No", "Item", "Specification", "Qty", "Unit Cost (₹)", "Amount (₹)"]);
  hdr.eachCell({ includeEmpty: true }, c => {
    c.fill = fill(C.olive);
    c.font = { name: FONT_NAME, bold: true, size: FONT_SIZE };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = thinBorder();
  });
  hdr.height = 26;

  for (const b of breakups) {
    // Banner: parent label + unit type + aggregate unit cost.
    const bnr = ws.addRow([`${b.parentLabel}${b.unitType ? ` (${b.unitType})` : ""}`]);
    ws.mergeCells(bnr.number, 1, bnr.number, BREAKUP_COLS);
    bnr.getCell(1).font = { name: FONT_NAME, bold: true, size: FONT_SIZE, color: { argb: C.black } };
    bnr.getCell(1).fill = fill(C.sectionBanner);
    bnr.getCell(1).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    for (let c = 1; c <= BREAKUP_COLS; c++) { bnr.getCell(c).fill = fill(C.sectionBanner); bnr.getCell(c).border = thinBorder(); }
    bnr.height = 18;

    let sno = 1;
    const firstRow = bnr.number + 1;
    for (const comp of b.components) {
      const r = ws.addRow([sno++, comp.label, comp.spec ?? "", comp.qty, comp.unitCost, null]);
      const rn = r.number;
      r.getCell(6).value = { formula: `D${rn}*E${rn}` };
      r.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.border = thinBorder();
        cell.font = { name: FONT_NAME, size: FONT_SIZE };
        cell.fill = fill(C.dataRow);
        if (col === 1 || col === 4) cell.alignment = { horizontal: "center", vertical: "middle" };
        else if (col === 2 || col === 3) cell.alignment = { vertical: "middle", wrapText: true };
        else cell.alignment = { horizontal: "right", vertical: "middle" };
        if (col === 5 || col === 6) cell.numFmt = NUMFMT.currency;
      });
      r.height = 22;
    }

    // Sub-total row = SUM of amounts. Flag when it doesn't reconcile to the
    // aggregate unit cost carried on the Budget sheet.
    const lastRow = ws.lastRow!.number;
    const componentSum = b.components.reduce((s, c) => s + c.qty * c.unitCost, 0);
    const reconciles = Math.round(componentSum) === Math.round(b.unitCost);
    const sub = ws.addRow([
      "", "Sub-total", reconciles ? "" : `⚠ ≠ Budget unit cost ₹${Math.round(b.unitCost).toLocaleString("en-IN")}`,
      "", "", b.components.length ? { formula: `SUM(F${firstRow}:F${lastRow})` } : 0,
    ]);
    sub.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = thinBorder();
      cell.font = { name: FONT_NAME, bold: true, size: FONT_SIZE };
      cell.fill = fill(reconciles ? C.subtotal : C.grandtotal);
      if (col === 3) { cell.alignment = { vertical: "middle", wrapText: true }; cell.font = { name: FONT_NAME, bold: true, size: FONT_SIZE, color: { argb: reconciles ? C.black : C.white } }; }
      else cell.alignment = { horizontal: col === 6 ? "right" : "left", vertical: "middle" };
      if (col === 6) cell.numFmt = NUMFMT.currency;
    });
    sub.height = 22;
    ws.addRow([]); // spacer between blocks
  }

  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 2, topLeftCell: "A3" }];
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget sheet shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function applyColumnLayout(ws: ExcelJS.Worksheet) {
  ws.columns = COL_WIDTHS.map(w => ({ width: w }));
  for (const c of Y4_Y5_OUTLINE_COLS) {
    ws.getColumn(c).outlineLevel = 1;
  }
  // Show outline summary buttons above (right of columns)
  ws.properties.outlineProperties = { summaryBelow: false, summaryRight: true };
}

function writeTitleRow(ws: ExcelJS.Worksheet, title: string) {
  const titleRow = ws.addRow([title]);
  ws.mergeCells(1, 1, 1, COL_COUNT);
  titleRow.getCell(1).font = { name: FONT_NAME, bold: true, size: 13, color: { argb: C.red } };
  titleRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
  titleRow.height = 22;
}

function writeYearGroupBanner(ws: ExcelJS.Worksheet, rowNum: number) {
  const row = ws.getRow(rowNum);
  row.height = 18;
  for (let c = 1; c <= COL_COUNT; c++) {
    const cell = row.getCell(c);
    cell.fill = fill(C.black);
    cell.font = { name: FONT_NAME, bold: true, color: { argb: C.white }, size: FONT_SIZE };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  }
  row.getCell(1).value = "Budget Category";
  ws.mergeCells(rowNum, 1, rowNum, 5);
  row.getCell(6).value = "Year 1"; ws.mergeCells(rowNum, 6, rowNum, 9);
  row.getCell(10).value = "Year 2"; ws.mergeCells(rowNum, 10, rowNum, 13);
  row.getCell(14).value = "Year 3"; ws.mergeCells(rowNum, 14, rowNum, 17);
  row.getCell(18).value = "Year 4"; ws.mergeCells(rowNum, 18, rowNum, 21);
  row.getCell(22).value = "Year 5"; ws.mergeCells(rowNum, 22, rowNum, 25);
  row.getCell(26).value = "Total";
  row.getCell(27).value = "Budget Notes";
  // Remarks/Notes header on the same banner row (col AD, AE)
  row.getCell(30).value = "Remarks";
  row.getCell(31).value = "Notes";
}

function writeColumnHeaderRow(ws: ExcelJS.Worksheet, rowNum: number) {
  const row = ws.getRow(rowNum);
  HEADER_LABELS.forEach((label, i) => { row.getCell(i + 1).value = label; });
  row.height = 32;
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    // Remarks/Notes header cells (AD=30, AE=31) get the light-green fill from the template
    if (col === 30 || col === 31) {
      cell.fill = fill(C.remarksHeader);
    } else {
      cell.fill = fill(C.olive);
    }
    cell.font = { name: FONT_NAME, bold: true, size: FONT_SIZE, color: { argb: C.black } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder();
  });
}

function styleSectionBanner(row: ExcelJS.Row) {
  row.height = 18;
  for (let c = 1; c <= COL_COUNT; c++) {
    const cell = row.getCell(c);
    cell.fill = fill(C.sectionBanner);
    cell.font = { name: FONT_NAME, bold: true, size: FONT_SIZE, color: { argb: C.black } };
    cell.border = thinBorder();
  }
  row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  row.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
}

function styleSubBanner(row: ExcelJS.Row) {
  row.height = 16;
  for (let c = 1; c <= COL_COUNT; c++) {
    const cell = row.getCell(c);
    cell.fill = fill(C.subBanner);
    cell.font = { name: FONT_NAME, bold: true, size: FONT_SIZE, color: { argb: C.black } };
    cell.border = thinBorder();
  }
  row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  row.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
}

function styleSubTotalRow(row: ExcelJS.Row) {
  row.eachCell({ includeEmpty: true }, c => {
    c.fill = fill(C.subtotal);
    c.font = { name: FONT_NAME, bold: true, size: FONT_SIZE, color: { argb: C.black } };
    c.border = thinBorder();
  });
  row.height = 18;
}

function styleGrandTotalRow(row: ExcelJS.Row) {
  row.eachCell({ includeEmpty: true }, c => {
    c.fill = fill(C.grandtotal);
    c.font = { name: FONT_NAME, bold: true, size: FONT_SIZE, color: { argb: C.black } };
    c.border = thinBorder();
  });
  row.height = 20;
}

function totalRowFormula(rowNum: number): string {
  return `I${rowNum}+M${rowNum}+Q${rowNum}+U${rowNum}+Y${rowNum}`;
}

/** Total = Units × Unit Cost × Allocation%. Inflation is *not* applied here:
 *  the generator already wrote inflated unit-cost values into the cell when
 *  the budget's applyInflation flag was on. Applying inflation again via the
 *  old (1+rate)^(year-1) factor double-counted Y2+ totals — this drops it. */
function totalFormula(rowNum: number, yearCol: keyof typeof YEAR_INPUT_COLS): string {
  const y = YEAR_INPUT_COLS[yearCol];
  return `${y.u}${rowNum}*${y.c}${rowNum}*IF(ISBLANK(${y.a}${rowNum}),100%,${y.a}${rowNum})`;
}

function applyDataRowStyling(r: ExcelJS.Row) {
  r.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.border = thinBorder();
    cell.font = { name: FONT_NAME, size: FONT_SIZE };
    // Inflation column gets yellow fill; rest get light-orange data-row fill
    if (col === 4) cell.fill = fill(C.yellow);
    else cell.fill = fill(C.dataRow);

    if (col === 2) cell.alignment = { vertical: "middle", wrapText: true };
    else if (col === 1) cell.alignment = { vertical: "middle", wrapText: true };
    else if (col === 27 || col === 30 || col === 31) cell.alignment = { vertical: "middle", wrapText: true };
    else if (col === 3 || col === 4 || col === 5) cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    else cell.alignment = { horizontal: "center", vertical: "middle" };

    // Number formats
    if (col === 6 || col === 10 || col === 14 || col === 18 || col === 22) cell.numFmt = NUMFMT.decimal2; // Units
    else if ([7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 26].includes(col)) cell.numFmt = NUMFMT.currency;
    else if ([8, 12, 16, 20, 24].includes(col)) cell.numFmt = NUMFMT.percent;
    else if (col === 28) cell.numFmt = NUMFMT.percent2;
  });
}

/**
 * Returns true if this line's unit cost can be expressed as a simple product
 * formula on the Working sheet (so Budget G can reference it). Excludes salary
 * stubs, user-input costs, worker-ratio, and pct-of formulas.
 */
function isStandardCostFormula(line: ExportLine): boolean {
  if (line.isSalaryStub) return false;
  if (line.userInputCost) return false;
  if (line.workerRatioKey) return false;
  if (line.costPctOf) return false;
  if (line.costComponents.length === 0) return false;
  return true;
}

function emitDataRow(
  ws: ExcelJS.Worksheet,
  line: ExportLine,
  sno: number,
  years: number,
  grandTotalRow: number,
  y1UnitCostFormula: string | null,
): void {
  const r = ws.addRow([]);
  const rn = r.number;

  r.getCell(1).value = sno;
  r.getCell(2).value = line.salaryHint ? `${line.description}  [${line.salaryHint}]` : line.description;
  r.getCell(3).value = line.costCategory;
  r.getCell(4).value = line.costCategory; // VLOOKUP key
  r.getCell(5).value = line.unitType;

  r.getCell(6).value = line.y1Units || null;
  r.getCell(7).value = y1UnitCostFormula ? { formula: y1UnitCostFormula } : (line.y1UnitCost || null);
  r.getCell(8).value = line.y1AllocPct;
  r.getCell(9).value = { formula: totalFormula(rn, 1) };

  const yearData: Array<{ y: 2 | 3 | 4 | 5; u: number; c: number; a: number }> = [
    { y: 2, u: line.y2Units, c: line.y2UnitCost, a: line.y2AllocPct },
    { y: 3, u: line.y3Units, c: line.y3UnitCost, a: line.y3AllocPct },
    { y: 4, u: line.y4Units, c: line.y4UnitCost, a: line.y4AllocPct },
    { y: 5, u: line.y5Units, c: line.y5UnitCost, a: line.y5AllocPct },
  ];
  for (const d of yearData) {
    if (years < d.y) continue;
    const y = YEAR_INPUT_COLS[d.y];
    r.getCell(y.u).value = d.u || null;
    r.getCell(y.c).value = d.c || null;
    r.getCell(y.a).value = d.a;
    r.getCell(y.t).value = { formula: totalFormula(rn, d.y) };
  }

  r.getCell(26).value = { formula: totalRowFormula(rn) };
  r.getCell(27).value = line.notes ?? "";
  r.getCell(28).value = { formula: `Z${rn}/$Z$${grandTotalRow}` };
  r.getCell(29).value = { formula: `(${totalRowFormula(rn)})=Z${rn}` };
  // AD (Remarks) and AE (Notes) left blank for reviewer use

  applyDataRowStyling(r);
}

function emitSubTotalRow(
  ws: ExcelJS.Worksheet,
  label: string,
  startDataRow: number,
  endDataRow: number,
): number {
  const r = ws.addRow([]);
  const rn = r.number;
  r.getCell(2).value = label;
  const sum = (col: string) => endDataRow >= startDataRow
    ? { formula: `SUM(${col}${startDataRow}:${col}${endDataRow})` }
    : (0 as unknown as ExcelJS.CellValue);
  r.getCell(9).value = sum("I");
  r.getCell(13).value = sum("M");
  r.getCell(17).value = sum("Q");
  r.getCell(21).value = sum("U");
  r.getCell(25).value = sum("Y");
  r.getCell(26).value = { formula: totalRowFormula(rn) };
  styleSubTotalRow(r);
  [9, 13, 17, 21, 25, 26].forEach(c => { r.getCell(c).numFmt = NUMFMT.currency; });
  r.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
  return rn;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-domain (or single) budget sheet
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map keyed by `${domain}:${programmeLineIndex}` → working-sheet unit-cost cell
 * address (e.g. "'04.Working'!J5"). Used by emitDataRow to write G col as a
 * cross-sheet reference instead of a literal value.
 */
type WorkingCellMap = Map<string, string>;

export function buildBudgetSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  title: string,
  lines: ExportLine[],
  years: number,
  domainKey: string,
  workingCellMap: WorkingCellMap,
): BudgetSheetResult {
  const ws = wb.addWorksheet(sheetName.substring(0, 31));
  ws.properties.tabColor = { argb: C.tabGreen };
  applyColumnLayout(ws);

  writeTitleRow(ws, title);
  ws.addRow([]);
  writeYearGroupBanner(ws, 2);

  // Row 3: section 1 banner ("1 | Salary, Honorarium, Staff benefits")
  const sec1 = ws.addRow([1, TEMPLATE_SECTIONS[0].label]);
  styleSectionBanner(sec1);

  // Row 4: column headers (formulas reference $4)
  ws.addRow([]);
  writeColumnHeaderRow(ws, HEADER_ROW);

  const salaryLines = lines.filter(l => l.section === "salary");
  const adminSalaryLines = lines.filter(l => l.section === "admin_salary");

  type PlanItem = {
    key: string;
    banner?: { num: number | string; label: string };
    subBanner?: { letter: string; label: string };
    data: ExportLine[];
  };
  const sectionPlan: PlanItem[] = [
    { key: "1a", subBanner: { letter: "a", label: "Program staff" }, data: salaryLines },
    { key: "1b", subBanner: { letter: "b", label: "Admin staff" }, data: adminSalaryLines },
  ];
  for (const sec of TEMPLATE_SECTIONS.slice(1)) {
    sectionPlan.push({
      key: sec.key,
      banner: { num: sec.num, label: sec.label },
      data: lines.filter(l => sec.sources!.includes(l.section)),
    });
  }

  // Forecast row numbers so AB column can reference $Z$<grandTotal>.
  let cursor = 5;
  const planned: Record<string, { startData: number; endData: number; subtotalRow: number }> = {};
  for (const p of sectionPlan) {
    if (p.banner) cursor += 1;
    if (p.subBanner) cursor += 1;
    cursor += 1; // repeated header
    const startData = cursor;
    const endData = startData + p.data.length - 1;
    cursor += p.data.length;
    const subtotalRow = cursor;
    cursor += 1;
    planned[p.key] = { startData, endData, subtotalRow };
  }
  const grandTotalRow = cursor;

  const map: SectionRowMap = { grandTotal: 0 } as SectionRowMap;
  const programmeRows: ProgrammeRowRef[] = [];
  const dataRows: ProgrammeRowRef[] = [];

  for (const p of sectionPlan) {
    if (p.banner) {
      const r = ws.addRow([p.banner.num, p.banner.label]);
      styleSectionBanner(r);
    }
    if (p.subBanner) {
      const r = ws.addRow([p.subBanner.letter, p.subBanner.label]);
      styleSubBanner(r);
    }
    ws.addRow([]);
    writeColumnHeaderRow(ws, ws.rowCount);

    let sno = 1;
    let programmeIdxInDomain = 0;
    for (const line of p.data) {
      let unitCostFormula: string | null = null;
      if (p.key === "4") {
        unitCostFormula = workingCellMap.get(`${domainKey}:${programmeIdxInDomain}`) ?? null;
      }
      emitDataRow(ws, line, sno++, years, grandTotalRow, unitCostFormula);
      dataRows.push({ line, rowNum: ws.rowCount });
      if (p.key === "4") {
        programmeRows.push({ line, rowNum: ws.rowCount });
        programmeIdxInDomain++;
      }
    }

    const stRow = emitSubTotalRow(ws, "Sub-total", planned[p.key].startData, planned[p.key].endData);
    map[p.key] = stRow;
  }

  // Grand total row
  const gtRow = ws.addRow([]);
  gtRow.getCell(1).value = "TOTAL";
  gtRow.getCell(2).value = title;
  ws.mergeCells(gtRow.number, 2, gtRow.number, 5);
  const subRows = ["1a", "1b", "2", "3", "4", "5"].map(k => planned[k].subtotalRow);
  const sumRefs = (col: string) => subRows.map(r => `${col}${r}`).join("+");
  gtRow.getCell(9).value = { formula: sumRefs("I") };
  gtRow.getCell(13).value = { formula: sumRefs("M") };
  gtRow.getCell(17).value = { formula: sumRefs("Q") };
  gtRow.getCell(21).value = { formula: sumRefs("U") };
  gtRow.getCell(25).value = { formula: sumRefs("Y") };
  gtRow.getCell(26).value = { formula: totalRowFormula(gtRow.number) };
  styleGrandTotalRow(gtRow);
  [9, 13, 17, 21, 25, 26].forEach(c => { gtRow.getCell(c).numFmt = NUMFMT.currency; });
  map.grandTotal = gtRow.number;

  if (gtRow.number !== grandTotalRow) {
    console.warn(`[budget export] grand-total row mismatch on ${sheetName}: forecast=${grandTotalRow}, actual=${gtRow.number}`);
  }

  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 4, topLeftCell: "C5" }];
  return { map, programmeRows, dataRows };
}

// ─────────────────────────────────────────────────────────────────────────────
// Master budget sheet (multi-domain) — compact data-styled rows.
// One row per (sub)section: F=1, G=cross-sheet SUM, H=100%, D="Nil",
// I = same VLOOKUP formula as data rows (evaluates to G since inflation=Nil).
// ─────────────────────────────────────────────────────────────────────────────

function quoteSheetRef(sheet: string, cell: string): string {
  return `'${sheet.replace(/'/g, "''")}'!${cell}`;
}

export function buildMasterBudgetSheet(
  wb: ExcelJS.Workbook,
  title: string,
  years: number,
  domainSheets: Array<{ name: string; map: SectionRowMap; label: string }>,
): SectionRowMap {
  const ws = wb.addWorksheet("03.Budget");
  ws.properties.tabColor = { argb: C.tabGreen };
  applyColumnLayout(ws);

  writeTitleRow(ws, title);
  ws.addRow([]);
  writeYearGroupBanner(ws, 2);

  // Row 3: section 1 banner
  const sec1Banner = ws.addRow([1, TEMPLATE_SECTIONS[0].label]);
  styleSectionBanner(sec1Banner);

  // Row 4: column headers (formulas reference $4)
  ws.addRow([]);
  writeColumnHeaderRow(ws, HEADER_ROW);

  const map: SectionRowMap = { grandTotal: 0 } as SectionRowMap;

  // Forecast grand-total row.
  // Layout: title + year-banner + sec1 banner + header (rows 1-4)
  //   + 1a, 1b rows (rows 5-6)
  //   + 1 data-styled row per section 2..5 (rows 7-10)
  //   + grand total (row 11)
  const grandTotalRow = 11;

  const emitMasterDataRow = (
    key: string,
    snoCol: string | number,
    labelCol: string,
  ) => {
    const r = ws.addRow([]);
    const rn = r.number;

    r.getCell(1).value = snoCol;
    r.getCell(2).value = labelCol;
    r.getCell(3).value = "Pooled";
    r.getCell(4).value = "Nil";   // VLOOKUP key — 0% inflation
    r.getCell(5).value = "Lumpsum";

    const yearSlots: Array<{ y: 1 | 2 | 3 | 4 | 5; mCol: string }> = [
      { y: 1, mCol: "I" }, { y: 2, mCol: "M" }, { y: 3, mCol: "Q" }, { y: 4, mCol: "U" }, { y: 5, mCol: "Y" },
    ];
    for (const slot of yearSlots) {
      if (years < slot.y) continue;
      const cols = YEAR_INPUT_COLS[slot.y];
      r.getCell(cols.u).value = 1;
      r.getCell(cols.c).value = {
        formula: domainSheets.map(d => quoteSheetRef(d.name, `${slot.mCol}${d.map[key]}`)).join("+"),
      };
      r.getCell(cols.a).value = 1;
      r.getCell(cols.t).value = { formula: totalFormula(rn, slot.y) };
    }
    r.getCell(26).value = { formula: totalRowFormula(rn) };
    r.getCell(28).value = { formula: `Z${rn}/$Z$${grandTotalRow}` };
    r.getCell(29).value = { formula: `(${totalRowFormula(rn)})=Z${rn}` };

    applyDataRowStyling(r);
    map[key] = rn;
  };

  // Section 1 — sub-rows a, b (under the sec1 banner emitted above)
  emitMasterDataRow("1a", "a", "Program staff");
  emitMasterDataRow("1b", "b", "Admin staff");

  // Sections 2..5 — one data-styled row each (section number in col A)
  for (const sec of TEMPLATE_SECTIONS.slice(1)) {
    emitMasterDataRow(sec.key, sec.num, sec.label);
  }

  // Grand total
  const gt = ws.addRow([]);
  gt.getCell(1).value = "TOTAL";
  gt.getCell(2).value = title;
  ws.mergeCells(gt.number, 2, gt.number, 5);
  const subRows = ["1a", "1b", "2", "3", "4", "5"].map(k => map[k]);
  const sumRefs = (col: string) => subRows.map(r => `${col}${r}`).join("+");
  gt.getCell(9).value = { formula: sumRefs("I") };
  gt.getCell(13).value = { formula: sumRefs("M") };
  gt.getCell(17).value = { formula: sumRefs("Q") };
  gt.getCell(21).value = { formula: sumRefs("U") };
  gt.getCell(25).value = { formula: sumRefs("Y") };
  gt.getCell(26).value = { formula: totalRowFormula(gt.number) };
  styleGrandTotalRow(gt);
  [9, 13, 17, 21, 25, 26].forEach(c => { gt.getCell(c).numFmt = NUMFMT.currency; });
  map.grandTotal = gt.number;

  if (gt.number !== grandTotalRow) {
    console.warn(`[budget export] master grand-total row mismatch: forecast=${grandTotalRow}, actual=${gt.number}`);
  }

  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 4, topLeftCell: "C5" }];
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary sheet
// ─────────────────────────────────────────────────────────────────────────────

export function buildSummarySheet(
  wb: ExcelJS.Workbook,
  title: string,
  masterSheetName: string,
  masterMap: SectionRowMap,
): void {
  const ws = wb.addWorksheet("02.Summary");
  ws.columns = [
    { width: 4.14 }, { width: 5.57 }, { width: 30.43 },
    { width: 14.71 }, { width: 14.71 }, { width: 14.71 }, { width: 14.71 }, { width: 14.71 },
    { width: 16.86 }, { width: 8.43 },
  ];

  // Row 1: title
  const titleRow = ws.addRow(["", "", "", "", "Budget Summary"]);
  ws.mergeCells(1, 1, 1, 10);
  titleRow.getCell(5).font = { name: FONT_NAME, bold: true, size: 14, color: { argb: C.red } };
  titleRow.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
  titleRow.height = 22;

  // Row 2: column-group banner
  const grpRow = ws.addRow(["", "Sl. No.", "Budget Category", "Yearly Estimated Budget", "", "", "", "", "Requested Grant", "%"]);
  ws.mergeCells(2, 4, 2, 8);
  grpRow.eachCell({ includeEmpty: true }, c => {
    c.font = { name: FONT_NAME, bold: true, color: { argb: C.white }, size: FONT_SIZE };
    c.fill = fill(C.black);
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = thinBorder();
  });

  // Row 3: year sub-headers
  const yearRow = ws.addRow(["", "", "", "Year I", "Year II", "Year III", "Year IV", "Year V", "", ""]);
  yearRow.eachCell({ includeEmpty: true }, c => {
    c.font = { name: FONT_NAME, bold: true, color: { argb: C.white }, size: FONT_SIZE };
    c.fill = fill(C.black);
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = thinBorder();
  });

  const masterRef = (col: string, row: number) => quoteSheetRef(masterSheetName, `${col}${row}`);
  const yearCols: Array<{ col: string; mCol: string }> = [
    { col: "D", mCol: "I" }, { col: "E", mCol: "M" }, { col: "F", mCol: "Q" },
    { col: "G", mCol: "U" }, { col: "H", mCol: "Y" },
  ];

  type SummaryRow = { isSubRow: boolean; sno: string; label: string; mapKey: string | string[] };
  const summaryRows: SummaryRow[] = [
    { isSubRow: false, sno: "1", label: "Salary, Honorarium, Staff benefits", mapKey: ["1a", "1b"] },
    { isSubRow: true,  sno: "a", label: "Program staff", mapKey: "1a" },
    { isSubRow: true,  sno: "b", label: "Admin staff", mapKey: "1b" },
    { isSubRow: false, sno: "2", label: "Fixed assets / CAPEX", mapKey: "2" },
    { isSubRow: false, sno: "3", label: "Travel, Boarding & Lodging", mapKey: "3" },
    { isSubRow: false, sno: "4", label: "Programme expenses", mapKey: "4" },
    { isSubRow: false, sno: "5", label: "Administration cost", mapKey: "5" },
  ];

  const dataRowStart = ws.rowCount + 1;
  for (const sr of summaryRows) {
    const r = ws.addRow([]);
    r.getCell(2).value = sr.sno;
    r.getCell(3).value = sr.label;
    for (const yc of yearCols) {
      const keys = Array.isArray(sr.mapKey) ? sr.mapKey : [sr.mapKey];
      const refs = keys.map(k => masterRef(yc.mCol, masterMap[k]));
      r.getCell(yc.col).value = { formula: refs.join("+") };
      r.getCell(yc.col).numFmt = NUMFMT.currency;
    }
    r.getCell(9).value = { formula: `D${r.number}+E${r.number}+F${r.number}+G${r.number}+H${r.number}` };
    r.getCell(9).numFmt = NUMFMT.currency;
    r.getCell(2).alignment = { horizontal: "center" };
    r.getCell(3).alignment = { horizontal: "left", indent: sr.isSubRow ? 2 : 0 };
    r.eachCell({ includeEmpty: true }, c => {
      c.border = thinBorder();
      c.font = { name: FONT_NAME, size: FONT_SIZE, bold: !sr.isSubRow };
    });
  }

  // Total row
  const totalRow = ws.addRow(["", "", "Total"]);
  const topLevelOffsets = [0, 3, 4, 5, 6];
  for (const yc of yearCols) {
    const formula = topLevelOffsets.map(o => `${yc.col}${dataRowStart + o}`).join("+");
    totalRow.getCell(yc.col).value = { formula };
    totalRow.getCell(yc.col).numFmt = NUMFMT.currency;
  }
  totalRow.getCell(9).value = { formula: `D${totalRow.number}+E${totalRow.number}+F${totalRow.number}+G${totalRow.number}+H${totalRow.number}` };
  totalRow.getCell(9).numFmt = NUMFMT.currency;
  totalRow.eachCell({ includeEmpty: true }, c => {
    c.font = { name: FONT_NAME, bold: true, size: FONT_SIZE };
    c.fill = fill(C.subtotal);
    c.border = thinBorder();
  });
  totalRow.getCell(3).alignment = { horizontal: "left" };

  // % column for parents only
  const totalRowNum = totalRow.number;
  for (let i = 0; i < summaryRows.length; i++) {
    const sr = summaryRows[i];
    if (sr.isSubRow) continue;
    const r = dataRowStart + i;
    ws.getCell(`J${r}`).value = { formula: `I${r}/$I$${totalRowNum}` };
    ws.getCell(`J${r}`).numFmt = NUMFMT.percent2;
    ws.getCell(`J${r}`).border = thinBorder();
    ws.getCell(`J${r}`).font = { name: FONT_NAME, size: FONT_SIZE, bold: true };
  }
  ws.getCell(`J${totalRowNum}`).value = 1;
  ws.getCell(`J${totalRowNum}`).numFmt = NUMFMT.percent;
  ws.getCell(`J${totalRowNum}`).border = thinBorder();
  ws.getCell(`J${totalRowNum}`).font = { name: FONT_NAME, bold: true, size: FONT_SIZE };
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level builder
// ─────────────────────────────────────────────────────────────────────────────

/** Build the hidden Meta line index from each sheet's emitted data rows,
 *  deduping cross-cutting (domain=null) lines that the multi-domain export
 *  repeats on every domain sheet (keep the first occurrence). */
function buildMetaLines(sheetRows: Array<{ sheet: string; rows: ProgrammeRowRef[] }>): MetaLine[] {
  const out: MetaLine[] = [];
  const byId = new Map<string, MetaLine>();
  let position = 0;
  for (const { sheet, rows } of sheetRows) {
    for (const { line, rowNum } of rows) {
      const id = `${line.section}|${line.templateKey ?? ""}|${line.description}|${line.domain ?? ""}`;
      const existing = byId.get(id);
      if (existing) {
        // Cross-cutting line repeated on another domain sheet — record the extra
        // location so import can pick up an edit made on any sheet.
        existing.locations.push({ sheet, row: rowNum });
        continue;
      }
      const ml: MetaLine = {
        locations: [{ sheet, row: rowNum }], position: position++,
        domain: line.domain, section: line.section, templateKey: line.templateKey,
        costCategory: line.costCategory, unitType: line.unitType,
        description: line.description, salaryHint: line.salaryHint, notes: line.notes,
        cadence: line.cadence, plannedMonths: line.plannedMonths,
        base: {
          y1: { u: line.y1Units, c: line.y1UnitCost, a: line.y1AllocPct },
          y2: { u: line.y2Units, c: line.y2UnitCost, a: line.y2AllocPct },
          y3: { u: line.y3Units, c: line.y3UnitCost, a: line.y3AllocPct },
          y4: { u: line.y4Units, c: line.y4UnitCost, a: line.y4AllocPct },
          y5: { u: line.y5Units, c: line.y5UnitCost, a: line.y5AllocPct },
        },
      };
      byId.set(id, ml);
      out.push(ml);
    }
  }
  return out;
}

/** Write the JSON meta blob to a very-hidden sheet, chunked down column A to
 *  stay under Excel's ~32,767-char per-cell limit. */
function writeMetaSheet(wb: ExcelJS.Workbook, meta: TemplateMeta): void {
  const ws = wb.addWorksheet(META_SHEET);
  ws.state = "veryHidden";
  const json = JSON.stringify(meta);
  const CHUNK = 30000;
  if (json.length <= CHUNK) {
    ws.getCell(META_CELL).value = json;
    return;
  }
  for (let i = 0, row = 1; i < json.length; i += CHUNK, row++) {
    ws.getCell(`A${row}`).value = json.slice(i, i + CHUNK);
  }
}

// Per-delivery-partner summary sheets (multi-partner budgets). Each sheet lists
// the partner's direct lines grouped by section with year totals, then their
// allocated share of shared/cross-cutting costs (by sharedPct, normalised), and
// a partner grand total. Self-contained — does not touch the APF sheet logic.
const PARTNER_SECTION_GROUPS: { sections: BudgetSection[]; label: string }[] = [
  { sections: ["salary", "admin_salary"], label: "1. Salary, Honorarium, Staff benefits" },
  { sections: ["capex"],                  label: "2. Fixed assets / CAPEX" },
  { sections: ["travel"],                 label: "3. Travel, Boarding & Lodging" },
  { sections: ["programme"],              label: "4. Programme expenses" },
  { sections: ["admin_other", "additional"], label: "5. Administration cost" },
];

function buildPartnerSheets(wb: ExcelJS.Workbook, budget: ExportBudget): void {
  const partners = budget.deliveryPartners ?? [];
  if (partners.length === 0) return;
  const yearCount = Math.max(1, Math.min(5, budget.years));
  const yearKeys = (["y1Total", "y2Total", "y3Total", "y4Total", "y5Total"] as const).slice(0, yearCount);
  const yearLabels = Array.from({ length: yearCount }, (_, i) => `Year ${i + 1} (Rs.)`);
  const sharedLines = budget.lines.filter(l => l.deliveryPartnerId == null);
  const pctSum = partners.reduce((s, p) => s + (p.sharedPct || 0), 0);
  const sumYear = (rows: ExportLine[], k: typeof yearKeys[number]) => rows.reduce((s, l) => s + (l[k] || 0), 0);

  for (const p of partners) {
    const safe = `P-${p.name}`.replace(/[\\/?*[\]:]/g, " ").substring(0, 31);
    const ws = wb.addWorksheet(safe);
    ws.columns = [{ width: 52 }, { width: 18 }, ...yearKeys.map(() => ({ width: 16 }))];

    const title = ws.addRow([`${p.name} — direct + allocated shared`]);
    title.getCell(1).font = { bold: true, size: 12 };
    ws.addRow([]);
    const head = ws.addRow(["Description", "Section", ...yearLabels]);
    head.eachCell(c => { c.font = { bold: true }; c.fill = fill(C.olive); c.border = thinBorder(); });

    const directTotals = yearKeys.map(() => 0);
    for (const g of PARTNER_SECTION_GROUPS) {
      const secLines = budget.lines.filter(l => l.deliveryPartnerId === p.id && g.sections.includes(l.section));
      if (secLines.length === 0) continue;
      const banner = ws.addRow([g.label]);
      banner.getCell(1).font = { bold: true };
      banner.getCell(1).fill = fill(C.sectionBanner);
      for (const l of secLines) {
        ws.addRow([l.description, l.section, ...yearKeys.map(k => Math.round(l[k] || 0))]);
      }
      const subt = ws.addRow([`Subtotal — ${g.label}`, "", ...yearKeys.map(k => Math.round(sumYear(secLines, k)))]);
      subt.eachCell(c => { c.font = { bold: true }; });
      yearKeys.forEach((k, i) => { directTotals[i] += Math.round(sumYear(secLines, k)); });
    }

    // Allocated shared costs (this partner's share of the master shared lines)
    const shareFrac = pctSum > 0 ? (p.sharedPct || 0) / pctSum : (partners.length ? 1 / partners.length : 0);
    const sharedTotals = yearKeys.map(k => Math.round(sumYear(sharedLines, k) * shareFrac));
    ws.addRow([]);
    const shr = ws.addRow([`Allocated shared costs (${Math.round(shareFrac * 100)}%)`, "", ...sharedTotals]);
    shr.eachCell(c => { c.font = { italic: true }; });

    const grand = ws.addRow(["PARTNER TOTAL", "", ...yearKeys.map((_, i) => directTotals[i] + sharedTotals[i])]);
    grand.eachCell(c => { c.font = { bold: true }; c.fill = fill(C.olive); c.border = thinBorder(); });

    ws.views = [{ state: "frozen", ySplit: 3 }];
  }
}

export async function buildBudgetWorkbook(budget: ExportBudget): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Budget Builder";
  wb.created = new Date();

  buildInstructionsSheet(wb, budget.inflationRates);

  // Collect (sheet → emitted data rows) so we can write the round-trip Meta index.
  const metaSheetRows: Array<{ sheet: string; rows: ProgrammeRowRef[] }> = [];

  const domains = budget.domains.length > 0 ? budget.domains : ["__all__"];

  // Step 1: gather programme lines per domain so we can forecast Working rows.
  const programmeByDomain = domains.map(domain => {
    const isAll = domain === "__all__";
    const filteredLines = isAll
      ? budget.lines
      : budget.lines.filter(l => l.domain === domain || l.domain === null);
    return {
      domainKey: domain,
      domainLabel: isAll ? budget.name : (DOMAIN_LABELS[domain] ?? domain),
      lines: filteredLines.filter(l => l.section === "programme"),
    };
  });

  // Step 2: forecast Working sheet row positions; build a (domain, idx) →
  // unit-cost cell address map that emitDataRow uses for Budget G col.
  const workingPlan = forecastWorkingPlan(programmeByDomain);
  const workingCellMap = buildWorkingCellMap(workingPlan);

  // Step 3: build Budget sheets with cross-sheet references in place.
  if (domains.length === 1) {
    const domainKey = domains[0];
    const linesForDomain = domainKey === "__all__"
      ? budget.lines
      : budget.lines.filter(l => l.domain === domainKey || l.domain === null);
    const { map, dataRows } = buildBudgetSheet(wb, "03.Budget", budget.name, linesForDomain, budget.years, domainKey, workingCellMap);
    metaSheetRows.push({ sheet: "03.Budget", rows: dataRows });
    buildSummarySheet(wb, budget.name, "03.Budget", map);
  } else {
    const domainSheets: Array<{ name: string; map: SectionRowMap; label: string }> = [];
    for (const domain of domains) {
      const label = DOMAIN_LABELS[domain] ?? domain;
      const sheetName = `Budget - ${label}`.substring(0, 31);
      const domainLines = budget.lines.filter(l => l.domain === domain || l.domain === null);
      const { map, dataRows } = buildBudgetSheet(wb, sheetName, `${label} – ${budget.name}`, domainLines, budget.years, domain, workingCellMap);
      metaSheetRows.push({ sheet: sheetName, rows: dataRows });
      domainSheets.push({ name: sheetName, map, label });
    }
    const masterMap = buildMasterBudgetSheet(wb, budget.name, budget.years, domainSheets);
    buildSummarySheet(wb, budget.name, "03.Budget", masterMap);
  }

  // Step 4: build Working with the structured component layout.
  buildWorkingSheet(wb, workingPlan);

  // Step 4a: Cost Breakup sheet — expand any aggregate items with components.
  if (budget.costBreakups && budget.costBreakups.length > 0) {
    buildCostBreakupSheet(wb, budget.costBreakups);
  }

  // Step 4b: per-delivery-partner summary sheets (multi-partner budgets).
  buildPartnerSheets(wb, budget);

  // Step 5: write the hidden round-trip Meta sheet (only when meta is supplied).
  if (budget.meta) {
    const metaLines = buildMetaLines(metaSheetRows);
    const budgetSheets = [...new Set(metaLines.flatMap(l => l.locations.map(loc => loc.sheet)))];
    const meta: TemplateMeta = {
      v: LAYOUT_VERSION, kind: "apf-budget",
      name: budget.name, city: budget.meta.city, domains: budget.domains,
      years: budget.years, horizonMonths: budget.meta.horizonMonths,
      applyInflation: budget.meta.applyInflation, inflation: budget.meta.inflationPct,
      inputs: budget.meta.inputs, costOverrides: budget.meta.costOverrides,
      costSnapshot: budget.meta.costSnapshot, budgetSheets, lines: metaLines,
    };
    writeMetaSheet(wb, meta);
  }

  // Reorder sheets to: 01.Instructions, 02.Summary, 03.Budget, 04.Working, then per-domain
  const desiredOrder = ["01.Instructions", "02.Summary", "03.Budget", "04.Working", "05.Cost Breakup"];
  const knownOrder: Record<string, number> = {};
  desiredOrder.forEach((n, i) => { knownOrder[n] = i; });
  const orderedSheets = [...wb.worksheets].sort((a, b) => {
    const ai = knownOrder[a.name] ?? desiredOrder.length;
    const bi = knownOrder[b.name] ?? desiredOrder.length;
    if (ai !== bi) return ai - bi;
    return wb.worksheets.indexOf(a) - wb.worksheets.indexOf(b);
  });
  orderedSheets.forEach((ws, i) => { (ws as unknown as { orderNo: number }).orderNo = i; });

  return wb.xlsx.writeBuffer();
}
