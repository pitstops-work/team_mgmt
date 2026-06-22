import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

type Row = { label: string; sub?: string; std: number | null; you: number | null };
type LineRow = { domain: string; section: string; description: string; std: number | null; you: number | null };
type Payload = {
  standardName: string;
  compareName: string;
  summary: Row[];
  lines: LineRow[];
};

const money = (v: number | null) => (v == null ? "—" : v);
const delta = (std: number | null, you: number | null) =>
  std == null || you == null ? "—" : you - std;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: Payload;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Budget Cost Analysis";

  const headFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1A1A" } };
  const styleHeader = (row: ExcelJS.Row) => {
    row.eachCell(c => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = headFill;
      c.alignment = { vertical: "middle" };
    });
  };

  // ── Summary sheet ──────────────────────────────────────────────────────────
  const s1 = wb.addWorksheet("Summary");
  s1.columns = [
    { header: "Metric", key: "label", width: 28 },
    { header: "Basis", key: "sub", width: 26 },
    { header: `Standard (${body.standardName})`, key: "std", width: 22 },
    { header: `Yours (${body.compareName})`, key: "you", width: 22 },
    { header: "Δ (Yours − Standard)", key: "delta", width: 20 },
  ];
  styleHeader(s1.getRow(1));
  for (const r of body.summary || []) {
    const row = s1.addRow({ label: r.label, sub: r.sub ?? "", std: money(r.std), you: money(r.you), delta: delta(r.std, r.you) });
    for (const k of ["std", "you", "delta"]) {
      const cell = row.getCell(k);
      if (typeof cell.value === "number") cell.numFmt = "#,##0";
    }
  }

  // ── Lines sheet ────────────────────────────────────────────────────────────
  const s2 = wb.addWorksheet("Lines (Y1)");
  s2.columns = [
    { header: "Domain", key: "domain", width: 16 },
    { header: "Section", key: "section", width: 16 },
    { header: "Line", key: "description", width: 52 },
    { header: `Standard Y1 (${body.standardName})`, key: "std", width: 22 },
    { header: `Yours Y1 (${body.compareName})`, key: "you", width: 22 },
    { header: "Δ", key: "delta", width: 16 },
  ];
  styleHeader(s2.getRow(1));
  for (const r of body.lines || []) {
    const row = s2.addRow({
      domain: r.domain, section: r.section, description: r.description,
      std: money(r.std), you: money(r.you), delta: delta(r.std, r.you),
    });
    for (const k of ["std", "you", "delta"]) {
      const cell = row.getCell(k);
      if (typeof cell.value === "number") cell.numFmt = "#,##0";
    }
  }
  s2.autoFilter = { from: "A1", to: "F1" };
  s2.views = [{ state: "frozen", ySplit: 1 }];
  s1.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const safe = (s: string) => (s || "budget").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const filename = `cost-analysis_${safe(body.standardName)}_vs_${safe(body.compareName)}.xlsx`;
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
