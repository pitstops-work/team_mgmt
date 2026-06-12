"use server";

import { auth } from "@/lib/auth";
import { isSuperAdmin, isBudgetAdminOrSuperAdmin } from "@/lib/roleGuard";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateSlots } from "@/lib/budget-report-slots";
import type { ReportFrequency, BudgetSection, ReallocationDuration } from "@/app/generated/prisma/client";

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
  if (!session?.user || !isBudgetAdminOrSuperAdmin(session)) throw new Error("Unauthorized");

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
    select: {
      budgetId: true, status: true, grantYear: true, slotNumber: true,
      report: { select: { id: true, lines: { select: { budgetLineId: true, actualAmount: true } } } },
    },
  });
  if (!slot) throw new Error("Not found");
  if (!["pending", "sent_back"].includes(slot.status)) throw new Error("Cannot submit in current status");

  await assertCanEditReport(slot.budgetId);

  // Recompute sustain checks on all reallocation requests for this report
  if (slot.report) {
    const requests = await prisma.budgetReallocationRequest.findMany({
      where: { reportId: slot.report.id, status: "pending" },
    });
    if (requests.length > 0) {
      // Fetch YTD actuals from prior approved/submitted slots
      const priorSlots = await prisma.budgetReportSlot.findMany({
        where: { budgetId: slot.budgetId, slotNumber: { lt: slot.slotNumber }, status: { in: ["approved", "submitted"] } },
        include: { report: { include: { lines: { select: { budgetLineId: true, actualAmount: true } } } } },
      });
      const priorActuals: Record<string, number> = {};
      for (const ps of priorSlots) {
        for (const l of ps.report?.lines ?? []) {
          priorActuals[l.budgetLineId] = (priorActuals[l.budgetLineId] ?? 0) + l.actualAmount;
        }
      }
      const currentActuals: Record<string, number> = Object.fromEntries(
        (slot.report.lines ?? []).map(l => [l.budgetLineId, l.actualAmount])
      );

      await Promise.all(requests.map(async req => {
        const fromLine = await prisma.budgetLine.findUnique({ where: { id: req.fromLineId } });
        if (!fromLine) return;
        const yearTotal =
          slot.grantYear === 1 ? fromLine.y1Total
          : slot.grantYear === 2 ? fromLine.y2Total
          : slot.grantYear === 3 ? fromLine.y3Total
          : slot.grantYear === 4 ? fromLine.y4Total
          : fromLine.y5Total;
        const ytdActual = (priorActuals[req.fromLineId] ?? 0) + (currentActuals[req.fromLineId] ?? 0);
        const sourceUnspent = Math.max(0, yearTotal - ytdActual);
        const willSustain = sourceUnspent >= req.requestedAmount;
        const sustainNote = willSustain ? null
          : `Source line has only ₹${Math.round(sourceUnspent).toLocaleString("en-IN")} unspent vs requested ₹${Math.round(req.requestedAmount).toLocaleString("en-IN")}`;
        await prisma.budgetReallocationRequest.update({
          where: { id: req.id },
          data: { sourceUnspent, willSustain, sustainNote },
        });
      }));
    }
  }

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
  if (!session?.user || !isBudgetAdminOrSuperAdmin(session)) throw new Error("Unauthorized");

  const slot = await prisma.budgetReportSlot.findUnique({
    where: { id: slotId },
    select: { budgetId: true, status: true },
  });
  if (!slot || slot.status !== "submitted") throw new Error("Not in submitted state");

  // Block if any reallocation requests are still pending
  const report = await prisma.budgetReport.findUnique({ where: { slotId }, select: { id: true } });
  if (report) {
    const pendingReallocations = await prisma.budgetReallocationRequest.count({
      where: { reportId: report.id, status: "pending" },
    });
    if (pendingReallocations > 0) throw new Error(`${pendingReallocations} reallocation request(s) still pending — resolve them before approving.`);

    // Create new BudgetLines for approved reallocations where toLineId is null
    const approvedNewLines = await prisma.budgetReallocationRequest.findMany({
      where: { reportId: report.id, status: "approved", toLineId: null, createdLineId: null },
      select: { id: true, toDescription: true, toSection: true, approvedAmount: true },
    });
    if (approvedNewLines.length > 0) {
      const maxPos = await prisma.budgetLine.aggregate({ where: { budgetId: slot.budgetId }, _max: { position: true } });
      let pos = (maxPos._max.position ?? 0) + 1;
      await Promise.all(approvedNewLines.map(async req => {
        if (!req.toDescription || !req.toSection) return;
        const newLine = await prisma.budgetLine.create({
          data: {
            budgetId: slot.budgetId,
            section: req.toSection,
            position: pos++,
            description: req.toDescription,
            costCategory: "Other",
            isAutoGenerated: false,
            isReallocation: true,
            sourceReallocationId: req.id,
            y1Total: req.approvedAmount ?? 0,
          },
        });
        await prisma.budgetReallocationRequest.update({ where: { id: req.id }, data: { createdLineId: newLine.id } });
      }));
    }
  }

  // Auto-fill opening balance for next pending slot
  const reportFull = await prisma.budgetReport.findUnique({ where: { slotId }, select: { id: true, openingBalance: true, tranchesReceived: true, interestEarned: true } });
  if (reportFull) {
    const totalIncome = reportFull.openingBalance + reportFull.tranchesReceived + reportFull.interestEarned;
    const totalActuals = await prisma.budgetReportLine.aggregate({ where: { reportId: reportFull.id }, _sum: { actualAmount: true } });
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
  if (!session?.user || !isBudgetAdminOrSuperAdmin(session)) throw new Error("Unauthorized");

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

// ── Reallocation requests ─────────────────────────────────────────────────────

export async function addReallocationRequest(
  slotId: string,
  req: {
    fromLineId: string;
    toLineId: string | null;
    toDescription?: string;
    toSection?: BudgetSection;
    requestedAmount: number;
    durationType: ReallocationDuration;
    durationMonths?: number;
    rationale: string;
  }
) {
  const slot = await prisma.budgetReportSlot.findUnique({
    where: { id: slotId },
    select: { budgetId: true, status: true, grantYear: true, slotNumber: true },
  });
  if (!slot) throw new Error("Slot not found");
  if (!["pending", "sent_back"].includes(slot.status)) throw new Error("Cannot add requests in current status");
  await assertCanEditReport(slot.budgetId);

  // Ensure report exists
  const report = await prisma.budgetReport.upsert({
    where: { slotId },
    create: { slotId, budgetId: slot.budgetId },
    update: {},
    select: { id: true, lines: { select: { budgetLineId: true, actualAmount: true } } },
  });

  // Compute sustain check
  const priorSlots = await prisma.budgetReportSlot.findMany({
    where: { budgetId: slot.budgetId, slotNumber: { lt: slot.slotNumber }, status: { in: ["approved", "submitted"] } },
    include: { report: { include: { lines: { select: { budgetLineId: true, actualAmount: true } } } } },
  });
  const priorActuals: Record<string, number> = {};
  for (const ps of priorSlots) {
    for (const l of ps.report?.lines ?? []) {
      priorActuals[l.budgetLineId] = (priorActuals[l.budgetLineId] ?? 0) + l.actualAmount;
    }
  }
  const currentActuals: Record<string, number> = Object.fromEntries(report.lines.map(l => [l.budgetLineId, l.actualAmount]));
  const fromLine = await prisma.budgetLine.findUnique({ where: { id: req.fromLineId } });
  if (!fromLine) throw new Error("Source line not found");
  const yearTotal =
    slot.grantYear === 1 ? fromLine.y1Total
    : slot.grantYear === 2 ? fromLine.y2Total
    : slot.grantYear === 3 ? fromLine.y3Total
    : slot.grantYear === 4 ? fromLine.y4Total
    : fromLine.y5Total;
  const ytdActual = (priorActuals[req.fromLineId] ?? 0) + (currentActuals[req.fromLineId] ?? 0);
  const sourceUnspent = Math.max(0, yearTotal - ytdActual);
  const willSustain = sourceUnspent >= req.requestedAmount;
  const sustainNote = willSustain ? null
    : `Source line has only ₹${Math.round(sourceUnspent).toLocaleString("en-IN")} unspent vs requested ₹${Math.round(req.requestedAmount).toLocaleString("en-IN")}`;

  const isRecurring = req.durationType !== "one_time";
  const durationMonths = req.durationMonths ?? null;
  const monthlyAmount = isRecurring && durationMonths ? req.requestedAmount / durationMonths : 0;

  await prisma.budgetReallocationRequest.create({
    data: {
      reportId: report.id,
      fromLineId: req.fromLineId,
      toLineId: req.toLineId,
      toDescription: req.toDescription ?? null,
      toSection: req.toSection ?? null,
      requestedAmount: req.requestedAmount,
      isRecurring,
      monthlyAmount,
      durationType: req.durationType,
      durationMonths,
      rationale: req.rationale,
      sourceUnspent,
      willSustain,
      sustainNote,
    },
  });

  revalidatePath(`/budget/${slot.budgetId}/reports/${slotId}`);
}

export async function deleteReallocationRequest(requestId: string) {
  const req = await prisma.budgetReallocationRequest.findUnique({
    where: { id: requestId },
    select: { status: true, report: { select: { slotId: true, slot: { select: { budgetId: true, status: true } } } } },
  });
  if (!req) throw new Error("Not found");
  if (req.status !== "pending") throw new Error("Cannot delete a resolved request");
  if (!["pending", "sent_back"].includes(req.report.slot.status)) throw new Error("Cannot delete in current status");
  await assertCanEditReport(req.report.slot.budgetId);

  await prisma.budgetReallocationRequest.delete({ where: { id: requestId } });
  revalidatePath(`/budget/${req.report.slot.budgetId}/reports/${req.report.slotId}`);
}

export async function resolveReallocationRequest(
  requestId: string,
  resolution: { status: "approved" | "rejected"; approvedAmount?: number; reviewerComment?: string }
) {
  const session = await auth();
  if (!session?.user || !isBudgetAdminOrSuperAdmin(session)) throw new Error("Unauthorized");

  const req = await prisma.budgetReallocationRequest.findUnique({
    where: { id: requestId },
    select: { status: true, report: { select: { slotId: true, slot: { select: { budgetId: true, status: true } } } } },
  });
  if (!req) throw new Error("Not found");
  if (req.status !== "pending") throw new Error("Already resolved");
  if (req.report.slot.status !== "submitted") throw new Error("Report not in submitted state");

  await prisma.budgetReallocationRequest.update({
    where: { id: requestId },
    data: {
      status: resolution.status,
      approvedAmount: resolution.status === "approved" ? (resolution.approvedAmount ?? null) : null,
      reviewerComment: resolution.reviewerComment ?? null,
      resolvedAt: new Date(),
    },
  });

  revalidatePath(`/budget/${req.report.slot.budgetId}/reports/${req.report.slotId}`);
}
