-- Add numerator column to NeedsFormulaConfig so ratios like
-- "20 youth leaders per 500 youth" can be expressed directly
-- instead of mentally collapsing to "1 per 25".
ALTER TABLE "NeedsFormulaConfig"
  ADD COLUMN "numerator" DOUBLE PRECISION NOT NULL DEFAULT 1;
