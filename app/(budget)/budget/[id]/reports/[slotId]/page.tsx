import { auth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roleGuard";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import ReportForm from "./ReportForm";
import ReviewPanel from "./ReviewPanel";

export default async function ReportSlotPage({ params }: { params: Promise<{ id: string; slotId: string }> }) {
  const { id, slotId } = await params;
  const session = await auth();
  const superAdmin = isSuperAdmin(session);

  const [slot, budget] = await Promise.all([
    prisma.budgetReportSlot.findUnique({
      where: { id: slotId },
      include: {
        report: {
          include: { lines: true },
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
  if (!superAdmin && budget.partnerId !== session!.user!.id!) notFound();
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

  const serialized = JSON.parse(JSON.stringify({ slot, budget, cumulativePrior }));
  const canEdit = isPartner && ["pending", "sent_back"].includes(slot.status);
  const isReview = superAdmin && !isPartner && slot.status === "submitted";

  return (
    <div>
      {isReview
        ? <ReviewPanel {...serialized} />
        : <ReportForm {...serialized} canEdit={canEdit} isSuperAdmin={superAdmin} />
      }
    </div>
  );
}
