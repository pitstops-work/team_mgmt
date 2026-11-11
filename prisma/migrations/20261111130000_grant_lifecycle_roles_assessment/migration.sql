-- Grant lifecycle, second pass: role assignments, health assessment,
-- renewal lineage and grantee financial history.
--
-- Each closes a gap found by reading what the organisation already captures
-- in the system this replaces (docs/fluxx-read-across.md). Domain facts, not
-- an imported design.
--
-- Fully ADDITIVE: 3 new tables, 3 new enums, 4 new nullable columns.
-- Generated offline with 'prisma migrate diff' between datamodels; it never
-- touched the live database. No DROP, no type change, no NOT NULL backfill.
--
-- Budget.continuity is nullable with NO default on purpose: defaulting legacy
-- rows to 'new' would assert that every historic grant was a first grant,
-- which is false and unrecoverable once written.

-- CreateEnum
CREATE TYPE "GrantRole" AS ENUM ('programme_lead', 'programme_finance', 'effects_and_learning', 'location_team', 'consultant', 'other');

-- CreateEnum
CREATE TYPE "Rag" AS ENUM ('red', 'amber', 'green');

-- CreateEnum
CREATE TYPE "GrantContinuity" AS ENUM ('new', 'continuing', 'scale_up', 'deepening');

-- AlterTable
ALTER TABLE "Budget" ADD COLUMN     "continuity" "GrantContinuity",
ADD COLUMN     "renewsBudgetId" TEXT;

-- AlterTable
ALTER TABLE "AuthorityRule" ADD COLUMN     "grantRole" "GrantRole";

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "continuity" "GrantContinuity";

-- CreateTable
CREATE TABLE "GrantRoleAssignment" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "role" "GrantRole" NOT NULL,
    "userId" TEXT NOT NULL,
    "startedOn" DATE NOT NULL,
    "endedOn" DATE,
    "note" TEXT,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantAssessment" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "slotId" TEXT,
    "programmeRag" "Rag" NOT NULL,
    "programmeRationale" TEXT,
    "financeRag" "Rag" NOT NULL,
    "financeRationale" TEXT,
    "overallRag" "Rag" NOT NULL,
    "overallNote" TEXT,
    "assessedOn" DATE NOT NULL,
    "assessedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrantAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgFinancialYear" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "yearEnding" INTEGER NOT NULL,
    "expenditure" DECIMAL(14,2) NOT NULL,
    "income" DECIMAL(14,2),
    "isAudited" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgFinancialYear_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GrantRoleAssignment_budgetId_role_endedOn_idx" ON "GrantRoleAssignment"("budgetId", "role", "endedOn");

-- CreateIndex
CREATE INDEX "GrantRoleAssignment_userId_endedOn_idx" ON "GrantRoleAssignment"("userId", "endedOn");

-- CreateIndex
CREATE INDEX "GrantAssessment_budgetId_assessedOn_idx" ON "GrantAssessment"("budgetId", "assessedOn");

-- CreateIndex
CREATE INDEX "GrantAssessment_overallRag_assessedOn_idx" ON "GrantAssessment"("overallRag", "assessedOn");

-- CreateIndex
CREATE UNIQUE INDEX "GrantAssessment_budgetId_slotId_key" ON "GrantAssessment"("budgetId", "slotId");

-- CreateIndex
CREATE INDEX "OrgFinancialYear_orgId_yearEnding_idx" ON "OrgFinancialYear"("orgId", "yearEnding");

-- CreateIndex
CREATE UNIQUE INDEX "OrgFinancialYear_orgId_yearEnding_key" ON "OrgFinancialYear"("orgId", "yearEnding");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_renewsBudgetId_key" ON "Budget"("renewsBudgetId");

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_renewsBudgetId_fkey" FOREIGN KEY ("renewsBudgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantRoleAssignment" ADD CONSTRAINT "GrantRoleAssignment_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantRoleAssignment" ADD CONSTRAINT "GrantRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantRoleAssignment" ADD CONSTRAINT "GrantRoleAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantAssessment" ADD CONSTRAINT "GrantAssessment_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantAssessment" ADD CONSTRAINT "GrantAssessment_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "BudgetReportSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantAssessment" ADD CONSTRAINT "GrantAssessment_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgFinancialYear" ADD CONSTRAINT "OrgFinancialYear_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgFinancialYear" ADD CONSTRAINT "OrgFinancialYear_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

