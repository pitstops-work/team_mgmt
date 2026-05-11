"use server";

import { auth } from "@/lib/auth";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateSlots } from "@/lib/budget-report-slots";
import type { ReportFrequency } from "@/app/generated/prisma/client";

// ── Admin: approve a budget and set up report config ──────────────────────────

export async function approveBudget(
  budgetId: string,
  config: {
    frequency: ReportFrequency;
    grantStartDate: Date;
    grantEndDate: Date;
    dueAfterDays?: number;
  }
) {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session)) throw new Error("Unauthorized");

  const dueAfterDays = config.dueAfterDays ?? 30;
  const slots = generateSlots(config.grantStartDate, config.grantEndDate, config.frequency, dueAfterDays);

  await prisma.$transaction([
    prisma.budget.update({ where: { id: budgetId }, data: { status: "approved" } }),
    prisma.budgetReportConfig.upsert({
      where: { budgetId },
      create: {
        budgetId,
        frequency: config.frequency,
        grantStartDate: config.grantStartDate,
        grantEndDate: config.grantEndDate,
        dueAfterDays,
      },
      update: {
        frequency: config.frequency,
        grantStartDate: config.grantStartDate,
        grantEndDate: config.grantEndDate,
        dueAfterDays,
      },
    }),
    // Delete future slots only (keep any already submitted/approved)
    prisma.budgetReportSlot.deleteMany({
      where: { budgetId, status: { in: ["pending", "sent_back"] } },
    }),
    ...slots.map(s =>
      prisma.budgetReportSlot.upsert({
        where: { budgetId_slotNumber: { budgetId, slotNumber: s.slotNumber } },
        create: { budgetId, ...s },
        update: { grantYear: s.grantYear, periodFrom: s.periodFrom, periodTo: s.periodTo, dueDate: s.dueDate },
      })
    ),
  ]);

  revalidatePath(`/budget/${budgetId}`);
  revalidatePath("/admin");
}

// ── Partner: start or update a report ─────────────────────────────────────────

async function assertCanEditReport(budgetId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const budget = await prisma.budget.findUnique({ where: { id: budgetId }, select: { partnerId: true } });
  if (!budget) throw new Error("Not found");
  if (budget.partnerId !== session.user.id && !isSuperAdmin(session)) throw new Error("Forbidden");
  return session;
}

export async function saveReport(
  slotId: string,
  data: {
    openingBalance?: number;
    tranchesReceived?: number;
    interestEarned?: number;
    bankBalance?: number;
    fdBalance?: number;
    cashInHand?: number;
    advances?: number;
    receivables?: number;
    payables?: number;
    partnerNotes?: string;
    bankStatementUrl?: string;
    bankStatementParsed?: object;
  }
) {
  const slot = await prisma.budgetReportSlot.findUnique({
    where: { id: slotId },
    select: { budgetId: true, status: true },
  });
  if (!slot) throw new Error("Slot not found");
  if (slot.status === "approved") throw new Error("Cannot edit an approved report");

  await assertCanEditReport(slot.budgetId);

  await prisma.budgetReport.upsert({
    where: { slotId },
    create: { slotId, budgetId: slot.budgetId, ...data },
    update: data,
  });

  revalidatePath(`/budget/${slot.budgetId}/reports/${slotId}`);
}

export async function saveReportLines(
  slotId: string,
  lines: Array<{ budgetLineId: string; actualAmount: number; notes?: string }>
) {
  const slot = await prisma.budgetReportSlot.findUnique({
    where: { id: slotId },
    select: { budgetId: true, status: true, report: { select: { id: true } } },
  });
  if (!slot) throw new Error("Slot not found");
  if (slot.status === "approved") throw new Error("Cannot edit an approved report");

  await assertCanEditReport(slot.budgetId);

  // Ensure report record exists
  const report = await prisma.budgetReport.upsert({
    where: { slotId },
    create: { slotId, budgetId: slot.budgetId },
    update: {},
    select: { id: true },
  });

  await Promise.all(
    lines.map(l =>
      prisma.budgetReportLine.upsert({
        where: { reportId_budgetLineId: { reportId: report.id, budgetLineId: l.budgetLineId } },
        create: { reportId: report.id, budgetLineId: l.budgetLineId, actualAmount: l.actualAmount, notes: l.notes },
        update: { actualAmount: l.actualAmount, notes: l.notes },
      })
    )
  );

  revalidatePath(`/budget/${slot.budgetId}/reports/${slotId}`);
}

export async function submitReport(slotId: string) {
  const slot = await prisma.budgetReportSlot.findUnique({
    where: { id: slotId },
    select: { budgetId: true, status: true },
  });
  if (!slot) throw new Error("Not found");
  if (!["pending", "sent_back"].includes(slot.status)) throw new Error("Cannot submit in current status");

  await assertCanEditReport(slot.budgetId);

  await prisma.$transaction([
    prisma.budgetReportSlot.update({ where: { id: slotId }, data: { status: "submitted" } }),
    prisma.budgetReport.update({ where: { slotId }, data: { submittedAt: new Date() } }),
  ]);

  revalidatePath(`/budget/${slot.budgetId}/reports`);
  redirect(`/budget/${slot.budgetId}/reports`);
}

// ── Admin: review actions ──────────────────────────────────────────────────────

export async function approveReport(slotId: string) {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session)) throw new Error("Unauthorized");

  const slot = await prisma.budgetReportSlot.findUnique({
    where: { id: slotId },
    select: { budgetId: true, status: true },
  });
  if (!slot || slot.status !== "submitted") throw new Error("Not in submitted state");

  // Auto-fill opening balance for next pending slot
  const report = await prisma.budgetReport.findUnique({ where: { slotId }, select: { id: true, openingBalance: true, tranchesReceived: true, interestEarned: true, bankBalance: true, fdBalance: true, cashInHand: true, advances: true, receivables: true, payables: true } });
  if (report) {
    const totalIncome = report.openingBalance + report.tranchesReceived + report.interestEarned;
    const totalActuals = await prisma.budgetReportLine.aggregate({ where: { reportId: report.id }, _sum: { actualAmount: true } });
    const closingBalance = totalIncome - (totalActuals._sum.actualAmount ?? 0);

    // Find next slot and pre-fill opening balance
    const currentSlot = await prisma.budgetReportSlot.findUnique({ where: { id: slotId }, select: { slotNumber: true } });
    if (currentSlot) {
      const nextSlot = await prisma.budgetReportSlot.findUnique({
        where: { budgetId_slotNumber: { budgetId: slot.budgetId, slotNumber: currentSlot.slotNumber + 1 } },
        select: { id: true, status: true },
      });
      if (nextSlot && nextSlot.status === "pending") {
        await prisma.budgetReport.upsert({
          where: { slotId: nextSlot.id },
          create: { slotId: nextSlot.id, budgetId: slot.budgetId, openingBalance: closingBalance },
          update: { openingBalance: closingBalance },
        });
      }
    }
  }

  await prisma.$transaction([
    prisma.budgetReportSlot.update({ where: { id: slotId }, data: { status: "approved" } }),
    prisma.budgetReport.update({ where: { slotId }, data: { approvedAt: new Date() } }),
  ]);

  revalidatePath(`/budget/${slot.budgetId}/reports`);
  revalidatePath("/admin");
}

export async function sendBackReport(slotId: string, reviewerNotes: string) {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session)) throw new Error("Unauthorized");

  const slot = await prisma.budgetReportSlot.findUnique({
    where: { id: slotId },
    select: { budgetId: true, status: true },
  });
  if (!slot || slot.status !== "submitted") throw new Error("Not in submitted state");

  await prisma.$transaction([
    prisma.budgetReportSlot.update({ where: { id: slotId }, data: { status: "sent_back" } }),
    prisma.budgetReport.update({ where: { slotId }, data: { reviewerNotes } }),
  ]);

  revalidatePath(`/budget/${slot.budgetId}/reports`);
}
