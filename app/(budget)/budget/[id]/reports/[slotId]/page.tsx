import { auth } from "@/lib/auth";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import ReportForm from "./ReportForm";
import ReviewPanel from "./ReviewPanel";

export default async function ReportSlotPage({ params }: { params: Promise<{ id: string; slotId: string }> }) {
  const { id, slotId } = await params;
  const session = await auth();
  const superAdmin = isSuperAdmin(session);
  const budgetAdmin = isBudgetAdmin(session);
  const canReview = superAdmin || budgetAdmin;

  const [slot, budget] = await Promise.all([
    prisma.budgetReportSlot.findUnique({
      where: { id: slotId },
      include: {
        report: {
          include: {
            lines: true,
            reallocationRequests: {
              include: {
                fromLine: { select: { id: true, description: true, section: true } },
                toLine: { select: { id: true, description: true, section: true } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    }),
    prisma.budget.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { position: "asc" } },
        reportConfig: true,
      },
    }),
  ]);

  if (!slot || !budget || slot.budgetId !== id) notFound();
  if (!canReview && budget.partnerId !== session!.user!.id!) notFound();
  const isPartner = budget.partnerId === session!.user!.id!;

  // Cumulative actuals for all approved/submitted slots in same grant year before this one
  const priorSlots = await prisma.budgetReportSlot.findMany({
    where: {
      budgetId: id,
      grantYear: slot.grantYear,
      slotNumber: { lt: slot.slotNumber },
      status: { in: ["approved", "submitted"] },
    },
    include: { report: { include: { lines: true } } },
  });

  const cumulativePrior: Record<string, number> = {};
  for (const ps of priorSlots) {
    for (const l of ps.report?.lines ?? []) {
      cumulativePrior[l.budgetLineId] = (cumulativePrior[l.budgetLineId] ?? 0) + l.actualAmount;
    }
  }

  // Approved reallocations from prior approved reports (any grant year) — for revised budget basis
  const priorApprovedSlots = await prisma.budgetReportSlot.findMany({
    where: { budgetId: id, slotNumber: { lt: slot.slotNumber }, status: "approved" },
    include: {
      report: {
        include: {
          reallocationRequests: {
            where: { status: "approved" },
            select: { fromLineId: true, toLineId: true, approvedAmount: true },
          },
        },
      },
    },
  });

  // revisedYearTotals[lineId] = original yearTotal ± approved reallocations
  const revisedAdjustments: Record<string, number> = {};
  for (const ps of priorApprovedSlots) {
    for (const r of ps.report?.reallocationRequests ?? []) {
      if (r.approvedAmount == null) continue;
      revisedAdjustments[r.fromLineId] = (revisedAdjustments[r.fromLineId] ?? 0) - r.approvedAmount;
      if (r.toLineId) {
        revisedAdjustments[r.toLineId] = (revisedAdjustments[r.toLineId] ?? 0) + r.approvedAmount;
      }
    }
  }

  const serialized = JSON.parse(JSON.stringify({ slot, budget, cumulativePrior, revisedAdjustments }));
  const canEdit = isPartner && ["pending", "sent_back"].includes(slot.status);
  const isReview = canReview && !isPartner && slot.status === "submitted";

  return (
    <div>
      {isReview
        ? <ReviewPanel {...serialized} />
        : <ReportForm {...serialized} canEdit={canEdit} isSuperAdmin={canReview} />
      }
    </div>
  );
}
