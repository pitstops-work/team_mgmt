import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

type Row = { label: string; sub?: string; std: number | null; you: number | null };
// std/you = Year-1; stdTotal/youTotal = full-horizon (all active years).
type LineRow = { domain: string; section: string; description: string; std: number | null; you: number | null; stdTotal?: number | null; youTotal?: number | null };
type Payload = {
  standardName: string;
  compareName: string;
  summary: Row[];
  lines: LineRow[];
};

// Mirrors BudgetEditor SECTION_LABELS / SECTION_ORDER so heads read the same.
const SECTION_LABELS: Record<string, string> = {
  salary: "Salary & Honorarium",
  capex: "Fixed Assets / CAPEX",
  travel: "Travel",
  programme: "Programme Expenses",
  admin_salary: "Admin – Salaries",
  admin_other: "Admin – Other",
  additional: "Additional Items",
};
const SECTION_ORDER = ["salary", "capex", "travel", "programme", "admin_salary", "admin_other", "additional"];

const money = (v: number | null) => (v == null ? "—" : v);
const delta = (std: number | null, you: number | null) =>
  std == null || you == null ? "—" : you - std;
// Variance of Yours vs Standard as a signed %. "—" when there's no standard base.
const variancePct = (std: number | null, you: number | null) =>
  std == null || you == null || std === 0 ? "—" : Math.round(((you - std) / std) * 1000) / 10;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: Payload;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const lines = body.lines || [];

  const wb = new ExcelJS.Workbook();
  wb.creator = "Budget Cost Analysis";

  const headFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1A1A" } };
  const subFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2EC" } };
  const totFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE8E0" } };
  const styleHeader = (row: ExcelJS.Row) => {
    row.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = headFill; c.alignment = { vertical: "middle" }; });
  };
  const numFmt = (row: ExcelJS.Row, keys: string[]) => {
    for (const k of keys) { const c = row.getCell(k); if (typeof c.value === "number") c.numFmt = k === "var" ? '+0.0;-0.0' : "#,##0"; }
  };

  const stdHdr = `Standard (${body.standardName})`;
  const youHdr = `Yours (${body.compareName})`;

  // ── By Head sheet — section sub-totals + grand total (Y1 and full horizon) ──
  const sh = wb.addWorksheet("By Head");
  sh.columns = [
    { header: "Head", key: "head", width: 24 },
    { header: `Std Y1`, key: "std", width: 16 },
    { header: `Yours Y1`, key: "you", width: 16 },
    { header: `Std Total (all yrs)`, key: "stdT", width: 18 },
    { header: `Yours Total (all yrs)`, key: "youT", width: 18 },
    { header: "Δ Total", key: "delta", width: 16 },
    { header: "Variance % (Total)", key: "var", width: 16 },
  ];
  styleHeader(sh.getRow(1));
  const sum = (rows: LineRow[], pick: (l: LineRow) => number | null | undefined) =>
    rows.reduce((s, l) => s + (pick(l) ?? 0), 0);
  let tStd = 0, tYou = 0, tStdT = 0, tYouT = 0;
  for (const sec of SECTION_ORDER) {
    const rows = lines.filter(l => l.section === sec);
    if (rows.length === 0) continue;
    const std = sum(rows, l => l.std), you = sum(rows, l => l.you);
    const stdT = sum(rows, l => l.stdTotal), youT = sum(rows, l => l.youTotal);
    tStd += std; tYou += you; tStdT += stdT; tYouT += youT;
    const row = sh.addRow({ head: SECTION_LABELS[sec] ?? sec, std, you, stdT, youT, delta: delta(stdT, youT), var: variancePct(stdT, youT) });
    row.eachCell(c => { c.fill = subFill; });
    numFmt(row, ["std", "you", "stdT", "youT", "delta", "var"]);
  }
  // Any line whose section isn't in SECTION_ORDER still counts toward the totals.
  const known = new Set(SECTION_ORDER);
  for (const l of lines) {
    if (known.has(l.section)) continue;
    tStd += l.std ?? 0; tYou += l.you ?? 0; tStdT += l.stdTotal ?? 0; tYouT += l.youTotal ?? 0;
  }
  const totalRow = sh.addRow({ head: "TOTAL", std: tStd, you: tYou, stdT: tStdT, youT: tYouT, delta: delta(tStdT, tYouT), var: variancePct(tStdT, tYouT) });
  totalRow.eachCell(c => { c.font = { bold: true }; c.fill = totFill; });
  numFmt(totalRow, ["std", "you", "stdT", "youT", "delta", "var"]);
  sh.views = [{ state: "frozen", ySplit: 1 }];

  // ── Summary sheet — per-unit cost metrics ───────────────────────────────────
  const s1 = wb.addWorksheet("Summary");
  s1.columns = [
    { header: "Metric", key: "label", width: 28 },
    { header: "Basis", key: "sub", width: 26 },
    { header: stdHdr, key: "std", width: 22 },
    { header: youHdr, key: "you", width: 22 },
    { header: "Δ", key: "delta", width: 16 },
    { header: "Variance %", key: "var", width: 14 },
  ];
  styleHeader(s1.getRow(1));
  for (const r of body.summary || []) {
    const row = s1.addRow({ label: r.label, sub: r.sub ?? "", std: money(r.std), you: money(r.you), delta: delta(r.std, r.you), var: variancePct(r.std, r.you) });
    numFmt(row, ["std", "you", "delta", "var"]);
  }
  s1.views = [{ state: "frozen", ySplit: 1 }];

  // ── Lines sheet — per-line detail (Y1) ──────────────────────────────────────
  const s2 = wb.addWorksheet("Lines (Y1)");
  s2.columns = [
    { header: "Domain", key: "domain", width: 16 },
    { header: "Head", key: "section", width: 18 },
    { header: "Line", key: "description", width: 52 },
    { header: stdHdr, key: "std", width: 20 },
    { header: youHdr, key: "you", width: 20 },
    { header: "Δ", key: "delta", width: 14 },
    { header: "Variance %", key: "var", width: 14 },
  ];
  styleHeader(s2.getRow(1));
  for (const r of lines) {
    const row = s2.addRow({
      domain: r.domain, section: SECTION_LABELS[r.section] ?? r.section, description: r.description,
      std: money(r.std), you: money(r.you), delta: delta(r.std, r.you), var: variancePct(r.std, r.you),
    });
    numFmt(row, ["std", "you", "delta", "var"]);
  }
  s2.autoFilter = { from: "A1", to: "G1" };
  s2.views = [{ state: "frozen", ySplit: 1 }];

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
