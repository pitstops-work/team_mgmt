import { auth } from "@/lib/auth";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { getPartnerAccess, partnerCanAccessBudget } from "@/lib/budget/partnerAccess";
import prisma from "@/lib/prisma";
import { computeDeclarationData } from "@/lib/budget/declarationData";
import { AFFIRMATION_CLAUSES, inr, type DeclarationInputs } from "@/lib/budget/declaration";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, HeadingLevel,
} from "docx";

const fmtDate = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

function cell(text: string, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) {
  return new TableCell({
    children: [new Paragraph({
      alignment: opts.align,
      children: [new TextRun({ text, bold: opts.bold, size: 20 })],
    })],
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
  });
}

// POST — generate a pre-filled, letterhead-ready declaration (.docx) the partner
// prints, signs, seals and re-uploads. Figures come from the books, not the body.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; slotId: string }> },
) {
  const { id, slotId } = await params;
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const slot = await prisma.budgetReportSlot.findUnique({ where: { id: slotId }, select: { budgetId: true } });
  const budget = await prisma.budget.findUnique({ where: { id }, select: { partnerId: true, grantPartnerId: true } });
  if (!slot || !budget || slot.budgetId !== id) return Response.json({ error: "Not found" }, { status: 404 });
  const access = await getPartnerAccess(session);
  const allowed = budget.partnerId === session.user.id || isSuperAdmin(session) || isBudgetAdmin(session) || partnerCanAccessBudget(access, budget);
  if (!allowed) return Response.json({ error: "Forbidden" }, { status: 403 });

  const inputs = (await req.json().catch(() => ({}))) as Partial<DeclarationInputs>;
  const data = await computeDeclarationData(slotId);
  if (!data) return Response.json({ error: "Could not compute figures" }, { status: 400 });

  const g = (v?: string) => (v && v.trim() ? v.trim() : "____________");
  const fcra = inputs.fcraApplicable ? g(inputs.validFCRA) : "N/A";

  const P = (text: string, o: { bold?: boolean; spacingAfter?: number; italics?: boolean } = {}) =>
    new Paragraph({ spacing: { after: o.spacingAfter ?? 120 }, children: [new TextRun({ text, bold: o.bold, italics: o.italics, size: 22 })] });

  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1 }, insideVertical: { style: BorderStyle.SINGLE, size: 1 },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell("Sl.no.", { bold: true }), cell("Particulars", { bold: true }),
          cell("Budget for the Reporting Period ₹", { bold: true, align: AlignmentType.RIGHT }),
          cell("Expenses as per books of account ₹", { bold: true, align: AlignmentType.RIGHT }),
        ],
      }),
      ...data.summary.rows.map(r => new TableRow({
        children: [
          cell(r.sl), cell(r.label),
          cell(inr(r.budget), { align: AlignmentType.RIGHT }),
          cell(inr(r.expenses), { align: AlignmentType.RIGHT }),
        ],
      })),
      new TableRow({
        children: [
          cell(""), cell("Total", { bold: true }),
          cell(inr(data.summary.totalBudget), { bold: true, align: AlignmentType.RIGHT }),
          cell(inr(data.summary.totalExpenses), { bold: true, align: AlignmentType.RIGHT }),
        ],
      }),
    ],
  });

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Finance Declaration by Partner", bold: true })] }),
        P("(To be printed on the organization letter head, jointly signed by the Programme and Finance Heads, with organization seal duly affixed)", { italics: true, spacingAfter: 200 }),
        P(`Date: ${fmtDate(new Date())}`),
        P("To,"),
        P("Programme Manager,"),
        P("Azim Premji Foundation (Azim Premji Philanthropic Initiatives Pvt. Ltd.),"),
        P("#134, Doddakannelli, Next to Wipro Corporate Office,"),
        P("Sarjapur Road, Bengaluru-560 035.", { spacingAfter: 200 }),
        P(`Sub: Grant ID ${g(inputs.grantId)} — Financial declaration for the Reporting Period ${fmtDate(data.periodFrom)} to ${fmtDate(data.periodTo)}`, { bold: true }),
        P("Dear Sir/Madam,"),
        P(`We, ${g(inputs.orgHeadName)} (${g(inputs.orgHeadDesignation)}) & ${g(inputs.finHeadName)} (${g(inputs.finHeadDesignation)}), hereby declare:`, { spacingAfter: 160 }),
        P(`That the validity of 12A extends until ${g(inputs.valid12A)}, and 80G extends until ${g(inputs.valid80G)}, and FCRA extends until ${fcra} (strike out if not applicable).`),
        ...AFFIRMATION_CLAUSES.map(c => P(`That ${c.charAt(0).toLowerCase() + c.slice(1)}`)),
        P("Summary of Fund Utilization for the Reporting period:", { bold: true, spacingAfter: 120 }),
        summaryTable,
        new Paragraph({ spacing: { after: 160 }, children: [] }),
        P(`That the unspent grant fund of ${inr(data.unspent)} reported in 'Fund Utilization Report', for the Reporting Period, is in line with the books of accounts maintained by the organization.`),
        P("Further, we certify that the financial information provided in the Fund Utilization Report, Bank Statement, and Bank Reconciliation Statement, for the Reporting Period, is true and correct to the best of our knowledge and belief, and reflects a true and fair state of affairs as per the maintained books of accounts.", { spacingAfter: 400 }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 },
            left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 },
            insideHorizontal: { style: BorderStyle.NONE, size: 0 }, insideVertical: { style: BorderStyle.NONE, size: 0 },
          },
          rows: [
            new TableRow({ children: [cell("Head of Organization/Program", { bold: true }), cell("Head of Finance", { bold: true })] }),
            new TableRow({ children: [cell(""), cell("")] }),
            new TableRow({ children: [
              cell(`${g(inputs.orgHeadName)} (${g(inputs.orgHeadDesignation)})`),
              cell(`${g(inputs.finHeadName)} (${g(inputs.finHeadDesignation)})`),
            ] }),
          ],
        }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const safeName = `Finance-Declaration-Y${data.grantYear}-R${data.slotNumber}.docx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeName}"`,
    },
  });
}
