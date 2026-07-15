-- Distinguish a frozen standard-as-generated working from a budget-specific
-- customisation.
ALTER TABLE "BudgetLine" ADD COLUMN "workingCustomised" BOOLEAN NOT NULL DEFAULT false;
