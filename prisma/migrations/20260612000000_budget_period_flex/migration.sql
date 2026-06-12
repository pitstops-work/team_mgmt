-- Budget: flexible horizon (months) + independent inflation toggle + per-budget rates
ALTER TABLE "Budget"
  ADD COLUMN "horizonMonths"      INTEGER          NOT NULL DEFAULT 12,
  ADD COLUMN "applyInflation"     BOOLEAN          NOT NULL DEFAULT TRUE,
  ADD COLUMN "inflationSalaryPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
  ADD COLUMN "inflationOtherPct"  DOUBLE PRECISION NOT NULL DEFAULT 5,
  ADD COLUMN "inflationNilPct"    DOUBLE PRECISION NOT NULL DEFAULT 0;

-- BudgetLine: add Y4/Y5 columns for horizons > 36 months
ALTER TABLE "BudgetLine"
  ADD COLUMN "y4Units"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "y4UnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "y4AllocPct" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN "y4Total"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "y5Units"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "y5UnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "y5AllocPct" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN "y5Total"    DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill existing budgets so visible behaviour is identical to pre-migration:
--   horizonMonths = years * 12, applyInflation = (years = 3).
-- Defaults above cover newly inserted rows; this fixes pre-existing rows whose
-- `years` field was 3 (the only non-default value seen in prod).
UPDATE "Budget"
   SET "horizonMonths"  = "years" * 12,
       "applyInflation" = ("years" = 3);
