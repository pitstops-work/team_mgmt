// Server-side figures for the Finance Declaration, computed from the books
// (budget lines + saved report actuals) — authoritative, never trusts the
// client. Shared by the submit action (snapshot/hash) and the DOCX route.

import prisma from "@/lib/prisma";
import { buildDeclarationSummary, type DeclarationSummary } from "./declaration";

export type DeclarationData = {
  budgetName: string;
  grantYear: number;
  slotNumber: number;
  periodFrom: Date;
  periodTo: Date;
  summary: DeclarationSummary;
  unspent: number;
};

export async function computeDeclarationData(slotId: string): Promise<DeclarationData | null> {
  const slot = await prisma.budgetReportSlot.findUnique({
    where: { id: slotId },
    select: { budgetId: true, grantYear: true, slotNumber: true, periodFrom: true, periodTo: true },
  });
  if (!slot) return null;

  const [budget, report] = await Promise.all([
    prisma.budget.findUnique({ where: { id: slot.budgetId }, include: { lines: true, reportConfig: true } }),
    prisma.budgetReport.findUnique({ where: { slotId }, include: { lines: true } }),
  ]);
  if (!budget) return null;

  const gs = budget.reportConfig ? new Date(budget.reportConfig.grantStartDate) : slot.periodFrom;
  const yearStart = new Date(Date.UTC(gs.getUTCFullYear() + (slot.grantYear - 1), gs.getUTCMonth(), 1));

  const actualByLine: Record<string, number> = Object.fromEntries((report?.lines ?? []).map(l => [l.budgetLineId, l.actualAmount]));
  const yt = (l: { y1Total: number; y2Total: number; y3Total: number; y4Total: number; y5Total: number }) =>
    slot.grantYear === 1 ? l.y1Total : slot.grantYear === 2 ? l.y2Total : slot.grantYear === 3 ? l.y3Total : slot.grantYear === 4 ? l.y4Total : l.y5Total;

  const declLines = budget.lines.map(l => ({
    section: l.section,
    cadence: l.cadence,
    plannedMonths: l.plannedMonths,
    yearTotal: yt(l),
    actual: actualByLine[l.id] ?? 0,
  }));

  const summary = buildDeclarationSummary(declLines, slot.periodFrom, slot.periodTo, yearStart);
  const totalActuals = (report?.lines ?? []).reduce((s, l) => s + l.actualAmount, 0);
  const unspent = (report?.openingBalance ?? 0) + (report?.tranchesReceived ?? 0) + (report?.interestEarned ?? 0) - totalActuals;

  return {
    budgetName: budget.name,
    grantYear: slot.grantYear,
    slotNumber: slot.slotNumber,
    periodFrom: slot.periodFrom,
    periodTo: slot.periodTo,
    summary,
    unspent: Math.round(unspent),
  };
}
