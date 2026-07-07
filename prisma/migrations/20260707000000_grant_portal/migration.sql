-- Grant portal: partner-as-org registry + cross-grant borrowing/reimbursement.
-- All additive. Budget.grantPartnerId nullable (legacy rows unassigned).

-- Partner org registry (city-scoped).
CREATE TABLE "GrantPartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Bangalore',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GrantPartner_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GrantPartner_city_name_key" ON "GrantPartner"("city", "name");
CREATE INDEX "GrantPartner_city_idx" ON "GrantPartner"("city");

-- Budget → GrantPartner.
ALTER TABLE "Budget" ADD COLUMN "grantPartnerId" TEXT;
CREATE INDEX "Budget_grantPartnerId_idx" ON "Budget"("grantPartnerId");
ALTER TABLE "Budget"
  ADD CONSTRAINT "Budget_grantPartnerId_fkey"
  FOREIGN KEY ("grantPartnerId") REFERENCES "GrantPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cross-grant borrowing.
CREATE TYPE "GrantBorrowingStatus" AS ENUM ('outstanding', 'partially_reimbursed', 'reimbursed');

CREATE TABLE "GrantBorrowing" (
    "id" TEXT NOT NULL,
    "fromBudgetId" TEXT NOT NULL,
    "toBudgetId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "borrowedOn" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "GrantBorrowingStatus" NOT NULL DEFAULT 'outstanding',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GrantBorrowing_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GrantBorrowing_fromBudgetId_idx" ON "GrantBorrowing"("fromBudgetId");
CREATE INDEX "GrantBorrowing_toBudgetId_idx" ON "GrantBorrowing"("toBudgetId");
ALTER TABLE "GrantBorrowing"
  ADD CONSTRAINT "GrantBorrowing_fromBudgetId_fkey"
  FOREIGN KEY ("fromBudgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrantBorrowing"
  ADD CONSTRAINT "GrantBorrowing_toBudgetId_fkey"
  FOREIGN KEY ("toBudgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GrantBorrowingRepayment" (
    "id" TEXT NOT NULL,
    "borrowingId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "repaidOn" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    CONSTRAINT "GrantBorrowingRepayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GrantBorrowingRepayment_borrowingId_idx" ON "GrantBorrowingRepayment"("borrowingId");
ALTER TABLE "GrantBorrowingRepayment"
  ADD CONSTRAINT "GrantBorrowingRepayment_borrowingId_fkey"
  FOREIGN KEY ("borrowingId") REFERENCES "GrantBorrowing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
