-- Multi-partner budgets: a budget can be split across delivery/implementing
-- partners (distinct from Budget.partnerId, the creator). Additive + defaulted.

ALTER TABLE "Budget" ADD COLUMN "isMultiPartner" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "BudgetDeliveryPartner" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sharedPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inputs" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "BudgetDeliveryPartner_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BudgetDeliveryPartner_budgetId_idx" ON "BudgetDeliveryPartner"("budgetId");
ALTER TABLE "BudgetDeliveryPartner"
  ADD CONSTRAINT "BudgetDeliveryPartner_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BudgetLine" ADD COLUMN "deliveryPartnerId" TEXT;
CREATE INDEX "BudgetLine_deliveryPartnerId_idx" ON "BudgetLine"("deliveryPartnerId");
ALTER TABLE "BudgetLine"
  ADD CONSTRAINT "BudgetLine_deliveryPartnerId_fkey"
  FOREIGN KEY ("deliveryPartnerId") REFERENCES "BudgetDeliveryPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
