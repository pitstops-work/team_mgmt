"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import {
  saveReport, saveReportLines, submitReport,
  addReallocationRequest, deleteReallocationRequest,
} from "../../../../budget/report-actions";
import {
  SECTION_TO_HEAD, BUDGET_HEAD_ORDER,
  proratedBudget, cumulativeProratedBudget, varianceFlag,
} from "@/lib/budget-report-slots";
import type { BudgetSection, ReallocationDuration } from "@/app/generated/prisma/client";

type Line = {
  id: string; description: string; section: BudgetSection; domain: string | null;
  y1Total: number; y2Total: number; y3Total: number;
};
type ReportLine = { budgetLineId: string; actualAmount: number; notes: string | null };
type ReallocationRequest = {
  id: string; status: string;
  fromLine: { id: string; description: string; section: string };
  toLine: { id: string; description: string; section: string } | null;
  toDescription: string | null; toSection: string | null;
  requestedAmount: number; durationType: string; durationMonths: number | null;
  rationale: string; sourceUnspent: number; willSustain: boolean; sustainNote: string | null;
  approvedAmount: number | null; reviewerComment: string | null;
};
type Report = {
  id: string; openingBalance: number; tranchesReceived: number; interestEarned: number;
  bankBalance: number; fdBalance: number; cashInHand: number; advances: number;
  receivables: number; payables: number; partnerNotes: string | null; reviewerNotes: string | null;
  lines: ReportLine[];
  reallocationRequests: ReallocationRequest[];
} | null;
type Slot = { id: string; slotNumber: number; grantYear: number; periodFrom: string; periodTo: string; dueDate: string; status: string; report: Report };
type Budget = { id: string; name: string; years: number; lines: Line[]; reportConfig: { grantStartDate: string } | null };

const SECTION_LABELS: Record<BudgetSection, string> = {
  salary: "Salary & Honorarium", capex: "Fixed Assets / CAPEX", travel: "Travel",
  programme: "Programme Expenses", admin_salary: "Admin – Salaries",
  admin_other: "Admin – Other", additional: "Additional Items",
};

const DURATION_LABELS: Record<string, string> = {
  remaining_year: "Rest of grant year",
  full_grant: "Full remaining grant period",
  custom: "Custom period",
  one_time: "One-time payment",
};

const REALLOC_STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
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

const BLANK_REALLOC = {
  fromLineId: "", toLineId: "" as string | "new",
  toDescription: "", toSection: "programme" as BudgetSection,
  requestedAmount: "", durationType: "remaining_year" as ReallocationDuration,
  durationMonths: "", rationale: "",
};

export default function ReportForm({
  slot, budget, cumulativePrior, revisedAdjustments, canEdit, isSuperAdmin,
}: {
  slot: Slot; budget: Budget; cumulativePrior: Record<string, number>;
  revisedAdjustments: Record<string, number>;
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
  const [parseProgress, setParseProgress] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Reallocation state
  const [showReallocationForm, setShowReallocationForm] = useState(false);
  const [realloc, setRealloc] = useState(BLANK_REALLOC);
  const [reallocSaving, startReallocSave] = useTransition();
  const [reallocDeleting, startReallocDelete] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  function revisedYearTotal(line: Line): number {
    return yearTotal(line) + (revisedAdjustments[line.id] ?? 0);
  }

  const hasRevisions = budget.lines.some(l => (revisedAdjustments[l.id] ?? 0) !== 0);

  function handleSave() {
    startSave(async () => {
      const nv = (v: string) => parseFloat(v) || 0;
      await Promise.all([
        saveReport(slot.id, {
          openingBalance: nv(recon.openingBalance),
          tranchesReceived: nv(recon.tranchesReceived),
          interestEarned: nv(recon.interestEarned),
          bankBalance: nv(recon.bankBalance),
          fdBalance: nv(recon.fdBalance),
          cashInHand: nv(recon.cashInHand),
          advances: nv(recon.advances),
          receivables: nv(recon.receivables),
          payables: nv(recon.payables),
          partnerNotes: recon.partnerNotes || undefined,
        }),
        saveReportLines(slot.id, budget.lines.map(l => ({
          budgetLineId: l.id,
          actualAmount: nv(actuals[l.id] ?? ""),
          notes: lineNotes[l.id] || undefined,
        }))),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  function handleSubmit() {
    setSubmitError(null);
    startSubmit(async () => {
      const nv = (v: string) => parseFloat(v) || 0;
      await saveReport(slot.id, {
        openingBalance: nv(recon.openingBalance),
        tranchesReceived: nv(recon.tranchesReceived),
        interestEarned: nv(recon.interestEarned),
        bankBalance: nv(recon.bankBalance),
        fdBalance: nv(recon.fdBalance),
        cashInHand: nv(recon.cashInHand),
        advances: nv(recon.advances),
        receivables: nv(recon.receivables),
        payables: nv(recon.payables),
        partnerNotes: recon.partnerNotes || undefined,
      });
      await saveReportLines(slot.id, budget.lines.map(l => ({
        budgetLineId: l.id,
        actualAmount: nv(actuals[l.id] ?? ""),
        notes: lineNotes[l.id] || undefined,
      })));
      try {
        await submitReport(slot.id);
      } catch (e: any) {
        setSubmitError(e.message ?? "Submit failed");
      }
    });
  }

  function handleAddRealloc() {
    if (!realloc.fromLineId || !realloc.requestedAmount || !realloc.rationale.trim()) return;
    if (realloc.toLineId === "new" && !realloc.toDescription.trim()) return;
    startReallocSave(async () => {
      const nv = (v: string) => parseFloat(v) || 0;
      await addReallocationRequest(slot.id, {
        fromLineId: realloc.fromLineId,
        toLineId: realloc.toLineId === "new" ? null : (realloc.toLineId || null),
        toDescription: realloc.toLineId === "new" ? realloc.toDescription : undefined,
        toSection: realloc.toLineId === "new" ? realloc.toSection : undefined,
        requestedAmount: nv(realloc.requestedAmount),
        durationType: realloc.durationType,
        durationMonths: realloc.durationType === "custom" ? (parseInt(realloc.durationMonths) || undefined) : undefined,
        rationale: realloc.rationale.trim(),
      });
      setRealloc(BLANK_REALLOC);
      setShowReallocationForm(false);
    });
  }

  // Group lines by section
  const bySec = budget.lines.reduce<Record<string, Line[]>>((acc, l) => {
    (acc[l.section] ??= []).push(l);
    return acc;
  }, {});

  const n = (v: string) => parseFloat(v) || 0;

  // Reconciliation check
  const totalIncome = n(recon.openingBalance) + n(recon.tranchesReceived) + n(recon.interestEarned);
  const totalActuals = budget.lines.reduce((s, l) => s + (n(actuals[l.id] ?? "") || 0), 0);
  const closingBalance = totalIncome - totalActuals;
  const fundBalance = n(recon.bankBalance) + n(recon.fdBalance) + n(recon.cashInHand) + n(recon.advances) + n(recon.receivables) - n(recon.payables);
  const reconDiff = closingBalance - fundBalance;

  const reallocRequests = report?.reallocationRequests ?? [];
  const pendingReallocCount = reallocRequests.filter(r => r.status === "pending").length;

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
        {hasRevisions && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            Revised budget shown — prior approved reallocations have adjusted some line budgets.
          </p>
        )}
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
                        const rvt = revisedYearTotal(line);
                        const periodBudget = proratedBudget(rvt, periodFrom, periodTo);
                        const ytdBudget = cumulativeProratedBudget(rvt, yearStart, periodTo);
                        const thisActual = n(actuals[line.id] ?? "");
                        const priorActual = cumulativePrior[line.id] ?? 0;
                        const ytdActual = priorActual + thisActual;
                        const flag = varianceFlag(ytdActual, ytdBudget);
                        const varPct = ytdBudget > 0 ? ((ytdActual - ytdBudget) / ytdBudget * 100).toFixed(1) : null;
                        const isRevised = (revisedAdjustments[line.id] ?? 0) !== 0;

                        return (
                          <tr key={line.id} className="hover:bg-stone-50">
                            <td className="px-4 py-2.5 text-stone-700">
                              {line.description}
                              {isRevised && (
                                <span className="ml-1.5 text-xs text-amber-600 font-medium">revised</span>
                              )}
                            </td>
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
                const annualBudget = headLines.reduce((s, l) => s + revisedYearTotal(l), 0);
                const periodBud = headLines.reduce((s, l) => s + proratedBudget(revisedYearTotal(l), periodFrom, periodTo), 0);
                const ytdBud = headLines.reduce((s, l) => s + cumulativeProratedBudget(revisedYearTotal(l), yearStart, periodTo), 0);
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
                  {fmt(Math.round(budget.lines.reduce((s, l) => s + revisedYearTotal(l), 0)))}
                </td>
                <td className="px-3 py-2.5 text-right text-stone-600">
                  {fmt(Math.round(budget.lines.reduce((s, l) => s + proratedBudget(revisedYearTotal(l), periodFrom, periodTo), 0)))}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-stone-800">
                  {fmt(Math.round(totalActuals))}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-stone-800">
                  {fmt(Math.round(budget.lines.reduce((s, l) => s + (n(actuals[l.id] ?? "") || 0) + (cumulativePrior[l.id] ?? 0), 0)))}
                </td>
                <td className="px-3 py-2.5 text-right text-stone-500">
                  {fmt(Math.round(budget.lines.reduce((s, l) => s + cumulativeProratedBudget(revisedYearTotal(l), yearStart, periodTo), 0)))}
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
            <p className="text-xs text-stone-400 mb-3">Upload one or more bank statement PDFs — Claude will extract balances and interest. If you have monthly statements, select all at once; interest will be summed and the latest closing balance used.</p>
            <div className="flex items-center gap-3 flex-wrap">
              <input ref={fileRef} type="file" accept=".pdf,image/jpeg,image/png" multiple className="hidden"
                onChange={async e => {
                  const files = Array.from(e.target.files ?? []);
                  if (!files.length) return;
                  setParseStatus("uploading");
                  setParseNote(null);
                  setParseProgress("");
                  try {
                    type ParsedResult = { bankBalance: number; interestEarned: number; fdBalance: number; periodTo: string | null; periodFrom: string | null; bankName: string | null; notes: string | null };

                    async function parseFile(file: File): Promise<ParsedResult> {
                      const fd = new FormData();
                      fd.append("file", file);
                      fd.append("slotId", slot.id);
                      const controller = new AbortController();
                      const parseTimeout = setTimeout(() => controller.abort(), 88_000);
                      let parseRes: Response;
                      try {
                        parseRes = await fetch("/api/budget/parse-bank-statement", {
                          method: "POST",
                          body: fd,
                          signal: controller.signal,
                        });
                      } finally {
                        clearTimeout(parseTimeout);
                      }
                      const data = await parseRes.json();
                      if (!parseRes.ok) throw new Error(data.error ?? "Parse failed");
                      return data as ParsedResult;
                    }

                    setParseStatus("parsing");
                    if (files.length > 1) setParseProgress(`0/${files.length}`);

                    // Process all files in parallel; collect successes and failures
                    let doneCount = 0;
                    const settlements = await Promise.allSettled(
                      files.map(f => parseFile(f).then(r => { doneCount++; setParseProgress(`${doneCount}/${files.length}`); return r; }))
                    );

                    const results = settlements.flatMap(s => s.status === "fulfilled" ? [s.value] : []);
                    const failCount = settlements.filter(s => s.status === "rejected").length;

                    if (results.length === 0) {
                      const firstErr = settlements.find(s => s.status === "rejected") as PromiseRejectedResult;
                      const errMsg = firstErr?.reason?.name === "AbortError"
                        ? "Timed out — PDF may be too large. Try uploading fewer files at once."
                        : (firstErr?.reason?.message ?? "All files failed to parse");
                      throw new Error(errMsg);
                    }

                    // Combine: sum interest, use latest closing balance (by periodTo)
                    const totalInterest = results.reduce((s, r) => s + (r.interestEarned ?? 0), 0);
                    const latest = results.reduce((best, r) => {
                      if (!best) return r;
                      const bestDate = best.periodTo ? new Date(best.periodTo).getTime() : 0;
                      const rDate = r.periodTo ? new Date(r.periodTo).getTime() : 0;
                      return rDate >= bestDate ? r : best;
                    }, null as ParsedResult | null)!;

                    setRecon(p => ({
                      ...p,
                      bankBalance: latest.bankBalance != null ? String(latest.bankBalance) : p.bankBalance,
                      fdBalance: latest.fdBalance != null ? String(latest.fdBalance) : p.fdBalance,
                      interestEarned: String(totalInterest),
                    }));

                    const banks = [...new Set(results.map(r => r.bankName).filter(Boolean))];
                    const notes = results.map(r => r.notes).filter(Boolean);
                    setParseNote(
                      (banks.length ? `Parsed from ${banks.join(", ")}` : "Parsed successfully") +
                      (files.length > 1 ? ` · ${results.length}/${files.length} statements combined` : "") +
                      (failCount > 0 ? ` · ${failCount} file(s) failed — review fields` : "") +
                      (notes.length ? ` · ${notes.join("; ")}` : "")
                    );
                    setParseStatus(failCount > 0 ? "error" : "done");
                  } catch (err: any) {
                    setParseNote(err.message ?? "Parse failed");
                    setParseStatus("error");
                  }
                  if (fileRef.current) fileRef.current.value = "";
                }}
              />
              <button onClick={() => fileRef.current?.click()} disabled={parseStatus === "uploading" || parseStatus === "parsing"}
                className="text-sm border border-stone-200 hover:border-sky-400 text-stone-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                {parseStatus === "uploading"
                  ? `Uploading…${parseProgress ? ` (${parseProgress})` : ""}`
                  : parseStatus === "parsing"
                  ? `Parsing with Claude…${parseProgress ? ` (${parseProgress})` : ""}`
                  : "Upload statement(s)"}
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

      {/* Reallocation requests */}
      {(canEdit || reallocRequests.length > 0) && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-stone-800">Reallocation requests</h2>
              <p className="text-xs text-stone-400 mt-0.5">Request budget reallocation from one line to another</p>
            </div>
            {canEdit && !showReallocationForm && (
              <button onClick={() => setShowReallocationForm(true)}
                className="text-sm border border-sky-300 text-sky-700 hover:bg-sky-50 px-4 py-1.5 rounded-lg transition-colors">
                + Add request
              </button>
            )}
          </div>

          {/* Existing requests */}
          {reallocRequests.length > 0 && (
            <div className="space-y-3 mb-4">
              {reallocRequests.map(req => (
                <div key={req.id} className={`border rounded-xl px-5 py-4 ${REALLOC_STATUS_STYLE[req.status] ?? "border-stone-200"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-medium text-stone-800">
                          {req.fromLine.description} → {req.toLine?.description ?? req.toDescription ?? "New line"}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                          req.status === "approved" ? "bg-green-100 text-green-700"
                          : req.status === "rejected" ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                        }`}>{req.status}</span>
                      </div>
                      <p className="text-xs text-stone-500">
                        {fmt(Math.round(req.requestedAmount))} · {DURATION_LABELS[req.durationType] ?? req.durationType}
                        {req.durationType === "custom" && req.durationMonths ? ` (${req.durationMonths} months)` : ""}
                      </p>
                      <p className="text-xs text-stone-500 mt-0.5">{req.rationale}</p>
                      {!req.willSustain && req.sustainNote && (
                        <p className="text-xs text-amber-700 mt-1">{req.sustainNote}</p>
                      )}
                      {req.status === "approved" && req.approvedAmount != null && req.approvedAmount !== req.requestedAmount && (
                        <p className="text-xs text-green-700 mt-1">Approved amount: {fmt(Math.round(req.approvedAmount))}</p>
                      )}
                      {req.reviewerComment && (
                        <p className="text-xs text-stone-600 mt-1 italic">"{req.reviewerComment}"</p>
                      )}
                    </div>
                    {canEdit && req.status === "pending" && (
                      <button
                        disabled={reallocDeleting}
                        onClick={() => startReallocDelete(async () => { await deleteReallocationRequest(req.id); })}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors shrink-0">
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add form */}
          {showReallocationForm && canEdit && (
            <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
              <p className="text-sm font-semibold text-stone-700">New reallocation request</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-stone-500 block mb-1">From line (source)</label>
                  <select value={realloc.fromLineId}
                    onChange={e => setRealloc(p => ({ ...p, fromLineId: e.target.value }))}
                    className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400">
                    <option value="">Select line…</option>
                    {budget.lines.map(l => (
                      <option key={l.id} value={l.id}>{l.description}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-stone-500 block mb-1">To line (destination)</label>
                  <select value={realloc.toLineId}
                    onChange={e => setRealloc(p => ({ ...p, toLineId: e.target.value }))}
                    className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400">
                    <option value="">Select line…</option>
                    <option value="new">— Create new budget line —</option>
                    {budget.lines.filter(l => l.id !== realloc.fromLineId).map(l => (
                      <option key={l.id} value={l.id}>{l.description}</option>
                    ))}
                  </select>
                </div>

                {realloc.toLineId === "new" && (
                  <>
                    <div>
                      <label className="text-xs text-stone-500 block mb-1">New line description</label>
                      <input type="text" value={realloc.toDescription}
                        onChange={e => setRealloc(p => ({ ...p, toDescription: e.target.value }))}
                        placeholder="e.g. Field visit expenses"
                        className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400" />
                    </div>
                    <div>
                      <label className="text-xs text-stone-500 block mb-1">Budget section</label>
                      <select value={realloc.toSection}
                        onChange={e => setRealloc(p => ({ ...p, toSection: e.target.value as BudgetSection }))}
                        className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400">
                        {(Object.keys(SECTION_LABELS) as BudgetSection[]).map(s => (
                          <option key={s} value={s}>{SECTION_LABELS[s]}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div>
                  <label className="text-xs text-stone-500 block mb-1">Amount to reallocate (₹)</label>
                  <input type="number" min={0} value={realloc.requestedAmount}
                    onChange={e => setRealloc(p => ({ ...p, requestedAmount: e.target.value }))}
                    placeholder="0"
                    className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400" />
                </div>

                <div>
                  <label className="text-xs text-stone-500 block mb-1">Duration</label>
                  <select value={realloc.durationType}
                    onChange={e => setRealloc(p => ({ ...p, durationType: e.target.value as ReallocationDuration }))}
                    className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400">
                    <option value="remaining_year">Rest of grant year</option>
                    <option value="full_grant">Full remaining grant period</option>
                    <option value="custom">Custom number of months</option>
                    <option value="one_time">One-time payment</option>
                  </select>
                </div>

                {realloc.durationType === "custom" && (
                  <div>
                    <label className="text-xs text-stone-500 block mb-1">Number of months</label>
                    <input type="number" min={1} value={realloc.durationMonths}
                      onChange={e => setRealloc(p => ({ ...p, durationMonths: e.target.value }))}
                      placeholder="e.g. 3"
                      className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400" />
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs text-stone-500 block mb-1">Rationale</label>
                <textarea value={realloc.rationale}
                  onChange={e => setRealloc(p => ({ ...p, rationale: e.target.value }))}
                  rows={2} placeholder="Explain why this reallocation is needed…"
                  className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400" />
              </div>

              <div className="flex gap-3">
                <button onClick={handleAddRealloc} disabled={reallocSaving}
                  className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
                  {reallocSaving ? "Saving…" : "Add request"}
                </button>
                <button onClick={() => { setShowReallocationForm(false); setRealloc(BLANK_REALLOC); }}
                  className="text-sm text-stone-400 hover:text-stone-700">Cancel</button>
              </div>
            </div>
          )}

          {pendingReallocCount > 0 && !canEdit && (
            <p className="text-xs text-amber-700">{pendingReallocCount} pending reallocation request{pendingReallocCount > 1 ? "s" : ""} — resolve before approving report.</p>
          )}
        </section>
      )}

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
        {submitError && <p className="text-sm text-red-600">{submitError}</p>}
      </div>
    </div>
  );
}
