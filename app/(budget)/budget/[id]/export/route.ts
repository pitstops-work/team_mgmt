import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import type { BudgetDomain, BudgetSection } from "@/app/generated/prisma/client";

const DOMAIN_LABELS: Record<string, string> = {
  Children: "Children", Youth: "Youth", Elderly: "Elderly + Kitchen",
  WelfareRights: "Welfare Rights", Creche: "Creche",
};

const SECTION_LABELS: Record<BudgetSection, string> = {
  salary: "1. Salary & Honorarium",
  capex: "2. Fixed Assets / CAPEX",
  travel: "3. Travel",
  programme: "4. Programme Expenses",
  admin_salary: "5a. Admin – Salaries",
  admin_other: "5b. Admin – Other",
  additional: "6. Additional Items",
};

const SECTION_ORDER: BudgetSection[] = ["salary", "capex", "travel", "programme", "admin_salary", "admin_other", "additional"];
const INFLATION_LABELS: Record<string, string> = { Salary: "Salary (10%)", Other: "Other (5%)", Nil: "Nil (0%)" };

// ── Colour palette ───────────────────────────────────────────────────────────
const C = {
  black:     "FF000000",
  white:     "FFFFFFFF",
  olive:     "FFC2D69B",   // APF column-header green
  yellow:    "FFFFF2CC",   // Inflation column
  subtotal:  "FFF2F2F2",   // sub-total row
  grandtotal:"FF404040",   // grand total row bg (dark)
  border:    "FFBFBFBF",
};

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const s: ExcelJS.BorderStyle = "thin";
  const c = { style: s, color: { argb: C.border } };
  return { top: c, bottom: c, left: c, right: c };
}

function fmtPct(v: number) {
  return v === 1 ? "100%" : `${Math.round(v * 100)}%`;
}

function fmtNum(v: number) {
  return v === 0 ? "" : Math.round(v);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });

  const budget = await prisma.budget.findUnique({
    where: { id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!budget || budget.partnerId !== session.user.id) return new NextResponse("Not found", { status: 404 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "APF Budget Builder";
  wb.created = new Date();
  const years = budget.years;

  // ── Column definitions ─────────────────────────────────────────────────────
  // 1yr: A=SNO B=Desc C=CostCat D=Inflation E=UnitType F=Units G=UnitCost H=Alloc% I=Y1Total J=Notes
  // 3yr: A–E same, F=Y1Units G=Y1Cost H=Y1Alloc% I=Y1Total, J-M=Y2, N-Q=Y3, R=GrandTotal, S=Notes
  const colDefs = years === 3
    ? [
        { header: "S.No",          key: "sno",       width: 6  },
        { header: "Description",   key: "desc",      width: 55 },
        { header: "Cost Category", key: "cat",       width: 14 },
        { header: "Inflation",     key: "infl",      width: 14 },
        { header: "Unit Type",     key: "unit",      width: 14 },
        { header: "Units",         key: "y1u",       width: 11 },
        { header: "Unit Cost",     key: "y1c",       width: 14 },
        { header: "Alloc %",       key: "y1a",       width: 9  },
        { header: "Y1 Total (₹)", key: "y1t",       width: 16 },
        { header: "Units",         key: "y2u",       width: 11 },
        { header: "Unit Cost",     key: "y2c",       width: 14 },
        { header: "Alloc %",       key: "y2a",       width: 9  },
        { header: "Y2 Total (₹)", key: "y2t",       width: 16 },
        { header: "Units",         key: "y3u",       width: 11 },
        { header: "Unit Cost",     key: "y3c",       width: 14 },
        { header: "Alloc %",       key: "y3a",       width: 9  },
        { header: "Y3 Total (₹)", key: "y3t",       width: 16 },
        { header: "Grand Total (₹)", key: "gt",     width: 18 },
        { header: "Notes",         key: "notes",     width: 22 },
      ]
    : [
        { header: "S.No",          key: "sno",       width: 6  },
        { header: "Description",   key: "desc",      width: 55 },
        { header: "Cost Category", key: "cat",       width: 14 },
        { header: "Inflation",     key: "infl",      width: 14 },
        { header: "Unit Type",     key: "unit",      width: 14 },
        { header: "Units",         key: "y1u",       width: 11 },
        { header: "Unit Cost",     key: "y1c",       width: 14 },
        { header: "Alloc %",       key: "y1a",       width: 9  },
        { header: "Y1 Total (₹)", key: "y1t",       width: 16 },
        { header: "Notes",         key: "notes",     width: 22 },
      ];

  const nCols = colDefs.length;
  // Col indices (1-based) for key columns
  const COL = {
    sno: 1, desc: 2, cat: 3, infl: 4, unit: 5,
    y1u: 6, y1c: 7, y1a: 8, y1t: 9,
    ...(years === 3 ? { y2u: 10, y2c: 11, y2a: 12, y2t: 13, y3u: 14, y3c: 15, y3a: 16, y3t: 17, gt: 18, notes: 19 } : { notes: 10 }),
  } as Record<string, number>;

  const buildSheet = (domainLines: typeof budget.lines, sheetTitle: string) => {
    const ws = wb.addWorksheet(sheetTitle.substring(0, 31));

    // Column widths
    ws.columns = colDefs.map(c => ({ width: c.width }));

    // ── Row 1: Title ──────────────────────────────────────────────────────────
    const titleRow = ws.addRow([sheetTitle]);
    titleRow.height = 22;
    const titleCell = titleRow.getCell(1);
    titleCell.font = { bold: true, size: 13, color: { argb: C.white } };
    titleCell.fill = fill(C.black);
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    ws.mergeCells(1, 1, 1, nCols);
    // fill rest of cells in merged range
    for (let c = 2; c <= nCols; c++) {
      titleRow.getCell(c).fill = fill(C.black);
    }

    // ── Row 2: Year group headers (black bg, white text) ─────────────────────
    const yearGroupRow = ws.addRow([]);
    yearGroupRow.height = 18;
    // Fill all black first
    for (let c = 1; c <= nCols; c++) {
      const cell = yearGroupRow.getCell(c);
      cell.fill = fill(C.black);
      cell.font = { bold: true, color: { argb: C.white } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }
    if (years === 3) {
      // Merge A-E: empty label area
      ws.mergeCells(2, 1, 2, 5);
      // Year 1: F-I (cols 6-9)
      yearGroupRow.getCell(6).value = "Year 1";
      ws.mergeCells(2, 6, 2, 9);
      // Year 2: J-M (cols 10-13)
      yearGroupRow.getCell(10).value = "Year 2";
      ws.mergeCells(2, 10, 2, 13);
      // Year 3: N-Q (cols 14-17)
      yearGroupRow.getCell(14).value = "Year 3";
      ws.mergeCells(2, 14, 2, 17);
      // Grand Total: R (col 18)
      yearGroupRow.getCell(18).value = "Grand Total";
    } else {
      ws.mergeCells(2, 1, 2, 5);
      yearGroupRow.getCell(6).value = "Year 1";
      ws.mergeCells(2, 6, 2, 9);
    }

    // ── Row 3: Column headers (olive bg) ──────────────────────────────────────
    const hdrValues = colDefs.map(c => c.header);
    const hdrRow = ws.addRow(hdrValues);
    hdrRow.height = 16;
    hdrRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = fill(C.olive);
      cell.font = { bold: true, size: 9, color: { argb: C.black } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
      cell.border = thinBorder();
    });

    // ── Data rows ─────────────────────────────────────────────────────────────
    let sno = 1;

    for (const sec of SECTION_ORDER) {
      const secLines = domainLines.filter(l => l.section === sec);
      if (secLines.length === 0) continue;

      // Section header row
      const secRow = ws.addRow([SECTION_LABELS[sec]]);
      secRow.height = 15;
      ws.mergeCells(secRow.number, 1, secRow.number, nCols);
      for (let c = 1; c <= nCols; c++) {
        const cell = secRow.getCell(c);
        cell.font = { bold: true, size: 10, color: { argb: C.black } };
        cell.fill = fill("FFF5F5F5");
        cell.border = thinBorder();
      }
      secRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

      // Data rows
      for (const l of secLines) {
        const rowVals: (string | number)[] = [
          sno++,
          l.description,
          l.costCategory,
          INFLATION_LABELS[l.costCategory] ?? l.costCategory,
          l.unitType,
          fmtNum(l.y1Units),
          fmtNum(l.y1UnitCost),
          fmtPct(l.y1AllocPct),
          Math.round(l.y1Total),
        ];
        if (years === 3) {
          rowVals.push(
            fmtNum(l.y2Units), fmtNum(l.y2UnitCost), fmtPct(l.y2AllocPct), Math.round(l.y2Total),
            fmtNum(l.y3Units), fmtNum(l.y3UnitCost), fmtPct(l.y3AllocPct), Math.round(l.y3Total),
            Math.round(l.y1Total + l.y2Total + l.y3Total),
          );
        }
        rowVals.push(l.notes ?? "");

        const dataRow = ws.addRow(rowVals);
        dataRow.height = 15;
        dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
          cell.border = thinBorder();
          cell.font = { size: 9, color: { argb: C.black } };
          if (colNum === COL.infl) {
            cell.fill = fill(C.yellow);
            cell.alignment = { horizontal: "center", vertical: "middle" };
          } else if (colNum === COL.desc || colNum === COL.unit || colNum === COL.cat) {
            cell.alignment = { horizontal: "left", vertical: "middle" };
          } else if (colNum === COL.sno || colNum === COL.notes) {
            cell.alignment = { horizontal: "left", vertical: "middle" };
          } else {
            cell.alignment = { horizontal: "right", vertical: "middle" };
          }
          // Numeric total columns
          if ([COL.y1t, COL.y2t, COL.y3t, COL.gt].includes(colNum)) {
            if (typeof cell.value === "number" && cell.value !== 0) {
              cell.numFmt = '#,##0';
            }
          }
        });

        // Salary hint rows: italic amber if y1UnitCost = 0 and salaryHint present
        if (l.y1UnitCost === 0 && l.salaryHint) {
          const hintCell = dataRow.getCell(COL.desc);
          hintCell.value = `${l.description}  [${l.salaryHint}]`;
          hintCell.font = { italic: true, size: 9, color: { argb: "FFB45309" } };
        }
      }

      // Sub-total row
      const y1Sub = secLines.reduce((s, l) => s + l.y1Total, 0);
      const subVals: (string | number)[] = ["", `Sub-total – ${SECTION_LABELS[sec]}`, "", "", "", "", "", "", Math.round(y1Sub)];
      if (years === 3) {
        const y2Sub = secLines.reduce((s, l) => s + l.y2Total, 0);
        const y3Sub = secLines.reduce((s, l) => s + l.y3Total, 0);
        subVals.push("", "", "", Math.round(y2Sub), "", "", "", Math.round(y3Sub), Math.round(y1Sub + y2Sub + y3Sub));
      }
      subVals.push("");
      const subRow = ws.addRow(subVals);
      subRow.height = 15;
      subRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.fill = fill(C.subtotal);
        cell.font = { bold: true, size: 9, color: { argb: C.black } };
        cell.border = thinBorder();
        if ([COL.y1t, COL.y2t, COL.y3t, COL.gt].includes(colNum)) {
          if (typeof cell.value === "number" && cell.value !== 0) {
            cell.numFmt = '#,##0';
          }
        }
        cell.alignment = { horizontal: colNum === COL.desc ? "left" : "right", vertical: "middle" };
      });
      // Spacer row (no border)
      ws.addRow([]);
    }

    // ── Grand total row ────────────────────────────────────────────────────────
    const y1GT = domainLines.reduce((s, l) => s + l.y1Total, 0);
    const gtVals: (string | number)[] = ["", "GRAND TOTAL", "", "", "", "", "", "", Math.round(y1GT)];
    if (years === 3) {
      const y2GT = domainLines.reduce((s, l) => s + l.y2Total, 0);
      const y3GT = domainLines.reduce((s, l) => s + l.y3Total, 0);
      gtVals.push("", "", "", Math.round(y2GT), "", "", "", Math.round(y3GT), Math.round(y1GT + y2GT + y3GT));
    }
    gtVals.push("");
    const gtRow = ws.addRow(gtVals);
    gtRow.height = 17;
    gtRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill = fill(C.grandtotal);
      cell.font = { bold: true, size: 10, color: { argb: C.white } };
      cell.border = thinBorder();
      if ([COL.y1t, COL.y2t, COL.y3t, COL.gt].includes(colNum)) {
        if (typeof cell.value === "number" && cell.value !== 0) {
          cell.numFmt = '#,##0';
        }
      }
      cell.alignment = { horizontal: colNum === COL.desc ? "left" : "right", vertical: "middle" };
    });

    // Freeze top 3 rows + first 2 columns
    ws.views = [{ state: "frozen", xSplit: 2, ySplit: 3, topLeftCell: "C4" }];

    return ws;
  };

  // Master sheet
  buildSheet(budget.lines, `${budget.name} – Master Budget`);

  // Per-domain sheets
  for (const domain of budget.domains as BudgetDomain[]) {
    const domainLines = budget.lines.filter(l => l.domain === domain || l.domain === null);
    const label = DOMAIN_LABELS[domain] ?? domain;
    buildSheet(domainLines, `${label} – ${budget.name}`.substring(0, 31));
  }

  const buffer = await wb.xlsx.writeBuffer();
  const safeName = budget.name.replace(/[^a-z0-9]/gi, "_").substring(0, 40);

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}_budget.xlsx"`,
    },
  });
}
