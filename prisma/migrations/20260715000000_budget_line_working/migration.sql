-- Budget-level cost provenance: per-line component breakup (the line's own
-- "working") + a change log for the line's base unit cost.

ALTER TABLE "BudgetLine" ADD COLUMN "derivation" TEXT;

CREATE TABLE "BudgetLineComponent" (
    "id"           TEXT NOT NULL,
    "budgetLineId" TEXT NOT NULL,
    "position"     INTEGER NOT NULL DEFAULT 0,
    "label"        TEXT NOT NULL,
    "spec"         TEXT,
    "qty"          DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitCost"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BudgetLineComponent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BudgetLineComponent_budgetLineId_position_idx" ON "BudgetLineComponent"("budgetLineId", "position");
ALTER TABLE "BudgetLineComponent"
  ADD CONSTRAINT "BudgetLineComponent_budgetLineId_fkey"
  FOREIGN KEY ("budgetLineId") REFERENCES "BudgetLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BudgetLineCostHistory" (
    "id"           TEXT NOT NULL,
    "budgetLineId" TEXT NOT NULL,
    "oldCost"      DOUBLE PRECISION,
    "newCost"      DOUBLE PRECISION,
    "source"       TEXT,
    "changedById"  TEXT,
    "changedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BudgetLineCostHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BudgetLineCostHistory_budgetLineId_changedAt_idx" ON "BudgetLineCostHistory"("budgetLineId", "changedAt");
ALTER TABLE "BudgetLineCostHistory"
  ADD CONSTRAINT "BudgetLineCostHistory_budgetLineId_fkey"
  FOREIGN KEY ("budgetLineId") REFERENCES "BudgetLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
