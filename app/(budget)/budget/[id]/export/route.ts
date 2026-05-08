import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
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

const INFLATION_LABELS = { Salary: "Salary (10%)", Other: "Other (5%)", Nil: "Nil (0%)" };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });

  const budget = await prisma.budget.findUnique({
    where: { id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!budget || budget.partnerId !== session.user.id) return new NextResponse("Not found", { status: 404 });

  const wb = XLSX.utils.book_new();
  const years = budget.years;

  // Helper to build a domain sheet
  const buildSheet = (domainLines: typeof budget.lines, sheetTitle: string) => {
    const rows: (string | number)[][] = [];

    // Title
    rows.push([sheetTitle, "", "", "", "", "", years === 3 ? "Year 1" : "Year 1", ...(years === 3 ? ["", "Year 2", "", "Year 3", "", "Total"] : [])]);

    const headers = ["S.No", "Description", "Cost Category", "Inflation", "Unit Type", "No. of Units", "Unit Cost", "Total (Rs.) – Year 1",
      ...(years === 3 ? ["No. of Units", "Unit Cost", "Total (Rs.) – Year 2", "No. of Units", "Unit Cost", "Total (Rs.) – Year 3", "Grand Total (Rs.)"] : [])];
    rows.push(headers);

    let sno = 1;
    for (const sec of SECTION_ORDER) {
      const secLines = domainLines.filter(l => l.section === sec);
      if (secLines.length === 0) continue;

      rows.push([SECTION_LABELS[sec]]);
      for (const l of secLines) {
        const row: (string | number)[] = [
          sno++,
          l.description,
          l.costCategory,
          INFLATION_LABELS[l.costCategory],
          l.unitType,
          l.y1Units,
          l.y1UnitCost,
          l.y1Total,
        ];
        if (years === 3) {
          row.push(l.y2Units, l.y2UnitCost, l.y2Total, l.y3Units, l.y3UnitCost, l.y3Total, l.y1Total + l.y2Total + l.y3Total);
        }
        rows.push(row);
      }
      const secTotal: (string | number)[] = ["", "Sub-total", "", "", "", "", "", secLines.reduce((s, l) => s + l.y1Total, 0)];
      if (years === 3) {
        secTotal.push("", "", secLines.reduce((s, l) => s + l.y2Total, 0), "", "", secLines.reduce((s, l) => s + l.y3Total, 0),
          secLines.reduce((s, l) => s + l.y1Total + l.y2Total + l.y3Total, 0));
      }
      rows.push(secTotal);
      rows.push([]); // spacer
    }

    // Grand total
    const gt: (string | number)[] = ["", "TOTAL", "", "", "", "", "", domainLines.reduce((s, l) => s + l.y1Total, 0)];
    if (years === 3) {
      gt.push("", "", domainLines.reduce((s, l) => s + l.y2Total, 0), "", "", domainLines.reduce((s, l) => s + l.y3Total, 0),
        domainLines.reduce((s, l) => s + l.y1Total + l.y2Total + l.y3Total, 0));
    }
    rows.push(gt);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Column widths
    ws["!cols"] = [{ wch: 6 }, { wch: 55 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 },
      ...(years === 3 ? [{ wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 18 }] : [])];
    return ws;
  };

  // Master sheet
  const masterSheet = buildSheet(budget.lines, `${budget.name} – Master Budget`);
  XLSX.utils.book_append_sheet(wb, masterSheet, "Master");

  // Per-domain sheets
  for (const domain of budget.domains as BudgetDomain[]) {
    const domainLines = budget.lines.filter(l => l.domain === domain || l.domain === null);
    const ws = buildSheet(domainLines, `${DOMAIN_LABELS[domain]} – ${budget.name}`);
    XLSX.utils.book_append_sheet(wb, ws, DOMAIN_LABELS[domain].substring(0, 31));
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const safeName = budget.name.replace(/[^a-z0-9]/gi, "_").substring(0, 40);

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}_budget.xlsx"`,
    },
  });
}
