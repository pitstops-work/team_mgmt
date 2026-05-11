-- CreateEnum
CREATE TYPE "ReallocationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ReallocationDuration" AS ENUM ('remaining_year', 'full_grant', 'custom', 'one_time');

-- AlterTable: add reallocation fields to BudgetLine
ALTER TABLE "BudgetLine"
  ADD COLUMN "isReallocation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sourceReallocationId" TEXT;

-- CreateTable: BudgetReallocationRequest
CREATE TABLE "BudgetReallocationRequest" (
    "id"              TEXT NOT NULL,
    "reportId"        TEXT NOT NULL,
    "fromLineId"      TEXT NOT NULL,
    "toLineId"        TEXT,
    "toDescription"   TEXT,
    "toSection"       "BudgetSection",
    "requestedAmount" DOUBLE PRECISION NOT NULL,
    "isRecurring"     BOOLEAN NOT NULL DEFAULT false,
    "monthlyAmount"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationType"    "ReallocationDuration" NOT NULL,
    "durationMonths"  INTEGER,
    "rationale"       TEXT NOT NULL,
    "sourceUnspent"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "willSustain"     BOOLEAN NOT NULL DEFAULT true,
    "sustainNote"     TEXT,
    "status"          "ReallocationStatus" NOT NULL DEFAULT 'pending',
    "approvedAmount"  DOUBLE PRECISION,
    "reviewerComment" TEXT,
    "resolvedAt"      TIMESTAMP(3),
    "createdLineId"   TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetReallocationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetReallocationRequest_reportId_idx" ON "BudgetReallocationRequest"("reportId");

-- CreateIndex
CREATE INDEX "BudgetReallocationRequest_fromLineId_idx" ON "BudgetReallocationRequest"("fromLineId");

-- AddForeignKey
ALTER TABLE "BudgetReallocationRequest"
  ADD CONSTRAINT "BudgetReallocationRequest_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "BudgetReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetReallocationRequest"
  ADD CONSTRAINT "BudgetReallocationRequest_fromLineId_fkey"
  FOREIGN KEY ("fromLineId") REFERENCES "BudgetLine"("id") ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetReallocationRequest"
  ADD CONSTRAINT "BudgetReallocationRequest_toLineId_fkey"
  FOREIGN KEY ("toLineId") REFERENCES "BudgetLine"("id") ON UPDATE CASCADE;
