-- CreateEnum
CREATE TYPE "ReportFrequency" AS ENUM ('monthly', 'bi_monthly', 'quarterly', 'half_yearly', 'annual');

-- CreateEnum
CREATE TYPE "ReportSlotStatus" AS ENUM ('pending', 'submitted', 'under_review', 'sent_back', 'approved');

-- AlterEnum
ALTER TYPE "BudgetStatus" ADD VALUE 'approved';

-- CreateTable
CREATE TABLE "BudgetReportConfig" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "frequency" "ReportFrequency" NOT NULL,
    "grantStartDate" TIMESTAMP(3) NOT NULL,
    "grantEndDate" TIMESTAMP(3) NOT NULL,
    "dueAfterDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetReportConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetReportSlot" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "slotNumber" INTEGER NOT NULL,
    "grantYear" INTEGER NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ReportSlotStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetReportSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetReport" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tranchesReceived" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interestEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bankBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fdBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashInHand" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advances" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivables" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payables" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bankStatementUrl" TEXT,
    "bankStatementParsed" JSONB,
    "partnerNotes" TEXT,
    "reviewerNotes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetReportLine" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "budgetLineId" TEXT NOT NULL,
    "actualAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "BudgetReportLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BudgetReportConfig_budgetId_key" ON "BudgetReportConfig"("budgetId");

-- CreateIndex
CREATE INDEX "BudgetReportSlot_budgetId_grantYear_idx" ON "BudgetReportSlot"("budgetId", "grantYear");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetReportSlot_budgetId_slotNumber_key" ON "BudgetReportSlot"("budgetId", "slotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetReport_slotId_key" ON "BudgetReport"("slotId");

-- CreateIndex
CREATE INDEX "BudgetReport_budgetId_idx" ON "BudgetReport"("budgetId");

-- CreateIndex
CREATE INDEX "BudgetReportLine_reportId_idx" ON "BudgetReportLine"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetReportLine_reportId_budgetLineId_key" ON "BudgetReportLine"("reportId", "budgetLineId");

-- AddForeignKey
ALTER TABLE "BudgetReportConfig" ADD CONSTRAINT "BudgetReportConfig_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetReportSlot" ADD CONSTRAINT "BudgetReportSlot_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetReport" ADD CONSTRAINT "BudgetReport_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "BudgetReportSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetReport" ADD CONSTRAINT "BudgetReport_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetReportLine" ADD CONSTRAINT "BudgetReportLine_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "BudgetReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetReportLine" ADD CONSTRAINT "BudgetReportLine_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "BudgetLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

