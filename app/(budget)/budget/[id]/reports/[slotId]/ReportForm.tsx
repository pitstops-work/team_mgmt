"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import { saveReport, saveReportLines, submitReport } from "../../../../budget/report-actions";
import {
  SECTION_TO_HEAD, BUDGET_HEAD_ORDER,
  proratedBudget, cumulativeProratedBudget, varianceFlag,
} from "@/lib/budget-report-slots";
import type { BudgetSection } from "@/app/generated/prisma/client";

type Line = {
  id: string; description: string; section: BudgetSection; domain: string | null;
  y1Total: number; y2Total: number; y3Total: number;
};
type ReportLine = { budgetLineId: string; actualAmount: number; notes: string | null };
type Report = {
  id: string; openingBalance: number; tranchesReceived: number; interestEarned: number;
  bankBalance: number; fdBalance: number; cashInHand: number; advances: number;
  receivables: number; payables: number; partnerNotes: string | null; reviewerNotes: string | null;
  lines: ReportLine[];
} | null;
type Slot = { id: string; slotNumber: number; grantYear: number; periodFrom: string; periodTo: string; dueDate: string; status: string; report: Report };
type Budget = { id: string; name: string; years: number; lines: Line[]; reportConfig: { grantStartDate: string } | null };

const SECTION_LABELS: Record<BudgetSection, string> = {
  salary: "Salary & Honorarium", capex: "Fixed Assets / CAPEX", travel: "Travel",
  programme: "Programme Expenses", admin_salary: "Admin – Salaries",
  admin_other: "Admin – Other", additional: "Additional Items",
};

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

function FlagChip({ flag }: { flag: "over" | "under" | null }) {
  if (!flag) return null;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${flag === "over" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}>
      {flag === "over" ? "Over" : "Under"}
    </span>
  );
}

export default function ReportForm({
  slot, budget, cumulativePrior, canEdit, isSuperAdmin,
}: {
  slot: Slot; budget: Budget; cumulativePrior: Record<string, number>;
  canEdit: boolean; isSuperAdmin: boolean;
}) {
  const report = slot.report;
  const existingLines: Record<string, ReportLine> = Object.fromEntries(
    (report?.lines ?? []).map(l => [l.budgetLineId, l])
  );

  const [actuals, setActuals] = useState<Record<string, string>>(
    Object.fromEntries(budget.lines.map(l => [l.id, String(existingLines[l.id]?.actualAmount ?? "")]))
  );
  const [lineNotes, setLineNotes] = useState<Record<string, string>>(
    Object.fromEntries(budget.lines.map(l => [l.id, existingLines[l.id]?.notes ?? ""]))
  );
  const [recon, setRecon] = useState({
    openingBalance: String(report?.openingBalance ?? ""),
    tranchesReceived: String(report?.tranchesReceived ?? ""),
    interestEarned: String(report?.interestEarned ?? ""),
    bankBalance: String(report?.bankBalance ?? ""),
    fdBalance: String(report?.fdBalance ?? ""),
    cashInHand: String(report?.cashInHand ?? ""),
    advances: String(report?.advances ?? ""),
    receivables: String(report?.receivables ?? ""),
    payables: String(report?.payables ?? ""),
    partnerNotes: report?.partnerNotes ?? "",
  });
  const [saving, startSave] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const [saved, setSaved] = useState(false);
  const [parseStatus, setParseStatus] = useState<"idle" | "uploading" | "parsing" | "done" | "error">("idle");
  const [parseNote, setParseNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const periodFrom = new Date(slot.periodFrom);
  const periodTo = new Date(slot.periodTo);
  const yearStart = budget.reportConfig
    ? (() => {
        const gs = new Date(budget.reportConfig.grantStartDate);
        return new Date(Date.UTC(gs.getUTCFullYear() + (slot.grantYear - 1), gs.getUTCMonth(), 1));
      })()
    : periodFrom;

  function yearTotal(line: Line): number {
    return slot.grantYear === 1 ? line.y1Total : slot.grantYear === 2 ? line.y2Total : line.y3Total;
  }

  function handleSave() {
    startSave(async () => {
      const n = (v: string) => parseFloat(v) || 0;
      await Promise.all([
        saveReport(slot.id, {
          openingBalance: n(recon.openingBalance),
          tranchesReceived: n(recon.tranchesReceived),
          interestEarned: n(recon.interestEarned),
          bankBalance: n(recon.bankBalance),
          fdBalance: n(recon.fdBalance),
          cashInHand: n(recon.cashInHand),
          advances: n(recon.advances),
          receivables: n(recon.receivables),
          payables: n(recon.payables),
          partnerNotes: recon.partnerNotes || undefined,
        }),
        saveReportLines(slot.id, budget.lines.map(l => ({
          budgetLineId: l.id,
          actualAmount: n(actuals[l.id] ?? ""),
          notes: lineNotes[l.id] || undefined,
        }))),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  function handleSubmit() {
    startSubmit(async () => {
      const n = (v: string) => parseFloat(v) || 0;
      await saveReport(slot.id, {
        openingBalance: n(recon.openingBalance),
        tranchesReceived: n(recon.tranchesReceived),
        interestEarned: n(recon.interestEarned),
        bankBalance: n(recon.bankBalance),
        fdBalance: n(recon.fdBalance),
        cashInHand: n(recon.cashInHand),
        advances: n(recon.advances),
        receivables: n(recon.receivables),
        payables: n(recon.payables),
        partnerNotes: recon.partnerNotes || undefined,
      });
      await saveReportLines(slot.id, budget.lines.map(l => ({
        budgetLineId: l.id,
        actualAmount: n(actuals[l.id] ?? ""),
        notes: lineNotes[l.id] || undefined,
      })));
      await submitReport(slot.id);
    });
  }

  // Group lines by section
  const bySec = budget.lines.reduce<Record<string, Line[]>>((acc, l) => {
    (acc[l.section] ??= []).push(l);
    return acc;
  }, {});

  const inputClass = "w-full text-sm border border-stone-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:border-sky-400";
  const readClass = "w-full text-sm px-3 py-1.5 text-stone-600";

  const n = (v: string) => parseFloat(v) || 0;

  // Reconciliation check
  const totalIncome = n(recon.openingBalance) + n(recon.tranchesReceived) + n(recon.interestEarned);
  const totalActuals = budget.lines.reduce((s, l) => s + (n(actuals[l.id] ?? "") || 0), 0);
  const closingBalance = totalIncome - totalActuals;
  const fundBalance = n(recon.bankBalance) + n(recon.fdBalance) + n(recon.cashInHand) + n(recon.advances) + n(recon.receivables) - n(recon.payables);
  const reconDiff = closingBalance - fundBalance;

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div>
        <Link href={`/budget/${budget.id}/reports`} className="text-xs text-stone-400 hover:text-stone-700">← Reports</Link>
        <h1 className="text-xl font-semibold text-stone-900 mt-2">
          {fmtDate(slot.periodFrom)} – {fmtDate(slot.periodTo)}
        </h1>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-sm text-stone-500">Grant Year {slot.grantYear} · Report #{slot.slotNumber}</span>
          {slot.status === "sent_back" && report?.reviewerNotes && (
            <span className="text-sm text-red-600 bg-red-50 px-3 py-1 rounded-lg">
              Sent back: {report.reviewerNotes}
            </span>
          )}
        </div>
      </div>

      {/* Line-item actuals */}
      <section>
        <h2 className="text-base font-semibold text-stone-800 mb-4">Line-item actuals</h2>
        <div className="space-y-6">
          {(Object.keys(SECTION_LABELS) as BudgetSection[]).map(sec => {
            const lines = bySec[sec];
            if (!lines?.length) return null;
            return (
              <div key={sec}>
                <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">{SECTION_LABELS[sec]}</h3>
                <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-stone-50 border-b border-stone-200">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-stone-500 text-xs">Line item</th>
                        <th className="text-right px-3 py-2.5 font-medium text-stone-500 text-xs">Period budget</th>
                        <th className="text-right px-3 py-2.5 font-medium text-stone-500 text-xs">This period actual</th>
                        <th className="text-right px-3 py-2.5 font-medium text-stone-500 text-xs">YTD actual</th>
                        <th className="text-right px-3 py-2.5 font-medium text-stone-500 text-xs">YTD budget</th>
                        <th className="px-3 py-2.5 font-medium text-stone-500 text-xs">Variance</th>
                        {canEdit && <th className="px-3 py-2.5 font-medium text-stone-500 text-xs w-32">Notes</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {lines.map(line => {
                        const yt = yearTotal(line);
                        const periodBudget = proratedBudget(yt, periodFrom, periodTo);
                        const ytdBudget = cumulativeProratedBudget(yt, yearStart, periodTo);
                        const thisActual = n(actuals[line.id] ?? "");
                        const priorActual = cumulativePrior[line.id] ?? 0;
                        const ytdActual = priorActual + thisActual;
                        const flag = varianceFlag(ytdActual, ytdBudget);
                        const varPct = ytdBudget > 0 ? ((ytdActual - ytdBudget) / ytdBudget * 100).toFixed(1) : null;

                        return (
                          <tr key={line.id} className="hover:bg-stone-50">
                            <td className="px-4 py-2.5 text-stone-700">{line.description}</td>
                            <td className="px-3 py-2.5 text-right text-stone-500">{fmt(Math.round(periodBudget))}</td>
                            <td className="px-3 py-2.5 text-right">
                              {canEdit
                                ? <input type="number" min={0} value={actuals[line.id] ?? ""}
                                    onChange={e => setActuals(p => ({ ...p, [line.id]: e.target.value }))}
                                    className="w-28 text-sm text-right border border-stone-200 rounded px-2 py-1 focus:outline-none focus:border-sky-400" />
                                : <span className="text-stone-800">{fmt(thisActual)}</span>
                              }
                            </td>
                            <td className="px-3 py-2.5 text-right text-stone-800">{fmt(Math.round(ytdActual))}</td>
                            <td className="px-3 py-2.5 text-right text-stone-500">{fmt(Math.round(ytdBudget))}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5">
                                {varPct !== null && (
                                  <span className={`text-xs ${flag ? "font-semibold" : "text-stone-400"}`}>
                                    {varPct}%
                                  </span>
                                )}
                                <FlagChip flag={flag} />
                              </div>
                            </td>
                            {canEdit && (
                              <td className="px-3 py-2.5">
                                <input type="text" value={lineNotes[line.id] ?? ""}
                                  onChange={e => setLineNotes(p => ({ ...p, [line.id]: e.target.value }))}
                                  placeholder="Note…"
                                  className="w-full text-xs border border-stone-200 rounded px-2 py-1 focus:outline-none focus:border-sky-400" />
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Budget head summary */}
      <section>
        <h2 className="text-base font-semibold text-stone-800 mb-4">Budget head summary</h2>
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-stone-500 text-xs">Budget head</th>
                <th className="text-right px-3 py-2.5 font-medium text-stone-500 text-xs">Annual budget</th>
                <th className="text-right px-3 py-2.5 font-medium text-stone-500 text-xs">Period budget</th>
                <th className="text-right px-3 py-2.5 font-medium text-stone-500 text-xs">This period</th>
                <th className="text-right px-3 py-2.5 font-medium text-stone-500 text-xs">YTD actual</th>
                <th className="text-right px-3 py-2.5 font-medium text-stone-500 text-xs">YTD budget</th>
                <th className="px-3 py-2.5 font-medium text-stone-500 text-xs">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {BUDGET_HEAD_ORDER.map(head => {
                const headLines = budget.lines.filter(l => SECTION_TO_HEAD[l.section] === head);
                if (!headLines.length) return null;
                const annualBudget = headLines.reduce((s, l) => s + yearTotal(l), 0);
                const periodBud = headLines.reduce((s, l) => s + proratedBudget(yearTotal(l), periodFrom, periodTo), 0);
                const ytdBud = headLines.reduce((s, l) => s + cumulativeProratedBudget(yearTotal(l), yearStart, periodTo), 0);
                const thisPeriodAct = headLines.reduce((s, l) => s + n(actuals[l.id] ?? ""), 0);
                const priorAct = headLines.reduce((s, l) => s + (cumulativePrior[l.id] ?? 0), 0);
                const ytdAct = priorAct + thisPeriodAct;
                const flag = varianceFlag(ytdAct, ytdBud);
                const varPct = ytdBud > 0 ? ((ytdAct - ytdBud) / ytdBud * 100).toFixed(1) : null;
                return (
                  <tr key={head} className="hover:bg-stone-50">
                    <td className="px-4 py-2.5 text-stone-700 font-medium">{head}</td>
                    <td className="px-3 py-2.5 text-right text-stone-500">{fmt(Math.round(annualBudget))}</td>
                    <td className="px-3 py-2.5 text-right text-stone-500">{fmt(Math.round(periodBud))}</td>
                    <td className="px-3 py-2.5 text-right text-stone-800">{fmt(Math.round(thisPeriodAct))}</td>
                    <td className="px-3 py-2.5 text-right text-stone-800 font-semibold">{fmt(Math.round(ytdAct))}</td>
                    <td className="px-3 py-2.5 text-right text-stone-500">{fmt(Math.round(ytdBud))}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {varPct !== null && (
                          <span className={`text-xs ${flag ? "font-semibold" : "text-stone-400"}`}>{varPct}%</span>
                        )}
                        <FlagChip flag={flag} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-stone-50 border-t border-stone-200">
              <tr>
                <td className="px-4 py-2.5 font-semibold text-stone-800 text-sm">Total</td>
                <td className="px-3 py-2.5 text-right font-semibold text-stone-800">
                  {fmt(Math.round(budget.lines.reduce((s, l) => s + yearTotal(l), 0)))}
                </td>
                <td className="px-3 py-2.5 text-right text-stone-600">
                  {fmt(Math.round(budget.lines.reduce((s, l) => s + proratedBudget(yearTotal(l), periodFrom, periodTo), 0)))}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-stone-800">
                  {fmt(Math.round(totalActuals))}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-stone-800">
                  {fmt(Math.round(budget.lines.reduce((s, l) => s + (n(actuals[l.id] ?? "") || 0) + (cumulativePrior[l.id] ?? 0), 0)))}
                </td>
                <td className="px-3 py-2.5 text-right text-stone-500">
                  {fmt(Math.round(budget.lines.reduce((s, l) => s + cumulativeProratedBudget(yearTotal(l), yearStart, periodTo), 0)))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Fund reconciliation */}
      <section>
        <h2 className="text-base font-semibold text-stone-800 mb-4">Fund reconciliation</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* A – Funds */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">A – Fund movement</p>
            {([
              ["openingBalance", "Opening balance"],
              ["tranchesReceived", "Tranches received"],
              ["interestEarned", "Interest earned (from bank statement)"],
            ] as [keyof typeof recon, string][]).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <label className="text-sm text-stone-600">{label}</label>
                {canEdit
                  ? <input type="number" min={0} value={recon[key]}
                      onChange={e => setRecon(p => ({ ...p, [key]: e.target.value }))}
                      className="w-36 text-sm text-right border border-stone-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-sky-400" />
                  : <span className="text-sm font-medium text-stone-800">{fmt(n(recon[key]))}</span>
                }
              </div>
            ))}
            <div className="border-t border-stone-200 pt-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-stone-700">Total income</span>
              <span className="text-sm font-semibold text-stone-900">{fmt(Math.round(totalIncome))}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-600">Less: total expenditure</span>
              <span className="text-sm text-stone-800">({fmt(Math.round(totalActuals))})</span>
            </div>
            <div className="border-t border-stone-200 pt-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-stone-700">Closing balance [A]</span>
              <span className={`text-sm font-semibold ${closingBalance < 0 ? "text-red-600" : "text-stone-900"}`}>
                {fmt(Math.round(closingBalance))}
              </span>
            </div>
          </div>

          {/* B – Represented by */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">B – Represented by</p>
            {([
              ["bankBalance", "Cash at bank (from statement)"],
              ["fdBalance", "FD with bank (from statement)"],
              ["cashInHand", "Cash in hand"],
              ["advances", "Advances to employees/vendors"],
              ["receivables", "Other receivables"],
              ["payables", "Less: payables / current liabilities"],
            ] as [keyof typeof recon, string][]).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <label className={`text-sm ${key === "payables" ? "text-red-500" : "text-stone-600"}`}>{label}</label>
                {canEdit
                  ? <input type="number" min={0} value={recon[key]}
                      onChange={e => setRecon(p => ({ ...p, [key]: e.target.value }))}
                      className="w-36 text-sm text-right border border-stone-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-sky-400" />
                  : <span className="text-sm font-medium text-stone-800">{fmt(n(recon[key]))}</span>
                }
              </div>
            ))}
            <div className="border-t border-stone-200 pt-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-stone-700">Fund balance [B]</span>
              <span className="text-sm font-semibold text-stone-900">{fmt(Math.round(fundBalance))}</span>
            </div>
            <div className={`flex items-center justify-between pt-1 ${Math.abs(reconDiff) > 1 ? "text-red-600" : "text-green-600"}`}>
              <span className="text-sm font-semibold">Difference [A – B]</span>
              <span className="text-sm font-semibold">{fmt(Math.round(reconDiff))}</span>
            </div>
            {Math.abs(reconDiff) > 1 && (
              <p className="text-xs text-red-500">Reconciliation does not balance — please check your figures.</p>
            )}
          </div>
        </div>

        {/* Bank statement upload */}
        {canEdit && (
          <div className="mt-4 bg-white border border-stone-200 rounded-xl p-5">
            <p className="text-sm font-medium text-stone-700 mb-1">Bank statement</p>
            <p className="text-xs text-stone-400 mb-3">Upload your bank statement PDF — Claude will extract bank balance, FD balance, and interest earned and pre-fill the fields above.</p>
            <div className="flex items-center gap-3 flex-wrap">
              <input ref={fileRef} type="file" accept=".pdf,image/jpeg,image/png" className="hidden"
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setParseStatus("uploading");
                  setParseNote(null);
                  try {
                    const blob = await upload(file.name, file, {
                      access: "public",
                      handleUploadUrl: "/api/budget/blob-upload",
                    });
                    setParseStatus("parsing");
                    const res = await fetch("/api/budget/parse-bank-statement", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ url: blob.url, slotId: slot.id }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error ?? "Parse failed");
                    setRecon(p => ({
                      ...p,
                      bankBalance: data.bankBalance != null ? String(data.bankBalance) : p.bankBalance,
                      interestEarned: data.interestEarned != null ? String(data.interestEarned) : p.interestEarned,
                      fdBalance: data.fdBalance != null ? String(data.fdBalance) : p.fdBalance,
                    }));
                    setParseNote(data.notes ?? (data.bankName ? `Parsed from ${data.bankName}` : "Parsed successfully"));
                    setParseStatus("done");
                  } catch (err: any) {
                    setParseNote(err.message ?? "Error");
                    setParseStatus("error");
                  }
                  if (fileRef.current) fileRef.current.value = "";
                }}
              />
              <button onClick={() => fileRef.current?.click()} disabled={parseStatus === "uploading" || parseStatus === "parsing"}
                className="text-sm border border-stone-200 hover:border-sky-400 text-stone-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                {parseStatus === "uploading" ? "Uploading…" : parseStatus === "parsing" ? "Parsing with Claude…" : "Upload statement"}
              </button>
              {parseNote && (
                <span className={`text-xs ${parseStatus === "error" ? "text-red-500" : "text-green-600"}`}>
                  {parseStatus === "done" ? "✓ " : "✗ "}{parseNote}
                </span>
              )}
            </div>
            <p className="text-xs text-stone-300 mt-2">Fields will be pre-filled — review and correct before saving.</p>
          </div>
        )}

        {/* Partner notes */}
        {(canEdit || recon.partnerNotes) && (
          <div className="mt-4">
            <label className="text-xs text-stone-500 block mb-1">Notes / comments</label>
            {canEdit
              ? <textarea value={recon.partnerNotes} onChange={e => setRecon(p => ({ ...p, partnerNotes: e.target.value }))}
                  rows={3} placeholder="Any notes for the reviewer…"
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400" />
              : <p className="text-sm text-stone-700">{recon.partnerNotes}</p>
            }
          </div>
        )}
      </section>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        {canEdit && (
          <>
            <button onClick={handleSave} disabled={saving}
              className="bg-white border border-stone-200 hover:border-stone-400 text-stone-700 text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save draft"}
            </button>
            <button onClick={handleSubmit} disabled={submitting || saving}
              className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
              {submitting ? "Submitting…" : "Submit for review"}
            </button>
          </>
        )}
        {(isSuperAdmin || slot.status === "approved") && (
          <a href={`/api/budget/${budget.id}/reports/${slot.id}/export`}
            className="border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-sm font-medium px-5 py-2 rounded-lg transition-colors">
            Export (.xlsx)
          </a>
        )}
      </div>
    </div>
  );
}
