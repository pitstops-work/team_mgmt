-- Mark budgets created by importing a filled Excel template (vs the parametric
-- generator). Nullable + additive, so existing rows are unaffected.
ALTER TABLE "Budget" ADD COLUMN "importedAt" TIMESTAMP(3);
