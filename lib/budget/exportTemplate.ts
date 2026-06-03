import ExcelJS from "exceljs";
import type { BudgetSection } from "@/app/generated/prisma/client";

export type ExportLine = {
  domain: string | null;
  section: BudgetSection;
  description: string;
  costCategory: "Salary" | "Other" | "Nil";
  unitType: string;
  notes: string | null;
  salaryHint: string | null;
  templateKey: string | null;
  costDriver: string | null;
  y1Units: number; y1UnitCost: number; y1AllocPct: number; y1Total: number;
  y2Units: number; y2UnitCost: number; y2AllocPct: number; y2Total: number;
  y3Units: number; y3UnitCost: number; y3AllocPct: number; y3Total: number;
};

export type ExportBudget = {
  name: string;
  domains: string[];
  years: number;
  lines: ExportLine[];
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

const INFLATION_RANGE = "'01.Instructions'!$B$21:$C$23";

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
  description: string;
  notes: string | null;
  costDriver: string | null;
  y1Units: number;
  y1UnitCost: number;
  rowNum: number; // row position on the source Budget sheet
};

export type BudgetSheetResult = {
  map: SectionRowMap;
  programmeRows: ProgrammeRowRef[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Instructions sheet
// ─────────────────────────────────────────────────────────────────────────────

const INSTRUCTION_LINES: string[] = [
  "Pls fill the data in all the sheets highlighted in GREEN (03.Budget and 04.Working). Items in yellow are auto-computed.",
  "Pls DO NOT CUT a cell. If you want to copy contents of one cell to another, use Copy + Paste instead.",
  "Columns marked 'Total' are auto-filled. The Summary sheet rolls up Budget category sub-totals automatically.",
  "To provide additional details like sub-line breakdown of a programme expense, use the 04.Working sheet.",
  "Inflation is computed automatically in the annual cost based on the Cost Category. Salary = 10%, Other = 5%, Nil = 0%.",
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

function buildInstructionsSheet(wb: ExcelJS.Workbook): void {
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

  const inflationRows: Array<[string, number]> = [["Salary", 0.10], ["Nil", 0], ["Other", 0.05]];
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
// Working sheet — pre-populated from backend programme lines
// One row per section-4 (Programme expense) line, with Total linked back to
// the source Budget sheet. Breakdown columns (Food/Accom/Resource/IEC/Others)
// kept as template-style reviewer space.
// ─────────────────────────────────────────────────────────────────────────────

type WorkingProgrammeGroup = {
  domainLabel: string;
  sheetName: string; // source Budget sheet to link Total cell to
  rows: ProgrammeRowRef[];
};

function buildWorkingSheet(wb: ExcelJS.Workbook, groups: WorkingProgrammeGroup[]): void {
  const ws = wb.addWorksheet("04.Working");
  ws.properties.tabColor = { argb: C.tabGreen };
  // A=Sl.No B=Programme expense C=Food D=Accom E=Resource fee F=IEC G=Others
  // H=Total (linked) I=Cost driver (from cost registry) J=Assumptions (notes)
  ws.columns = [
    { width: 6 }, { width: 38 },
    { width: 12 }, { width: 14 }, { width: 20 }, { width: 10 }, { width: 12 },
    { width: 16 }, { width: 46 }, { width: 36 },
  ];

  const totalCols = 10;
  const totalLines = groups.reduce((s, g) => s + g.rows.length, 0);
  const introText = totalLines === 0
    ? "No programme expenses in this budget yet. Add lines under section 4 of 03.Budget; they'll appear here on the next export."
    : "Reference breakdown of programme expenses. Each row links back to the corresponding line on the Budget sheet (Total column = live reference). The 'Cost driver' column shows the cost-registry components fed in by the Budget Builder. This export is generated by the Budget Builder; the Budget Builder remains the source of truth.";

  const intro = ws.addRow([introText]);
  ws.mergeCells(1, 1, 1, totalCols);
  intro.getCell(1).alignment = { wrapText: true, vertical: "middle" };
  intro.getCell(1).font = { name: FONT_NAME, size: FONT_SIZE, italic: true };
  intro.height = 42;

  const hdr = ws.addRow(["Sl.No", "Programme expense", "Food", "Accommodation", "Resource fee / Consultant", "IEC", "Others", "Total (Rs.)", "Cost driver", "Assumptions"]);
  hdr.eachCell({ includeEmpty: true }, c => {
    c.fill = fill(C.olive);
    c.font = { name: FONT_NAME, bold: true, size: FONT_SIZE };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = thinBorder();
  });
  hdr.height = 30;

  const multiDomain = groups.length > 1;
  let sno = 1;
  for (const g of groups) {
    if (g.rows.length === 0) continue;
    if (multiDomain) {
      const bnr = ws.addRow([`${g.domainLabel} — Programme expenses`]);
      ws.mergeCells(bnr.number, 1, bnr.number, totalCols);
      bnr.getCell(1).font = { name: FONT_NAME, bold: true, size: FONT_SIZE, color: { argb: C.black } };
      bnr.getCell(1).fill = fill(C.sectionBanner);
      bnr.getCell(1).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      bnr.getCell(1).border = thinBorder();
      for (let c = 2; c <= totalCols; c++) {
        bnr.getCell(c).fill = fill(C.sectionBanner);
        bnr.getCell(c).border = thinBorder();
      }
      bnr.height = 18;
    }

    for (const pr of g.rows) {
      const r = ws.addRow([
        sno++,
        pr.description,
        null, null, null, null, null,
        { formula: `'${g.sheetName.replace(/'/g, "''")}'!I${pr.rowNum}` },
        pr.costDriver ?? "",
        pr.notes ?? "",
      ]);
      r.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.border = thinBorder();
        cell.font = { name: FONT_NAME, size: FONT_SIZE };
        cell.fill = fill(C.dataRow);
        if (col === 1) cell.alignment = { horizontal: "center", vertical: "middle" };
        else if (col === 2 || col === 9 || col === 10) cell.alignment = { vertical: "middle", wrapText: true };
        else cell.alignment = { horizontal: "right", vertical: "middle" };
        if ([3, 4, 5, 6, 7, 8].includes(col)) cell.numFmt = NUMFMT.currency;
      });
      r.height = 28;
    }
  }
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

function inflationFormula(rowNum: number, yearCol: keyof typeof YEAR_INPUT_COLS): string {
  const y = YEAR_INPUT_COLS[yearCol];
  return `${y.u}${rowNum}*${y.c}${rowNum}*IF(ISBLANK(${y.a}${rowNum}),100%,${y.a}${rowNum})*(1+VLOOKUP($D${rowNum},${INFLATION_RANGE},2,FALSE))^(RIGHT(${y.t}$${HEADER_ROW},1)-1)`;
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

function emitDataRow(
  ws: ExcelJS.Worksheet,
  line: ExportLine,
  sno: number,
  years: number,
  grandTotalRow: number,
): void {
  const r = ws.addRow([]);
  const rn = r.number;

  r.getCell(1).value = sno;
  r.getCell(2).value = line.salaryHint ? `${line.description}  [${line.salaryHint}]` : line.description;
  r.getCell(3).value = line.costCategory;
  r.getCell(4).value = line.costCategory; // VLOOKUP key
  r.getCell(5).value = line.unitType;

  r.getCell(6).value = line.y1Units || null;
  r.getCell(7).value = line.y1UnitCost || null;
  r.getCell(8).value = line.y1AllocPct;
  r.getCell(9).value = { formula: inflationFormula(rn, 1) };

  const yearData: Array<{ y: 2 | 3 | 4 | 5; u: number; c: number; a: number }> = [
    { y: 2, u: line.y2Units, c: line.y2UnitCost, a: line.y2AllocPct },
    { y: 3, u: line.y3Units, c: line.y3UnitCost, a: line.y3AllocPct },
    { y: 4, u: 0, c: 0, a: 1 },
    { y: 5, u: 0, c: 0, a: 1 },
  ];
  for (const d of yearData) {
    if (years < d.y) continue;
    const y = YEAR_INPUT_COLS[d.y];
    r.getCell(y.u).value = d.u || null;
    r.getCell(y.c).value = d.c || null;
    r.getCell(y.a).value = d.a;
    r.getCell(y.t).value = { formula: inflationFormula(rn, d.y) };
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

export function buildBudgetSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  title: string,
  lines: ExportLine[],
  years: number,
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
    for (const line of p.data) {
      emitDataRow(ws, line, sno++, years, grandTotalRow);
      if (p.key === "4") {
        programmeRows.push({
          description: line.description,
          notes: line.notes,
          costDriver: line.costDriver,
          y1Units: line.y1Units,
          y1UnitCost: line.y1UnitCost,
          rowNum: ws.rowCount,
        });
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
  return { map, programmeRows };
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
      r.getCell(cols.t).value = { formula: inflationFormula(rn, slot.y) };
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

export async function buildBudgetWorkbook(budget: ExportBudget): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Budget Builder";
  wb.created = new Date();

  buildInstructionsSheet(wb);

  const domains = budget.domains.length > 0 ? budget.domains : ["__all__"];
  const workingGroups: WorkingProgrammeGroup[] = [];

  if (domains.length === 1) {
    const domainKey = domains[0];
    const linesForDomain = domainKey === "__all__"
      ? budget.lines
      : budget.lines.filter(l => l.domain === domainKey || l.domain === null);
    const { map, programmeRows } = buildBudgetSheet(wb, "03.Budget", budget.name, linesForDomain, budget.years);
    buildSummarySheet(wb, budget.name, "03.Budget", map);
    workingGroups.push({
      domainLabel: domainKey === "__all__" ? budget.name : (DOMAIN_LABELS[domainKey] ?? domainKey),
      sheetName: "03.Budget",
      rows: programmeRows,
    });
  } else {
    const domainSheets: Array<{ name: string; map: SectionRowMap; label: string }> = [];
    for (const domain of domains) {
      const label = DOMAIN_LABELS[domain] ?? domain;
      const sheetName = `Budget - ${label}`.substring(0, 31);
      const domainLines = budget.lines.filter(l => l.domain === domain || l.domain === null);
      const { map, programmeRows } = buildBudgetSheet(wb, sheetName, `${label} – ${budget.name}`, domainLines, budget.years);
      domainSheets.push({ name: sheetName, map, label });
      workingGroups.push({ domainLabel: label, sheetName, rows: programmeRows });
    }
    const masterMap = buildMasterBudgetSheet(wb, budget.name, budget.years, domainSheets);
    buildSummarySheet(wb, budget.name, "03.Budget", masterMap);
  }

  buildWorkingSheet(wb, workingGroups);

  // Reorder sheets to: 01.Instructions, 02.Summary, 03.Budget, 04.Working, then per-domain
  const desiredOrder = ["01.Instructions", "02.Summary", "03.Budget", "04.Working"];
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
