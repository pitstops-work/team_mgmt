import { auth } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/roleGuard';
import prisma from '@/lib/prisma';
import ExcelJS from 'exceljs';
import {
  SECTION_TO_HEAD, BUDGET_HEAD_ORDER,
  proratedBudget, cumulativeProratedBudget, varianceFlag,
} from '@/lib/budget-report-slots';

export const runtime = 'nodejs';
export const maxDuration = 30;

const INR = (n: number) => Math.round(n);
const PCT = (a: number, b: number) => b === 0 ? null : Number(((a / b) * 100).toFixed(1));
const HEADS = BUDGET_HEAD_ORDER;

function yearTotal(line: { y1Total: number; y2Total: number; y3Total: number }, grantYear: number) {
  return grantYear === 1 ? line.y1Total : grantYear === 2 ? line.y2Total : line.y3Total;
}

function styleHeader(ws: ExcelJS.Worksheet, row: ExcelJS.Row, bgColor = '1F4E79') {
  row.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF000000' } } };
  });
  row.height = 30;
}

function styleSectionHeader(row: ExcelJS.Row) {
  row.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };
    cell.font = { bold: true, size: 10 };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } };
  });
}

function styleTotal(row: ExcelJS.Row) {
  row.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } };
    cell.font = { bold: true, size: 10 };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF888888' } },
      bottom: { style: 'double', color: { argb: 'FF000000' } },
    };
  });
}

function applyFlagColor(cell: ExcelJS.Cell, flag: 'over' | 'under' | null) {
  if (flag === 'over') {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4E4' } };
    cell.font = { bold: true, color: { argb: 'FFCC0000' }, size: 10 };
  } else if (flag === 'under') {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
    cell.font = { bold: true, color: { argb: 'FF856404' }, size: 10 };
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; slotId: string }> }) {
  const { id, slotId } = await params;
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const [slot, budget] = await Promise.all([
    prisma.budgetReportSlot.findUnique({
      where: { id: slotId },
      include: { report: { include: { lines: true } } },
    }),
    prisma.budget.findUnique({
      where: { id },
      include: {
        partner: { select: { name: true, email: true } },
        lines: { orderBy: { position: 'asc' } },
        reportConfig: true,
      },
    }),
  ]);

  if (!slot || !budget || slot.budgetId !== id) return new Response('Not found', { status: 404 });
  if (!isSuperAdmin(session) && budget.partnerId !== session.user!.id!) return new Response('Forbidden', { status: 403 });
  const b = budget;

  // Cumulative prior actuals for this grant year
  const priorSlots = await prisma.budgetReportSlot.findMany({
    where: { budgetId: id, grantYear: slot.grantYear, slotNumber: { lt: slot.slotNumber }, status: { in: ['approved', 'submitted'] } },
    include: { report: { include: { lines: true } } },
  });
  const cumulativePrior: Record<string, number> = {};
  for (const ps of priorSlots) {
    for (const l of ps.report?.lines ?? []) {
      cumulativePrior[l.budgetLineId] = (cumulativePrior[l.budgetLineId] ?? 0) + l.actualAmount;
    }
  }

  const report = slot.report;
  const actualMap: Record<string, number> = Object.fromEntries((report?.lines ?? []).map(l => [l.budgetLineId, l.actualAmount]));
  const periodFrom = new Date(slot.periodFrom);
  const periodTo = new Date(slot.periodTo);
  const gs = b.reportConfig ? new Date(b.reportConfig.grantStartDate) : periodFrom;
  const yearStart = new Date(Date.UTC(gs.getUTCFullYear() + (slot.grantYear - 1), gs.getUTCMonth(), 1));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Pitstop Budget';
  wb.created = new Date();

  // ── Utility sheet builder ────────────────────────────────────────────────────

  function buildYearSheet(ws: ExcelJS.Worksheet, grantYear: number) {
    ws.properties.defaultColWidth = 14;
    ws.getColumn(1).width = 4;
    ws.getColumn(2).width = 42;
    ws.getColumn(3).width = 18;
    ws.getColumn(4).width = 18;
    ws.getColumn(5).width = 18;
    ws.getColumn(6).width = 14;
    ws.getColumn(7).width = 22;
    ws.getColumn(8).width = 22;

    // Title
    ws.mergeCells('A1:H1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'Fund Utilization Report';
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF1F4E79' } };
    titleCell.alignment = { horizontal: 'center' };
    ws.getRow(1).height = 28;

    // Meta rows
    const meta = [
      ['Partner NGO', b.partner.name ?? b.partner.email ?? ''],
      ['Grant ID / Budget', b.name],
      ['Grant Period', b.reportConfig
        ? `${new Date(b.reportConfig.grantStartDate).toLocaleDateString('en-IN')} to ${new Date(b.reportConfig.grantEndDate).toLocaleDateString('en-IN')}`
        : ''],
      ['Reporting Period', `${periodFrom.toLocaleDateString('en-IN')} to ${periodTo.toLocaleDateString('en-IN')}`],
      ['Year of Reporting', `Year ${grantYear}`],
      ['City', b.city],
    ];
    let r = 2;
    for (const [label, value] of meta) {
      ws.mergeCells(`A${r}:B${r}`);
      ws.getCell(`A${r}`).value = label;
      ws.getCell(`A${r}`).font = { bold: true, size: 10, color: { argb: 'FF555555' } };
      ws.mergeCells(`C${r}:H${r}`);
      ws.getCell(`C${r}`).value = value;
      ws.getCell(`C${r}`).font = { size: 10 };
      r++;
    }

    r++;
    // Column headers
    const hdrRow = ws.getRow(r++);
    hdrRow.values = ['', 'Particulars', `Year ${grantYear} Budget (₹)`, `Year ${grantYear} Expenses (₹)`, 'Balance (₹)', '% Utilization', 'YTD Budget (₹)', 'YTD Actual (₹)', 'Comments'];
    styleHeader(ws, hdrRow);
    ws.getColumn(9).width = 28;

    let slNo = 0;
    let totalBudget = 0, totalExpenses = 0, totalYtdBudget = 0, totalYtdActual = 0;

    for (const head of HEADS) {
      const headLines = b.lines.filter(l => SECTION_TO_HEAD[l.section] === head);
      if (!headLines.length) continue;
      slNo++;

      const annualBudget = headLines.reduce((s, l) => s + yearTotal(l, grantYear), 0);
      const periodBud = headLines.reduce((s, l) => s + proratedBudget(yearTotal(l, grantYear), periodFrom, periodTo), 0);
      const ytdBud = headLines.reduce((s, l) => s + cumulativeProratedBudget(yearTotal(l, grantYear), yearStart, periodTo), 0);
      const thisAct = headLines.reduce((s, l) => s + (actualMap[l.id] ?? 0), 0);
      const priorAct = headLines.reduce((s, l) => s + (cumulativePrior[l.id] ?? 0), 0);
      const ytdAct = priorAct + thisAct;
      const balance = annualBudget - ytdAct;
      const utilPct = PCT(ytdAct, annualBudget);
      const flag = varianceFlag(ytdAct, ytdBud);

      totalBudget += annualBudget;
      totalExpenses += thisAct;
      totalYtdBudget += ytdBud;
      totalYtdActual += ytdAct;

      // Head row
      const headRow = ws.getRow(r++);
      headRow.values = [slNo, head, INR(annualBudget), INR(thisAct), INR(balance), utilPct !== null ? `${utilPct}%` : '-', INR(ytdBud), INR(ytdAct), ''];
      styleSectionHeader(headRow);

      // Sub-rows per line item
      for (const line of headLines) {
        const lAnnual = yearTotal(line, grantYear);
        const lPeriodBud = proratedBudget(lAnnual, periodFrom, periodTo);
        const lYtdBud = cumulativeProratedBudget(lAnnual, yearStart, periodTo);
        const lThis = actualMap[line.id] ?? 0;
        const lPrior = cumulativePrior[line.id] ?? 0;
        const lYtd = lPrior + lThis;
        const lBalance = lAnnual - lYtd;
        const lPct = PCT(lYtd, lAnnual);
        const lFlag = varianceFlag(lYtd, lYtdBud);

        const lineRow = ws.getRow(r++);
        lineRow.values = ['', `  ${line.description}`, INR(lAnnual), INR(lThis), INR(lBalance), lPct !== null ? `${lPct}%` : '-', INR(lYtdBud), INR(lYtd), ''];
        lineRow.getCell(2).font = { size: 9, color: { argb: 'FF444444' } };
        // Apply variance flag color to YTD actual and % columns
        if (lFlag) {
          applyFlagColor(lineRow.getCell(6), lFlag);
          applyFlagColor(lineRow.getCell(8), lFlag);
        }
        [3, 4, 5, 7, 8].forEach(c => {
          lineRow.getCell(c).numFmt = '#,##0';
          lineRow.getCell(c).alignment = { horizontal: 'right' };
        });
        lineRow.getCell(6).alignment = { horizontal: 'center' };
      }
    }

    // Total row
    const totalRow = ws.getRow(r++);
    const totalBalance = totalBudget - totalYtdActual;
    const totalPct = PCT(totalYtdActual, totalBudget);
    totalRow.values = ['', 'TOTAL EXPENDITURE', INR(totalBudget), INR(totalExpenses), INR(totalBalance), totalPct !== null ? `${totalPct}%` : '-', INR(totalYtdBudget), INR(totalYtdActual), ''];
    styleTotal(totalRow);
    [3, 4, 5, 7, 8].forEach(c => {
      totalRow.getCell(c).numFmt = '#,##0';
      totalRow.getCell(c).alignment = { horizontal: 'right' };
    });

    r += 2;

    // ── Fund Reconciliation ────────────────────────────────────────────────────
    ws.mergeCells(`A${r}:H${r}`);
    const reconHeader = ws.getRow(r++);
    reconHeader.getCell(1).value = `Fund Reconciliation (Year ${grantYear})`;
    reconHeader.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF1F4E79' } };
    reconHeader.height = 22;

    const recon = report;
    const totalIncome = (recon?.openingBalance ?? 0) + (recon?.tranchesReceived ?? 0) + (recon?.interestEarned ?? 0);
    const closingBalance = totalIncome - totalYtdActual;
    const fundBalance = (recon?.bankBalance ?? 0) + (recon?.fdBalance ?? 0) + (recon?.cashInHand ?? 0) + (recon?.advances ?? 0) + (recon?.receivables ?? 0) - (recon?.payables ?? 0);
    const reconDiff = closingBalance - fundBalance;

    const reconRows: [string, string, number | string][] = [
      ['A', 'Opening balance', recon?.openingBalance ?? 0],
      ['', 'Add: Tranches received during the period', recon?.tranchesReceived ?? 0],
      ['', 'Add: Interest earned', recon?.interestEarned ?? 0],
      ['', 'Less: Total expenditure', totalYtdActual],
      ['', 'Total unutilized fund [A]', closingBalance],
      ['', '', ''],
      ['B', 'Cash in hand', recon?.cashInHand ?? 0],
      ['', 'Cash at bank', recon?.bankBalance ?? 0],
      ['', 'Investments in FD, if any', recon?.fdBalance ?? 0],
      ['', 'Advances (employees/vendors)', recon?.advances ?? 0],
      ['', 'Receivables', recon?.receivables ?? 0],
      ['', 'Less: Payables / current liabilities', recon?.payables ?? 0],
      ['', 'Total balance with Partner NGO [B]', fundBalance],
      ['', 'Difference, if any [A – B]', reconDiff],
    ];

    for (const [sec, label, val] of reconRows) {
      if (!label) { r++; continue; }
      const rr = ws.getRow(r++);
      rr.getCell(1).value = sec;
      rr.getCell(1).font = { bold: !!sec, size: 10 };
      ws.mergeCells(`B${rr.number}:F${rr.number}`);
      rr.getCell(2).value = label;
      rr.getCell(2).font = { size: 10, bold: label.includes('[A]') || label.includes('[B]') || label.includes('[A –') };
      rr.getCell(7).value = typeof val === 'number' ? INR(val) : val;
      rr.getCell(7).numFmt = '#,##0';
      rr.getCell(7).alignment = { horizontal: 'right' };

      if (label.includes('[A]') || label.includes('[B]') || label.includes('Total balance')) {
        rr.getCell(7).font = { bold: true, size: 10 };
        rr.getCell(7).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
      }
      if (label.includes('Difference')) {
        rr.getCell(7).font = { bold: true, color: { argb: Math.abs(typeof val === 'number' ? val : 0) > 1 ? 'FFCC0000' : 'FF006400' }, size: 10 };
      }
    }

    r += 2;

    // ── Checks ────────────────────────────────────────────────────────────────
    const checkRows = ws.getRow(r++);
    checkRows.values = ['', 'CHECKS', '', '', '', ''];
    checkRows.getCell(2).font = { bold: true, size: 10, color: { argb: 'FF555555' } };

    const utilPctNum = totalBudget > 0 ? (totalYtdActual / totalBudget) * 100 : 0;
    const monthsElapsed = (periodTo.getUTCFullYear() - yearStart.getUTCFullYear()) * 12 + (periodTo.getUTCMonth() - yearStart.getUTCMonth()) + 1;
    const burnRate = monthsElapsed > 0 ? totalYtdActual / monthsElapsed : 0;
    const remainingBudget = totalBudget - totalYtdActual;
    const monthsRunway = burnRate > 0 ? remainingBudget / burnRate : 0;

    const checks: [string, string | number][] = [
      ['Utilisation % (YTD actual / annual budget)', `${utilPctNum.toFixed(1)}%`],
      ['Burn rate (avg monthly spend)', INR(burnRate)],
      ['Remaining budget', INR(remainingBudget)],
      ['Months of runway at current burn rate', monthsRunway.toFixed(1)],
      ['Tranche readiness', monthsRunway < 2 ? 'Ready to process next tranche' : `~${monthsRunway.toFixed(0)} months remaining`],
      ['Reconciliation balanced', Math.abs(reconDiff) <= 1 ? 'YES ✓' : `NO — difference of ₹${INR(Math.abs(reconDiff))}`],
    ];

    for (const [label, val] of checks) {
      const rr = ws.getRow(r++);
      ws.mergeCells(`B${rr.number}:F${rr.number}`);
      rr.getCell(2).value = label;
      rr.getCell(2).font = { size: 10 };
      rr.getCell(7).value = val;
      rr.getCell(7).alignment = { horizontal: 'right' };
      rr.getCell(7).font = { size: 10 };
    }
  }

  const maxYear = b.years;

  // ── Summary sheet (first tab) ─────────────────────────────────────────────────
  const summary = wb.addWorksheet('Summary', { properties: { tabColor: { argb: 'FF1F4E79' } } });
  summary.properties.defaultColWidth = 14;
  summary.getColumn(1).width = 4;
  summary.getColumn(2).width = 42;
  for (let i = 3; i <= 3 + maxYear; i++) summary.getColumn(i).width = 18;

  summary.mergeCells(`A1:${String.fromCharCode(66 + maxYear)}1`);
  const sumTitle = summary.getCell('A1');
  sumTitle.value = 'Fund Utilization Report — Summary';
  sumTitle.font = { bold: true, size: 14, color: { argb: 'FF1F4E79' } };
  sumTitle.alignment = { horizontal: 'center' };
  summary.getRow(1).height = 28;

  // Meta
  const smeta = [
    ['Partner NGO', b.partner.name ?? b.partner.email ?? ''],
    ['Grant ID / Budget', b.name],
    ['Grant Period', b.reportConfig ? `${new Date(b.reportConfig.grantStartDate).toLocaleDateString('en-IN')} to ${new Date(b.reportConfig.grantEndDate).toLocaleDateString('en-IN')}` : ''],
    ['City', b.city],
  ];
  let sr = 2;
  for (const [label, value] of smeta) {
    summary.mergeCells(`A${sr}:B${sr}`);
    summary.getCell(`A${sr}`).value = label;
    summary.getCell(`A${sr}`).font = { bold: true, size: 10, color: { argb: 'FF555555' } };
    summary.mergeCells(`C${sr}:${String.fromCharCode(66 + maxYear)}${sr}`);
    summary.getCell(`C${sr}`).value = value;
    sr++;
  }
  sr++;

  // Header row
  const hdr = summary.getRow(sr++);
  const yearCols = Array.from({ length: maxYear }, (_, i) => `Year ${i + 1} Budget (₹)`);
  hdr.values = ['', 'Budget Category', ...yearCols, 'Total (₹)'];
  styleHeader(summary, hdr);

  let slNo = 0;
  let grandTotal = 0;
  for (const head of HEADS) {
    const headLines = b.lines.filter(l => SECTION_TO_HEAD[l.section] === head);
    if (!headLines.length) continue;
    slNo++;
    const yearBudgets = Array.from({ length: maxYear }, (_, i) =>
      headLines.reduce((s, l) => s + (i === 0 ? l.y1Total : i === 1 ? l.y2Total : l.y3Total), 0)
    );
    const total = yearBudgets.reduce((a, b) => a + b, 0);
    grandTotal += total;
    const row = summary.getRow(sr++);
    row.values = [slNo, head, ...yearBudgets.map(INR), INR(total)];
    styleSectionHeader(row);
    [3, 3 + maxYear].forEach(c => {
      for (let cc = c; cc <= 3 + maxYear; cc++) {
        row.getCell(cc).numFmt = '#,##0';
        row.getCell(cc).alignment = { horizontal: 'right' };
      }
    });
  }

  const totalRow = summary.getRow(sr++);
  const allYearTotals = Array.from({ length: maxYear }, (_, i) =>
    b.lines.reduce((s, l) => s + (i === 0 ? l.y1Total : i === 1 ? l.y2Total : l.y3Total), 0)
  );
  totalRow.values = ['', 'Grand Total', ...allYearTotals.map(INR), INR(grandTotal)];
  styleTotal(totalRow);

  // ── Year utilization sheets ───────────────────────────────────────────────────
  for (let y = 1; y <= maxYear; y++) {
    const ws = wb.addWorksheet(`Y${y} Utilization`);
    buildYearSheet(ws, y);
  }

  // Serialize
  const buffer = await wb.xlsx.writeBuffer();
  const slugName = (b.partner.name ?? 'partner').replace(/\s+/g, '-').toLowerCase();
  const slugPeriod = `${periodFrom.toISOString().slice(0, 7)}-to-${periodTo.toISOString().slice(0, 7)}`;
  const filename = `fur-${slugName}-${slugPeriod}.xlsx`;

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
