-- Add clusterScope to NeedsFormulaConfig
-- When true: viability minimum is checked at cluster level, not per-settlement
ALTER TABLE "NeedsFormulaConfig" ADD COLUMN "clusterScope" BOOLEAN NOT NULL DEFAULT false;

-- ElderlyCentre and YouthResourceCentre require cluster-level minimum
UPDATE "NeedsFormulaConfig" SET "clusterScope" = true
WHERE domain IN ('ElderlyCentre', 'YouthResourceCentre');
